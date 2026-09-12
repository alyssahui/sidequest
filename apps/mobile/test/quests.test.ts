import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const screen = readFileSync(
  new URL("../src/features/quests/QuestsScreen.tsx", import.meta.url),
  "utf8",
);
const states = readFileSync(
  new URL("../src/features/quests/QuestStatePanel.tsx", import.meta.url),
  "utf8",
);
const challenge = readFileSync(
  new URL("../src/features/challenges/ChallengeCard.tsx", import.meta.url),
  "utf8",
);
const composer = readFileSync(
  new URL("../src/features/challenges/ChallengeComposer.tsx", import.meta.url),
  "utf8",
);
const briefing = readFileSync(
  new URL("../src/features/quests/QuestBriefing.tsx", import.meta.url),
  "utf8",
);

describe("quest PWA surface", () => {
  it.each(["ACTIVE", "NEARBY", "CHALLENGES", "MY LIST"])(
    "renders the %s section",
    (section) => expect(screen).toContain(`"${section}"`),
  );

  it.each([
    "loading",
    "empty",
    "error",
    "offline",
    "permission-denied",
    "expired",
    "conflict",
    "complete",
  ])("defines the %s state", (state) => expect(states).toContain(state));

  it("states challenge consent and location privacy", () => {
    expect(challenge).toContain("Declining has no penalty");
    expect(challenge).toMatch(/never\s+shares your location/);
  });

  it("uses accessible tabs and controls", () => {
    expect(screen).toContain('accessibilityRole="tablist"');
    expect(screen).toContain('accessibilityRole="tab"');
    expect(screen).toContain('accessibilityRole="button"');
  });

  it("converts list items into active quests instead of a hidden reveal", () => {
    expect(screen).toContain('setSection("ACTIVE")');
    expect(screen).toContain("setCustomActive");
    expect(screen).toContain("just evolved into a live quest");
  });

  it("offers challenge construction, classification, barter and delivery", () => {
    expect(composer).toContain("CHALLENGE PLAYER");
    expect(composer).toContain("symmetric barter");
    expect(composer).toContain("SEND CHALLENGE");
    expect(challenge).toContain("% COMPLETE");
  });

  it.each(["OBJECTIVE", "TIME", "LOCATION", "FIELD NOTES"])(
    "renders quest briefing detail %s",
    (label) => expect(briefing).toContain(label),
  );
});
