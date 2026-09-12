import type {
  Challenge,
  QuestInstance,
  QuestTemplate,
  VerificationAttempt,
  WantNeedItem,
} from "@sidequest/contracts";
export interface QuestRepository {
  get(id: string): Promise<QuestInstance | undefined>;
  save(value: QuestInstance, expectedVersion?: number): Promise<void>;
  listForUser(userId: string): Promise<QuestInstance[]>;
}
export interface TemplateRepository {
  get(id: string): Promise<QuestTemplate | undefined>;
  save(value: QuestTemplate): Promise<void>;
  list(): Promise<QuestTemplate[]>;
}
export interface AttemptRepository {
  save(value: VerificationAttempt): Promise<void>;
  listForQuest(questId: string): Promise<VerificationAttempt[]>;
}
export interface ChallengeRepository {
  get(id: string): Promise<Challenge | undefined>;
  save(value: Challenge, expectedVersion?: number): Promise<void>;
  listChallengesForUser(userId: string): Promise<Challenge[]>;
}
export interface WantNeedRepository {
  get(id: string): Promise<WantNeedItem | undefined>;
  save(value: WantNeedItem, expectedVersion?: number): Promise<void>;
  remove(id: string, owner: string): Promise<boolean>;
  listItems(owner: string): Promise<WantNeedItem[]>;
}
export interface IdempotencyStore {
  getResult<T>(scope: string, key: string): Promise<T | undefined>;
  putResult<T>(scope: string, key: string, value: T): Promise<void>;
}
const clone = <T>(v: T): T => structuredClone(v);
export class MemoryStore
  implements
    QuestRepository,
    TemplateRepository,
    AttemptRepository,
    ChallengeRepository,
    WantNeedRepository,
    IdempotencyStore
{
  readonly quests = new Map<string, QuestInstance>();
  readonly templates = new Map<string, QuestTemplate>();
  readonly attempts = new Map<string, VerificationAttempt>();
  readonly challenges = new Map<string, Challenge>();
  readonly items = new Map<string, WantNeedItem>();
  readonly commands = new Map<string, unknown>();
  constructor(templates: QuestTemplate[] = []) {
    for (const t of templates) this.templates.set(t.id, clone(t));
  }
  async get(id: string): Promise<any> {
    return clone(
      this.quests.get(id) ??
        this.templates.get(id) ??
        this.challenges.get(id) ??
        this.items.get(id),
    );
  }
  async save(value: any, expectedVersion?: number) {
    const map = value.requirements
      ? this.quests
      : value.stakeCoins !== undefined
        ? this.challenges
        : value.kind
          ? this.items
          : value.defaultRequirements
            ? this.templates
            : this.attempts;
    const current = map.get(value.id) as { version?: number } | undefined;
    if (expectedVersion !== undefined && current?.version !== expectedVersion)
      throw new Error("VERSION_CONFLICT");
    map.set(value.id, clone(value));
  }
  async listForUser(userId: string): Promise<any[]> {
    return [...this.quests.values()]
      .filter(
        (q) => q.ownerUserId === userId || q.participantIds.includes(userId),
      )
      .map(clone);
  }
  async listChallengesForUser(userId: string) {
    return [...this.challenges.values()]
      .filter((c) => c.issuerUserId === userId || c.recipientUserId === userId)
      .map(clone);
  }
  async list() {
    return [...this.templates.values()].map(clone);
  }
  async listItems(owner: string) {
    return [...this.items.values()]
      .filter((item) => item.ownerUserId === owner)
      .map(clone);
  }
  async listForQuest(questId: string) {
    return [...this.attempts.values()]
      .filter((a) => a.questId === questId)
      .map(clone);
  }
  async remove(id: string, owner: string) {
    const item = this.items.get(id);
    return !!item && item.ownerUserId === owner && this.items.delete(id);
  }
  async getResult<T>(scope: string, key: string) {
    return clone(this.commands.get(`${scope}:${key}`)) as T | undefined;
  }
  async putResult<T>(scope: string, key: string, value: T) {
    this.commands.set(`${scope}:${key}`, clone(value));
  }
}
