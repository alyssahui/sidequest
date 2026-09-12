import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type {
  Coordinates,
  GpsRequirement,
  LocationErrorCode,
  LocationSessionMode,
  LocationSessionPurpose,
  LocationSharingPreference,
  StartLocationSessionRequest,
} from "@sidequest/contracts/location";
import { locationSessionPurposes } from "@sidequest/contracts/location";
import { isValidCoordinates } from "@sidequest/location";

import { LocationServiceError, type LocationService } from "./service";

function fail(
  reply: FastifyReply,
  status: number,
  code: LocationErrorCode,
  message: string,
) {
  return reply.status(status).send({ error: { code, message } });
}

function handleServiceError(reply: FastifyReply, error: unknown) {
  if (error instanceof LocationServiceError) {
    return fail(
      reply,
      error.statusCode,
      error.code as LocationErrorCode,
      error.message,
    );
  }
  throw error;
}

const isPurpose = (value: unknown): value is LocationSessionPurpose =>
  typeof value === "string" &&
  (locationSessionPurposes as readonly string[]).includes(value);

const isMode = (value: unknown): value is LocationSessionMode =>
  value === "FOREGROUND" || value === "BACKGROUND";

/**
 * Parses a GPS requirement from a request body.
 *
 * The quest module supplies the real requirement in-process; this HTTP shape
 * exists so the app can render live "42m to go" feedback and so the flow is
 * inspectable without a database.
 */
function parseRequirement(
  body: Record<string, unknown>,
): GpsRequirement | undefined {
  const target = body.target;
  if (!isValidCoordinates(target)) return undefined;

  const radiusMeters = body.radiusMeters;
  const maxAccuracyMeters = body.maxAccuracyMeters;
  if (typeof radiusMeters !== "number" || !Number.isFinite(radiusMeters)) {
    return undefined;
  }
  if (radiusMeters <= 0 || radiusMeters > 100_000) return undefined;
  if (
    typeof maxAccuracyMeters !== "number" ||
    !Number.isFinite(maxAccuracyMeters) ||
    maxAccuracyMeters <= 0
  ) {
    return undefined;
  }

  return {
    type: "GPS",
    target: target as Coordinates,
    radiusMeters,
    maxAccuracyMeters,
  };
}

export type LocationRoutesOptions = {
  service: LocationService;
};

/**
 * HTTP surface for the location module.
 *
 * Every route derives the acting user from `request.principal`. No handler
 * reads an actor id from a body or query string, and no response body carries
 * another player's coordinates.
 */
export async function registerLocationRoutes(
  app: FastifyInstance,
  { service }: LocationRoutesOptions,
) {
  const principalOf = (request: FastifyRequest) => request.principal;

  app.get("/v1/location/config", async () => {
    const policy = service.policy;
    // Thresholds the client needs to set expectations before a round trip.
    return {
      arrival: {
        mode: policy.arrival.mode,
        maxAccuracyMeters: policy.arrival.maxAccuracyMeters,
        maxSampleAgeMs: policy.arrival.maxSampleAgeMs,
      },
      ingest: {
        maxAccuracyMeters: policy.ingest.maxAccuracyMeters,
        maxSampleAgeMs: policy.ingest.maxSampleAgeMs,
      },
      session: {
        defaultDurationMs: policy.session.defaultDurationMs,
        maxDurationMs: policy.session.maxDurationMs,
      },
      retention: { rawSampleTtlMs: policy.retention.rawSampleTtlMs },
    };
  });

  /* ---------------------------------------------------------------- */
  /* Sessions                                                          */
  /* ---------------------------------------------------------------- */

  app.post("/v1/location/sessions", async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;

    if (!isPurpose(body.purpose)) {
      return fail(
        reply,
        400,
        "INVALID_REQUEST",
        "purpose must be ACTIVE_QUEST or PARTY_SESSION.",
      );
    }
    if (!isMode(body.mode)) {
      return fail(
        reply,
        400,
        "INVALID_REQUEST",
        "mode must be FOREGROUND or BACKGROUND.",
      );
    }

    const durationMs =
      typeof body.durationMs === "number" && Number.isFinite(body.durationMs)
        ? body.durationMs
        : undefined;

    const start: StartLocationSessionRequest = {
      purpose: body.purpose,
      mode: body.mode,
      ...(durationMs === undefined ? {} : { durationMs }),
      ...(typeof body.questInstanceId === "string"
        ? { questInstanceId: body.questInstanceId }
        : {}),
      ...(typeof body.partyId === "string" ? { partyId: body.partyId } : {}),
    };

    try {
      const session = await service.startSession(
        principalOf(request).userId,
        start,
      );
      return reply.status(201).send({ session });
    } catch (error) {
      return handleServiceError(reply, error);
    }
  });

  app.get("/v1/location/sessions", async (request) => {
    const sessions = await service.listSessions(principalOf(request).userId);
    return { sessions };
  });

  app.post<{ Params: { sessionId: string } }>(
    "/v1/location/sessions/:sessionId/pause",
    async (request, reply) => {
      try {
        const session = await service.pauseSession(
          principalOf(request).userId,
          request.params.sessionId,
        );
        return { session };
      } catch (error) {
        return handleServiceError(reply, error);
      }
    },
  );

  app.post<{ Params: { sessionId: string } }>(
    "/v1/location/sessions/:sessionId/resume",
    async (request, reply) => {
      try {
        const session = await service.resumeSession(
          principalOf(request).userId,
          request.params.sessionId,
        );
        return { session };
      } catch (error) {
        return handleServiceError(reply, error);
      }
    },
  );

  app.delete<{ Params: { sessionId: string } }>(
    "/v1/location/sessions/:sessionId",
    async (request, reply) => {
      try {
        const session = await service.stopSession(
          principalOf(request).userId,
          request.params.sessionId,
        );
        return { session };
      } catch (error) {
        return handleServiceError(reply, error);
      }
    },
  );

  /* ---------------------------------------------------------------- */
  /* Ingest                                                            */
  /* ---------------------------------------------------------------- */

  app.post("/v1/location/samples", async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;

    if (typeof body.sessionId !== "string" || body.sessionId.length === 0) {
      return fail(
        reply,
        400,
        "INVALID_REQUEST",
        "sessionId is required to submit a reading.",
      );
    }

    // An idempotency key may travel in the standard header or the body; the
    // header wins so a generic retrying HTTP client does the right thing.
    const headerKey = request.headers["idempotency-key"];
    const idempotencyKey =
      typeof headerKey === "string"
        ? headerKey
        : typeof body.idempotencyKey === "string"
          ? body.idempotencyKey
          : undefined;

    const result = await service.submitSample(principalOf(request).userId, {
      sessionId: body.sessionId,
      sample: body.sample as never,
      ...(idempotencyKey ? { idempotencyKey } : {}),
    });

    if (result.accepted) return reply.status(202).send(result);

    // A rate limit is the one rejection that is about the caller rather than
    // the reading, so it gets the status code clients already retry on.
    const status = result.rejection.code === "RATE_LIMITED" ? 429 : 422;
    return reply.status(status).send(result);
  });

  /* ---------------------------------------------------------------- */
  /* GPS evidence                                                      */
  /* ---------------------------------------------------------------- */

  app.post("/v1/location/evidence/gps", async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;

    if (typeof body.questInstanceId !== "string") {
      return fail(
        reply,
        400,
        "INVALID_REQUEST",
        "questInstanceId is required.",
      );
    }

    const requirement = parseRequirement(body);
    if (!requirement) {
      return fail(
        reply,
        400,
        "INVALID_REQUEST",
        "target, radiusMeters and maxAccuracyMeters are required and must be in range.",
      );
    }

    // Evidence is always evaluated for the authenticated user. There is no way
    // to ask this endpoint about somebody else.
    const result = await service.evaluate({
      userId: principalOf(request).userId,
      questInstanceId: body.questInstanceId,
      requirement,
    });

    return { evidence: result };
  });

  /* ---------------------------------------------------------------- */
  /* Presence                                                          */
  /* ---------------------------------------------------------------- */

  app.get<{ Params: { partyId: string } }>(
    "/v1/location/party/:partyId/presence",
    async (request, reply) => {
      try {
        const presence = await service.getPartyPresence(
          principalOf(request).userId,
          request.params.partyId,
        );
        return { presence };
      } catch (error) {
        return handleServiceError(reply, error);
      }
    },
  );

  /* ---------------------------------------------------------------- */
  /* Privacy controls                                                  */
  /* ---------------------------------------------------------------- */

  app.get("/v1/location/me/privacy", async (request) => {
    const userId = principalOf(request).userId;
    return {
      summary: await service.getPrivacySummary(userId),
      preference: await service.getSharingPreference(userId),
    };
  });

  app.patch("/v1/location/me/privacy", async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const patch: Partial<LocationSharingPreference> = {};

    if (typeof body.sharingEnabled === "boolean")
      patch.sharingEnabled = body.sharingEnabled;
    if (typeof body.sharePartyPresence === "boolean")
      patch.sharePartyPresence = body.sharePartyPresence;
    if (typeof body.allowBackgroundDuringQuest === "boolean")
      patch.allowBackgroundDuringQuest = body.allowBackgroundDuringQuest;
    if (
      typeof body.defaultSessionDurationMs === "number" &&
      Number.isFinite(body.defaultSessionDurationMs) &&
      body.defaultSessionDurationMs > 0
    ) {
      patch.defaultSessionDurationMs = body.defaultSessionDurationMs;
    }

    if (Object.keys(patch).length === 0) {
      return fail(
        reply,
        400,
        "INVALID_REQUEST",
        "No recognised privacy settings were supplied.",
      );
    }

    const preference = await service.updateSharingPreference(
      principalOf(request).userId,
      patch,
    );
    return { preference };
  });

  app.delete("/v1/location/me/samples", async (request) => {
    const result = await service.deleteMyLocationData(
      principalOf(request).userId,
    );
    return result;
  });

  app.post("/v1/location/retention/sweep", async () => ({
    deletedSampleCount: await service.sweepExpiredSamples(),
  }));
}
