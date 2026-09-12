import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const screen = readFileSync(
  new URL("../src/features/quests/QuestsScreen.tsx", import.meta.url),
  "utf8",
);
const row = readFileSync(
  new URL("../src/features/quests/QuestRow.tsx", import.meta.url),
  "utf8",
);
const overlay = readFileSync(
  new URL("../src/features/quests/QuestDetailOverlay.tsx", import.meta.url),
  "utf8",
);
const add = readFileSync(
  new URL("../src/features/quests/AddTaskOverlay.tsx", import.meta.url),
  "utf8",
);
const states = readFileSync(
  new URL("../src/features/quests/QuestStatePanel.tsx", import.meta.url),
  "utf8",
);
const briefing = readFileSync(
  new URL("../src/features/quests/QuestBriefing.tsx", import.meta.url),
  "utf8",
);

describe("quest PWA surface", () => {
  it("keeps a condensed list without markets or section tabs", () => {
    expect(screen).toContain("QuestRow");
    expect(screen).not.toContain("PredictionMarketCard");
    expect(screen).not.toContain("SelfBountyCard");
    expect(screen).not.toContain('"MY LIST"');
    expect(screen).not.toContain('"NEARBY"');
  });

  it("puts add-task in the header and supports self-wager plus friend challenges", () => {
    expect(screen).toContain(
      'accessibilityLabel="Add a task or challenge a friend"',
    );
    expect(add).toContain("QUEST");
    expect(add).not.toContain("MY TASK");
    expect(add).not.toContain("CHALLENGE A FRIEND");
    expect(add).toContain("CHALLENGE PLAYER");
    expect(add).toContain("SELF-WAGER");
    expect(add).toContain("SEND CHALLENGE");
    expect(add).toContain("BY THIS DATE");
    expect(add).toContain("Due day");
    expect(add).toContain("Due time");
    expect(add).toContain("defaultDue");
    expect(add).toContain('"n/a"');
    expect(add).not.toContain("Your call");
    expect(add).not.toContain("A promise you put credit behind yourself");
    expect(row).toContain("quest.description ?");
    expect(screen).toContain("current + selected.stake");
    expect(screen).toContain("current - selected.stake");
  });

  it("color-codes own tasks yellow and challenges/system quests red", () => {
    expect(row).toContain("yellow");
    expect(row).toContain("red");
    expect(row).toContain("surfaceStroke");
    expect(row).toContain("brandDeepStroke");
    expect(row).toContain("strokes.card");
    expect(row).toContain("LocationPinIcon");
    expect(row).toContain("PersonIcon");
    expect(row).toContain("formatTimeLeft");
    expect(row).toContain("dueAt");
    expect(overlay).toContain("formatTimeLeft");
  });

  it("resolves pending challenges in an overlay", () => {
    expect(overlay).toContain("ACCEPT");
    expect(overlay).toContain("DECLINE");
    expect(overlay).toContain("WAGER");
    expect(overlay).not.toContain("fits your day");
    expect(overlay).not.toContain("no hard feelings");
    expect(overlay).not.toContain("never shares your location");
    expect(screen).toContain("attention: false");
  });

  it.each([
    "loading",
    "empty",
    "error",
    "offline",
    "permission-denied",
    "expired",
    "conflict",
    "complete",
  ])("still defines the %s state", (state) => expect(states).toContain(state));

  it.each(["OBJECTIVE", "TIME", "LOCATION", "FIELD NOTES"])(
    "keeps quest briefing detail %s",
    (label) => expect(briefing).toContain(label),
  );
});
