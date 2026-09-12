import Fastify from "fastify";

import type { RequestPrincipal } from "@sidequest/contracts";

import {
  CryptoIdGenerator,
  DemoPartyMemberships,
  InMemoryEconomy,
  InMemoryEventBus,
  SystemClock,
  demoPrincipal,
} from "./foundation/demoAdapters";
import { registerLocationModule } from "./modules/location";

declare module "fastify" {
  interface FastifyRequest {
    principal: RequestPrincipal;
  }
}

export function buildApp() {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" });
  const events = new InMemoryEventBus();
  const economy = new InMemoryEconomy();
  const memberships = new DemoPartyMemberships();

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

  // Location owns its own routes, storage, and retention timer. It exposes
  // `gpsEvidence` for quest verification to consume in-process.
  const location = registerLocationModule(app, {
    events,
    memberships,
    clock: new SystemClock(),
    ids: new CryptoIdGenerator(),
    startRetentionSweep: process.env.NODE_ENV !== "test",
  });

  app.addHook("onClose", async () => {
    location.stop();
  });

  return app;
}
