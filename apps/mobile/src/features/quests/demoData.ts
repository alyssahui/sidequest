export type QuestSection = "ACTIVE" | "NEARBY" | "CHALLENGES" | "MY LIST";
export const demoActive = {
  title: "Make campus kinder",
  deadline: "42 min left",
  reward: 30,
  participants: "You + Alyssa",
  steps: ["Reach the CMU area", "Upload current GPS", "Finish before deadline"],
  briefing: {
    explanation:
      "⚡ Campus kindness quest locked in! Three tiny cleanups become one visible win for everyone sharing the space.",
    objective:
      "Collect three safe pieces of litter and place them in the correct bin.",
    timeLabel: "Finish within 42 minutes",
    locationLabel: "CMU campus public paths",
    notes: ["Wear gloves or use a grabber", "Skip sharp or unsafe objects"],
  },
};
export const demoNearby = [
  {
    id: "cmu-teach",
    title: "Teach a tiny thing",
    meta: "180m · 25 coins · TIME",
    reason: "Learning interest · one friend nearby",
  },
  {
    id: "cmu-access",
    title: "Explore an accessible route",
    meta: "320m · 20 coins · GPS + TIME",
    reason: "Accessibility interest · near campus",
  },
];
export const demoChallenges = [
  {
    id: "challenge-ben",
    direction: "INCOMING",
    person: "Ben",
    title: "Teach a tiny thing",
    stake: 25,
    expires: "58 min",
    status: "PENDING",
    progress: 0,
    explanation:
      "🔥 Ben sent a quick learning duel. Accept only if the mission fits your day.",
  },
  {
    id: "challenge-alyssa",
    direction: "OUTGOING",
    person: "Alyssa",
    title: "Make campus kinder",
    stake: 15,
    expires: "2 hrs",
    status: "PENDING",
    progress: 0,
    explanation:
      "⚡ Delivered to Alyssa. Your 15 coins are safely held while she decides.",
  },
] as const;
export const demoItems = [
  { id: "item-1", kind: "WANT", text: "Try a pottery class" },
  { id: "item-2", kind: "NEED", text: "Return library books" },
] as const;
