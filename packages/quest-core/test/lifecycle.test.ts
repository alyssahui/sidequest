import { describe, expect, it } from "vitest";
import { QuestError } from "../src";
import { fixture, spawned } from "./helpers";
describe("quest lifecycle", () => {
  it("supports every valid transition path", async () => {
    const { f, q } = await spawned();
    const accepted = await f.quests.accept({
      questId: q.id,
      actorUserId: "zuri",
      expectedVersion: 1,
      idempotencyKey: "accept",
    });
    const started = await f.quests.start({
      questId: q.id,
      actorUserId: "zuri",
      expectedVersion: 2,
      idempotencyKey: "start",
    });
    expect([accepted.status, started.status]).toEqual([
      "ACCEPTED",
      "IN_PROGRESS",
    ]);
  });
  it("rejects invalid and stale transitions", async () => {
    const { f, q } = await spawned();
    await expect(
      f.quests.start({
        questId: q.id,
        actorUserId: "zuri",
        expectedVersion: 1,
        idempotencyKey: "bad",
      }),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await f.quests.accept({
      questId: q.id,
      actorUserId: "zuri",
      expectedVersion: 1,
      idempotencyKey: "ok",
    });
    await expect(
      f.quests.start({
        questId: q.id,
        actorUserId: "zuri",
        expectedVersion: 1,
        idempotencyKey: "stale",
      }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });
  it("dismisses and expires without penalty at the deadline", async () => {
    const a = await spawned();
    expect(
      (
        await a.f.quests.dismiss({
          questId: a.q.id,
          actorUserId: "zuri",
          expectedVersion: 1,
          idempotencyKey: "dismiss",
        })
      ).status,
    ).toBe("DISMISSED");
    const b = await spawned(fixture(), "cmu-teach");
    b.f.setNow("2026-09-12T18:00:00.000Z");
    expect(
      (
        await b.f.quests.expire({
          questId: b.q.id,
          expectedVersion: 1,
          idempotencyKey: "expire",
        })
      ).status,
    ).toBe("EXPIRED");
  });
  it("returns the original result for duplicate commands", async () => {
    const { f, q } = await spawned();
    const one = await f.quests.accept({
      questId: q.id,
      actorUserId: "zuri",
      expectedVersion: 1,
      idempotencyKey: "same",
    });
    const two = await f.quests.accept({
      questId: q.id,
      actorUserId: "zuri",
      expectedVersion: 1,
      idempotencyKey: "same",
    });
    expect(two).toEqual(one);
    expect((await f.store.get(q.id))?.version).toBe(2);
  });
});
describe("verification", () => {
  it("composes GPS and server time, rewards and emits a private-data-free event once", async () => {
    const { f, q } = await spawned();
    await f.quests.accept({
      questId: q.id,
      actorUserId: "zuri",
      expectedVersion: 1,
      idempotencyKey: "a",
    });
    await f.quests.start({
      questId: q.id,
      actorUserId: "zuri",
      expectedVersion: 2,
      idempotencyKey: "s",
    });
    const input = {
      questId: q.id,
      actorUserId: "zuri",
      expectedVersion: 3,
      evidence: {
        gps: {
          coordinates: { latitude: 40.4433, longitude: -79.9431 },
          accuracyMeters: 10,
          capturedAt: "2026-09-12T15:59:00.000Z",
          source: "demo" as const,
        },
      },
      idempotencyKey: "e",
    };
    const attempt = await f.quests.submitEvidence(input);
    const duplicate = await f.quests.submitEvidence(input);
    expect(attempt.decision).toBe("VERIFIED");
    expect(duplicate.id).toBe(attempt.id);
    expect(f.balances.get("zuri")).toBe(520);
    expect(f.operations.size).toBe(1);
    const event = f.events.find((e) => e.type === "quest.resolved")!;
    expect(JSON.stringify(event.payload)).not.toMatch(
      /latitude|mediaRef|coordinates/,
    );
  });
  it("rejects stale GPS", async () => {
    const { f, q } = await spawned();
    await f.quests.accept({
      questId: q.id,
      actorUserId: "zuri",
      expectedVersion: 1,
      idempotencyKey: "a",
    });
    const result = await f.quests.submitEvidence({
      questId: q.id,
      actorUserId: "zuri",
      expectedVersion: 2,
      evidence: {
        gps: {
          coordinates: { latitude: 40.4433, longitude: -79.9431 },
          accuracyMeters: 10,
          capturedAt: "2026-09-12T14:00:00.000Z",
          source: "demo",
        },
      },
      idempotencyKey: "stale",
    });
    expect(result.checks[0]).toMatchObject({
      decision: "FAILED",
      code: "GPS_STALE",
    });
  });
  it("keeps non-demo photos pending for manual review and rejects unsafe refs", async () => {
    const { f, q } = await spawned(undefined, "pgh-reconnect");
    await f.quests.accept({
      questId: q.id,
      actorUserId: "zuri",
      expectedVersion: 1,
      idempotencyKey: "a",
    });
    const pending = await f.quests.submitEvidence({
      questId: q.id,
      actorUserId: "zuri",
      expectedVersion: 2,
      evidence: { photo: { mediaRef: "media://uploads/photo-1" } },
      idempotencyKey: "photo",
    });
    expect(pending.decision).toBe("PENDING_REVIEW");
    expect(
      (
        await f.quests.reviewPhoto({
          questId: q.id,
          attemptId: pending.id,
          reviewerUserId: "reviewer",
          accepted: true,
          idempotencyKey: "review",
        })
      ).decision,
    ).toBe("VERIFIED");
    const next = await spawned(fixture(), "pgh-reconnect");
    await next.f.quests.accept({
      questId: next.q.id,
      actorUserId: "zuri",
      expectedVersion: 1,
      idempotencyKey: "a",
    });
    await expect(
      next.f.quests.submitEvidence({
        questId: next.q.id,
        actorUserId: "zuri",
        expectedVersion: 2,
        evidence: { photo: { mediaRef: "https://evil.example/private" } },
        idempotencyKey: "unsafe",
      }),
    ).rejects.toBeInstanceOf(QuestError);
  });
});
