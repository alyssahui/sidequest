# Prediction market integration

This module provides the runnable credential-free market API. `packages/market-core` owns deterministic domain rules and the append-only in-memory ledger; `20260911_001_market_economy.sql` is the production PostgreSQL contract.

## API surface

All state-changing requests require an `Idempotency-Key` header.

- `GET /v1/markets`
- `GET /v1/markets/:marketId`
- `POST /v1/markets`
- `POST /v1/markets/:marketId/open`
- `POST /v1/markets/:marketId/bets`
- `POST /v1/markets/:marketId/close`
- `GET /v1/economy/me`
- `POST /v1/self-bounties`
- `POST /v1/demo/markets/:marketId/settle` (demo only)
- `POST /v1/demo/markets/:marketId/void` (demo only)
- `POST /v1/demo/self-bounties/:bountyId/resolve` (demo only)

`X-Demo-User-Id` switches among seeded Party identities only in demo mode. A production deployment must replace the foundation principal getter with validated authentication and must never accept this header.

## Quest integration

The quest module should open a market after a quest is accepted and consume resolution through a normalized internal command:

```ts
await marketService.settleFromQuest({
  eventId: event.id,
  questInstanceId: event.aggregateId,
  outcome: questStatus === "VERIFIED" ? "COMPLETE" : "FAIL",
});
```

The consumer must deduplicate by `quest.resolved` event ID. In PostgreSQL, lock the market row, create all ledger transaction legs, insert `market_settlements`, update the market, and write `market.settled` to `domain_outbox` in one transaction. The public demo settlement endpoint must remain disabled outside demo mode.

## Economic rules

- Coins are integer, closed-loop play points with no purchase or cash-out path.
- Stakes move immediately from a user account to per-market escrow.
- Winners recover their stake plus a pro-rata share of the losing pool.
- Remainders go deterministically by bet creation time and ID.
- No winning predictions means a full refund; void always means a full refund.
- A participant cannot predict their own quest result.
- A self-bounty returns on completion and moves to the forfeiture system account on failure. It never mints a reward.
