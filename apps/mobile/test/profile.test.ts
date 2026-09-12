import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const profile = readFileSync(
  new URL("../src/features/profile/ProfileScreen.tsx", import.meta.url),
  "utf8",
);
const prefs = readFileSync(
  new URL("../src/features/profile/PreferencesScreen.tsx", import.meta.url),
  "utf8",
);
const route = readFileSync(
  new URL("../app/(tabs)/profile/preferences.tsx", import.meta.url),
  "utf8",
);

describe("profile actions", () => {
  it("hides account actions until the own profile card is pressed", () => {
    expect(profile).toContain("actionsOpen");
    expect(profile).toContain("isSelf");
    expect(profile).toContain("ACCOUNT");
    expect(profile).toContain("SET PREFERENCES");
    expect(profile).toContain("NOTIFICATIONS");
    expect(profile).toContain('router.push("/profile/preferences")');
  });

  it("uses a dedicated preferences page with a large activity list and Other", () => {
    expect(route).toContain("PreferencesScreen");
    expect(prefs).toContain("QUEST STYLE");
    expect(prefs).toContain("I LIKE TO DO");
    expect(prefs).toContain("OTHER");
    expect(prefs).toContain("Other…");
    expect(prefs).toContain("ACTIVITY_OPTIONS");
    expect(prefs).not.toContain("Modal");
  });
});
