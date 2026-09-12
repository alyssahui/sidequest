import type { MarketBetDto, MarketOutcome } from "@sidequest/contracts/market";

export type Payout = { betId: string; bettorId: string; amount: number };

export function poolTotals(
  bets: readonly MarketBetDto[],
): Record<MarketOutcome, number> {
  return bets.reduce(
    (totals, bet) => {
      totals[bet.outcome] += bet.amount;
      return totals;
    },
    { COMPLETE: 0, FAIL: 0 },
  );
}

export function estimatedPayout(
  bets: readonly MarketBetDto[],
  outcome: MarketOutcome,
  prospectiveStake: number,
): number {
  if (!Number.isSafeInteger(prospectiveStake) || prospectiveStake <= 0)
    return 0;
  const pools = poolTotals(bets);
  const winningPool = pools[outcome] + prospectiveStake;
  const losingPool = pools[outcome === "COMPLETE" ? "FAIL" : "COMPLETE"];
  const profit =
    (BigInt(prospectiveStake) * BigInt(losingPool)) / BigInt(winningPool);
  return prospectiveStake + Number(profit);
}

export function calculatePayouts(
  bets: readonly MarketBetDto[],
  outcome: MarketOutcome,
): { payouts: readonly Payout[]; refundAll: boolean } {
  const winners = bets
    .filter((bet) => bet.outcome === outcome)
    .sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    );

  if (winners.length === 0) {
    return {
      payouts: bets.map((bet) => ({
        betId: bet.id,
        bettorId: bet.bettorId,
        amount: bet.amount,
      })),
      refundAll: true,
    };
  }

  const pools = poolTotals(bets);
  const winningPool = pools[outcome];
  const losingPool = pools[outcome === "COMPLETE" ? "FAIL" : "COMPLETE"];
  const payouts = winners.map((bet) => ({
    betId: bet.id,
    bettorId: bet.bettorId,
    amount:
      bet.amount +
      Number((BigInt(bet.amount) * BigInt(losingPool)) / BigInt(winningPool)),
  }));
  let remainder =
    winningPool +
    losingPool -
    payouts.reduce((sum, payout) => sum + payout.amount, 0);
  for (let index = 0; remainder > 0; index += 1, remainder -= 1)
    payouts[index]!.amount += 1;

  return { payouts, refundAll: false };
}
