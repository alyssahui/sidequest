import Fastify from "fastify";

import type { RequestPrincipal } from "@sidequest/contracts";

import {
  CryptoIdGenerator,
  DemoPartyMemberships,
  InMemoryEventBus,
  SystemClock,
  demoPrincipal,
} from "./foundation/demoAdapters";
import { registerMarketRoutes } from "./modules/markets/routes";
import {
  InMemoryLedger,
  InMemoryMarketRepository,
  LedgerEconomyAdapter,
  MarketService,
  SelfBountyService,
} from "@sidequest/market-core";

declare module "fastify" {
  interface FastifyRequest {
    principal: RequestPrincipal;
  }
}

export function buildApp() {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" });
  const events = new InMemoryEventBus();
  const memberships = new DemoPartyMemberships();
  const ids = new CryptoIdGenerator();
  const clock = new SystemClock();
  const marketLedger = new InMemoryLedger(ids);
  const markets = new MarketService(
    new InMemoryMarketRepository(),
    marketLedger,
    events,
    clock,
    ids,
  );
  const economy = new LedgerEconomyAdapter(marketLedger);
  const bounties = new SelfBountyService(marketLedger, clock, ids);

  marketLedger.grant("user-zuri", 420);
  marketLedger.grant("user-alyssa", 365);
  marketLedger.grant("user-ben", 290);

  app.decorateRequest("principal", {
    // Foundation-only demo identity. Replace this getter with AuthPort validation before deployment.
    getter() {
      return demoPrincipal;
    },
  });

  app.get("/health", async () => ({
    ok: true,
    mode: "demo",
    service: "sidequest-api",
  }));

  app.get("/v1/me", async (request) => ({
    ...request.principal,
    coins: await economy.balanceFor(request.principal.userId),
  }));

  app.get("/v1/demo/feed", async () => ({ events: events.feed }));

  app.get("/v1/demo/party/:partyId/membership", async (request) => {
    const { partyId } = request.params as { partyId: string };
    return {
      isMember: await memberships.isMember(request.principal.userId, partyId),
    };
  });

  app.register(async (marketApp) => {
    registerMarketRoutes(marketApp, {
      service: markets,
      bounties,
      ledger: marketLedger,
      memberships,
      demoMode: true,
    });
  });

  return app;
}
