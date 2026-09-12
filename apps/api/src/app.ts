import Fastify from "fastify";

import type { RequestPrincipal } from "@sidequest/contracts";

import {
  DemoPartyMemberships,
  InMemoryEconomy,
  InMemoryEventBus,
  demoPrincipal,
} from "./foundation/demoAdapters";

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

  return app;
}
