import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { QuestError } from "@sidequest/quest-core";
import { demoChallengeService } from "../quests/demo";
type ChallengeRoutesOptions = {
  service?: typeof demoChallengeService;
};
const idempotency = (h: Record<string, unknown>) =>
  typeof h["idempotency-key"] === "string" ? h["idempotency-key"] : "";
const fail = (reply: FastifyReply, e: unknown) => {
  const code = e instanceof QuestError ? e.code : "INVALID_CHALLENGE";
  return reply
    .code(
      code === "NOT_AUTHORIZED"
        ? 403
        : ["VERSION_CONFLICT", "INVALID_TRANSITION", "EXPIRED"].includes(code)
          ? 409
          : 400,
    )
    .send({ code, message: code });
};
export const challengeRoutes: FastifyPluginAsync<
  ChallengeRoutesOptions
> = async (app, options) => {
  const service = options.service ?? demoChallengeService;
  app.get("/challenges", async (request) => {
    const challenges = await service.list(request.principal.userId);
    return {
      incoming: challenges.filter(
        (challenge) => challenge.recipientUserId === request.principal.userId,
      ),
      outgoing: challenges.filter(
        (challenge) => challenge.issuerUserId === request.principal.userId,
      ),
    };
  });
  app.post("/challenges/assess", async (request, reply) => {
    try {
      const body = request.body as {
        recipientUserId: string;
        partyId: string;
        task: string;
        locationLabel?: string;
        notes?: string;
        deadline: string;
      };
      return service.assessDraft(body);
    } catch (error) {
      return fail(reply, error);
    }
  });
  app.post("/challenges/custom", async (request, reply) => {
    try {
      const body = request.body as {
        recipientUserId: string;
        partyId: string;
        task: string;
        locationLabel?: string;
        notes?: string;
        deadline: string;
      };
      return await service.issueCustom({
        ...body,
        issuerUserId: request.principal.userId,
        idempotencyKey: idempotency(request.headers),
      });
    } catch (error) {
      return fail(reply, error);
    }
  });
  app.post("/challenges", async (request, reply) => {
    try {
      const b = request.body as {
        recipientUserId: string;
        partyId: string;
        questTemplateId: string;
        stakeCoins: number;
        expiresAt: string;
      };
      return await service.issue({
        ...b,
        issuerUserId: request.principal.userId,
        idempotencyKey: idempotency(request.headers),
      });
    } catch (e) {
      return fail(reply, e);
    }
  });
  app.post("/challenges/:id/respond", async (request, reply) => {
    try {
      const b = request.body as { accept: boolean; expectedVersion: number };
      return await service.respond({
        challengeId: (request.params as { id: string }).id,
        recipientUserId: request.principal.userId,
        ...b,
        idempotencyKey: idempotency(request.headers),
      });
    } catch (e) {
      return fail(reply, e);
    }
  });
  app.post("/challenges/:id/progress", async (request, reply) => {
    try {
      const body = request.body as {
        progressPercent: number;
        expectedVersion: number;
      };
      return await service.updateProgress({
        challengeId: (request.params as { id: string }).id,
        recipientUserId: request.principal.userId,
        ...body,
        idempotencyKey: idempotency(request.headers),
      });
    } catch (error) {
      return fail(reply, error);
    }
  });
};
