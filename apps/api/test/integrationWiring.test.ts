import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app";
import { InMemoryEventBus } from "../src/foundation/demoAdapters";

const apps: ReturnType<typeof buildApp>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function api() {
  const app = buildApp();
  apps.push(app);
  return app;
}

const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();

/** Spawn -> accept -> start, returning the quest and its current version. */
async function startQuest(app: ReturnType<typeof buildApp>, suffix: string) {
  const spawned = await app.inject({
    method: "POST",
    url: "/v1/quests/spawn",
    headers: { "idempotency-key": `spawn-${suffix}` },
    payload: { templateId: "cmu-cleanup", expiresAt: iso(6 * 60 * 60_000) },
  });
  const quest = spawned.json();

  await app.inject({
    method: "POST",
    url: `/v1/quests/${quest.id}/accept`,
    headers: { "idempotency-key": `accept-${suffix}` },
    payload: { expectedVersion: quest.version },
  });
  await app.inject({
    method: "POST",
    url: `/v1/quests/${quest.id}/start`,
    headers: { "idempotency-key": `start-${suffix}` },
    payload: { expectedVersion: quest.version + 1 },
  });

  // GPS target of the seeded template.
  const gpsRequirement = quest.requirements.find(
    (r: { type: string }) => r.type === "GPS",
  );
  return { quest, version: quest.version + 2, target: gpsRequirement.target };
}

describe("quest GPS verification is backed by the location module", () => {
  it("accepts a reading at the target and rewards the player", async () => {
    const app = api();
    const { quest, version, target } = await startQuest(app, "ok");

    const before = (await app.inject({ method: "GET", url: "/v1/me" })).json()
      .coins;

    const response = await app.inject({
      method: "POST",
      url: `/v1/quests/${quest.id}/evidence`,
      headers: { "idempotency-key": "evidence-ok" },
      payload: {
        expectedVersion: version,
        evidence: {
          gps: {
            coordinates: target,
            accuracyMeters: 12,
            capturedAt: iso(),
          },
        },
      },
    });

    const attempt = response.json();
    expect(attempt.decision).toBe("VERIFIED");
    expect(
      attempt.checks.find((c: { type: string }) => c.type === "GPS").code,
    ).toBe("GPS_OK");

    const after = (await app.inject({ method: "GET", url: "/v1/me" })).json()
      .coins;
    expect(after).toBe(before + quest.rewardCoins);
  });

  it("rejects a reading outside the radius with the location module's code", async () => {
    const app = api();
    const { quest, version, target } = await startQuest(app, "far");

    const response = await app.inject({
      method: "POST",
      url: `/v1/quests/${quest.id}/evidence`,
      headers: { "idempotency-key": "evidence-far" },
      payload: {
        expectedVersion: version,
        evidence: {
          gps: {
            // ~1.1 degrees of latitude away: far outside any sane radius.
            coordinates: {
              latitude: target.latitude + 1.1,
              longitude: target.longitude,
            },
            accuracyMeters: 10,
            capturedAt: iso(),
          },
        },
      },
    });

    const attempt = response.json();
    expect(attempt.decision).toBe("FAILED");
    expect(
      attempt.checks.find((c: { type: string }) => c.type === "GPS").code,
    ).toBe("GPS_OUTSIDE_RADIUS");
  });

  it("rejects a reading too inaccurate to be evidence", async () => {
    const app = api();
    const { quest, version, target } = await startQuest(app, "vague");

    const response = await app.inject({
      method: "POST",
      url: `/v1/quests/${quest.id}/evidence`,
      headers: { "idempotency-key": "evidence-vague" },
      payload: {
        expectedVersion: version,
        evidence: {
          gps: {
            coordinates: target,
            accuracyMeters: 5_000,
            capturedAt: iso(),
          },
        },
      },
    });

    expect(
      response.json().checks.find((c: { type: string }) => c.type === "GPS")
        .code,
    ).toBe("GPS_INACCURATE");
  });

  it("rejects a stale reading", async () => {
    const app = api();
    const { quest, version, target } = await startQuest(app, "stale");

    const response = await app.inject({
      method: "POST",
      url: `/v1/quests/${quest.id}/evidence`,
      headers: { "idempotency-key": "evidence-stale" },
      payload: {
        expectedVersion: version,
        evidence: {
          gps: {
            coordinates: target,
            accuracyMeters: 10,
            capturedAt: iso(-60 * 60_000),
          },
        },
      },
    });

    expect(
      response.json().checks.find((c: { type: string }) => c.type === "GPS")
        .code,
    ).toBe("GPS_STALE");
  });
});

describe("malformed evidence does not burn the quest", () => {
  it("rejects a submission missing the required GPS reading", async () => {
    const app = api();
    const { quest, version } = await startQuest(app, "missing");

    const response = await app.inject({
      method: "POST",
      url: `/v1/quests/${quest.id}/evidence`,
      headers: { "idempotency-key": "evidence-missing" },
      payload: { expectedVersion: version, evidence: {} },
    });

    // A client-side typo or a wrong payload shape must not resolve the quest.
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("INVALID_EVIDENCE");

    const list = (
      await app.inject({ method: "GET", url: "/v1/quests" })
    ).json();
    const still = [...list.active, ...list.nearby].find(
      (q: { id: string }) => q.id === quest.id,
    );
    expect(still).toBeDefined();
    expect(still.status).toBe("IN_PROGRESS");
  });

  it("still lets the player verify afterwards", async () => {
    const app = api();
    const { quest, version, target } = await startQuest(app, "recover");

    await app.inject({
      method: "POST",
      url: `/v1/quests/${quest.id}/evidence`,
      headers: { "idempotency-key": "evidence-bad" },
      payload: { expectedVersion: version, evidence: {} },
    });

    const good = await app.inject({
      method: "POST",
      url: `/v1/quests/${quest.id}/evidence`,
      headers: { "idempotency-key": "evidence-good" },
      payload: {
        expectedVersion: version,
        evidence: {
          gps: { coordinates: target, accuracyMeters: 10, capturedAt: iso() },
        },
      },
    });

    expect(good.json().decision).toBe("VERIFIED");
  });
});

describe("quest.resolved settles the prediction market", () => {
  async function openMarket(
    app: ReturnType<typeof buildApp>,
    questInstanceId: string,
    suffix: string,
  ) {
    const created = await app.inject({
      method: "POST",
      url: "/v1/markets",
      headers: { "idempotency-key": `market-create-${suffix}` },
      payload: {
        questInstanceId,
        participantUserId: "user-zuri",
        partyId: "party-demo",
        prompt: "Will they finish it?",
        opensAt: iso(-60_000),
        closesAt: iso(60 * 60_000),
        questDeadline: iso(6 * 60 * 60_000),
      },
    });
    const marketId = created.json().market?.id ?? created.json().id;

    await app.inject({
      method: "POST",
      url: `/v1/markets/${marketId}/open`,
      headers: { "idempotency-key": `market-open-${suffix}` },
      payload: {},
    });
    return marketId;
  }

  it("settles COMPLETE when the quest verifies, with no manual call", async () => {
    const app = api();
    const { quest, version, target } = await startQuest(app, "settle");
    const marketId = await openMarket(app, quest.id, "settle");

    await app.inject({
      method: "POST",
      url: `/v1/quests/${quest.id}/evidence`,
      headers: { "idempotency-key": "evidence-settle" },
      payload: {
        expectedVersion: version,
        evidence: {
          gps: { coordinates: target, accuracyMeters: 10, capturedAt: iso() },
        },
      },
    });

    const market = (
      await app.inject({ method: "GET", url: `/v1/markets/${marketId}` })
    ).json();
    const dto = market.market ?? market;

    // Nothing called /v1/demo/markets/:id/settle — the event did it.
    expect(dto.status).toBe("SETTLED");
    expect(dto.outcome).toBe("COMPLETE");
  });

  it("leaves markets for other quests alone", async () => {
    const app = api();
    const settled = await startQuest(app, "a");
    const untouched = await startQuest(app, "b");

    const otherMarket = await openMarket(app, untouched.quest.id, "b");

    await app.inject({
      method: "POST",
      url: `/v1/quests/${settled.quest.id}/evidence`,
      headers: { "idempotency-key": "evidence-a" },
      payload: {
        expectedVersion: settled.version,
        evidence: {
          gps: {
            coordinates: settled.target,
            accuracyMeters: 10,
            capturedAt: iso(),
          },
        },
      },
    });

    const market = (
      await app.inject({ method: "GET", url: `/v1/markets/${otherMarket}` })
    ).json();
    expect((market.market ?? market).status).toBe("OPEN");
  });
});

describe("InMemoryEventBus subscriptions", () => {
  it("delivers to handlers for the matching type only", async () => {
    const bus = new InMemoryEventBus();
    const seen: string[] = [];
    bus.on("quest.resolved", (event) => {
      seen.push(event.id);
    });

    const base = {
      version: 1 as const,
      occurredAt: iso(),
      aggregateId: "q1",
      correlationId: "c1",
      payload: {},
    };
    await bus.publish({ ...base, id: "e1", type: "quest.resolved" });
    await bus.publish({ ...base, id: "e2", type: "market.opened" });

    expect(seen).toEqual(["e1"]);
  });

  it("does not redeliver a duplicate event id", async () => {
    const bus = new InMemoryEventBus();
    let calls = 0;
    bus.on("quest.resolved", () => {
      calls += 1;
    });

    const event = {
      id: "same",
      type: "quest.resolved",
      version: 1 as const,
      occurredAt: iso(),
      aggregateId: "q1",
      correlationId: "c1",
      payload: {},
    };
    await bus.publish(event);
    await bus.publish(event);

    expect(calls).toBe(1);
  });

  it("a throwing handler does not break the publisher", async () => {
    const bus = new InMemoryEventBus();
    bus.on("quest.resolved", () => {
      throw new Error("consumer exploded");
    });

    await expect(
      bus.publish({
        id: "e1",
        type: "quest.resolved",
        version: 1,
        occurredAt: iso(),
        aggregateId: "q1",
        correlationId: "c1",
        payload: {},
      }),
    ).resolves.toBeUndefined();

    expect(bus.events).toHaveLength(1);
  });

  it("unsubscribes", async () => {
    const bus = new InMemoryEventBus();
    let calls = 0;
    const off = bus.on("quest.resolved", () => {
      calls += 1;
    });
    off();

    await bus.publish({
      id: "e1",
      type: "quest.resolved",
      version: 1,
      occurredAt: iso(),
      aggregateId: "q1",
      correlationId: "c1",
      payload: {},
    });

    expect(calls).toBe(0);
  });
});
