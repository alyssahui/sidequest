import { describe, expect, it } from "vitest";
import { fixture } from "./helpers";
const issue = (f: ReturnType<typeof fixture>, overrides = {}) =>
  f.challenges.issue({
    issuerUserId: "zuri",
    recipientUserId: "ben",
    partyId: "party",
    questTemplateId: "cmu-teach",
    stakeCoins: 25,
    expiresAt: "2026-09-12T18:00:00.000Z",
    idempotencyKey: "issue",
    ...overrides,
  });
describe("consent-based challenges", () => {
  it("escrows symmetrically, attaches a quest, and pays recipient on success", async () => {
    const f = fixture();
    const c = await issue(f);
    expect(f.balances.get("zuri")).toBe(475);
    const accepted = await f.challenges.respond({
      challengeId: c.id,
      recipientUserId: "ben",
      accept: true,
      expectedVersion: 1,
      idempotencyKey: "accept",
    });
    expect(accepted.questId).toBeTruthy();
    expect(f.balances.get("ben")).toBe(475);
    await f.challenges.consumeQuestOutcome({
      challengeId: c.id,
      questStatus: "VERIFIED",
      idempotencyKey: "outcome",
    });
    expect(f.balances.get("ben")).toBe(525);
  });
  it("pays issuer on failure and consumes duplicate outcomes once", async () => {
    const f = fixture();
    const c = await issue(f);
    await f.challenges.respond({
      challengeId: c.id,
      recipientUserId: "ben",
      accept: true,
      expectedVersion: 1,
      idempotencyKey: "accept",
    });
    await f.challenges.consumeQuestOutcome({
      challengeId: c.id,
      questStatus: "FAILED",
      idempotencyKey: "outcome",
    });
    await f.challenges.consumeQuestOutcome({
      challengeId: c.id,
      questStatus: "FAILED",
      idempotencyKey: "outcome",
    });
    expect(f.balances.get("zuri")).toBe(525);
  });
  it("declines with no penalty and refunds issuer", async () => {
    const f = fixture();
    const c = await issue(f);
    const declined = await f.challenges.respond({
      challengeId: c.id,
      recipientUserId: "ben",
      accept: false,
      expectedVersion: 1,
      idempotencyKey: "decline",
    });
    expect(declined.status).toBe("DECLINED");
    expect(f.balances.get("zuri")).toBe(500);
  });
  it("lets only the issuer recall an unanswered challenge and refunds once", async () => {
    const f = fixture();
    const c = await issue(f);
    await expect(
      f.challenges.cancel({
        challengeId: c.id,
        issuerUserId: "ben",
        expectedVersion: 1,
        idempotencyKey: "nope",
      }),
    ).rejects.toMatchObject({ code: "NOT_AUTHORIZED" });
    const cancelled = await f.challenges.cancel({
      challengeId: c.id,
      issuerUserId: "zuri",
      expectedVersion: 1,
      idempotencyKey: "cancel",
    });
    expect(cancelled.status).toBe("DECLINED");
    expect(f.balances.get("zuri")).toBe(500);
    await expect(
      f.challenges.cancel({
        challengeId: c.id,
        issuerUserId: "zuri",
        expectedVersion: 2,
        idempotencyKey: "again",
      }),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });
  it("refunds a timed-out pending challenge", async () => {
    const f = fixture();
    const c = await issue(f);
    f.setNow("2026-09-12T18:00:00.000Z");
    expect(
      (
        await f.challenges.expire({
          challengeId: c.id,
          expectedVersion: 1,
          idempotencyKey: "expire",
        })
      ).status,
    ).toBe("EXPIRED");
    expect(f.balances.get("zuri")).toBe(500);
  });
  it("rejects self, non-member, invalid stakes and insufficient balance", async () => {
    const f = fixture();
    await expect(issue(f, { recipientUserId: "zuri" })).rejects.toMatchObject({
      code: "INVALID_CHALLENGE",
    });
    await expect(
      issue(f, { recipientUserId: "stranger", idempotencyKey: "nonmember" }),
    ).rejects.toMatchObject({ code: "NOT_AUTHORIZED" });
    await expect(
      issue(f, { stakeCoins: 999, idempotencyKey: "high" }),
    ).rejects.toMatchObject({ code: "INVALID_CHALLENGE" });
    await expect(
      issue(f, { stakeCoins: 250, idempotencyKey: "one" }),
    ).resolves.toBeTruthy();
    await expect(
      issue(f, { stakeCoins: 250, idempotencyKey: "two" }),
    ).resolves.toBeTruthy();
    await expect(
      issue(f, { stakeCoins: 5, idempotencyKey: "three" }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_BALANCE" });
  });
  it("rejects unauthorized response and stale versions", async () => {
    const f = fixture();
    const c = await issue(f);
    await expect(
      f.challenges.respond({
        challengeId: c.id,
        recipientUserId: "zuri",
        accept: true,
        expectedVersion: 1,
        idempotencyKey: "wrong",
      }),
    ).rejects.toMatchObject({ code: "NOT_AUTHORIZED" });
    await expect(
      f.challenges.respond({
        challengeId: c.id,
        recipientUserId: "ben",
        accept: true,
        expectedVersion: 9,
        idempotencyKey: "stale",
      }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });
});
