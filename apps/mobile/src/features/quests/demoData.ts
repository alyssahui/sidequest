export type QuestSection = "ACTIVE" | "NEARBY" | "CHALLENGES" | "MY LIST";
export const demoActive = {
  title: "Make campus kinder",
  deadline: "42 min left",
  reward: 30,
  participants: "You + Alyssa",
  steps: ["Reach the CMU area", "Upload current GPS", "Finish before deadline"],
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
  },
  {
    id: "challenge-alyssa",
    direction: "OUTGOING",
    person: "Alyssa",
    title: "Make campus kinder",
    stake: 15,
    expires: "2 hrs",
    status: "PENDING",
  },
] as const;
export const demoItems = [
  { id: "item-1", kind: "WANT", text: "Try a pottery class" },
  { id: "item-2", kind: "NEED", text: "Return library books" },
] as const;
