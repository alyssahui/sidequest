import Fastify from "fastify";
import type { RequestPrincipal } from "@sidequest/contracts";
import {
  CryptoIdGenerator,
  DemoPartyMemberships,
  InMemoryEventBus,
  SystemClock,
  demoPrincipalFor,
  demoUsers,
} from "./foundation/demoAdapters";
import { registerLocationModule } from "./modules/location";
import { createQuestGpsEvidenceService } from "./modules/location/questGpsAdapter";
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
import { GrokService } from "./modules/grok/service";
declare module "fastify" {
  interface FastifyRequest {
    principal: RequestPrincipal;
  }
}
export function buildApp() {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" });
  app.addHook("onSend", async (request, reply, payload) => {
    const origin = request.headers.origin;
    if (origin) {
      reply.header("access-control-allow-origin", origin);
      reply.header("vary", "origin");
      reply.header(
        "access-control-allow-headers",
        "content-type,idempotency-key,x-demo-user-id",
      );
      reply.header("access-control-allow-methods", "GET,POST,OPTIONS");
    }
    return payload;
  });
  app.options("/*", async (_request, reply) => reply.code(204).send());
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
  const grok = new GrokService();
  // Location owns its own routes, storage, and retention timer, and is built
  // before the quest runtime because quest GPS verification is backed by it.
  const location = registerLocationModule(app, {
    events,
    memberships,
    clock,
    ids,
    startRetentionSweep: process.env.NODE_ENV !== "test",
  });

  const questRuntime = createDemoQuestRuntime({
    clock,
    ids,
    economy,
    events,
    memberships,
    // Verification now evaluates the reading the location module stored and
    // validated, rather than trusting coordinates posted in the request body.
    gps: createQuestGpsEvidenceService({ service: location.service }),
  });
  const demoQuestServices = questRuntime.services;

  marketLedger.grant("user-zuri", 420);
  marketLedger.grant("user-alyssa", 365);
  marketLedger.grant("user-ben", 290);
  for (let index = 1; index <= 40; index++) {
    marketLedger.grant(`user-grok-crowd-${index}`, 100);
  }
  app.decorateRequest("principal", {
    getter(this: { headers?: Record<string, unknown> }) {
      return demoPrincipalFor(this.headers?.["x-demo-user-id"]);
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
  app.get("/v1/demo/session", async (request) => ({
    user: demoUsers.find((user) => user.id === request.principal.userId),
    users: demoUsers,
    grok: {
      enabled: grok.enabled,
      model: grok.model,
      imagineModel: process.env.XAI_IMAGE_MODEL ?? "grok-imagine-image-2.0",
      voice: process.env.XAI_VOICE_ID ?? "eve",
    },
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

  app.post("/v1/grok/quest-design", async (request) => {
    const body = request.body as {
      recipientUserId: string;
      partyId: string;
      task: string;
      locationLabel?: string;
      notes?: string;
      deadline: string;
    };
    const baseline = questRuntime.challengeService.assessDraft(body);
    return grok.designQuest(body, baseline);
  });

  app.post("/v1/grok/imagine", async (request, reply) => {
    if (!grok.enabled)
      return reply.code(503).send({
        code: "GROK_NOT_CONFIGURED",
        message:
          "Add XAI_API_KEY to generate a live Grok Imagine mission card.",
      });
    const { prompt } = request.body as { prompt: string };
    try {
      return await grok.createImage(prompt);
    } catch (error) {
      request.log.error(error);
      return reply.code(502).send({ code: "GROK_IMAGINE_FAILED" });
    }
  });

  app.post("/v1/grok/voice", async (request, reply) => {
    if (!grok.enabled)
      return reply.code(503).send({
        code: "GROK_NOT_CONFIGURED",
        message: "Add XAI_API_KEY to generate a live Grok Voice briefing.",
      });
    const { text } = request.body as { text: string };
    try {
      const audio = await grok.createVoice(text);
      return reply.type("audio/mpeg").send(Buffer.from(audio));
    } catch (error) {
      request.log.error(error);
      return reply.code(502).send({ code: "GROK_VOICE_FAILED" });
    }
  });

  app.addHook("onClose", async () => {
    location.stop();
  });

  // A resolved quest settles its prediction. Delivery is at-least-once, so the
  // event id is the idempotency key and a re-delivery is a no-op.
  events.on("quest.resolved", async (event) => {
    const payload = event.payload as { questId?: string; status?: string };
    if (!payload.questId) return;
    if (payload.status !== "VERIFIED" && payload.status !== "FAILED") return;

    await markets.settleFromQuest({
      eventId: event.id,
      questInstanceId: payload.questId,
      outcome: payload.status === "VERIFIED" ? "COMPLETE" : "FAIL",
    });
  });

  // Location stops collecting once the quest that justified it is over.
  events.on("quest.resolved", async (event) => {
    const payload = event.payload as { questId?: string };
    if (!payload.questId) return;
    await location.service.stopSessionsFor(
      { type: "QUEST_RESOLVED", questInstanceId: payload.questId },
      { userId: event.actorUserId ?? "" },
    );
  });

  app.register(async (marketApp) => {
    registerMarketRoutes(marketApp, {
      service: markets,
      bounties,
      ledger: marketLedger,
      memberships: demoQuestServices.memberships,
      demoMode: true,
      grok,
    });
  });

  let marketsSeeded = false;
  app.addHook("onReady", async () => {
    if (marketsSeeded) return;
    marketsSeeded = true;
    const opensAt = new Date(clock.now().getTime() - 60_000).toISOString();
    const closesAt = new Date(
      clock.now().getTime() + 24 * 3600_000,
    ).toISOString();
    const questDeadline = new Date(
      clock.now().getTime() + 25 * 3600_000,
    ).toISOString();
    for (const seed of [
      {
        questInstanceId: "quest-ben-water-audit",
        participantUserId: "user-ben",
        prompt: "Will Etash audit and fix one source of wasted water today?",
      },
      {
        questInstanceId: "quest-alyssa-teach",
        participantUserId: "user-alyssa",
        prompt:
          "Will Alyssa teach a neighbor one emergency-preparedness skill?",
      },
    ]) {
      const market = await markets.create({
        ...seed,
        idempotencyKey: `seed:${seed.questInstanceId}`,
        partyId: "party-demo",
        opensAt,
        closesAt,
        questDeadline,
      });
      await markets.open(market.id, `seed-open:${market.id}`);
    }
  });

  return app;
}
