import type {
  ArrivalCondition,
  ArrivalEvaluation,
  GpsRequirement,
  LocationSample,
} from "@sidequest/contracts/location";

import { distanceMeters } from "./geometry";
import type { ArrivalPolicy } from "./policy";
import { parseInstant } from "./samples";

/**
 * Comparison tolerance in meters.
 *
 * Haversine over doubles lands a point placed exactly on the radius a few
 * nanometers either side of it. Without a tolerance, standing precisely on the
 * boundary is a coin flip decided by floating-point error. A micrometer is far
 * below any meaning GPS has, so it can only ever resolve that tie in the
 * player's favour.
 */
const DISTANCE_EPSILON_METERS = 1e-6;

export type ArrivalInput = {
  sample: LocationSample;
  requirement: GpsRequirement;
  now: number;
  policy: ArrivalPolicy;
};

/**
 * Arrival requires every configured condition at once: inside the radius,
 * accurate enough to believe, and recent enough to describe *now*.
 *
 * The measurements that produced the verdict are all returned so the UI can say
 * "42m away, need 30m" instead of a bare "not there yet", and so a disputed
 * result is explainable after the fact without re-reading raw coordinates.
 */
export function evaluateArrival({
  sample,
  requirement,
  now,
  policy,
}: ArrivalInput): ArrivalEvaluation {
  const raw = distanceMeters(sample.coordinates, requirement.target);

  // The requirement may tighten the policy ceiling but never loosen it: a quest
  // author cannot opt into evidence the system considers unusable.
  const maxAccuracyMeters = Math.min(
    requirement.maxAccuracyMeters,
    policy.maxAccuracyMeters,
  );

  const effectiveDistanceMeters =
    policy.mode === "UNCERTAINTY_ADJUSTED"
      ? Math.max(0, raw - sample.accuracyMeters)
      : raw;

  const recordedAt = parseInstant(sample.recordedAt);
  const sampleAgeMs = Number.isNaN(recordedAt)
    ? Number.POSITIVE_INFINITY
    : Math.max(0, now - recordedAt);

  const failedConditions: ArrivalCondition[] = [];
  if (
    effectiveDistanceMeters >
    requirement.radiusMeters + DISTANCE_EPSILON_METERS
  ) {
    failedConditions.push("DISTANCE");
  }
  if (sample.accuracyMeters > maxAccuracyMeters) {
    failedConditions.push("ACCURACY");
  }
  if (sampleAgeMs > policy.maxSampleAgeMs) {
    failedConditions.push("FRESHNESS");
  }

  return {
    arrived: failedConditions.length === 0,
    mode: policy.mode,
    distanceMeters: raw,
    effectiveDistanceMeters,
    radiusMeters: requirement.radiusMeters,
    accuracyMeters: sample.accuracyMeters,
    maxAccuracyMeters,
    sampleAgeMs,
    maxSampleAgeMs: policy.maxSampleAgeMs,
    failedConditions,
  };
}

/**
 * Player-facing explanation of an evaluation. Returns no coordinates, so it is
 * safe to render, log, and put in a notification.
 */
export function explainArrival(evaluation: ArrivalEvaluation): string {
  if (evaluation.arrived) {
    return `Location verified — ${Math.round(evaluation.distanceMeters)}m from the target.`;
  }

  const parts: string[] = [];
  if (evaluation.failedConditions.includes("DISTANCE")) {
    const remaining = Math.max(
      0,
      Math.round(evaluation.effectiveDistanceMeters - evaluation.radiusMeters),
    );
    parts.push(`${remaining}m to go`);
  }
  if (evaluation.failedConditions.includes("ACCURACY")) {
    parts.push(
      `signal accurate to ${Math.round(evaluation.accuracyMeters)}m, need ${Math.round(evaluation.maxAccuracyMeters)}m`,
    );
  }
  if (evaluation.failedConditions.includes("FRESHNESS")) {
    parts.push(
      `last reading ${Math.round(evaluation.sampleAgeMs / 1000)}s old`,
    );
  }

  return parts.length > 0 ? parts.join(" · ") : "Not verified yet.";
}

/** Progress toward the target in [0, 1], for HUD rings and progress bars. */
export function arrivalProgress(
  evaluation: ArrivalEvaluation,
  startedDistanceMeters: number,
): number {
  if (evaluation.arrived) return 1;
  if (startedDistanceMeters <= evaluation.radiusMeters) return 1;
  const travelled = startedDistanceMeters - evaluation.effectiveDistanceMeters;
  const total = startedDistanceMeters - evaluation.radiusMeters;
  return Math.min(1, Math.max(0, travelled / total));
}
