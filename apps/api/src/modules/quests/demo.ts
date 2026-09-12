import {
  ChallengeService,
  DemoPhotoReview,
  DeterministicGpsEvidenceService,
  MemoryStore,
  QuestService,
  QuestSuggestionService,
  VerificationRegistry,
  DEMO_TEMPLATES,
  type PhotoReviewPort,
} from "@sidequest/quest-core";
import type {
  Clock,
  EconomyPort,
  IdGenerator,
  PartyMembershipPort,
  QuestGpsEvidenceService,
} from "@sidequest/contracts";
import {
  CryptoIdGenerator,
  DemoPartyMemberships,
  InMemoryEconomy,
  InMemoryEventBus,
  SystemClock,
} from "../../foundation/demoAdapters";

type DemoQuestOverrides = {
  /** Supplied by the API so GPS verification is backed by the location module. */
  gps?: QuestGpsEvidenceService;
  clock?: Clock;
  ids?: IdGenerator;
  economy?: EconomyPort;
  events?: InMemoryEventBus;
  memberships?: PartyMembershipPort;
  photo?: PhotoReviewPort;
};

export function createDemoQuestRuntime(overrides: DemoQuestOverrides = {}) {
  const clock = overrides.clock ?? new SystemClock();
  const ids = overrides.ids ?? new CryptoIdGenerator();
  const store = new MemoryStore(DEMO_TEMPLATES);
  const economy = overrides.economy ?? new InMemoryEconomy();
  const events = overrides.events ?? new InMemoryEventBus();
  const memberships = overrides.memberships ?? new DemoPartyMemberships();
  const verification = new VerificationRegistry(
    clock,
    ids,
    overrides.gps ?? new DeterministicGpsEvidenceService(),
    overrides.photo ?? new DemoPhotoReview(),
  );
  const services = {
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
  const challengeService = new ChallengeService({
    clock,
    ids,
    economy,
    events,
    memberships,
    social: { canInteract: async () => ({ allowed: true }) },
    challenges: store,
    commands: store,
    templates: store,
    quests: services.quests,
    minStake: 5,
    maxStake: 250,
  });

  const seed = async () => {
    const existing = await services.quests.list("user-zuri");
    if (existing.nearby.length) return existing.nearby[0];
    return services.quests.spawn({
      templateId: "cmu-cleanup",
      ownerUserId: "user-zuri",
      partyId: "party-demo",
      expiresAt: new Date(clock.now().getTime() + 12 * 3600000).toISOString(),
      reasonForYou: "Community interest · near campus",
      idempotencyKey: "seed-cmu-cleanup",
    });
  };

  return { services, challengeService, seed };
}

const defaultRuntime = createDemoQuestRuntime();
export const demoQuestServices = defaultRuntime.services;
export const demoChallengeService = defaultRuntime.challengeService;
export const seedQuestDemo = defaultRuntime.seed;
