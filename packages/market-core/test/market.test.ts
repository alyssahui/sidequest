import { describe, expect, it } from "vitest";

import type {
  Clock,
  DomainEvent,
  EventPublisher,
  IdGenerator,
} from "@sidequest/contracts";

import {
  InMemoryLedger,
  InMemoryMarketRepository,
  MarketError,
  MarketService,
  SelfBountyService,
  calculatePayouts,
  marketEscrowAccount,
} from "../src";

class FixedClock implements Clock {
  current = new Date("2026-09-11T18:00:00.000Z");
  now() {
    return new Date(this.current);
  }
}

class SequentialIds implements IdGenerator {
  #next = 0;
  next() {
    this.#next += 1;
    return `00000000-0000-4000-8000-${String(this.#next).padStart(12, "0")}`;
  }
}

class EventCollector implements EventPublisher {
  events: DomainEvent[] = [];
  async publish(event: DomainEvent) {
    if (!this.events.some((item) => item.id === event.id))
      this.events.push(event);
  }
}

function setup() {
  const clock = new FixedClock();
  const ids = new SequentialIds();
  const events = new EventCollector();
  const ledger = new InMemoryLedger(ids);
  const repository = new InMemoryMarketRepository();
  const service = new MarketService(
    repository,
    ledger,
    events,
    clock,
    ids,
    500,
  );
  for (const user of ["participant", "alice", "bob", "charlie"])
    ledger.grant(user, 1_000);
  return { clock, events, ledger, repository, service, ids };
}

async function openMarket(context: ReturnType<typeof setup>) {
  const market = await context.service.create({
    idempotencyKey: "create-one",
    questInstanceId: "quest-one",
    participantUserId: "participant",
    partyId: "party-one",
    prompt: "Will Ben make it to the gym?",
    opensAt: "2026-09-11T18:00:00.000Z",
    closesAt: "2026-09-11T19:00:00.000Z",
    questDeadline: "2026-09-11T20:00:00.000Z",
  });
  return context.service.open(market.id, "open-one");
}

describe("append-only ledger", () => {
  it("is balanced and idempotent", () => {
    const { ids, ledger } = setup();
    const before = ledger.entries.reduce((sum, entry) => sum + entry.amount, 0);
    const first = ledger.grant("new-user", 50, "same-grant");
    const second = ledger.grant("new-user", 50, "same-grant");

    expect(second).toBe(first);
    expect(ledger.userBalance("new-user")).toBe(50);
    expect(ledger.entries.reduce((sum, entry) => sum + entry.amount, 0)).toBe(
      before,
    );
    expect(ids).toBeDefined();
  });
});

describe("prediction market", () => {
  it("escrows bets and allocates the full pool with deterministic remainders", async () => {
    const context = setup();
    const market = await openMarket(context);
    await context.service.placeBet({
      idempotencyKey: "alice-one",
      marketId: market.id,
      bettorId: "alice",
      outcome: "COMPLETE",
      amount: 2,
    });
    await context.service.placeBet({
      idempotencyKey: "bob-one",
      marketId: market.id,
      bettorId: "bob",
      outcome: "COMPLETE",
      amount: 1,
    });
    await context.service.placeBet({
      idempotencyKey: "charlie-one",
      marketId: market.id,
      bettorId: "charlie",
      outcome: "FAIL",
      amount: 2,
    });

    expect(context.ledger.balance(marketEscrowAccount(market.id))).toBe(5);
    const settled = await context.service.settle(
      market.id,
      "COMPLETE",
      "resolve-one",
    );

    expect(settled.status).toBe("SETTLED");
    expect(context.ledger.userBalance("alice")).toBe(1_002);
    expect(context.ledger.userBalance("bob")).toBe(1_000);
    expect(context.ledger.userBalance("charlie")).toBe(998);
    expect(context.ledger.balance(marketEscrowAccount(market.id))).toBe(0);
    expect(
      context.ledger.entries.reduce((sum, entry) => sum + entry.amount, 0),
    ).toBe(0);
  });

  it("deduplicates concurrent command retries", async () => {
    const context = setup();
    const market = await openMarket(context);
    const command = {
      idempotencyKey: "one-request",
      marketId: market.id,
      bettorId: "alice",
      outcome: "COMPLETE" as const,
      amount: 25,
    };

    const [first, second] = await Promise.all([
      context.service.placeBet(command),
      context.service.placeBet(command),
    ]);

    expect(first.bet.id).toBe(second.bet.id);
    expect(context.service.get(market.id).bets).toHaveLength(1);
    expect(context.ledger.userBalance("alice")).toBe(975);
  });

  it("rejects self predictions, invalid amounts, insufficient balance, and late bets", async () => {
    const context = setup();
    const market = await openMarket(context);
    const base = {
      idempotencyKey: "bad",
      marketId: market.id,
      outcome: "COMPLETE" as const,
    };

    await expect(
      context.service.placeBet({
        ...base,
        bettorId: "participant",
        amount: 10,
      }),
    ).rejects.toMatchObject({ code: "SELF_PREDICTION_FORBIDDEN" });
    await expect(
      context.service.placeBet({
        ...base,
        idempotencyKey: "fraction",
        bettorId: "alice",
        amount: 1.5,
      }),
    ).rejects.toMatchObject({ code: "INVALID_COMMAND" });
    await expect(
      context.service.placeBet({
        ...base,
        idempotencyKey: "poor",
        bettorId: "unknown",
        amount: 10,
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_COINS" });

    context.clock.current = new Date("2026-09-11T19:00:00.000Z");
    await expect(
      context.service.placeBet({
        ...base,
        idempotencyKey: "late",
        bettorId: "alice",
        amount: 10,
      }),
    ).rejects.toMatchObject({ code: "MARKET_CLOSED" });
  });

  it("refunds everyone when the resolved side has no predictions", async () => {
    const context = setup();
    const market = await openMarket(context);
    await context.service.placeBet({
      idempotencyKey: "only-complete",
      marketId: market.id,
      bettorId: "alice",
      outcome: "COMPLETE",
      amount: 100,
    });

    await context.service.settle(market.id, "FAIL", "no-winner");
    expect(context.ledger.userBalance("alice")).toBe(1_000);
    expect(context.ledger.balance(marketEscrowAccount(market.id))).toBe(0);
  });

  it("returns the original settlement when resolution is retried", async () => {
    const context = setup();
    const market = await openMarket(context);
    await context.service.placeBet({
      idempotencyKey: "bet",
      marketId: market.id,
      bettorId: "alice",
      outcome: "COMPLETE",
      amount: 50,
    });
    const first = await context.service.settle(
      market.id,
      "COMPLETE",
      "first-resolution",
    );
    const second = await context.service.settle(
      market.id,
      "COMPLETE",
      "retry-resolution",
    );
    expect(second).toEqual(first);
    expect(context.ledger.userBalance("alice")).toBe(1_000);
  });

  it("settles once when a quest resolution event is redelivered", async () => {
    const context = setup();
    const market = await openMarket(context);
    await context.service.placeBet({
      idempotencyKey: "event-bet",
      marketId: market.id,
      bettorId: "alice",
      outcome: "FAIL",
      amount: 75,
    });
    const command = {
      eventId: "quest-event-one",
      questInstanceId: "quest-one",
      outcome: "FAIL" as const,
    };
    const first = await context.service.settleFromQuest(command);
    const retry = await context.service.settleFromQuest(command);
    expect(retry).toEqual(first);
    expect(context.ledger.userBalance("alice")).toBe(1_000);
    expect(
      context.events.events.filter((event) => event.type === "market.settled"),
    ).toHaveLength(1);
  });

  it("voids and refunds an open pool exactly once", async () => {
    const context = setup();
    const market = await openMarket(context);
    await context.service.placeBet({
      idempotencyKey: "void-bet",
      marketId: market.id,
      bettorId: "bob",
      outcome: "FAIL",
      amount: 40,
    });
    await context.service.void(market.id, "void-one");
    await context.service.void(market.id, "void-retry");
    expect(context.ledger.userBalance("bob")).toBe(1_000);
    expect(context.ledger.balance(marketEscrowAccount(market.id))).toBe(0);
  });
});

describe("payout conservation", () => {
  it("conserves every generated two-sided pool", () => {
    for (let left = 1; left <= 31; left += 3) {
      for (let right = 1; right <= 29; right += 4) {
        const bets = [
          {
            id: "a",
            bettorId: "a",
            outcome: "COMPLETE" as const,
            amount: left,
            createdAt: "1",
          },
          {
            id: "b",
            bettorId: "b",
            outcome: "COMPLETE" as const,
            amount: right,
            createdAt: "2",
          },
          {
            id: "c",
            bettorId: "c",
            outcome: "FAIL" as const,
            amount: left + right - 1,
            createdAt: "3",
          },
        ];
        const result = calculatePayouts(bets, "COMPLETE");
        expect(
          result.payouts.reduce((sum, payout) => sum + payout.amount, 0),
        ).toBe(bets.reduce((sum, bet) => sum + bet.amount, 0));
      }
    }
  });
});

describe("self bounty", () => {
  it("returns escrow on completion and forfeits it on failure without minting Coins", () => {
    const context = setup();
    const bounties = new SelfBountyService(
      context.ledger,
      context.clock,
      context.ids,
    );
    const completed = bounties.place("alice", "quest-a", 100, "bounty-a");
    bounties.resolve(completed.id, true);
    expect(context.ledger.userBalance("alice")).toBe(1_000);

    const failed = bounties.place("alice", "quest-b", 100, "bounty-b");
    bounties.resolve(failed.id, false);
    expect(context.ledger.userBalance("alice")).toBe(900);
    expect(
      context.ledger.entries.reduce((sum, entry) => sum + entry.amount, 0),
    ).toBe(0);
  });
});
