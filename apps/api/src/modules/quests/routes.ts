import type { FastifyPluginAsync, FastifyReply } from "fastify";
import type { EvidenceSubmission, SpawnContext } from "@sidequest/contracts";
import { DEMO_TEMPLATES, QuestError } from "@sidequest/quest-core";
import { demoQuestServices, seedQuestDemo } from "./demo";
const key = (headers: Record<string, unknown>) =>
  typeof headers["idempotency-key"] === "string"
    ? headers["idempotency-key"]
    : "";
const fail = (reply: FastifyReply, error: unknown) => {
  const code = error instanceof QuestError ? error.code : "INVALID_EVIDENCE";
  const status =
    code === "NOT_FOUND"
      ? 404
      : code === "NOT_AUTHORIZED"
        ? 403
        : ["VERSION_CONFLICT", "INVALID_TRANSITION", "EXPIRED"].includes(code)
          ? 409
          : 400;
  return reply.code(status).send({
    code,
    message: code,
    retryable: ["VERSION_CONFLICT", "EXPIRED"].includes(code),
  });
};
export const questRoutes: FastifyPluginAsync = async (app) => {
  await seedQuestDemo();
  app.get("/quests", async (request) =>
    demoQuestServices.quests.list(request.principal.userId),
  );
  app.get("/quests/impact", async (request) =>
    demoQuestServices.quests.impact(request.principal.userId),
  );
  app.post("/quests/spawn", async (request, reply) => {
    try {
      const b = request.body as { templateId: string; expiresAt: string };
      return await demoQuestServices.quests.spawn({
        ...b,
        ownerUserId: request.principal.userId,
        partyId: request.principal.partyIds[0],
        idempotencyKey: key(request.headers),
      });
    } catch (e) {
      return fail(reply, e);
    }
  });
  app.post("/quests/:id/accept", async (request, reply) =>
    command(request, reply, "accept"),
  );
  app.post("/quests/:id/start", async (request, reply) =>
    command(request, reply, "start"),
  );
  app.post("/quests/:id/dismiss", async (request, reply) =>
    command(request, reply, "dismiss"),
  );
  app.post("/quests/:id/evidence", async (request, reply) => {
    try {
      const b = request.body as {
        expectedVersion: number;
        evidence: EvidenceSubmission;
      };
      return await demoQuestServices.quests.submitEvidence({
        questId: (request.params as { id: string }).id,
        actorUserId: request.principal.userId,
        expectedVersion: b.expectedVersion,
        evidence: b.evidence,
        idempotencyKey: key(request.headers),
      });
    } catch (e) {
      return fail(reply, e);
    }
  });
  app.post("/quests/:id/photo-review", async (request, reply) => {
    try {
      const b = request.body as { attemptId: string; accepted: boolean };
      return await demoQuestServices.quests.reviewPhoto({
        questId: (request.params as { id: string }).id,
        attemptId: b.attemptId,
        accepted: b.accepted,
        reviewerUserId: request.principal.userId,
        idempotencyKey: key(request.headers),
      });
    } catch (e) {
      return fail(reply, e);
    }
  });
  app.get("/quest-suggestions", async (request) => {
    const q = request.query as Partial<SpawnContext>;
    const now = demoQuestServices.clock.now().toISOString();
    return {
      suggestions: demoQuestServices.spawning.suggest(
        {
          userId: request.principal.userId,
          now,
          area: String(q.area ?? "CMU"),
          placeCategories: Array.isArray(q.placeCategories)
            ? q.placeCategories
            : [],
          preferenceTags: Array.isArray(q.preferenceTags)
            ? q.preferenceTags
            : ["community", "learning"],
          socialPreference: q.socialPreference ?? "either",
          nearbyMemberCount: Number(q.nearbyMemberCount ?? 1),
          activeCount: Number(q.activeCount ?? 0),
          spawnedCount: Number(q.spawnedCount ?? 0),
          history: [],
        },
        DEMO_TEMPLATES,
      ),
    };
  });
  app.get(
    "/quest-items",
    async (request) =>
      (await demoQuestServices.quests.list(request.principal.userId)).items,
  );
  app.post("/quest-items", async (request, reply) => {
    try {
      const b = request.body as {
        kind: "WANT" | "NEED";
        text: string;
        tags?: string[];
      };
      return await demoQuestServices.quests.addItem({
        ownerUserId: request.principal.userId,
        kind: b.kind,
        text: b.text,
        tags: b.tags ?? [],
        idempotencyKey: key(request.headers),
      });
    } catch (e) {
      return fail(reply, e);
    }
  });
};
async function command(
  request: any,
  reply: FastifyReply,
  action: "accept" | "start" | "dismiss",
) {
  try {
    const b = request.body as { expectedVersion: number };
    return await demoQuestServices.quests[action]({
      questId: request.params.id,
      actorUserId: request.principal.userId,
      expectedVersion: b.expectedVersion,
      idempotencyKey: key(request.headers),
    });
  } catch (e) {
    return fail(reply, e);
  }
}
