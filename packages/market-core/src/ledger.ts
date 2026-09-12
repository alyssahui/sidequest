import type {
  EconomyOperation,
  EconomyOperationResult,
  EconomyPort,
  IdGenerator,
} from "@sidequest/contracts/foundation";

export type LedgerReason =
  | "WELCOME_GRANT"
  | "QUEST_REWARD"
  | "CHALLENGE_ESCROW"
  | "CHALLENGE_PAYOUT"
  | "MARKET_ESCROW"
  | "MARKET_PAYOUT"
  | "REFUND"
  | "SELF_BOUNTY";

export type LedgerEntry = {
  id: string;
  transactionId: string;
  legIndex: number;
  operationId: string;
  accountId: string;
  amount: number;
  balanceAfter: number;
  reason: LedgerReason;
  relatedEntityId?: string;
  createdAt: string;
};

export type Transfer = {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  reason: LedgerReason;
  relatedEntityId?: string;
};

export type LedgerTransaction = {
  operationId: string;
  entries: readonly LedgerEntry[];
};

export const userAccount = (userId: string) => `USER:${userId}`;
export const marketEscrowAccount = (marketId: string) =>
  `MARKET_ESCROW:${marketId}`;
export const bountyEscrowAccount = (bountyId: string) =>
  `BOUNTY_ESCROW:${bountyId}`;
export const systemAccount = "SYSTEM:ISSUANCE";
export const forfeitureAccount = "SYSTEM:FORFEITURE";

export class InsufficientCoinsError extends Error {
  constructor() {
    super("Insufficient available Coins");
    this.name = "InsufficientCoinsError";
  }
}

export class InMemoryLedger {
  readonly #balances = new Map<string, number>();
  readonly #entries: LedgerEntry[] = [];
  readonly #transactions = new Map<string, LedgerTransaction>();

  constructor(private readonly ids: IdGenerator) {}

  get entries(): readonly LedgerEntry[] {
    return this.#entries;
  }

  balance(accountId: string): number {
    return this.#balances.get(accountId) ?? 0;
  }

  userBalance(userId: string): number {
    return this.balance(userAccount(userId));
  }

  grant(userId: string, amount: number, operationId = `welcome:${userId}`) {
    return this.applyBatch(operationId, [
      {
        fromAccountId: systemAccount,
        toAccountId: userAccount(userId),
        amount,
        reason: "WELCOME_GRANT",
      },
    ]);
  }

  transfer(operationId: string, transfer: Transfer) {
    return this.applyBatch(operationId, [transfer]);
  }

  applyBatch(
    operationId: string,
    transfers: readonly Transfer[],
  ): LedgerTransaction {
    const previous = this.#transactions.get(operationId);
    if (previous) return previous;
    if (!operationId || transfers.length === 0)
      throw new Error("A ledger operation requires transfers");

    const deltas = new Map<string, number>();
    for (const transfer of transfers) {
      if (!Number.isSafeInteger(transfer.amount) || transfer.amount <= 0) {
        throw new Error("Coin transfers must use positive safe integers");
      }
      if (transfer.fromAccountId === transfer.toAccountId)
        throw new Error("Ledger accounts must differ");
      deltas.set(
        transfer.fromAccountId,
        (deltas.get(transfer.fromAccountId) ?? 0) - transfer.amount,
      );
      deltas.set(
        transfer.toAccountId,
        (deltas.get(transfer.toAccountId) ?? 0) + transfer.amount,
      );
    }

    for (const [accountId, delta] of deltas) {
      if (
        !accountId.startsWith("SYSTEM:") &&
        this.balance(accountId) + delta < 0
      ) {
        throw new InsufficientCoinsError();
      }
    }

    const transactionId = this.ids.next();
    const createdAt = new Date().toISOString();
    const entries: LedgerEntry[] = [];
    let legIndex = 0;
    for (const transfer of transfers) {
      for (const leg of [
        { accountId: transfer.fromAccountId, amount: -transfer.amount },
        { accountId: transfer.toAccountId, amount: transfer.amount },
      ]) {
        const balanceAfter = this.balance(leg.accountId) + leg.amount;
        this.#balances.set(leg.accountId, balanceAfter);
        const entry: LedgerEntry = {
          id: this.ids.next(),
          transactionId,
          legIndex,
          operationId,
          accountId: leg.accountId,
          amount: leg.amount,
          balanceAfter,
          reason: transfer.reason,
          relatedEntityId: transfer.relatedEntityId,
          createdAt,
        };
        entries.push(entry);
        this.#entries.push(entry);
        legIndex += 1;
      }
    }

    const transaction = { operationId, entries };
    this.#transactions.set(operationId, transaction);
    return transaction;
  }
}

export class LedgerEconomyAdapter implements EconomyPort {
  constructor(private readonly ledger: InMemoryLedger) {}

  async apply(operation: EconomyOperation): Promise<EconomyOperationResult> {
    if (!Number.isSafeInteger(operation.amount) || operation.amount === 0) {
      throw new Error("Economy operations require a non-zero integer amount");
    }
    const transaction = this.ledger.transfer(operation.operationId, {
      fromAccountId:
        operation.amount > 0 ? systemAccount : userAccount(operation.userId),
      toAccountId:
        operation.amount > 0
          ? userAccount(operation.userId)
          : forfeitureAccount,
      amount: Math.abs(operation.amount),
      reason: operation.reason as LedgerReason,
      relatedEntityId: operation.relatedEntityId,
    });
    return {
      operationId: transaction.operationId,
      applied: true,
      balance: this.ledger.userBalance(operation.userId),
    };
  }

  async balanceFor(userId: string) {
    return this.ledger.userBalance(userId);
  }
}
