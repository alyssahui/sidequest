export type TokenBucketState = {
  tokens: number;
  updatedAt: number;
};

export type TokenBucketOptions = {
  capacity: number;
  refillPerMinute: number;
};

export type TokenBucketDecision = {
  allowed: boolean;
  state: TokenBucketState;
  remaining: number;
  /** Milliseconds until one token is available, 0 when allowed. */
  retryAfterMs: number;
};

/**
 * Per-user ingest limiter.
 *
 * A token bucket rather than a fixed window because a phone emerging from a
 * tunnel legitimately flushes a short burst of queued fixes; a fixed window
 * would reject the burst outright, while the bucket absorbs it and then holds
 * the sustained rate down.
 */
export function consumeToken(
  state: TokenBucketState | undefined,
  now: number,
  options: TokenBucketOptions,
): TokenBucketDecision {
  const current = state ?? { tokens: options.capacity, updatedAt: now };
  const elapsedMs = Math.max(0, now - current.updatedAt);
  const refilled = Math.min(
    options.capacity,
    current.tokens + (elapsedMs / 60_000) * options.refillPerMinute,
  );

  if (refilled < 1) {
    const perMs = options.refillPerMinute / 60_000;
    return {
      allowed: false,
      state: { tokens: refilled, updatedAt: now },
      remaining: 0,
      retryAfterMs: perMs > 0 ? Math.ceil((1 - refilled) / perMs) : Infinity,
    };
  }

  const tokens = refilled - 1;
  return {
    allowed: true,
    state: { tokens, updatedAt: now },
    remaining: Math.floor(tokens),
    retryAfterMs: 0,
  };
}

/** Small keyed wrapper around `consumeToken` for in-process use. */
export class RateLimiter {
  readonly #buckets = new Map<string, TokenBucketState>();
  readonly #options: TokenBucketOptions;

  constructor(options: TokenBucketOptions) {
    this.#options = options;
  }

  consume(key: string, now: number): TokenBucketDecision {
    const decision = consumeToken(this.#buckets.get(key), now, this.#options);
    this.#buckets.set(key, decision.state);
    return decision;
  }

  reset(key?: string): void {
    if (key === undefined) this.#buckets.clear();
    else this.#buckets.delete(key);
  }
}
