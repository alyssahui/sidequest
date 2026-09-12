import type {
  QuestTemplate,
  VerificationRequirement,
} from "@sidequest/contracts";
const at = (
  type: "GPS" | "PHOTO" | "TIME",
  target?: { latitude: number; longitude: number },
): VerificationRequirement =>
  type === "GPS"
    ? { type, target: target!, radiusMeters: 350, maxAccuracyMeters: 100 }
    : type === "PHOTO"
      ? {
          type,
          prompt:
            "Upload a new quest photo without private messages or personal documents.",
          review: "MANUAL_OR_DEMO",
        }
      : { type, deadline: "2099-12-31T23:59:59.000Z" };
const base = {
  safety: { risk: "LOW", moderation: "APPROVED", flags: [] } as const,
  rewardRange: { min: 20, max: 40 },
  version: 1,
};
export const DEMO_TEMPLATES: QuestTemplate[] = [
  {
    id: "cmu-cleanup",
    title: "Make campus kinder",
    description: "Collect three pieces of litter and dispose of them safely.",
    category: "community-cleanup",
    tags: ["community", "outdoors"],
    ...base,
    spawnRules: {
      areas: ["CMU"],
      placeCategories: ["campus", "park"],
      social: "either",
      minimumNearbyMembers: 0,
      cooldownHours: 24,
    },
    defaultRequirements: [
      at("GPS", { latitude: 40.4433, longitude: -79.9431 }),
      at("TIME"),
    ],
  },
  {
    id: "pgh-reconnect",
    title: "Send a real check-in",
    description:
      "Reconnect with someone you care about with a thoughtful message.",
    category: "reconnect",
    tags: ["friends", "kindness"],
    ...base,
    spawnRules: {
      areas: ["PITTSBURGH", "CMU"],
      placeCategories: [],
      social: "either",
      minimumNearbyMembers: 0,
      cooldownHours: 12,
    },
    defaultRequirements: [at("PHOTO"), at("TIME")],
  },
  {
    id: "cmu-teach",
    title: "Teach a tiny thing",
    description: "Teach a friend one useful idea in ten minutes.",
    category: "learn-teach",
    tags: ["learning", "friends"],
    ...base,
    spawnRules: {
      areas: ["CMU"],
      placeCategories: ["campus", "library"],
      social: "friends",
      minimumNearbyMembers: 1,
      cooldownHours: 24,
    },
    defaultRequirements: [at("TIME")],
  },
  {
    id: "pgh-pantry",
    title: "Help a community pantry",
    description:
      "Donate one requested shelf-stable item during posted public hours.",
    category: "mutual-aid",
    tags: ["community", "kindness"],
    ...base,
    spawnRules: {
      areas: ["PITTSBURGH"],
      placeCategories: ["community-center"],
      allowedHours: { start: 9, end: 18 },
      social: "either",
      minimumNearbyMembers: 0,
      cooldownHours: 72,
    },
    defaultRequirements: [at("PHOTO"), at("TIME")],
  },
  {
    id: "cmu-access",
    title: "Explore an accessible route",
    description:
      "Try a step-free public route and note one useful accessibility detail.",
    category: "accessible-exploration",
    tags: ["accessibility", "learning"],
    ...base,
    safety: {
      ...base.safety,
      abilityNotes:
        "Choose any comfortable distance; mobility aids are welcome.",
    },
    spawnRules: {
      areas: ["CMU"],
      placeCategories: ["campus"],
      social: "either",
      minimumNearbyMembers: 0,
      cooldownHours: 48,
    },
    defaultRequirements: [
      at("GPS", { latitude: 40.4442, longitude: -79.9428 }),
      at("TIME"),
    ],
  },
  {
    id: "pgh-wellness",
    title: "Take a gentle reset",
    description:
      "Spend ten quiet minutes outside or in a public indoor space you enjoy.",
    category: "wellness",
    tags: ["rest", "outdoors"],
    ...base,
    spawnRules: {
      areas: ["PITTSBURGH", "CMU"],
      placeCategories: ["park", "campus"],
      social: "solo",
      minimumNearbyMembers: 0,
      cooldownHours: 24,
    },
    defaultRequirements: [at("TIME")],
  },
  {
    id: "pgh-local",
    title: "Support a local place",
    description:
      "Visit a locally owned public shop and learn one thing about it; purchase is optional.",
    category: "support-local",
    tags: ["local", "learning"],
    ...base,
    spawnRules: {
      areas: ["PITTSBURGH"],
      placeCategories: ["shop", "cafe"],
      social: "either",
      minimumNearbyMembers: 0,
      cooldownHours: 48,
    },
    defaultRequirements: [
      at("GPS", { latitude: 40.4433, longitude: -79.953 }),
      at("TIME"),
    ],
  },
  {
    id: "photo-verification-sandbox",
    title: "Snack Scout · photo test",
    description:
      "Photograph a food or drink item you have right now. This is a safe, no-stakes vision-verification sandbox.",
    category: "wellness",
    tags: ["photo", "food", "demo"],
    ...base,
    spawnRules: {
      areas: ["ANYWHERE"],
      placeCategories: [],
      social: "solo",
      minimumNearbyMembers: 0,
      cooldownHours: 0,
    },
    defaultRequirements: [
      {
        type: "PHOTO",
        prompt:
          "Show a clearly visible food or drink item. Do not include private messages, IDs, or other people.",
        review: "MANUAL_OR_DEMO",
      },
      at("TIME"),
    ],
  },
];
