import {
  ChallengeService,
  DemoPhotoReview,
  DeterministicGpsEvidenceService,
  MemoryStore,
  QuestService,
  QuestSuggestionService,
  VerificationRegistry,
  DEMO_TEMPLATES,
} from "@sidequest/quest-core";
import {
  CryptoIdGenerator,
  DemoPartyMemberships,
  InMemoryEconomy,
  InMemoryEventBus,
  SystemClock,
} from "../../foundation/demoAdapters";
const clock = new SystemClock();
const ids = new CryptoIdGenerator();
const store = new MemoryStore(DEMO_TEMPLATES);
const economy = new InMemoryEconomy();
const events = new InMemoryEventBus();
const memberships = new DemoPartyMemberships();
const verification = new VerificationRegistry(
  clock,
  ids,
  new DeterministicGpsEvidenceService(),
  new DemoPhotoReview(),
);
export const demoQuestServices = {
  clock,
  ids,
  store,
  economy,
  events,
  memberships,
  spawning: new QuestSuggestionService(),
  quests: new QuestService({
    clock,
    ids,
    economy,
    events,
    quests: store,
    templates: store,
    attempts: store,
    items: store,
    commands: store,
    verification,
  }),
};
export const demoChallengeService = new ChallengeService({
  clock,
  ids,
  economy,
  events,
  memberships,
  social: { canInteract: async () => ({ allowed: true }) },
  challenges: store,
  commands: store,
  templates: store,
  quests: demoQuestServices.quests,
  minStake: 5,
  maxStake: 250,
});
export async function seedQuestDemo() {
  const existing = await demoQuestServices.quests.list("user-zuri");
  if (existing.nearby.length) return existing.nearby[0];
  return demoQuestServices.quests.spawn({
    templateId: "cmu-cleanup",
    ownerUserId: "user-zuri",
    partyId: "party-demo",
    expiresAt: new Date(clock.now().getTime() + 12 * 3600000).toISOString(),
    reasonForYou: "Community interest · near campus",
    idempotencyKey: "seed-cmu-cleanup",
  });
}
