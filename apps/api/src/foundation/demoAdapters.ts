import type {
  Clock,
  DomainEvent,
  EconomyOperation,
  EconomyOperationResult,
  EconomyPort,
  EventPublisher,
  FeedEvent,
  IdGenerator,
  PartyMembershipPort,
  RequestPrincipal,
} from "@sidequest/contracts";

export const demoPrincipal: RequestPrincipal = {
  userId: "user-zuri",
  partyIds: ["party-demo"],
};

export class SystemClock implements Clock {
  now() {
    return new Date();
  }
}

export class CryptoIdGenerator implements IdGenerator {
  next() {
    return crypto.randomUUID();
  }
}

export class DemoPartyMemberships implements PartyMembershipPort {
  async isMember(userId: string, partyId: string) {
    return (
      partyId === "party-demo" &&
      ["user-zuri", "user-alyssa", "user-ben"].includes(userId)
    );
  }
}

export class InMemoryEconomy implements EconomyPort {
  readonly #balances = new Map<string, number>([["user-zuri", 420]]);
  readonly #operations = new Map<string, EconomyOperationResult>();

  async apply(operation: EconomyOperation): Promise<EconomyOperationResult> {
    const previous = this.#operations.get(operation.operationId);
    if (previous) return previous;

    if (!Number.isSafeInteger(operation.amount))
      throw new Error("Coin amount must be an integer");

    const balance =
      (this.#balances.get(operation.userId) ?? 0) + operation.amount;
    if (balance < 0) throw new Error("Insufficient demo balance");

    const result = {
      operationId: operation.operationId,
      applied: true,
      balance,
    };
    this.#balances.set(operation.userId, balance);
    this.#operations.set(operation.operationId, result);
    return result;
  }

  async balanceFor(userId: string) {
    return this.#balances.get(userId) ?? 0;
  }
}

export class InMemoryEventBus implements EventPublisher {
  readonly events: DomainEvent[] = [];
  readonly feed: FeedEvent[] = [];

  async publish(event: DomainEvent) {
    if (this.events.some((existing) => existing.id === event.id)) return;
    this.events.push(event);
    this.feed.unshift({
      id: event.id,
      type: event.type,
      occurredAt: event.occurredAt,
      title: event.type.replaceAll(".", " "),
      detail: "Deterministic demo event",
    });
  }
}
