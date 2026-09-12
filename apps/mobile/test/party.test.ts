import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const party = readFileSync(
  new URL("../src/features/party/PartyScreen.tsx", import.meta.url),
  "utf8",
);
const feed = readFileSync(
  new URL("../src/features/feed/FeedScreen.tsx", import.meta.url),
  "utf8",
);
const tabs = readFileSync(
  new URL("../app/(tabs)/_layout.tsx", import.meta.url),
  "utf8",
);
const preview = readFileSync(
  new URL("../src/features/party/FriendPreviewOverlay.tsx", import.meta.url),
  "utf8",
);
const layout = readFileSync(
  new URL("../app/_layout.tsx", import.meta.url),
  "utf8",
);

describe("party absorbs the feed", () => {
  it("keeps party and feed on one party screen", () => {
    expect(party).toContain('accessibilityRole="tablist"');
    expect(party).toContain('"PARTY"');
    expect(party).toContain('"FEED"');
    expect(party).toContain("Your Party");
    expect(party).toContain("FeedEventList");
  });

  it("lets you add friends and preview a member", () => {
    expect(party).toContain('accessibilityLabel="Add a friend"');
    expect(party).toContain("FriendPreviewOverlay");
    expect(preview).toContain("CREDIT");
    expect(preview).toContain("RECENTLY COMPLETED");
    expect(preview).toContain("PREFERENCES");
    expect(preview).toContain("{member.self ? (");
    expect(party).toContain('router.push("/profile/preferences")');
  });

  it("still renders party presence and feed copy", () => {
    expect(party).toContain("Exact live locations stay private");
    expect(feed).toContain("completed “7 AM Run”");
    expect(feed).toContain("challenged Maya");
  });

  it("does not keep a root feed tab", () => {
    expect(tabs).not.toContain('name="feed"');
    expect(tabs).toContain('name="bet"');
  });
});

describe("global chrome", () => {
  it("adds a casino chip bar and equal nav icon boxes", () => {
    expect(layout).toContain("CasinoChipBar");
    expect(tabs).toContain("height: 24");
    expect(tabs).toContain("width: 24");
    expect(tabs).toContain("justifyContent: \"flex-end\"");
    expect(tabs).toContain("map: 23");
    expect(tabs).toContain("quests: 18");
    expect(tabs).toContain("party: 23");
  });
});
