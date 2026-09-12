import { describe, expect, it } from "vitest";
import type { ChallengeAssessment, ChallengeDraft } from "@sidequest/contracts";
import { GrokService } from "../src/modules/grok/service";
import { createCvPhotoReview } from "../src/modules/quests/cvPhotoReview";

const draft: ChallengeDraft = {
  recipientUserId: "user-ben",
  partyId: "party-demo",
  task: "Teach one guitar chord",
  locationLabel: "campus",
  notes: "private note",
  deadline: "2099-01-01T00:00:00.000Z",
};
const baseline: ChallengeAssessment = {
  title: "Teach one guitar chord",
  description: "Teach one guitar chord.",
  category: "learn-teach",
  tags: ["learning"],
  explanation: "Deterministic",
  suggestedStakeCoins: 20,
  requirements: [{ type: "TIME", deadline: draft.deadline }],
  safety: { accepted: true, reason: "safe" },
};
const response = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

describe("Grok bounded fallback", () => {
  it("uses validated flavor but preserves deterministic fields and redacts notes/location", async () => {
    let sent = "";
    const grok = new GrokService({
      apiKey: "test",
      fetcher: async (_url, init) => {
        sent = String(init?.body);
        return response(
          JSON.stringify({
            title: "Flavor",
            description: "Flavor description",
            impact: "A bright learning moment.",
            verificationPlan: "TIME",
            suggestedStakeCoins: 90,
          }),
        );
      },
    });
    const result = await grok.designQuest(draft, baseline);
    expect(result).toMatchObject({
      source: "grok",
      title: baseline.title,
      description: baseline.description,
      suggestedStakeCoins: 20,
    });
    expect(sent).not.toContain("private note");
    expect(sent).not.toContain("campus");
  });
  it("may reorder only curated suggestions and append safe flavor", async () => {
    const grok = new GrokService({
      apiKey: "test",
      fetcher: async () =>
        response(
          JSON.stringify({
            order: ["q2", "q1"],
            flavors: [{ id: "q2", flavor: "A quick campus momentum boost." }],
          }),
        ),
    });
    const template = (id: string) => ({
      id,
      title: id,
      description: id,
      category: "learn-teach" as const,
      tags: ["learning"],
      safety: {
        risk: "LOW" as const,
        moderation: "APPROVED" as const,
        flags: [],
      },
      spawnRules: {
        areas: ["CMU"],
        placeCategories: [],
        social: "either" as const,
        minimumNearbyMembers: 0,
        cooldownHours: 0,
      },
      defaultRequirements: [
        { type: "TIME" as const, deadline: draft.deadline },
      ],
      rewardRange: { min: 10, max: 10 },
      version: 1,
    });
    const enhanced = await grok.enhanceSuggestions(
      [
        { template: template("q1"), score: 2, reason: "learning" },
        { template: template("q2"), score: 1, reason: "campus" },
      ],
      { area: "CMU", preferenceTags: ["learning"] },
    );
    expect(enhanced.map((item) => item.template.id)).toEqual(["q2", "q1"]);
    expect(enhanced[0].reason).toContain("momentum");
  });
  it.each([
    ["malformed", async () => response("not-json")],
    ["schema violation", async () => response(JSON.stringify({ title: 42 }))],
    [
      "unsafe output",
      async () =>
        response(
          JSON.stringify({
            title: "Steal a sign",
            description: "Trespass",
            impact: "bad",
            verificationPlan: "TIME",
            suggestedStakeCoins: 20,
          }),
        ),
    ],
    [
      "timeout",
      async () => {
        throw new DOMException("timeout", "TimeoutError");
      },
    ],
  ])("falls back on %s", async (_name, fetcher) => {
    const result = await new GrokService({
      apiKey: "test",
      fetcher: fetcher as typeof fetch,
      timeoutMs: 1,
    }).designQuest(draft, baseline);
    expect(result).toMatchObject({
      source: "deterministic-fallback",
      title: baseline.title,
    });
  });
});

describe("CV-assisted review", () => {
  const inspect = async (payload: object) =>
    createCvPhotoReview({
      endpoint: "https://cv.test/check",
      apiKey: "test",
      fetcher: async () =>
        new Response(JSON.stringify(payload), { status: 200 }),
    }).inspectReference("media://uploads/photo", "show the task");
  it("keeps high-confidence matches pending for human review", async () =>
    expect(await inspect({ match: true, confidence: 0.96 })).toMatchObject({
      recommendation: "MATCH",
    }));
  it("routes low confidence to review", async () =>
    expect(await inspect({ match: true, confidence: 0.4 })).toMatchObject({
      recommendation: "REVIEW",
      code: "PHOTO_LOW_CONFIDENCE",
    }));
  it("requests a non-shaming retake for a clear mismatch", async () =>
    expect(await inspect({ match: false, confidence: 0.96 })).toMatchObject({
      recommendation: "RETAKE",
      code: "PHOTO_RETAKE_SUGGESTED",
    }));
  it("falls back on timeout and malformed data", async () =>
    expect(await inspect({ nope: true })).toMatchObject({
      recommendation: "REVIEW",
      code: "PHOTO_SERVICE_UNAVAILABLE",
    }));
  it("falls back when unconfigured", async () =>
    expect(
      await createCvPhotoReview({}).inspectReference("media://uploads/photo"),
    ).toMatchObject({ recommendation: "REVIEW", code: "PHOTO_MANUAL_REVIEW" }));
});
