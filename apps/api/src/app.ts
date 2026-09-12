import Fastify from "fastify";
import type { RequestPrincipal } from "@sidequest/contracts";
import { demoPrincipal } from "./foundation/demoAdapters";
import { challengeRoutes } from "./modules/challenges/routes";
import { demoQuestServices } from "./modules/quests/demo";
import { questRoutes } from "./modules/quests/routes";
declare module "fastify" {
  interface FastifyRequest {
    principal: RequestPrincipal;
  }
}
export function buildApp() {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" });
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
  app.get("/v1/demo/party/:partyId/membership", async (request) => ({
    isMember: await demoQuestServices.memberships.isMember(
      request.principal.userId,
      (request.params as { partyId: string }).partyId,
    ),
  }));
  app.register(questRoutes, { prefix: "/v1" });
  app.register(challengeRoutes, { prefix: "/v1" });
  return app;
}
