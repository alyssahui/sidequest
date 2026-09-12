import { describe, expect, it } from "vitest";

import type { LocationSample } from "@sidequest/contracts/location";

import { defaultLocationPolicy, withPolicy } from "../src/policy";
import {
  checkAccuracy,
  checkFreshness,
  checkPlausibleTravel,
  normalizeSample,
  parseInstant,
} from "../src/samples";

const policy = defaultLocationPolicy;
const now = Date.parse("2026-09-11T18:00:00.000Z");

/** Raw payload shape, so invalid inputs can be expressed without casts. */
function sample(overrides: Record<string, unknown> = {}) {
  return {
    coordinates: { latitude: 40.4433, longitude: -79.9436 },
    accuracyMeters: 12,
    recordedAt: "2026-09-11T18:00:00.000Z",
    source: "GPS",
    ...overrides,
  };
}

/** Already-normalized sample, for the checks that run after validation. */
function validSample(overrides: Partial<LocationSample> = {}): LocationSample {
  return {
    coordinates: { latitude: 40.4433, longitude: -79.9436 },
    accuracyMeters: 12,
    recordedAt: "2026-09-11T18:00:00.000Z",
    source: "GPS",
    ...overrides,
  };
}

describe("normalizeSample", () => {
  it("accepts a well-formed sample and keeps coordinate order", () => {
    const result = normalizeSample(sample());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.coordinates).toEqual({
      latitude: 40.4433,
      longitude: -79.9436,
    });
    expect(result.value.source).toBe("GPS");
  });

  it("canonicalizes a non-UTC timestamp to UTC", () => {
    const result = normalizeSample(
      sample({ recordedAt: "2026-09-11T14:00:00.000-04:00" }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.recordedAt).toBe("2026-09-11T18:00:00.000Z");
  });

  it("rejects a reversed coordinate pair that is out of range", () => {
    const result = normalizeSample(
      sample({ coordinates: { latitude: 139.69, longitude: 35.68 } }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection.code).toBe("COORDINATES_LOOK_SWAPPED");
    expect(result.rejection.retryable).toBe(false);
  });

  it.each([
    ["missing coordinates", { coordinates: undefined }, "INVALID_COORDINATES"],
    [
      "non-numeric latitude",
      { coordinates: { latitude: "40.44", longitude: -79.94 } },
      "INVALID_COORDINATES",
    ],
    [
      "out-of-range longitude",
      { coordinates: { latitude: 40.44, longitude: 200 } },
      "INVALID_COORDINATES",
    ],
    ["negative accuracy", { accuracyMeters: -1 }, "INVALID_ACCURACY"],
    ["NaN accuracy", { accuracyMeters: Number.NaN }, "INVALID_ACCURACY"],
    ["unparseable timestamp", { recordedAt: "yesterday" }, "INVALID_TIMESTAMP"],
    ["unknown source", { source: "PSYCHIC" }, "INVALID_COORDINATES"],
  ])("rejects %s", (_label, overrides, code) => {
    const result = normalizeSample(sample(overrides));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection.code).toBe(code);
  });

  it("rejects a non-object payload", () => {
    expect(normalizeSample(null).ok).toBe(false);
    expect(normalizeSample("40.44,-79.94").ok).toBe(false);
  });

  it("carries optional session and quest ids through", () => {
    const result = normalizeSample(
      sample({ sessionId: "session-1", questInstanceId: "quest-1" }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sessionId).toBe("session-1");
    expect(result.value.questInstanceId).toBe("quest-1");
  });

  it("drops unknown fields rather than persisting them", () => {
    const result = normalizeSample(
      sample({ deviceSerial: "abc-123", batteryLevel: 0.4 }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).not.toHaveProperty("deviceSerial");
    expect(result.value).not.toHaveProperty("batteryLevel");
  });
});

describe("checkFreshness", () => {
  it("accepts a sample recorded now", () => {
    const result = checkFreshness({
      sample: validSample(),
      now,
      policy: policy.ingest,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(0);
  });

  it("accepts a sample exactly at the age limit and rejects one past it", () => {
    const atLimit = validSample({
      recordedAt: new Date(now - policy.ingest.maxSampleAgeMs).toISOString(),
    });
    const pastLimit = validSample({
      recordedAt: new Date(
        now - policy.ingest.maxSampleAgeMs - 1,
      ).toISOString(),
    });

    expect(
      checkFreshness({ sample: atLimit, now, policy: policy.ingest }).ok,
    ).toBe(true);

    const rejected = checkFreshness({
      sample: pastLimit,
      now,
      policy: policy.ingest,
    });
    expect(rejected.ok).toBe(false);
    if (rejected.ok) return;
    expect(rejected.rejection.code).toBe("SAMPLE_STALE");
    expect(rejected.rejection.retryable).toBe(true);
  });

  it("tolerates small clock skew but rejects a far-future sample", () => {
    const slightlyAhead = validSample({
      recordedAt: new Date(now + 10_000).toISOString(),
    });
    const farAhead = validSample({
      recordedAt: new Date(now + 10 * 60_000).toISOString(),
    });

    const tolerated = checkFreshness({
      sample: slightlyAhead,
      now,
      policy: policy.ingest,
    });
    expect(tolerated.ok).toBe(true);
    if (!tolerated.ok) return;
    // Age never goes negative, so downstream arithmetic stays sane.
    expect(tolerated.value).toBe(0);

    const rejected = checkFreshness({
      sample: farAhead,
      now,
      policy: policy.ingest,
    });
    expect(rejected.ok).toBe(false);
    if (rejected.ok) return;
    expect(rejected.rejection.code).toBe("SAMPLE_IN_FUTURE");
  });
});

describe("checkAccuracy", () => {
  it("accepts exactly at the ceiling and rejects one meter past it", () => {
    const ceiling = policy.ingest.maxAccuracyMeters;

    expect(
      checkAccuracy(validSample({ accuracyMeters: ceiling }), ceiling).ok,
    ).toBe(true);

    const rejected = checkAccuracy(
      validSample({ accuracyMeters: ceiling + 1 }),
      ceiling,
    );
    expect(rejected.ok).toBe(false);
    if (rejected.ok) return;
    expect(rejected.rejection.code).toBe("ACCURACY_TOO_LOW");
    expect(rejected.rejection.retryable).toBe(true);
  });
});

describe("checkPlausibleTravel", () => {
  const travelPolicy = policy.ingest;

  function at(
    seconds: number,
    latitude: number,
    accuracyMeters = 10,
  ): LocationSample {
    return validSample({
      coordinates: { latitude, longitude: -79.9436 },
      accuracyMeters,
      recordedAt: new Date(now + seconds * 1000).toISOString(),
    });
  }

  it("accepts a normal walking pace", () => {
    // ~111m of latitude in 100s is about 1.1 m/s.
    const result = checkPlausibleTravel({
      previous: at(0, 40.4433),
      next: at(100, 40.4443),
      policy: travelPolicy,
    });

    expect(result.ok).toBe(true);
  });

  it("rejects a teleport", () => {
    const result = checkPlausibleTravel({
      previous: at(0, 40.4433),
      next: at(10, 41.4433),
      policy: travelPolicy,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection.code).toBe("IMPLAUSIBLE_TRAVEL");
    expect(result.rejection.retryable).toBe(true);
  });

  it("does not count accuracy noise as travel", () => {
    // Two stationary fixes, each accurate to 80m, reported 120m apart.
    const result = checkPlausibleTravel({
      previous: at(0, 40.4433, 80),
      next: at(1, 40.44438, 80),
      policy: travelPolicy,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.distanceMeters).toBeGreaterThan(100);
    expect(result.value.unexplainedMeters).toBe(0);
    expect(result.value.impliedSpeedMps).toBe(0);
  });

  it("rejects samples that go backwards in time", () => {
    const result = checkPlausibleTravel({
      previous: at(100, 40.4433),
      next: at(0, 40.4434),
      policy: travelPolicy,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection.code).toBe("NON_MONOTONIC_SAMPLE");
    expect(result.rejection.retryable).toBe(false);
  });

  it("allows two identical instants only when the move is explainable", () => {
    const stationary = checkPlausibleTravel({
      previous: at(0, 40.4433, 30),
      next: at(0, 40.44335, 30),
      policy: travelPolicy,
    });
    expect(stationary.ok).toBe(true);

    const impossible = checkPlausibleTravel({
      previous: at(0, 40.4433, 5),
      next: at(0, 40.4533, 5),
      policy: travelPolicy,
    });
    expect(impossible.ok).toBe(false);
    if (impossible.ok) return;
    expect(impossible.rejection.code).toBe("IMPLAUSIBLE_TRAVEL");
  });

  it("honours a tightened speed ceiling", () => {
    const strict = withPolicy({ ingest: { maxPlausibleSpeedMps: 2 } });

    // ~1100m in 100 seconds is 11 m/s: fine by default, too fast at 2 m/s.
    const input = {
      previous: at(0, 40.4433),
      next: at(100, 40.4533),
    };

    expect(checkPlausibleTravel({ ...input, policy: policy.ingest }).ok).toBe(
      true,
    );
    expect(checkPlausibleTravel({ ...input, policy: strict.ingest }).ok).toBe(
      false,
    );
  });
});

describe("parseInstant", () => {
  it("returns NaN for anything unparseable", () => {
    expect(Number.isNaN(parseInstant(""))).toBe(true);
    expect(Number.isNaN(parseInstant("not a date"))).toBe(true);
    expect(Number.isNaN(parseInstant(undefined))).toBe(true);
    expect(Number.isNaN(parseInstant(1_757_620_800_000))).toBe(true);
  });
});
