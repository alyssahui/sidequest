import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { QuestError } from "@sidequest/quest-core";
import { demoChallengeService } from "../quests/demo";
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
export const challengeRoutes: FastifyPluginAsync = async (app) => {
  app.get("/challenges", async (request) => ({
    challenges: await demoChallengeService.list(request.principal.userId),
  }));
  app.post("/challenges", async (request, reply) => {
    try {
      const b = request.body as {
        recipientUserId: string;
        partyId: string;
        questTemplateId: string;
        stakeCoins: number;
        expiresAt: string;
      };
      return await demoChallengeService.issue({
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
      return await demoChallengeService.respond({
        challengeId: (request.params as { id: string }).id,
        recipientUserId: request.principal.userId,
        ...b,
        idempotencyKey: idempotency(request.headers),
      });
    } catch (e) {
      return fail(reply, e);
    }
  });
};
