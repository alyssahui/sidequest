import type { MarketDto } from "@sidequest/contracts/market";
import { poolTotals } from "@sidequest/market-core";

export const DEMO_VIEWER_ID = "zuri";
export const DEMO_BALANCE = 420;

export type DemoMarket = MarketDto & {
  participantName: string;
  closesLabel: string;
};

const benBets = [
  {
    id: "bet-alyssa-complete",
    bettorId: "alyssa",
    outcome: "COMPLETE" as const,
    amount: 80,
    createdAt: "2026-09-12T09:12:00.000Z",
  },
  {
    id: "bet-chris-fail",
    bettorId: "chris",
    outcome: "FAIL" as const,
    amount: 210,
    createdAt: "2026-09-12T09:14:00.000Z",
  },
];

const alyssaBets = [
  {
    id: "bet-ben-fail",
    bettorId: "ben",
    outcome: "FAIL" as const,
    amount: 40,
    createdAt: "2026-09-12T10:01:00.000Z",
  },
  {
    id: "bet-chris-complete",
    bettorId: "chris",
    outcome: "COMPLETE" as const,
    amount: 60,
    createdAt: "2026-09-12T10:02:00.000Z",
  },
];

const settledBets = [
  {
    id: "bet-alyssa-fail-run",
    bettorId: "alyssa",
    outcome: "FAIL" as const,
    amount: 50,
    createdAt: "2026-09-11T11:00:00.000Z",
  },
  {
    id: "bet-chris-fail-run",
    bettorId: "chris",
    outcome: "FAIL" as const,
    amount: 70,
    createdAt: "2026-09-11T11:05:00.000Z",
  },
];

function withPools(
  market: Omit<DemoMarket, "pools" | "participantCount">,
): DemoMarket {
  const pools = poolTotals(market.bets);
  return {
    ...market,
    pools,
    participantCount: new Set(market.bets.map((bet) => bet.bettorId)).size,
  };
}

export const demoMarkets: DemoMarket[] = [
  withPools({
    id: "market-ben-gym",
    questInstanceId: "quest-ben-gym",
    participantUserId: "ben",
    participantName: "Ben",
    partyId: "party-demo",
    prompt: "Will Ben actually go to the gym before 9 PM?",
    status: "OPEN",
    opensAt: "2026-09-12T09:00:00.000Z",
    closesAt: "2026-09-12T21:00:00.000Z",
    closesLabel: "Closes with the quest deadline",
    version: 1,
    bets: benBets,
  }),
  withPools({
    id: "market-alyssa-bbq",
    questInstanceId: "quest-alyssa-bbq",
    participantUserId: "alyssa",
    participantName: "Alyssa",
    partyId: "party-demo",
    prompt: "Will Alyssa try Korean BBQ tonight?",
    status: "OPEN",
    opensAt: "2026-09-12T10:00:00.000Z",
    closesAt: "2026-09-12T23:00:00.000Z",
    closesLabel: "Open until tonight",
    version: 1,
    bets: alyssaBets,
  }),
  withPools({
    id: "market-chris-photo",
    questInstanceId: "quest-chris-photo",
    participantUserId: "chris",
    participantName: "Chris",
    partyId: "party-demo",
    prompt: "Will Chris find something purple before class?",
    status: "CLOSED",
    opensAt: "2026-09-12T08:00:00.000Z",
    closesAt: "2026-09-12T09:30:00.000Z",
    closesLabel: "Closed · waiting on verification",
    version: 2,
    bets: [
      {
        id: "bet-zuri-complete-purple",
        bettorId: "zuri",
        outcome: "COMPLETE",
        amount: 25,
        createdAt: "2026-09-12T08:10:00.000Z",
      },
      {
        id: "bet-ben-fail-purple",
        bettorId: "ben",
        outcome: "FAIL",
        amount: 25,
        createdAt: "2026-09-12T08:12:00.000Z",
      },
    ],
  }),
  withPools({
    id: "market-zuri-run",
    questInstanceId: "quest-zuri-run",
    participantUserId: "zuri",
    participantName: "Zuri",
    partyId: "party-demo",
    prompt: "Did Zuri finish the 7 AM run?",
    status: "SETTLED",
    opensAt: "2026-09-11T06:00:00.000Z",
    closesAt: "2026-09-11T07:00:00.000Z",
    closesLabel: "Settled · COMPLETE",
    version: 3,
    outcome: "COMPLETE",
    bets: settledBets,
  }),
];
