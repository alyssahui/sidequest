import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { demoQuests, questsForViewer } from "../src/features/quests/demoData";

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
    expect(screen).toContain("Placed by you");
    expect(screen).toContain('direction === "OUTGOING"');
    expect(screen).toContain("questsForViewer");
    expect(add).toContain("creatorUserId: user.id");
    expect(add).toContain("recipientUserId: recipient.id");
  });

  it("color-codes own tasks yellow and challenges/system quests red", () => {
    expect(row).toContain("yellow");
    expect(row).toContain("red");
    expect(row).toContain("surfaceStroke");
    expect(row).toContain("brandDeepStroke");
    expect(row).toContain("strokes.card");
    expect(row).toContain("LocationPinIcon");
    expect(row).toContain("creatorAvatar");
    expect(row).toContain("Created by");
    expect(row).toContain("Challenging");
    expect(row).not.toContain("PersonIcon");
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

describe("quest viewer projection", () => {
  it("shows Etash's challenge to Zuri as incoming with Etash as creator", () => {
    const zuri = questsForViewer(demoQuests, "user-zuri");
    const incoming = zuri.find((quest) => quest.id === "challenge-ben");
    expect(incoming).toMatchObject({
      direction: "INCOMING",
      creatorName: "Etash",
      creatorAvatar: "E",
      person: "Etash",
      attention: true,
    });
    expect(zuri.some((quest) => quest.id === "own-wean")).toBe(true);
    expect(zuri.some((quest) => quest.direction === "OUTGOING")).toBe(false);
    expect(zuri.some((quest) => quest.id === "own-ben-faucet")).toBe(false);
  });

  it("puts that same challenge in Etash's Placed list named for Zuri", () => {
    const ben = questsForViewer(demoQuests, "user-ben");
    const placed = ben.filter((quest) => quest.direction === "OUTGOING");
    const active = ben.filter((quest) => quest.direction !== "OUTGOING");
    expect(placed).toEqual([
      expect.objectContaining({
        id: "challenge-ben",
        creatorName: "Zuri",
        creatorAvatar: "Z",
        person: "Zuri",
        attention: false,
      }),
    ]);
    expect(active.map((quest) => quest.id)).toEqual(["own-ben-faucet"]);
    expect(active[0]?.creatorName).toBe("You");
  });

  it("hides other people's tasks from Alyssa", () => {
    const alyssa = questsForViewer(demoQuests, "user-alyssa");
    expect(alyssa.map((quest) => quest.id)).toEqual(["own-alyssa-kit"]);
    expect(alyssa[0]).toMatchObject({
      direction: "SELF",
      creatorName: "You",
      creatorAvatar: "A",
    });
  });
});
