import { describe, expect, it } from "vitest";
import { QuestContentService } from "../src";
import { fixture } from "./helpers";

describe("generated quest content", () => {
  it("classifies custom challenges and calculates a symmetric barter", () => {
    const assessment = new QuestContentService().assessChallenge({
      recipientUserId: "ben",
      partyId: "party",
      task: "Pick up litter around the park",
      locationLabel: "Schenley Park",
      notes: "Bring gloves",
      deadline: "2099-09-12T18:00:00.000Z",
    });
    expect(assessment).toMatchObject({
      category: "community-cleanup",
      suggestedStakeCoins: 20,
      safety: { accepted: true },
    });
    expect(assessment.description).toContain("Bring gloves");
    expect(assessment.explanation).toContain("Challenge calibrated");
  });

  it("rejects unsafe custom tasks", () => {
    const assessment = new QuestContentService().assessChallenge({
      recipientUserId: "ben",
      partyId: "party",
      task: "Steal a traffic sign",
      deadline: "2099-09-12T18:00:00.000Z",
    });
    expect(assessment.safety.accepted).toBe(false);
  });

  it("routes custom challenges to sender and recipient with progress notices", async () => {
    const f = fixture();
    const challenge = await f.challenges.issueCustom({
      issuerUserId: "zuri",
      recipientUserId: "ben",
      partyId: "party",
      task: "Teach one guitar chord",
      locationLabel: "The Cut",
      notes: "Acoustic is fine",
      deadline: "2099-09-12T18:00:00.000Z",
      idempotencyKey: "custom",
    });
    expect((await f.challenges.list("zuri"))[0].id).toBe(challenge.id);
    expect((await f.challenges.list("ben"))[0].id).toBe(challenge.id);
    const accepted = await f.challenges.respond({
      challengeId: challenge.id,
      recipientUserId: "ben",
      accept: true,
      expectedVersion: 1,
      idempotencyKey: "accept-custom",
    });
    const progress = await f.challenges.updateProgress({
      challengeId: challenge.id,
      recipientUserId: "ben",
      progressPercent: 60,
      expectedVersion: accepted.version,
      idempotencyKey: "progress-custom",
    });
    expect(progress.lastNotice).toContain("60% complete");
  });
});
