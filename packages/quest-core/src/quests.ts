import type {
  Clock,
  EconomyPort,
  EventPublisher,
  IdGenerator,
  ImpactSummary,
  QuestInstance,
  QuestStatus,
  QuestTemplate,
  VerificationAttempt,
  WantNeedItem,
  EvidenceSubmission,
} from "@sidequest/contracts";
import { QuestError } from "./errors";
import type {
  AttemptRepository,
  IdempotencyStore,
  QuestRepository,
  TemplateRepository,
  WantNeedRepository,
} from "./repositories";
import { VerificationRegistry } from "./verification";
const transitions: Record<QuestStatus, QuestStatus[]> = {
  SPAWNED: ["ACCEPTED", "DISMISSED", "EXPIRED"],
  ACCEPTED: ["IN_PROGRESS", "EXPIRED"],
  IN_PROGRESS: ["VERIFIED", "FAILED", "EXPIRED"],
  VERIFIED: [],
  FAILED: [],
  EXPIRED: [],
  DISMISSED: [],
};
export type QuestDependencies = {
  clock: Clock;
  ids: IdGenerator;
  economy: EconomyPort;
  events: EventPublisher;
  quests: QuestRepository;
  templates: TemplateRepository;
  attempts: AttemptRepository;
  items: WantNeedRepository;
  commands: IdempotencyStore;
  verification: VerificationRegistry;
};
export class QuestService {
  constructor(private readonly d: QuestDependencies) {}
  async spawn(input: {
    templateId: string;
    ownerUserId: string;
    partyId?: string;
    participantIds?: string[];
    expiresAt: string;
    reasonForYou?: string;
    source?: QuestInstance["source"];
    idempotencyKey: string;
  }): Promise<QuestInstance> {
    return this.once(
      "spawn",
      input.ownerUserId,
      input.idempotencyKey,
      async () => {
        const template = await this.template(input.templateId);
        this.assertSafe(template);
        const now = this.d.clock.now();
        if (new Date(input.expiresAt) <= now) throw new QuestError("EXPIRED");
        const reward = template.rewardRange.min;
        const quest: QuestInstance = {
          id: this.d.ids.next(),
          templateId: template.id,
          ownerUserId: input.ownerUserId,
          partyId: input.partyId,
          participantIds: [
            ...new Set(input.participantIds ?? [input.ownerUserId]),
          ],
          title: template.title,
          description: template.description,
          rewardCoins: reward,
          requirements: structuredClone(template.defaultRequirements),
          source: input.source ?? { type: "SPAWN" },
          status: "SPAWNED",
          reasonForYou: input.reasonForYou,
          createdAt: now.toISOString(),
          expiresAt: input.expiresAt,
          version: 1,
        };
        await this.d.quests.save(quest);
        await this.publish("quest.spawned", quest, input.idempotencyKey, {
          questId: quest.id,
          status: quest.status,
          rewardCoins: reward,
          expiresAt: quest.expiresAt,
        });
        return quest;
      },
    );
  }
  accept(input: {
    questId: string;
    actorUserId: string;
    expectedVersion: number;
    idempotencyKey: string;
  }) {
    return this.change(
      "accept",
      input,
      "ACCEPTED",
      "acceptedAt",
      "quest.accepted",
    );
  }
  start(input: {
    questId: string;
    actorUserId: string;
    expectedVersion: number;
    idempotencyKey: string;
  }) {
    return this.change("start", input, "IN_PROGRESS", "startedAt");
  }
  dismiss(input: {
    questId: string;
    actorUserId: string;
    expectedVersion: number;
    idempotencyKey: string;
  }) {
    return this.change("dismiss", input, "DISMISSED");
  }
  async expire(input: {
    questId: string;
    expectedVersion: number;
    idempotencyKey: string;
  }): Promise<QuestInstance> {
    return this.once("expire", "system", input.idempotencyKey, async () => {
      const q = await this.quest(input.questId);
      if (new Date(q.expiresAt) > this.d.clock.now())
        throw new QuestError("INVALID_TRANSITION");
      return this.persistTransition(
        q,
        "EXPIRED",
        input.expectedVersion,
        "DEADLINE_PASSED",
      );
    });
  }
  async submitEvidence(input: {
    questId: string;
    actorUserId: string;
    expectedVersion: number;
    evidence: EvidenceSubmission;
    idempotencyKey: string;
  }): Promise<VerificationAttempt> {
    return this.once(
      "evidence",
      input.actorUserId,
      input.idempotencyKey,
      async () => {
        let q = await this.owned(input.questId, input.actorUserId);
        if (!["ACCEPTED", "IN_PROGRESS"].includes(q.status))
          throw new QuestError("INVALID_TRANSITION");
        if (q.version !== input.expectedVersion)
          throw new QuestError("VERSION_CONFLICT");
        if (new Date(q.expiresAt) <= this.d.clock.now()) {
          await this.persistTransition(
            q,
            "EXPIRED",
            q.version,
            "DEADLINE_PASSED",
          );
          throw new QuestError("EXPIRED");
        }
        if (q.status === "ACCEPTED") {
          const started = {
            ...q,
            status: "IN_PROGRESS" as const,
            startedAt: this.d.clock.now().toISOString(),
            version: q.version + 1,
          };
          await this.d.quests.save(started, q.version);
          q = started;
        }
        const attempt = await this.d.verification.evaluate(
          q.id,
          input.actorUserId,
          q.requirements,
          input.evidence,
        );
        await this.d.attempts.save(attempt);
        await this.publish(
          "quest.verification_submitted",
          q,
          input.idempotencyKey,
          { questId: q.id, attemptId: attempt.id, decision: attempt.decision },
        );
        if (attempt.decision !== "PENDING_REVIEW")
          await this.resolve(
            q,
            attempt.decision === "VERIFIED",
            attempt.reasonCode,
          );
        return attempt;
      },
    );
  }
  async reviewPhoto(input: {
    questId: string;
    attemptId: string;
    reviewerUserId: string;
    accepted: boolean;
    idempotencyKey: string;
  }): Promise<VerificationAttempt> {
    return this.once(
      "photo-review",
      input.reviewerUserId,
      input.idempotencyKey,
      async () => {
        const q = await this.quest(input.questId);
        const attempts = await this.d.attempts.listForQuest(q.id);
        const attempt = attempts.find((a) => a.id === input.attemptId);
        if (!attempt || attempt.decision !== "PENDING_REVIEW")
          throw new QuestError("INVALID_EVIDENCE");
        const now = this.d.clock.now().toISOString();
        attempt.checks = attempt.checks.map((c) =>
          c.type === "PHOTO"
            ? {
                ...c,
                decision: input.accepted ? "VERIFIED" : "FAILED",
                code: input.accepted
                  ? "PHOTO_MANUALLY_ACCEPTED"
                  : "PHOTO_MANUALLY_REJECTED",
              }
            : c,
        );
        attempt.decision =
          input.accepted &&
          attempt.checks.every((c) => c.decision === "VERIFIED")
            ? "VERIFIED"
            : "FAILED";
        attempt.reasonCode = input.accepted
          ? "ALL_REQUIREMENTS_MET"
          : "PHOTO_REJECTED";
        attempt.reviewer = {
          type: "MANUAL",
          reviewerId: input.reviewerUserId,
          reviewedAt: now,
        };
        await this.d.attempts.save(attempt);
        await this.resolve(
          q,
          attempt.decision === "VERIFIED",
          attempt.reasonCode,
        );
        return attempt;
      },
    );
  }
  async addItem(input: {
    ownerUserId: string;
    kind: "WANT" | "NEED";
    text: string;
    tags: string[];
    idempotencyKey: string;
  }) {
    return this.once(
      "item-add",
      input.ownerUserId,
      input.idempotencyKey,
      async () => {
        const text = input.text.trim();
        if (text.length < 2 || text.length > 160)
          throw new QuestError("INVALID_EVIDENCE");
        const now = this.d.clock.now().toISOString();
        const item: WantNeedItem = {
          id: this.d.ids.next(),
          ownerUserId: input.ownerUserId,
          kind: input.kind,
          text,
          tags: input.tags.slice(0, 8),
          createdAt: now,
          updatedAt: now,
          version: 1,
        };
        await this.d.items.save(item);
        return item;
      },
    );
  }
  async editItem(input: {
    itemId: string;
    ownerUserId: string;
    text: string;
    tags: string[];
    expectedVersion: number;
  }) {
    const item = await this.d.items.get(input.itemId);
    if (!item || item.ownerUserId !== input.ownerUserId)
      throw new QuestError("NOT_AUTHORIZED");
    const previous = item.version;
    if (previous !== input.expectedVersion)
      throw new QuestError("VERSION_CONFLICT");
    item.text = input.text.trim();
    item.tags = input.tags.slice(0, 8);
    item.updatedAt = this.d.clock.now().toISOString();
    item.version++;
    await this.d.items.save(item, previous);
    return item;
  }
  async removeItem(itemId: string, ownerUserId: string) {
    if (!(await this.d.items.remove(itemId, ownerUserId)))
      throw new QuestError("NOT_AUTHORIZED");
  }
  async convertItem(input: {
    itemId: string;
    ownerUserId: string;
    templateId: string;
    expiresAt: string;
    idempotencyKey: string;
  }) {
    const item = await this.d.items.get(input.itemId);
    if (!item || item.ownerUserId !== input.ownerUserId)
      throw new QuestError("NOT_AUTHORIZED");
    const quest = await this.spawn({
      templateId: input.templateId,
      ownerUserId: input.ownerUserId,
      expiresAt: input.expiresAt,
      source: { type: "WANT_NEED", sourceId: item.id },
      idempotencyKey: `convert:${input.idempotencyKey}`,
    });
    const previous = item.version;
    item.convertedQuestId = quest.id;
    item.updatedAt = this.d.clock.now().toISOString();
    item.version++;
    await this.d.items.save(item, previous);
    return quest;
  }
  async list(userId: string) {
    const quests = await this.d.quests.listForUser(userId);
    return {
      active: quests.filter((q) =>
        ["ACCEPTED", "IN_PROGRESS"].includes(q.status),
      ),
      nearby: quests.filter((q) => q.status === "SPAWNED"),
      history: quests.filter((q) =>
        ["VERIFIED", "FAILED", "EXPIRED", "DISMISSED"].includes(q.status),
      ),
      items: await this.d.items.listItems(userId),
    };
  }
  async impact(userId: string): Promise<ImpactSummary> {
    const complete = (await this.d.quests.listForUser(userId)).filter(
      (q) => q.status === "VERIFIED",
    );
    const categories: ImpactSummary["categories"] = {};
    for (const q of complete) {
      const t = await this.d.templates.get(q.templateId);
      if (t) categories[t.category] = (categories[t.category] ?? 0) + 1;
    }
    return { completedActions: complete.length, categories };
  }
  private async change(
    scope: string,
    input: {
      questId: string;
      actorUserId: string;
      expectedVersion: number;
      idempotencyKey: string;
    },
    next: QuestStatus,
    timestamp?: "acceptedAt" | "startedAt",
    event?: string,
  ) {
    return this.once(
      scope,
      input.actorUserId,
      input.idempotencyKey,
      async () => {
        const q = await this.owned(input.questId, input.actorUserId);
        if (new Date(q.expiresAt) <= this.d.clock.now())
          throw new QuestError("EXPIRED");
        if (q.version !== input.expectedVersion)
          throw new QuestError("VERSION_CONFLICT");
        if (!transitions[q.status].includes(next))
          throw new QuestError("INVALID_TRANSITION");
        const updated = { ...q, status: next, version: q.version + 1 };
        if (timestamp) updated[timestamp] = this.d.clock.now().toISOString();
        await this.d.quests.save(updated, q.version);
        if (event)
          await this.publish(event, updated, input.idempotencyKey, {
            questId: q.id,
            status: next,
          });
        return updated;
      },
    );
  }
  private async persistTransition(
    q: QuestInstance,
    next: QuestStatus,
    expected: number,
    reason?: string,
  ) {
    if (q.version !== expected) throw new QuestError("VERSION_CONFLICT");
    if (!transitions[q.status].includes(next))
      throw new QuestError("INVALID_TRANSITION");
    const updated = {
      ...q,
      status: next,
      version: q.version + 1,
      resolutionReason: reason,
    };
    if (["VERIFIED", "FAILED", "EXPIRED"].includes(next))
      updated.resolvedAt = this.d.clock.now().toISOString();
    await this.d.quests.save(updated, q.version);
    return updated;
  }
  private async resolve(q: QuestInstance, verified: boolean, reason: string) {
    const latest = await this.quest(q.id);
    if (["VERIFIED", "FAILED"].includes(latest.status)) return latest;
    const next = verified ? "VERIFIED" : "FAILED";
    const resolved = await this.persistTransition(
      latest,
      next,
      latest.version,
      reason,
    );
    if (verified)
      await this.d.economy.apply({
        operationId: `quest-reward:${q.id}`,
        userId: q.ownerUserId,
        amount: q.rewardCoins,
        reason: "QUEST_REWARD",
        relatedEntityId: q.id,
      });
    await this.publish("quest.resolved", resolved, `resolve:${q.id}`, {
      questId: q.id,
      status: next,
      rewardCoins: verified ? q.rewardCoins : 0,
      resolvedAt: resolved.resolvedAt,
    });
    return resolved;
  }
  private async once<T>(
    scope: string,
    actor: string,
    key: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    if (!key || key.length > 128) throw new QuestError("IDEMPOTENCY_CONFLICT");
    const id = `${actor}:${scope}`;
    const old = await this.d.commands.getResult<T>(id, key);
    if (old) return old;
    const result = await fn();
    await this.d.commands.putResult(id, key, result);
    return result;
  }
  private async quest(id: string) {
    const q = await this.d.quests.get(id);
    if (!q) throw new QuestError("NOT_FOUND");
    return q;
  }
  private async owned(id: string, user: string) {
    const q = await this.quest(id);
    if (q.ownerUserId !== user && !q.participantIds.includes(user))
      throw new QuestError("NOT_AUTHORIZED");
    return q;
  }
  private async template(id: string) {
    const t = await this.d.templates.get(id);
    if (!t) throw new QuestError("NOT_FOUND");
    return t;
  }
  private assertSafe(t: QuestTemplate) {
    if (t.safety.moderation !== "APPROVED" || t.safety.flags.length)
      throw new QuestError("INVALID_CHALLENGE");
  }
  private publish(
    type: string,
    q: QuestInstance,
    correlationId: string,
    payload: unknown,
  ) {
    return this.d.events.publish({
      id: `${type}:${q.id}`,
      type,
      version: 1,
      occurredAt: this.d.clock.now().toISOString(),
      actorUserId: q.ownerUserId,
      partyId: q.partyId,
      aggregateId: q.id,
      correlationId,
      payload,
    });
  }
}
