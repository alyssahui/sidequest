import type { MarketErrorCode } from "@sidequest/contracts/market";

export class MarketError extends Error {
  constructor(
    readonly code: MarketErrorCode,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "MarketError";
  }
}
