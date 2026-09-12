import type { LocationSample } from "@sidequest/contracts/location";

/**
 * Coordinates must never reach application logs, analytics, crash reports, or
 * test snapshots. Everything that wants to describe a sample goes through here
 * first, so "log the sample" is a safe instinct instead of a privacy incident.
 */
export type RedactedSample = {
  sessionId?: string;
  questInstanceId?: string;
  source: LocationSample["source"];
  recordedAt: string;
  /** Bucketed so log volume cannot be used to reconstruct a precision trace. */
  accuracyBucket: AccuracyBucket;
};

export type AccuracyBucket = "FINE" | "GOOD" | "COARSE" | "POOR";

export function accuracyBucket(accuracyMeters: number): AccuracyBucket {
  if (accuracyMeters <= 15) return "FINE";
  if (accuracyMeters <= 50) return "GOOD";
  if (accuracyMeters <= 150) return "COARSE";
  return "POOR";
}

export function redactSample(sample: LocationSample): RedactedSample {
  const redacted: RedactedSample = {
    source: sample.source,
    recordedAt: sample.recordedAt,
    accuracyBucket: accuracyBucket(sample.accuracyMeters),
  };
  if (sample.sessionId) redacted.sessionId = sample.sessionId;
  if (sample.questInstanceId) redacted.questInstanceId = sample.questInstanceId;
  return redacted;
}

const coordinateKeys = new Set([
  "latitude",
  "longitude",
  "lat",
  "lng",
  "lon",
  "coordinates",
  "coords",
  "geometry",
  "point",
]);

/**
 * Test and runtime guard. Walks an arbitrary payload and reports any key that
 * could carry a position, so a route response or an emitted event can be
 * asserted coordinate-free without hand-listing its shape.
 */
export function findCoordinateLeaks(
  value: unknown,
  path = "$",
  seen = new WeakSet<object>(),
): string[] {
  if (value === null || typeof value !== "object") return [];
  if (seen.has(value)) return [];
  seen.add(value);

  const leaks: string[] = [];

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      leaks.push(...findCoordinateLeaks(entry, `${path}[${index}]`, seen));
    });
    return leaks;
  }

  for (const [key, entry] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (coordinateKeys.has(key)) {
      leaks.push(childPath);
      continue;
    }
    leaks.push(...findCoordinateLeaks(entry, childPath, seen));
  }

  return leaks;
}

export function assertNoCoordinates(value: unknown, label: string): void {
  const leaks = findCoordinateLeaks(value);
  if (leaks.length > 0) {
    throw new Error(
      `${label} would expose location data at: ${leaks.join(", ")}`,
    );
  }
}
