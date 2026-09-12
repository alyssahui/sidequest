import type { DomainEvent, EconomyOperation } from "@sidequest/contracts";
import {
  ChallengeService,
  DemoPhotoReview,
  DeterministicGpsEvidenceService,
  MemoryStore,
  QuestService,
  VerificationRegistry,
  DEMO_TEMPLATES,
} from "../src";
export function fixture() {
  let n = 0;
  let now = new Date("2026-09-12T16:00:00.000Z");
  const balances = new Map([
    ["zuri", 500],
    ["ben", 500],
    ["stranger", 500],
  ]);
  const operations = new Map<string, unknown>();
  const events: DomainEvent[] = [];
  const store = new MemoryStore(DEMO_TEMPLATES);
  const clock = { now: () => new Date(now) };
  const economy = {
    apply: async (o: EconomyOperation) => {
      const old = operations.get(o.operationId);
      if (old) return old as any;
      const balance = (balances.get(o.userId) ?? 0) + o.amount;
      if (balance < 0) throw Error("INSUFFICIENT");
      balances.set(o.userId, balance);
      const result = { operationId: o.operationId, applied: true, balance };
      operations.set(o.operationId, result);
      return result;
    },
    balanceFor: async (u: string) => balances.get(u) ?? 0,
  };
  const publisher = {
    publish: async (e: DomainEvent) => {
      if (!events.some((x) => x.id === e.id)) events.push(e);
    },
  };
  const quests = new QuestService({
    clock,
    ids: { next: () => `id-${++n}` },
    economy,
    events: publisher,
    quests: store,
    templates: store,
    attempts: store,
    items: store,
    commands: store,
    verification: new VerificationRegistry(
      clock,
      { next: () => `id-${++n}` },
      new DeterministicGpsEvidenceService(),
      new DemoPhotoReview(),
    ),
  });
  const challenges = new ChallengeService({
    clock,
    ids: { next: () => `id-${++n}` },
    economy,
    events: publisher,
    memberships: {
      isMember: async (u, p) => p === "party" && ["zuri", "ben"].includes(u),
    },
    social: { canInteract: async () => ({ allowed: true }) },
    challenges: store,
    commands: store,
    templates: store,
    quests,
    minStake: 5,
    maxStake: 250,
  });
  return {
    quests,
    challenges,
    store,
    events,
    balances,
    operations,
    setNow: (value: string) => {
      now = new Date(value);
    },
  };
}
export async function spawned(f = fixture(), templateId = "cmu-cleanup") {
  const q = await f.quests.spawn({
    templateId,
    ownerUserId: "zuri",
    partyId: "party",
    expiresAt: "2026-09-12T18:00:00.000Z",
    idempotencyKey: `spawn-${templateId}`,
  });
  return { f, q };
}
