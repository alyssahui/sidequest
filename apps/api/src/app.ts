import Fastify from "fastify";
import type { RequestPrincipal } from "@sidequest/contracts";
import {
  CryptoIdGenerator,
  DemoPartyMemberships,
  InMemoryEventBus,
  SystemClock,
  demoPrincipal,
} from "./foundation/demoAdapters";
import { registerLocationModule } from "./modules/location";
import { challengeRoutes } from "./modules/challenges/routes";
import { createDemoQuestRuntime } from "./modules/quests/demo";
import { questRoutes } from "./modules/quests/routes";
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
  const questRuntime = createDemoQuestRuntime({
    clock,
    ids,
    economy,
    events,
    memberships,
  });
  const demoQuestServices = questRuntime.services;

  marketLedger.grant("user-zuri", 420);
  marketLedger.grant("user-alyssa", 365);
  marketLedger.grant("user-ben", 290);
  app.decorateRequest("principal", {
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
    coins: await demoQuestServices.economy.balanceFor(request.principal.userId),
  }));
  app.get("/v1/demo/feed", async () => ({
    events: demoQuestServices.events.feed,
  }));

  app.get("/v1/demo/party/:partyId/membership", async (request) => {
    const { partyId } = request.params as { partyId: string };
    return {
      isMember: await demoQuestServices.memberships.isMember(
        request.principal.userId,
        partyId,
      ),
    };
  });

  app.register(questRoutes, {
    prefix: "/v1",
    services: demoQuestServices,
    seed: questRuntime.seed,
  });
  app.register(challengeRoutes, {
    prefix: "/v1",
    service: questRuntime.challengeService,
  });

  // Location owns its own routes, storage, and retention timer. It exposes
  // `gpsEvidence` for quest verification to consume in-process.
  const location = registerLocationModule(app, {
    events: demoQuestServices.events,
    memberships: demoQuestServices.memberships,
    clock: demoQuestServices.clock,
    ids: demoQuestServices.ids,
    startRetentionSweep: process.env.NODE_ENV !== "test",
  });

  app.addHook("onClose", async () => {
    location.stop();
  });

  app.register(async (marketApp) => {
    registerMarketRoutes(marketApp, {
      service: markets,
      bounties,
      ledger: marketLedger,
      memberships: demoQuestServices.memberships,
      demoMode: true,
    });
  });

  return app;
}
