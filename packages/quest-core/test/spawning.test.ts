import { describe, expect, it } from "vitest";
import { DEMO_TEMPLATES, QuestSuggestionService } from "../src";
const base = {
  userId: "zuri",
  now: "2026-09-12T16:00:00.000Z",
  area: "CMU",
  placeCategories: ["campus"],
  preferenceTags: ["community", "learning"],
  socialPreference: "either" as const,
  nearbyMemberCount: 1,
  activeCount: 0,
  spawnedCount: 0,
  history: [],
};
describe("deterministic spawning", () => {
  it("ranks deterministically with explanations", () => {
    const s = new QuestSuggestionService().suggest(base, DEMO_TEMPLATES);
    expect(s.map((x) => x.template.id)).toEqual([
      "cmu-access",
      "cmu-cleanup",
      "cmu-teach",
    ]);
    expect(s[0].reason).toContain("interests");
  });
  it("enforces cooldown, social preference, safety and caps", () => {
    const service = new QuestSuggestionService();
    expect(
      service.suggest({ ...base, activeCount: 3 }, DEMO_TEMPLATES),
    ).toEqual([]);
    expect(
      service
        .suggest(
          {
            ...base,
            history: [
              {
                templateId: "cmu-teach",
                status: "VERIFIED",
                occurredAt: "2026-09-12T15:00:00.000Z",
              },
            ],
          },
          DEMO_TEMPLATES,
        )
        .some((x) => x.template.id === "cmu-teach"),
    ).toBe(false);
    const unsafe = {
      ...DEMO_TEMPLATES[0],
      id: "unsafe",
      safety: { ...DEMO_TEMPLATES[0].safety, flags: ["dangerous"] },
    };
    expect(service.suggest(base, [unsafe])).toEqual([]);
    expect(
      service.suggest(
        { ...base, socialPreference: "solo", nearbyMemberCount: 0 },
        [DEMO_TEMPLATES[2]],
      ),
    ).toEqual([]);
  });
  it("returns a stable no-result fallback", () => {
    expect(
      new QuestSuggestionService().suggest(
        { ...base, area: "NOWHERE" },
        DEMO_TEMPLATES,
      ),
    ).toEqual([]);
  });
});
