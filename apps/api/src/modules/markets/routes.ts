import type { FastifyInstance, FastifyRequest } from "fastify";

import type { PartyMembershipPort } from "@sidequest/contracts/foundation";
import type { MarketOutcome } from "@sidequest/contracts/market";
import {
  InMemoryLedger,
  MarketError,
  MarketService,
  SelfBountyService,
  userAccount,
} from "@sidequest/market-core";
import type { GrokService } from "../grok/service";

type Dependencies = {
  service: MarketService;
  bounties: SelfBountyService;
  ledger: InMemoryLedger;
  memberships: PartyMembershipPort;
  demoMode: boolean;
  grok?: GrokService;
};

function idempotencyKey(request: FastifyRequest): string {
  const value = request.headers["idempotency-key"];
  if (typeof value !== "string" || value.trim().length < 4) {
    throw new MarketError(
      "INVALID_COMMAND",
      "A valid Idempotency-Key header is required",
    );
  }
  return value;
}

function actorId(request: FastifyRequest, demoMode: boolean): string {
  const demoUser = request.headers["x-demo-user-id"];
  return demoMode && typeof demoUser === "string"
    ? demoUser
    : request.principal.userId;
}

function commandKey(request: FastifyRequest, demoMode: boolean): string {
  return `${actorId(request, demoMode)}:${idempotencyKey(request)}`;
}

export function registerMarketRoutes(
  app: FastifyInstance,
  dependencies: Dependencies,
) {
  const { service, bounties, ledger, memberships, demoMode, grok } =
    dependencies;

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof MarketError) {
      const status =
        error.code === "MARKET_NOT_FOUND"
          ? 404
          : error.code === "FORBIDDEN"
            ? 403
            : error.code === "INSUFFICIENT_COINS"
              ? 409
              : 400;
      return reply.status(status).send({
        error: {
          code: error.code,
          message: error.message,
          retryable: error.retryable,
        },
      });
    }
    app.log.error(error);
    return reply.status(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: "The prediction could not be updated",
        retryable: true,
      },
    });
  });

  app.get("/v1/markets", async (request) => ({
    markets: service
      .list()
      .filter((market) => request.principal.partyIds.includes(market.partyId)),
  }));
  app.get("/v1/markets/:marketId", async (request) => {
    const { marketId } = request.params as { marketId: string };
    const market = service.get(marketId);
    if (
      !(await memberships.isMember(actorId(request, demoMode), market.partyId))
    ) {
      throw new MarketError(
        "FORBIDDEN",
        "This prediction belongs to another Party",
      );
    }
    return { market };
  });
  app.get("/v1/economy/me", async (request) => {
    const userId = actorId(request, demoMode);
    return { userId, balance: ledger.balance(userAccount(userId)) };
  });

  app.post("/v1/markets", async (request, reply) => {
    const body = request.body as Record<string, string>;
    if (
      !(await memberships.isMember(request.principal.userId, body.partyId)) ||
      !(await memberships.isMember(body.participantUserId, body.partyId))
    ) {
      throw new MarketError(
        "FORBIDDEN",
        "You must be a Party member to create this prediction",
      );
    }
    const market = await service.create({
      idempotencyKey: commandKey(request, demoMode),
      questInstanceId: body.questInstanceId,
      participantUserId: body.participantUserId,
      partyId: body.partyId,
      prompt: body.prompt,
      opensAt: body.opensAt,
      closesAt: body.closesAt,
      questDeadline: body.questDeadline,
    });
    return reply.status(201).send({ market });
  });

  app.post("/v1/markets/:marketId/open", async (request) => {
    const { marketId } = request.params as { marketId: string };
    return {
      market: await service.open(marketId, commandKey(request, demoMode)),
    };
  });

  app.post("/v1/markets/:marketId/bets", async (request, reply) => {
    const { marketId } = request.params as { marketId: string };
    const body = request.body as { outcome: MarketOutcome; amount: number };
    const market = service.get(marketId);
    const bettorId = actorId(request, demoMode);
    if (!(await memberships.isMember(bettorId, market.partyId))) {
      throw new MarketError(
        "FORBIDDEN",
        "Only Party members can make this prediction",
      );
    }
    const result = await service.placeBet({
      idempotencyKey: commandKey(request, demoMode),
      marketId,
      bettorId,
      outcome: body.outcome,
      amount: body.amount,
    });
    return reply.status(201).send(result);
  });

  app.post("/v1/markets/:marketId/close", async (request) => {
    const { marketId } = request.params as { marketId: string };
    return {
      market: await service.close(marketId, commandKey(request, demoMode)),
    };
  });

  // Integration target: call this from the trusted quest.resolved consumer, not a public client.
  app.post("/v1/demo/markets/:marketId/settle", async (request) => {
    if (!demoMode)
      throw new MarketError("INVALID_COMMAND", "Demo settlement is disabled");
    const { marketId } = request.params as { marketId: string };
    const { outcome } = request.body as { outcome: MarketOutcome };
    return {
      market: await service.settle(
        marketId,
        outcome,
        commandKey(request, demoMode),
      ),
    };
  });

  app.post("/v1/demo/markets/:marketId/void", async (request) => {
    if (!demoMode)
      throw new MarketError("INVALID_COMMAND", "Demo void is disabled");
    const { marketId } = request.params as { marketId: string };
    return {
      market: await service.void(marketId, commandKey(request, demoMode)),
    };
  });

  app.post("/v1/demo/markets/:marketId/simulate-crowd", async (request) => {
    if (!demoMode)
      throw new MarketError("INVALID_COMMAND", "Crowd simulation is disabled");
    const { marketId } = request.params as { marketId: string };
    const market = service.get(marketId);
    const requested = Number((request.body as { count?: number })?.count ?? 16);
    const count = Math.max(4, Math.min(30, Math.round(requested)));
    const forecast = await grok?.forecastCrowd(market.prompt);
    const completePercent = forecast?.completePercent ?? 62;
    let added = 0;
    for (let index = 1; index <= count; index++) {
      const bettorId = `user-grok-crowd-${index}`;
      if (service.get(marketId).bets.some((bet) => bet.bettorId === bettorId))
        continue;
      const outcome =
        index * 100 <= completePercent * count ? "COMPLETE" : "FAIL";
      await service.placeBet({
        idempotencyKey: `grok-crowd:${marketId}:${index}`,
        marketId,
        bettorId,
        outcome,
        amount: 5 + (index % 4) * 5,
      });
      added++;
    }
    return {
      market: service.get(marketId),
      simulation: {
        added,
        completePercent,
        rationale: forecast?.rationale ?? "Deterministic demo forecast.",
        source: forecast?.source ?? "deterministic-fallback",
        model: forecast?.model ?? "none",
      },
    };
  });

  app.post("/v1/self-bounties", async (request, reply) => {
    const body = request.body as { questInstanceId: string; amount: number };
    const bounty = bounties.place(
      actorId(request, demoMode),
      body.questInstanceId,
      body.amount,
      commandKey(request, demoMode),
    );
    return reply.status(201).send({ bounty });
  });

  app.post("/v1/demo/self-bounties/:bountyId/resolve", async (request) => {
    if (!demoMode)
      throw new MarketError("INVALID_COMMAND", "Demo resolution is disabled");
    const { bountyId } = request.params as { bountyId: string };
    const { completed } = request.body as { completed: boolean };
    return { bounty: bounties.resolve(bountyId, completed) };
  });
}
