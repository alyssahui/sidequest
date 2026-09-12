import type { Clock, EventPublisher, IdGenerator } from "@sidequest/contracts";
import type {
  MarketBetDto,
  MarketDto,
  MarketOutcome,
  MarketStatus,
  PlaceBetCommand,
  ResolveMarketFromQuestCommand,
} from "@sidequest/contracts/market";

import { MarketError } from "./errors";
import {
  InMemoryLedger,
  InsufficientCoinsError,
  marketEscrowAccount,
  userAccount,
} from "./ledger";
import { calculatePayouts, estimatedPayout, poolTotals } from "./payout";

type MarketRecord = Omit<MarketDto, "pools" | "participantCount" | "bets"> & {
  bets: MarketBetDto[];
  settlement?: {
    outcome?: MarketOutcome;
    payouts: readonly { bettorId: string; amount: number }[];
  };
};

export type CreateMarketCommand = {
  idempotencyKey: string;
  questInstanceId: string;
  participantUserId: string;
  partyId: string;
  prompt: string;
  opensAt: string;
  closesAt: string;
  questDeadline: string;
};

export class InMemoryMarketRepository {
  readonly markets = new Map<string, MarketRecord>();
  readonly commandResults = new Map<string, unknown>();
  readonly commandPromises = new Map<string, Promise<unknown>>();
}

export class MarketService {
  constructor(
    private readonly repository: InMemoryMarketRepository,
    private readonly ledger: InMemoryLedger,
    private readonly events: EventPublisher,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly maxStake = 500,
  ) {}

  list(): MarketDto[] {
    return [...this.repository.markets.values()].map((market) =>
      this.toDto(market),
    );
  }

  get(marketId: string): MarketDto {
    return this.toDto(this.requireMarket(marketId));
  }

  estimate(marketId: string, outcome: MarketOutcome, amount: number): number {
    return estimatedPayout(this.requireMarket(marketId).bets, outcome, amount);
  }

  async settleFromQuest(
    command: ResolveMarketFromQuestCommand,
  ): Promise<MarketDto | null> {
    const market = [...this.repository.markets.values()].find(
      (candidate) => candidate.questInstanceId === command.questInstanceId,
    );
    if (!market) return null;
    return this.settle(market.id, command.outcome, command.eventId);
  }

  async create(command: CreateMarketCommand): Promise<MarketDto> {
    return this.idempotent(`create:${command.idempotencyKey}`, async () => {
      const opensAt = this.validTime(command.opensAt, "opensAt");
      const closesAt = this.validTime(command.closesAt, "closesAt");
      const questDeadline = this.validTime(
        command.questDeadline,
        "questDeadline",
      );
      if (
        closesAt <= opensAt ||
        closesAt > questDeadline ||
        !command.prompt.trim()
      ) {
        throw new MarketError(
          "INVALID_COMMAND",
          "Market timing or prompt is invalid",
        );
      }

      const market: MarketRecord = {
        id: this.ids.next(),
        questInstanceId: command.questInstanceId,
        participantUserId: command.participantUserId,
        partyId: command.partyId,
        prompt: command.prompt.trim(),
        status: "DRAFT",
        opensAt: new Date(opensAt).toISOString(),
        closesAt: new Date(closesAt).toISOString(),
        version: 1,
        bets: [],
      };
      this.repository.markets.set(market.id, market);
      return this.toDto(market);
    });
  }

  async open(marketId: string, idempotencyKey: string): Promise<MarketDto> {
    return this.idempotent(`open:${marketId}:${idempotencyKey}`, async () => {
      const market = this.requireMarket(marketId);
      if (market.status !== "DRAFT") throw this.invalidState(market.status);
      if (this.clock.now().getTime() >= Date.parse(market.closesAt)) {
        throw new MarketError(
          "MARKET_CLOSED",
          "This prediction has already closed",
        );
      }
      market.status = "OPEN";
      market.version += 1;
      await this.publish("market.opened", market, idempotencyKey, {});
      return this.toDto(market);
    });
  }

  async placeBet(
    command: PlaceBetCommand,
  ): Promise<{ market: MarketDto; bet: MarketBetDto }> {
    return this.idempotent(
      `bet:${command.marketId}:${command.bettorId}:${command.idempotencyKey}`,
      async () => {
        const market = this.requireMarket(command.marketId);
        this.assertOpen(market);
        if (command.bettorId === market.participantUserId) {
          throw new MarketError(
            "SELF_PREDICTION_FORBIDDEN",
            "Players cannot predict their own result",
          );
        }
        if (!Number.isSafeInteger(command.amount) || command.amount <= 0) {
          throw new MarketError(
            "INVALID_COMMAND",
            "Prediction amount must be a positive whole Coin amount",
          );
        }
        if (command.amount > this.maxStake) {
          throw new MarketError(
            "STAKE_LIMIT_EXCEEDED",
            `The maximum prediction is ${this.maxStake} Coins`,
          );
        }
        if (command.outcome !== "COMPLETE" && command.outcome !== "FAIL") {
          throw new MarketError(
            "INVALID_COMMAND",
            "Prediction outcome is invalid",
          );
        }

        try {
          this.ledger.transfer(
            `market-escrow:${market.id}:${command.idempotencyKey}`,
            {
              fromAccountId: userAccount(command.bettorId),
              toAccountId: marketEscrowAccount(market.id),
              amount: command.amount,
              reason: "MARKET_ESCROW",
              relatedEntityId: market.id,
            },
          );
        } catch (error) {
          if (error instanceof InsufficientCoinsError) {
            throw new MarketError(
              "INSUFFICIENT_COINS",
              "You do not have enough available Coins",
            );
          }
          throw error;
        }

        const bet: MarketBetDto = {
          id: this.ids.next(),
          bettorId: command.bettorId,
          outcome: command.outcome,
          amount: command.amount,
          createdAt: this.clock.now().toISOString(),
        };
        market.bets.push(bet);
        market.version += 1;
        await this.publish(
          "market.bet_placed",
          market,
          command.idempotencyKey,
          {
            betId: bet.id,
            outcome: bet.outcome,
            amount: bet.amount,
          },
        );
        return { market: this.toDto(market), bet };
      },
    );
  }

  async close(marketId: string, idempotencyKey: string): Promise<MarketDto> {
    return this.idempotent(`close:${marketId}:${idempotencyKey}`, async () => {
      const market = this.requireMarket(marketId);
      if (market.status === "CLOSED") return this.toDto(market);
      if (market.status !== "OPEN") throw this.invalidState(market.status);
      market.status = "CLOSED";
      market.version += 1;
      await this.publish("market.closed", market, idempotencyKey, {});
      return this.toDto(market);
    });
  }

  async settle(
    marketId: string,
    outcome: MarketOutcome,
    idempotencyKey: string,
  ): Promise<MarketDto> {
    const market = this.requireMarket(marketId);
    if (market.status === "SETTLED") return this.toDto(market);
    return this.idempotent(`settle:${marketId}:${idempotencyKey}`, async () => {
      if (market.status !== "OPEN" && market.status !== "CLOSED")
        throw this.invalidState(market.status);
      if (outcome !== "COMPLETE" && outcome !== "FAIL") {
        throw new MarketError(
          "INVALID_COMMAND",
          "Settlement outcome is invalid",
        );
      }

      const allocation = calculatePayouts(market.bets, outcome);
      if (allocation.payouts.length > 0) {
        this.ledger.applyBatch(
          `market-settlement:${market.id}`,
          allocation.payouts.map((payout) => ({
            fromAccountId: marketEscrowAccount(market.id),
            toAccountId: userAccount(payout.bettorId),
            amount: payout.amount,
            reason: allocation.refundAll
              ? ("REFUND" as const)
              : ("MARKET_PAYOUT" as const),
            relatedEntityId: market.id,
          })),
        );
      }

      market.status = "SETTLED";
      market.outcome = outcome;
      market.settlement = { outcome, payouts: allocation.payouts };
      market.version += 1;
      await this.publish("market.settled", market, idempotencyKey, {
        outcome,
        refundAll: allocation.refundAll,
        payouts: allocation.payouts,
      });
      return this.toDto(market);
    });
  }

  async void(marketId: string, idempotencyKey: string): Promise<MarketDto> {
    const market = this.requireMarket(marketId);
    if (market.status === "VOID") return this.toDto(market);
    return this.idempotent(`void:${marketId}:${idempotencyKey}`, async () => {
      if (market.status === "SETTLED") throw this.invalidState(market.status);
      if (market.bets.length > 0) {
        this.ledger.applyBatch(
          `market-void:${market.id}`,
          market.bets.map((bet) => ({
            fromAccountId: marketEscrowAccount(market.id),
            toAccountId: userAccount(bet.bettorId),
            amount: bet.amount,
            reason: "REFUND" as const,
            relatedEntityId: market.id,
          })),
        );
      }
      market.status = "VOID";
      market.version += 1;
      market.settlement = {
        payouts: market.bets.map((bet) => ({
          bettorId: bet.bettorId,
          amount: bet.amount,
        })),
      };
      await this.publish("market.settled", market, idempotencyKey, {
        void: true,
      });
      return this.toDto(market);
    });
  }

  private async idempotent<T>(
    key: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.repository.commandResults.get(key);
    if (previous) return previous as T;
    const inFlight = this.repository.commandPromises.get(key);
    if (inFlight) return inFlight as Promise<T>;
    const promise = operation()
      .then((result) => {
        this.repository.commandResults.set(key, result);
        return result;
      })
      .finally(() => this.repository.commandPromises.delete(key));
    this.repository.commandPromises.set(key, promise);
    return promise;
  }

  private assertOpen(market: MarketRecord) {
    if (market.status !== "OPEN") throw this.invalidState(market.status);
    if (this.clock.now().getTime() >= Date.parse(market.closesAt)) {
      market.status = "CLOSED";
      market.version += 1;
      throw new MarketError("MARKET_CLOSED", "This prediction has closed");
    }
  }

  private requireMarket(marketId: string): MarketRecord {
    const market = this.repository.markets.get(marketId);
    if (!market)
      throw new MarketError("MARKET_NOT_FOUND", "Prediction not found");
    return market;
  }

  private invalidState(status: MarketStatus) {
    return new MarketError(
      "INVALID_STATE",
      `Prediction cannot perform this action while ${status}`,
    );
  }

  private validTime(value: string, field: string): number {
    const time = Date.parse(value);
    if (!Number.isFinite(time))
      throw new MarketError(
        "INVALID_COMMAND",
        `${field} must be an ISO timestamp`,
      );
    return time;
  }

  private toDto(market: MarketRecord): MarketDto {
    return {
      ...market,
      bets: market.bets.map((bet) => ({ ...bet })),
      pools: poolTotals(market.bets),
      participantCount: new Set(market.bets.map((bet) => bet.bettorId)).size,
    };
  }

  private async publish(
    type: string,
    market: MarketRecord,
    correlationId: string,
    payload: unknown,
  ) {
    await this.events.publish({
      id: this.ids.next(),
      type,
      version: 1,
      occurredAt: this.clock.now().toISOString(),
      partyId: market.partyId,
      aggregateId: market.id,
      correlationId,
      payload,
    });
  }
}
