import type { QuestGpsEvidenceService } from "@sidequest/contracts";
import type {
  GpsRequirement,
  LocationSample,
} from "@sidequest/contracts/location";
import {
  defaultLocationPolicy,
  evaluateArrival,
  type LocationPolicy,
} from "@sidequest/location";

import type { LocationService } from "./service";

/**
 * Backs quest GPS verification with the location module.
 *
 * Two things this fixes.
 *
 * First, semantics. Without it the quest module runs its own GPS check with its
 * own thresholds and a strict radius comparison, while the map HUD evaluates
 * arrival with the location policy's uncertainty adjustment. The same walk can
 * then read VERIFIED on the player's screen and fail on the server. Both sides
 * now use `evaluateArrival` against one policy.
 *
 * Second, trust. The quest evidence endpoint takes coordinates from the request
 * body, so a client can claim any position. When the player has been uploading
 * through a location session, the server already holds a reading that passed
 * validation, rate limiting, and the plausible-travel check — that record is
 * preferred, and the submitted coordinates are only a fallback for clients that
 * never opened a session.
 */
export type QuestGpsAdapterOptions = {
  service: LocationService;
  policy?: LocationPolicy;
};

export function createQuestGpsEvidenceService({
  service,
  policy = defaultLocationPolicy,
}: QuestGpsAdapterOptions): QuestGpsEvidenceService {
  return {
    async evaluate({
      evidence,
      target,
      radiusMeters,
      maxAccuracyMeters,
      serverNow,
      userId,
      questInstanceId,
    }) {
      const requirement: GpsRequirement = {
        type: "GPS",
        target,
        radiusMeters,
        maxAccuracyMeters,
      };

      // Server-held evidence first, when we know whose quest this is.
      if (userId && questInstanceId) {
        const stored = await service.evaluate({
          userId,
          questInstanceId,
          requirement,
          evaluatedAt: serverNow,
        });

        if (stored.status !== "NO_EVIDENCE" && stored.evaluation) {
          return {
            accepted: stored.evaluation.arrived,
            code: stored.evaluation.arrived
              ? "GPS_OK"
              : codeFor(stored.evaluation.failedConditions),
            distanceMeters: Math.round(stored.evaluation.distanceMeters),
          };
        }
      }

      // No session evidence: fall back to what the client submitted, evaluated
      // under the same policy so the verdict is at least consistent.
      const sample: LocationSample = {
        coordinates: evidence.coordinates,
        accuracyMeters: evidence.accuracyMeters,
        recordedAt: evidence.capturedAt,
        source: "MANUAL",
      };

      const evaluation = evaluateArrival({
        sample,
        requirement,
        now: Date.parse(serverNow),
        policy: policy.arrival,
      });

      return {
        accepted: evaluation.arrived,
        code: evaluation.arrived
          ? "GPS_OK"
          : codeFor(evaluation.failedConditions),
        distanceMeters: Math.round(evaluation.distanceMeters),
      };
    },
  };
}

/** Maps failed conditions onto the codes the quest module already reports. */
function codeFor(failed: readonly string[]): string {
  if (failed.includes("ACCURACY")) return "GPS_INACCURATE";
  if (failed.includes("FRESHNESS")) return "GPS_STALE";
  return "GPS_OUTSIDE_RADIUS";
}
