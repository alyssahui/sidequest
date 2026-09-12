export const marketOutcomes = ["COMPLETE", "FAIL"] as const;
export type MarketOutcome = (typeof marketOutcomes)[number];

export const marketStatuses = [
  "DRAFT",
  "OPEN",
  "CLOSED",
  "SETTLED",
  "VOID",
] as const;
export type MarketStatus = (typeof marketStatuses)[number];

export type MarketBetDto = {
  id: string;
  bettorId: string;
  outcome: MarketOutcome;
  amount: number;
  createdAt: string;
};

export type MarketDto = {
  id: string;
  questInstanceId: string;
  participantUserId: string;
  partyId: string;
  prompt: string;
  status: MarketStatus;
  opensAt: string;
  closesAt: string;
  version: number;
  pools: Record<MarketOutcome, number>;
  participantCount: number;
  outcome?: MarketOutcome;
  bets: readonly MarketBetDto[];
};

export type PlaceBetCommand = {
  idempotencyKey: string;
  marketId: string;
  bettorId: string;
  outcome: MarketOutcome;
  amount: number;
};

export type ResolveMarketFromQuestCommand = {
  eventId: string;
  questInstanceId: string;
  outcome: MarketOutcome;
};

export type MarketErrorCode =
  | "INVALID_COMMAND"
  | "INVALID_STATE"
  | "MARKET_CLOSED"
  | "MARKET_NOT_FOUND"
  | "INSUFFICIENT_COINS"
  | "FORBIDDEN"
  | "SELF_PREDICTION_FORBIDDEN"
  | "STAKE_LIMIT_EXCEEDED";

export type MarketApiError = {
  error: {
    code: MarketErrorCode;
    message: string;
    retryable: boolean;
  };
};
