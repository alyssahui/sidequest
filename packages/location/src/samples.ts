import type {
  LocationRejection,
  LocationRejectionCode,
  LocationSample,
  LocationSource,
} from "@sidequest/contracts/location";
import { locationSources } from "@sidequest/contracts/location";

import {
  isFiniteNumber,
  isValidCoordinates,
  isValidLatitude,
  isValidLongitude,
  looksLikeSwappedCoordinates,
  distanceMeters,
} from "./geometry";
import type { IngestPolicy } from "./policy";

export type SampleCheck<T> =
  { ok: true; value: T } | { ok: false; rejection: LocationRejection };

/** Messages are intentionally coordinate-free so they are safe to log. */
const messages: Record<LocationRejectionCode, string> = {
  INVALID_COORDINATES: "Coordinates are missing or outside the valid range.",
  COORDINATES_LOOK_SWAPPED:
    "Latitude and longitude appear to be reversed. Objects use { latitude, longitude }.",
  INVALID_ACCURACY: "Horizontal accuracy must be a positive number of meters.",
  INVALID_TIMESTAMP: "Timestamp must be a UTC ISO-8601 instant.",
  SAMPLE_IN_FUTURE:
    "Sample timestamp is further ahead than allowed clock skew.",
  SAMPLE_STALE: "Sample is too old to be used. Move and try again.",
  ACCURACY_TOO_LOW:
    "Signal is too weak right now. Step outside or wait for a better fix.",
  IMPLAUSIBLE_TRAVEL:
    "That jump is faster than physically plausible. The next fresh reading will be accepted.",
  NON_MONOTONIC_SAMPLE: "A newer sample has already been recorded.",
  NO_ACTIVE_SESSION: "Start a location session before sending readings.",
  SESSION_EXPIRED: "This location session has expired.",
  SESSION_PAUSED: "Location sharing is paused.",
  SESSION_NOT_OWNED: "This session belongs to a different player.",
  SESSION_QUEST_MISMATCH: "This session is not attached to that quest.",
  RATE_LIMITED: "Too many readings. Slow down and retry shortly.",
};

const retryable: Record<LocationRejectionCode, boolean> = {
  INVALID_COORDINATES: false,
  COORDINATES_LOOK_SWAPPED: false,
  INVALID_ACCURACY: false,
  INVALID_TIMESTAMP: false,
  SAMPLE_IN_FUTURE: true,
  SAMPLE_STALE: true,
  ACCURACY_TOO_LOW: true,
  IMPLAUSIBLE_TRAVEL: true,
  NON_MONOTONIC_SAMPLE: false,
  NO_ACTIVE_SESSION: false,
  SESSION_EXPIRED: false,
  SESSION_PAUSED: false,
  SESSION_NOT_OWNED: false,
  SESSION_QUEST_MISMATCH: false,
  RATE_LIMITED: true,
};

export function rejection(code: LocationRejectionCode): LocationRejection {
  return { code, message: messages[code], retryable: retryable[code] };
}

function isLocationSource(value: unknown): value is LocationSource {
  return (
    typeof value === "string" &&
    (locationSources as readonly string[]).includes(value)
  );
}

/** Parses an ISO-8601 instant, returning NaN for anything unparseable. */
export function parseInstant(value: unknown): number {
  if (typeof value !== "string" || value.length === 0) return Number.NaN;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.NaN : parsed;
}

/**
 * Shape validation only. Freshness, accuracy and travel plausibility are
 * separate checks because they depend on server time and prior samples, and
 * because they produce *retryable* rejections while a bad shape never will.
 */
export function normalizeSample(input: unknown): SampleCheck<LocationSample> {
  if (typeof input !== "object" || input === null) {
    return { ok: false, rejection: rejection("INVALID_COORDINATES") };
  }

  const candidate = input as Record<string, unknown>;
  const coordinates = candidate.coordinates as
    { latitude: number; longitude: number } | undefined;

  if (
    typeof coordinates !== "object" ||
    coordinates === null ||
    !isFiniteNumber(coordinates.latitude) ||
    !isFiniteNumber(coordinates.longitude)
  ) {
    return { ok: false, rejection: rejection("INVALID_COORDINATES") };
  }

  if (looksLikeSwappedCoordinates(coordinates)) {
    return { ok: false, rejection: rejection("COORDINATES_LOOK_SWAPPED") };
  }

  if (
    !isValidLatitude(coordinates.latitude) ||
    !isValidLongitude(coordinates.longitude)
  ) {
    return { ok: false, rejection: rejection("INVALID_COORDINATES") };
  }

  const accuracyMeters = candidate.accuracyMeters;
  if (!isFiniteNumber(accuracyMeters) || accuracyMeters < 0) {
    return { ok: false, rejection: rejection("INVALID_ACCURACY") };
  }

  if (Number.isNaN(parseInstant(candidate.recordedAt))) {
    return { ok: false, rejection: rejection("INVALID_TIMESTAMP") };
  }

  if (!isLocationSource(candidate.source)) {
    return { ok: false, rejection: rejection("INVALID_COORDINATES") };
  }

  const sample: LocationSample = {
    coordinates: {
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
    },
    accuracyMeters,
    // Re-serialize so persisted instants are canonical UTC regardless of the
    // offset the device sent.
    recordedAt: new Date(parseInstant(candidate.recordedAt)).toISOString(),
    source: candidate.source,
  };

  if (typeof candidate.sessionId === "string")
    sample.sessionId = candidate.sessionId;
  if (typeof candidate.questInstanceId === "string")
    sample.questInstanceId = candidate.questInstanceId;
  if (isFiniteNumber(candidate.altitudeMeters))
    sample.altitudeMeters = candidate.altitudeMeters;
  if (isFiniteNumber(candidate.speedMps)) sample.speedMps = candidate.speedMps;

  return { ok: true, value: sample };
}

export type FreshnessCheckInput = {
  sample: LocationSample;
  now: number;
  policy: Pick<IngestPolicy, "maxSampleAgeMs" | "maxClockSkewAheadMs">;
};

export function checkFreshness({
  sample,
  now,
  policy,
}: FreshnessCheckInput): SampleCheck<number> {
  const recordedAt = parseInstant(sample.recordedAt);
  if (Number.isNaN(recordedAt)) {
    return { ok: false, rejection: rejection("INVALID_TIMESTAMP") };
  }

  const ageMs = now - recordedAt;
  if (ageMs < -policy.maxClockSkewAheadMs) {
    return { ok: false, rejection: rejection("SAMPLE_IN_FUTURE") };
  }
  if (ageMs > policy.maxSampleAgeMs) {
    return { ok: false, rejection: rejection("SAMPLE_STALE") };
  }
  // A fix a few seconds "ahead" is clock skew, not time travel; clamp to zero
  // so downstream age arithmetic never goes negative.
  return { ok: true, value: Math.max(0, ageMs) };
}

export function checkAccuracy(
  sample: LocationSample,
  maxAccuracyMeters: number,
): SampleCheck<number> {
  if (sample.accuracyMeters > maxAccuracyMeters) {
    return { ok: false, rejection: rejection("ACCURACY_TOO_LOW") };
  }
  return { ok: true, value: sample.accuracyMeters };
}

export type TravelCheckInput = {
  previous: LocationSample;
  next: LocationSample;
  policy: Pick<IngestPolicy, "maxPlausibleSpeedMps" | "jitterGraceMeters">;
};

export type TravelMeasurement = {
  distanceMeters: number;
  /** Distance after removing combined horizontal uncertainty and jitter grace. */
  unexplainedMeters: number;
  elapsedMs: number;
  impliedSpeedMps: number;
};

/**
 * Plausible-travel check.
 *
 * Two consecutive fixes each accurate to ±50m can differ by 100m without the
 * device moving at all, so the raw distance is reduced by the combined accuracy
 * and a jitter grace before a speed is implied. What remains is movement the
 * accuracy cannot explain; only that is held to the speed ceiling.
 */
export function checkPlausibleTravel({
  previous,
  next,
  policy,
}: TravelCheckInput): SampleCheck<TravelMeasurement> {
  const previousAt = parseInstant(previous.recordedAt);
  const nextAt = parseInstant(next.recordedAt);

  if (Number.isNaN(previousAt) || Number.isNaN(nextAt)) {
    return { ok: false, rejection: rejection("INVALID_TIMESTAMP") };
  }

  const elapsedMs = nextAt - previousAt;
  if (elapsedMs < 0) {
    return { ok: false, rejection: rejection("NON_MONOTONIC_SAMPLE") };
  }

  const straightLine = distanceMeters(previous.coordinates, next.coordinates);
  const explainable =
    previous.accuracyMeters + next.accuracyMeters + policy.jitterGraceMeters;
  const unexplainedMeters = Math.max(0, straightLine - explainable);

  if (elapsedMs === 0) {
    // Same instant: only a genuinely unexplained jump is impossible.
    if (unexplainedMeters > 0) {
      return { ok: false, rejection: rejection("IMPLAUSIBLE_TRAVEL") };
    }
    return {
      ok: true,
      value: {
        distanceMeters: straightLine,
        unexplainedMeters,
        elapsedMs,
        impliedSpeedMps: 0,
      },
    };
  }

  const impliedSpeedMps = unexplainedMeters / (elapsedMs / 1000);
  if (impliedSpeedMps > policy.maxPlausibleSpeedMps) {
    return { ok: false, rejection: rejection("IMPLAUSIBLE_TRAVEL") };
  }

  return {
    ok: true,
    value: {
      distanceMeters: straightLine,
      unexplainedMeters,
      elapsedMs,
      impliedSpeedMps,
    },
  };
}

export { isValidCoordinates };
