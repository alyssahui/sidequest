import Fastify from "fastify";

import type { RequestPrincipal } from "@sidequest/contracts";
import {
  QuestService,
  ChallengeService,
  DEMO_TEMPLATES,
} from "@sidequest/quest-core";

import {
  DemoPartyMemberships,
  InMemoryEconomy,
  InMemoryEventBus,
  demoPrincipal,
  SystemClock,
  CryptoIdGenerator,
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
  const quests = new QuestService(
    new SystemClock(),
    new CryptoIdGenerator(),
    economy,
    events,
  );
  const challenges = new ChallengeService(
    new SystemClock(),
    new CryptoIdGenerator(),
    economy,
    memberships,
  );
  const demoQuest = quests.spawn(
    DEMO_TEMPLATES[0],
    demoPrincipal.userId,
    "party-demo",
    12 * 60 * 60 * 1000,
  );

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

  app.get("/v1/quests", async (request) => {
    const principal = request.principal;
    return {
      active: [...quests.instances.values()].filter(
        (q) =>
          q.ownerUserId === principal.userId &&
          ["ACCEPTED", "IN_PROGRESS"].includes(q.status),
      ),
      nearby: [...quests.instances.values()].filter(
        (q) => q.status === "SPAWNED",
      ),
      templates: quests.suggest({
        userId: principal.userId,
        now: new Date(),
        area: "CMU",
        tags: ["community", "friends"],
        social: "friends",
        nearbyMemberCount: 1,
        activeCount: 0,
        completedTemplateIds: [],
      }),
    };
  });
  app.post("/v1/quests/:questId/accept", async (request, reply) => {
    try {
      return quests.transition(
        (request.params as { questId: string }).questId,
        "ACCEPTED",
        request.principal.userId,
        String(request.headers["idempotency-key"] ?? "accept"),
      );
    } catch (error) {
      return reply
        .code(409)
        .send({ code: error instanceof Error ? error.message : "CONFLICT" });
    }
  });
  app.post("/v1/quests/:questId/start", async (request, reply) => {
    try {
      return quests.transition(
        (request.params as { questId: string }).questId,
        "IN_PROGRESS",
        request.principal.userId,
        String(request.headers["idempotency-key"] ?? "start"),
      );
    } catch (error) {
      return reply
        .code(409)
        .send({ code: error instanceof Error ? error.message : "CONFLICT" });
    }
  });
  app.post("/v1/quests/:questId/evidence", async (request, reply) => {
    try {
      return await quests.submit(
        (request.params as { questId: string }).questId,
        request.principal.userId,
        request.body as never,
        String(request.headers["idempotency-key"] ?? "evidence"),
      );
    } catch (error) {
      return reply
        .code(400)
        .send({
          code: error instanceof Error ? error.message : "INVALID_EVIDENCE",
        });
    }
  });
  app.get("/v1/demo/quest", async () => demoQuest);
  app.post("/v1/challenges", async (request, reply) => {
    try {
      const b = request.body as {
        recipientUserId: string;
        questTemplateId: string;
        stake: number;
        expiresAt: string;
      };
      return await challenges.issue(
        request.principal.userId,
        b.recipientUserId,
        "party-demo",
        b.questTemplateId,
        b.stake,
        b.expiresAt,
        String(request.headers["idempotency-key"] ?? "challenge"),
      );
    } catch (error) {
      return reply
        .code(400)
        .send({
          code: error instanceof Error ? error.message : "INVALID_CHALLENGE",
        });
    }
  });
  app.post("/v1/challenges/:challengeId/respond", async (request, reply) => {
    try {
      const b = request.body as { accept: boolean };
      return await challenges.respond(
        (request.params as { challengeId: string }).challengeId,
        request.principal.userId,
        b.accept,
        String(request.headers["idempotency-key"] ?? "respond"),
      );
    } catch (error) {
      return reply
        .code(409)
        .send({ code: error instanceof Error ? error.message : "CONFLICT" });
    }
  });

  return app;
}
