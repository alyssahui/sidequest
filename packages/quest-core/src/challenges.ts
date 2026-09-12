import type {
  Challenge,
  Clock,
  EconomyPort,
  EventPublisher,
  IdGenerator,
  PartyMembershipPort,
  SocialSafetyPort,
} from "@sidequest/contracts";
import { QuestError } from "./errors";
import type {
  ChallengeRepository,
  IdempotencyStore,
  TemplateRepository,
} from "./repositories";
import { QuestService } from "./quests";
export type ChallengeDependencies = {
  clock: Clock;
  ids: IdGenerator;
  economy: EconomyPort;
  events: EventPublisher;
  memberships: PartyMembershipPort;
  social: SocialSafetyPort;
  challenges: ChallengeRepository;
  commands: IdempotencyStore;
  templates: TemplateRepository;
  quests: QuestService;
  minStake?: number;
  maxStake?: number;
};
export class ChallengeService {
  private readonly min: number;
  private readonly max: number;
  constructor(private readonly d: ChallengeDependencies) {
    this.min = d.minStake ?? 1;
    this.max = d.maxStake ?? 500;
  }
  async issue(input: {
    issuerUserId: string;
    recipientUserId: string;
    partyId: string;
    questTemplateId: string;
    stakeCoins: number;
    expiresAt: string;
    idempotencyKey: string;
  }): Promise<Challenge> {
    return this.once(
      "issue",
      input.issuerUserId,
      input.idempotencyKey,
      async () => {
        if (
          input.issuerUserId === input.recipientUserId ||
          !Number.isSafeInteger(input.stakeCoins) ||
          input.stakeCoins < this.min ||
          input.stakeCoins > this.max
        )
          throw new QuestError("INVALID_CHALLENGE");
        if (
          !(await this.d.memberships.isMember(
            input.issuerUserId,
            input.partyId,
          )) ||
          !(await this.d.memberships.isMember(
            input.recipientUserId,
            input.partyId,
          ))
        )
          throw new QuestError("NOT_AUTHORIZED");
        const social = await this.d.social.canInteract(
          input.issuerUserId,
          input.recipientUserId,
        );
        if (!social.allowed) throw new QuestError("SOCIAL_INTERACTION_BLOCKED");
        const template = await this.d.templates.get(input.questTemplateId);
        if (
          !template ||
          template.safety.moderation !== "APPROVED" ||
          template.safety.flags.length
        )
          throw new QuestError("INVALID_CHALLENGE");
        const now = this.d.clock.now();
        if (new Date(input.expiresAt) <= now) throw new QuestError("EXPIRED");
        try {
          await this.d.economy.apply({
            operationId: `challenge-issuer-escrow:${input.idempotencyKey}`,
            userId: input.issuerUserId,
            amount: -input.stakeCoins,
            reason: "CHALLENGE_ESCROW",
          });
        } catch {
          throw new QuestError("INSUFFICIENT_BALANCE");
        }
        const c: Challenge = {
          id: this.d.ids.next(),
          issuerUserId: input.issuerUserId,
          recipientUserId: input.recipientUserId,
          partyId: input.partyId,
          questTemplateId: input.questTemplateId,
          stakeCoins: input.stakeCoins,
          status: "PENDING",
          createdAt: now.toISOString(),
          expiresAt: input.expiresAt,
          version: 1,
        };
        await this.d.challenges.save(c);
        await this.publish("challenge.issued", c, input.idempotencyKey);
        return c;
      },
    );
  }
  async respond(input: {
    challengeId: string;
    recipientUserId: string;
    accept: boolean;
    expectedVersion: number;
    idempotencyKey: string;
  }): Promise<Challenge> {
    return this.once(
      "respond",
      input.recipientUserId,
      input.idempotencyKey,
      async () => {
        const c = await this.get(input.challengeId);
        if (c.recipientUserId !== input.recipientUserId)
          throw new QuestError("NOT_AUTHORIZED");
        if (c.version !== input.expectedVersion)
          throw new QuestError("VERSION_CONFLICT");
        if (c.status !== "PENDING") throw new QuestError("INVALID_TRANSITION");
        if (new Date(c.expiresAt) <= this.d.clock.now()) {
          await this.expire({
            challengeId: c.id,
            expectedVersion: c.version,
            idempotencyKey: `auto:${c.id}`,
          });
          throw new QuestError("EXPIRED");
        }
        const old = c.version;
        if (!input.accept) {
          c.status = "DECLINED";
          await this.d.economy.apply({
            operationId: `challenge-refund:${c.id}`,
            userId: c.issuerUserId,
            amount: c.stakeCoins,
            reason: "REFUND",
            relatedEntityId: c.id,
          });
          await this.publish("challenge.declined", c, input.idempotencyKey);
        } else {
          try {
            await this.d.economy.apply({
              operationId: `challenge-recipient-escrow:${c.id}`,
              userId: c.recipientUserId,
              amount: -c.stakeCoins,
              reason: "CHALLENGE_ESCROW",
              relatedEntityId: c.id,
            });
          } catch {
            throw new QuestError("INSUFFICIENT_BALANCE");
          }
          const quest = await this.d.quests.spawn({
            templateId: c.questTemplateId,
            ownerUserId: c.recipientUserId,
            partyId: c.partyId,
            participantIds: [c.recipientUserId],
            expiresAt: c.expiresAt,
            source: { type: "CHALLENGE", sourceId: c.id },
            idempotencyKey: `challenge:${c.id}`,
          });
          c.questId = quest.id;
          c.status = "ACCEPTED";
          await this.publish("challenge.accepted", c, input.idempotencyKey);
        }
        c.version++;
        await this.d.challenges.save(c, old);
        return c;
      },
    );
  }
  async consumeQuestOutcome(input: {
    challengeId: string;
    questStatus: "VERIFIED" | "FAILED" | "EXPIRED";
    idempotencyKey: string;
  }): Promise<Challenge> {
    return this.once("outcome", "system", input.idempotencyKey, async () => {
      const c = await this.get(input.challengeId);
      if (c.status !== "ACCEPTED") throw new QuestError("INVALID_TRANSITION");
      const old = c.version;
      const recipientWins = input.questStatus === "VERIFIED";
      await this.d.economy.apply({
        operationId: `challenge-payout:${c.id}`,
        userId: recipientWins ? c.recipientUserId : c.issuerUserId,
        amount: c.stakeCoins * 2,
        reason: "CHALLENGE_PAYOUT",
        relatedEntityId: c.id,
      });
      c.status = recipientWins ? "COMPLETED" : "FAILED";
      c.resolvedAt = this.d.clock.now().toISOString();
      c.version++;
      await this.d.challenges.save(c, old);
      return c;
    });
  }
  async expire(input: {
    challengeId: string;
    expectedVersion: number;
    idempotencyKey: string;
  }) {
    return this.once("expire", "system", input.idempotencyKey, async () => {
      const c = await this.get(input.challengeId);
      if (c.version !== input.expectedVersion)
        throw new QuestError("VERSION_CONFLICT");
      if (c.status !== "PENDING" || new Date(c.expiresAt) > this.d.clock.now())
        throw new QuestError("INVALID_TRANSITION");
      const old = c.version;
      c.status = "EXPIRED";
      c.resolvedAt = this.d.clock.now().toISOString();
      c.version++;
      await this.d.economy.apply({
        operationId: `challenge-expiry-refund:${c.id}`,
        userId: c.issuerUserId,
        amount: c.stakeCoins,
        reason: "REFUND",
        relatedEntityId: c.id,
      });
      await this.d.challenges.save(c, old);
      return c;
    });
  }
  async list(userId: string) {
    return this.d.challenges.listChallengesForUser(userId);
  }
  private async get(id: string) {
    const c = await this.d.challenges.get(id);
    if (!c) throw new QuestError("NOT_FOUND");
    return c;
  }
  private async once<T>(
    scope: string,
    actor: string,
    key: string,
    fn: () => Promise<T>,
  ) {
    const bucket = `challenge:${scope}:${actor}`;
    const old = await this.d.commands.getResult<T>(bucket, key);
    if (old) return old;
    const result = await fn();
    await this.d.commands.putResult(bucket, key, result);
    return result;
  }
  private publish(type: string, c: Challenge, correlationId: string) {
    return this.d.events.publish({
      id: `${type}:${c.id}`,
      type,
      version: 1,
      occurredAt: this.d.clock.now().toISOString(),
      actorUserId: c.issuerUserId,
      partyId: c.partyId,
      aggregateId: c.id,
      correlationId,
      payload: {
        challengeId: c.id,
        issuerUserId: c.issuerUserId,
        recipientUserId: c.recipientUserId,
        stakeCoins: c.stakeCoins,
        status: c.status,
        questId: c.questId,
      },
    });
  }
}
