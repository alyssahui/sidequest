import type { Clock, IdGenerator } from "@sidequest/contracts/foundation";

import { MarketError } from "./errors";
import {
  bountyEscrowAccount,
  forfeitureAccount,
  InMemoryLedger,
  InsufficientCoinsError,
  userAccount,
} from "./ledger";

export type SelfBounty = {
  id: string;
  userId: string;
  questInstanceId: string;
  amount: number;
  status: "OPEN" | "COMPLETED" | "FORFEITED";
  createdAt: string;
};

export class SelfBountyService {
  readonly #bounties = new Map<string, SelfBounty>();

  constructor(
    private readonly ledger: InMemoryLedger,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly maxStake = 500,
  ) {}

  place(
    userId: string,
    questInstanceId: string,
    amount: number,
    idempotencyKey: string,
  ): SelfBounty {
    if (!Number.isSafeInteger(amount) || amount <= 0)
      throw new MarketError(
        "INVALID_COMMAND",
        "Bounty must be positive whole Coins",
      );
    if (amount > this.maxStake)
      throw new MarketError(
        "STAKE_LIMIT_EXCEEDED",
        `The maximum self-bounty is ${this.maxStake} Coins`,
      );
    const existing = [...this.#bounties.values()].find(
      (bounty) =>
        bounty.id === idempotencyKey ||
        (bounty.userId === userId &&
          bounty.questInstanceId === questInstanceId &&
          bounty.status === "OPEN"),
    );
    if (existing) return existing;

    const bounty: SelfBounty = {
      id: idempotencyKey || this.ids.next(),
      userId,
      questInstanceId,
      amount,
      status: "OPEN",
      createdAt: this.clock.now().toISOString(),
    };
    try {
      this.ledger.transfer(`bounty-place:${bounty.id}`, {
        fromAccountId: userAccount(userId),
        toAccountId: bountyEscrowAccount(bounty.id),
        amount,
        reason: "SELF_BOUNTY",
        relatedEntityId: bounty.id,
      });
    } catch (error) {
      if (error instanceof InsufficientCoinsError) {
        throw new MarketError(
          "INSUFFICIENT_COINS",
          "You do not have enough available Coins",
        );
      }
      throw error;
    }
    this.#bounties.set(bounty.id, bounty);
    return bounty;
  }

  resolve(id: string, completed: boolean): SelfBounty {
    const bounty = this.#bounties.get(id);
    if (!bounty) throw new Error("Bounty not found");
    if (bounty.status !== "OPEN") return bounty;
    this.ledger.transfer(`bounty-resolve:${bounty.id}`, {
      fromAccountId: bountyEscrowAccount(bounty.id),
      toAccountId: completed ? userAccount(bounty.userId) : forfeitureAccount,
      amount: bounty.amount,
      reason: completed ? "REFUND" : "SELF_BOUNTY",
      relatedEntityId: bounty.id,
    });
    bounty.status = completed ? "COMPLETED" : "FORFEITED";
    return bounty;
  }

  get(id: string): SelfBounty {
    const bounty = this.#bounties.get(id);
    if (!bounty)
      throw new MarketError("MARKET_NOT_FOUND", "Self-bounty not found");
    return { ...bounty };
  }
}
