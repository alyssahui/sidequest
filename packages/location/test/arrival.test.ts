import { describe, expect, it } from "vitest";

import type {
  GpsRequirement,
  LocationSample,
} from "@sidequest/contracts/location";

import {
  arrivalProgress,
  evaluateArrival,
  explainArrival,
} from "../src/arrival";
import { destinationPoint } from "../src/geometry";
import { defaultLocationPolicy, withPolicy } from "../src/policy";

const now = Date.parse("2026-09-11T18:00:00.000Z");
const target = { latitude: 40.4494, longitude: -79.9497 };

const requirement: GpsRequirement = {
  type: "GPS",
  target,
  radiusMeters: 50,
  maxAccuracyMeters: 60,
};

function sampleAt(
  distanceFromTarget: number,
  overrides: Partial<LocationSample> = {},
): LocationSample {
  return {
    coordinates: destinationPoint(target, 45, distanceFromTarget),
    accuracyMeters: 10,
    recordedAt: new Date(now).toISOString(),
    source: "GPS",
    ...overrides,
  };
}

describe("evaluateArrival — distance boundary", () => {
  const strict = withPolicy({ arrival: { mode: "STRICT_DISTANCE" } });

  it("arrives exactly on the radius", () => {
    const result = evaluateArrival({
      sample: sampleAt(50, { accuracyMeters: 0 }),
      requirement,
      now,
      policy: strict.arrival,
    });

    expect(result.effectiveDistanceMeters).toBeCloseTo(50, 6);
    expect(result.arrived).toBe(true);
  });

  it("does not arrive one meter outside the radius", () => {
    const result = evaluateArrival({
      sample: sampleAt(51, { accuracyMeters: 0 }),
      requirement,
      now,
      policy: strict.arrival,
    });

    expect(result.arrived).toBe(false);
    expect(result.failedConditions).toEqual(["DISTANCE"]);
  });
});

describe("evaluateArrival — uncertainty adjustment", () => {
  const policy = defaultLocationPolicy.arrival;

  it("is the documented default", () => {
    expect(policy.mode).toBe("UNCERTAINTY_ADJUSTED");
  });

  it("counts a fix that could plausibly be inside the radius", () => {
    // 80m away, accurate to 40m: strict comparison says no, but the player may
    // well be standing inside the radius. This is the false negative the
    // adjustment exists to prevent.
    const sample = sampleAt(80, { accuracyMeters: 40 });

    const adjusted = evaluateArrival({ sample, requirement, now, policy });
    const strict = evaluateArrival({
      sample,
      requirement,
      now,
      policy: withPolicy({ arrival: { mode: "STRICT_DISTANCE" } }).arrival,
    });

    expect(adjusted.arrived).toBe(true);
    expect(adjusted.effectiveDistanceMeters).toBeCloseTo(40, 6);
    expect(strict.arrived).toBe(false);
  });

  it("still refuses a fix too imprecise to believe", () => {
    // Right on top of the target, but the accuracy exceeds the ceiling, so the
    // adjustment cannot rescue it.
    const result = evaluateArrival({
      sample: sampleAt(5, { accuracyMeters: 200 }),
      requirement,
      now,
      policy,
    });

    expect(result.arrived).toBe(false);
    expect(result.failedConditions).toContain("ACCURACY");
  });

  it("never reports a negative effective distance", () => {
    const result = evaluateArrival({
      sample: sampleAt(5, { accuracyMeters: 50 }),
      requirement,
      now,
      policy,
    });

    expect(result.effectiveDistanceMeters).toBe(0);
  });
});

describe("evaluateArrival — accuracy ceiling", () => {
  const policy = defaultLocationPolicy.arrival;

  it("takes the stricter of the requirement and the policy", () => {
    const lenientRequirement: GpsRequirement = {
      ...requirement,
      maxAccuracyMeters: 500,
    };

    const result = evaluateArrival({
      sample: sampleAt(10, { accuracyMeters: 100 }),
      requirement: lenientRequirement,
      now,
      policy,
    });

    // A quest author asking for 500m accuracy cannot loosen the system ceiling.
    expect(result.maxAccuracyMeters).toBe(policy.maxAccuracyMeters);
    expect(result.failedConditions).toContain("ACCURACY");
  });

  it("lets a requirement tighten the ceiling", () => {
    const tight: GpsRequirement = { ...requirement, maxAccuracyMeters: 8 };

    const result = evaluateArrival({
      sample: sampleAt(10, { accuracyMeters: 20 }),
      requirement: tight,
      now,
      policy,
    });

    expect(result.maxAccuracyMeters).toBe(8);
    expect(result.failedConditions).toContain("ACCURACY");
  });
});

describe("evaluateArrival — freshness", () => {
  const policy = defaultLocationPolicy.arrival;

  it("rejects a stale sample even when the player is standing on the target", () => {
    const result = evaluateArrival({
      sample: sampleAt(1, {
        recordedAt: new Date(now - policy.maxSampleAgeMs - 1).toISOString(),
      }),
      requirement,
      now,
      policy,
    });

    expect(result.arrived).toBe(false);
    expect(result.failedConditions).toEqual(["FRESHNESS"]);
  });

  it("accepts a sample exactly at the freshness limit", () => {
    const result = evaluateArrival({
      sample: sampleAt(1, {
        recordedAt: new Date(now - policy.maxSampleAgeMs).toISOString(),
      }),
      requirement,
      now,
      policy,
    });

    expect(result.arrived).toBe(true);
  });

  it("treats an unparseable timestamp as infinitely stale rather than fresh", () => {
    const result = evaluateArrival({
      sample: sampleAt(1, { recordedAt: "whenever" }),
      requirement,
      now,
      policy,
    });

    expect(result.arrived).toBe(false);
    expect(result.failedConditions).toContain("FRESHNESS");
  });

  it("reports every failing condition at once", () => {
    const result = evaluateArrival({
      sample: sampleAt(900, {
        accuracyMeters: 400,
        recordedAt: new Date(now - 60 * 60_000).toISOString(),
      }),
      requirement,
      now,
      policy,
    });

    expect(result.failedConditions).toEqual([
      "DISTANCE",
      "ACCURACY",
      "FRESHNESS",
    ]);
  });
});

describe("explainArrival", () => {
  const policy = defaultLocationPolicy.arrival;

  it("never includes coordinates", () => {
    const result = evaluateArrival({
      sample: sampleAt(300),
      requirement,
      now,
      policy,
    });
    const text = explainArrival(result);

    expect(text).not.toContain("40.4");
    expect(text).not.toContain("-79.9");
    expect(text).toMatch(/m to go/);
  });

  it("confirms a successful arrival", () => {
    const result = evaluateArrival({
      sample: sampleAt(10),
      requirement,
      now,
      policy,
    });

    expect(explainArrival(result)).toContain("Location verified");
  });
});

describe("arrivalProgress", () => {
  const policy = defaultLocationPolicy.arrival;

  it("reads 0 at the start and 1 on arrival", () => {
    const start = evaluateArrival({
      sample: sampleAt(830, { accuracyMeters: 0 }),
      requirement,
      now,
      policy,
    });
    const done = evaluateArrival({
      sample: sampleAt(10),
      requirement,
      now,
      policy,
    });

    expect(arrivalProgress(start, 830)).toBeCloseTo(0, 2);
    expect(arrivalProgress(done, 830)).toBe(1);
  });

  it("stays inside the unit interval when the player overshoots backwards", () => {
    const wandered = evaluateArrival({
      sample: sampleAt(2_000),
      requirement,
      now,
      policy,
    });

    expect(arrivalProgress(wandered, 830)).toBe(0);
  });
});
