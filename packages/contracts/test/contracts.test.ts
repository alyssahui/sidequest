import { describe, expect, it } from "vitest";

import { rootTabLabels, rootTabs } from "../src/navigation";

describe("navigation contract", () => {
  it("keeps the canonical five tabs with Map first", () => {
    expect(rootTabs).toEqual(["map", "quests", "party", "feed", "profile"]);
    expect(rootTabLabels.map).toBe("MAP");
    expect(rootTabs).not.toContain("bet");
  });
});
