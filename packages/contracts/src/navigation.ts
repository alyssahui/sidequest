export const rootTabs = ["map", "quests", "party", "bet", "profile"] as const;

export type RootTab = (typeof rootTabs)[number];

export const rootTabLabels: Record<RootTab, string> = {
  map: "MAP",
  quests: "QUESTS",
  party: "PARTY",
  bet: "BET",
  profile: "PROFILE",
};
