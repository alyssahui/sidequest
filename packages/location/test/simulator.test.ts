import { describe, expect, it } from "vitest";

import type { GpsRequirement } from "@sidequest/contracts/location";

import { evaluateArrival } from "../src/arrival";
import { distanceMeters } from "../src/geometry";
import { defaultLocationPolicy } from "../src/policy";
import { checkPlausibleTravel, normalizeSample } from "../src/samples";
import {
  LocationSimulator,
  demoOrigin,
  demoQuestTarget,
  demoRoutes,
  findDemoRoute,
} from "../src/simulator";

const startedAt = Date.parse("2026-09-11T18:00:00.000Z");
const bakeryRoute = findDemoRoute("route-craig-street-bakery");

function simulator(routeId = "route-craig-street-bakery", seed = 1) {
  const route = findDemoRoute(routeId);
  if (!route) throw new Error(`Missing demo route ${routeId}`);
  return new LocationSimulator({ route, startedAt, seed });
}

describe("LocationSimulator determinism", () => {
  it("produces an identical trace on every run", () => {
    const first = simulator().trace(30_000, 20);
    const second = simulator().trace(30_000, 20);

    expect(first).toEqual(second);
  });

  it("is order-independent: seeking equals stepping", () => {
    const stepped = simulator();
    for (let index = 0; index < 10; index += 1) stepped.advance(30_000);

    const sought = simulator().seek(300_000);

    expect(stepped.current()).toEqual(sought);
  });

  it("varies accuracy with the seed but not the path", () => {
    const a = simulator("route-craig-street-bakery", 1).seek(120_000);
    const b = simulator("route-craig-street-bakery", 99).seek(120_000);

    expect(a.coordinates).toEqual(b.coordinates);
    expect(a.accuracyMeters).not.toBe(b.accuracyMeters);
  });

  it("marks every sample as simulated so it is never mistaken for a real fix", () => {
    for (const sample of simulator().trace(60_000, 10)) {
      expect(sample.source).toBe("SIMULATED");
    }
  });
});

describe("LocationSimulator movement", () => {
  it("starts at the route origin", () => {
    const sample = simulator().current();

    expect(distanceMeters(sample.coordinates, demoOrigin)).toBeCloseTo(0, 6);
    expect(sample.recordedAt).toBe("2026-09-11T18:00:00.000Z");
  });

  it("moves monotonically closer to the quest target", () => {
    const sim = simulator();
    let previous = Number.POSITIVE_INFINITY;

    for (let index = 0; index < 15; index += 1) {
      const sample = sim.advance(60_000);
      const remaining = distanceMeters(sample.coordinates, demoQuestTarget);
      expect(remaining).toBeLessThanOrEqual(previous);
      previous = remaining;
    }
  });

  it("stops at the final waypoint instead of overshooting", () => {
    const sim = simulator();
    const arrived = sim.seek(60 * 60_000);

    expect(distanceMeters(arrived.coordinates, demoQuestTarget)).toBeCloseTo(
      0,
      3,
    );
    expect(sim.progress).toBe(1);
    expect(sim.finished).toBe(true);
  });

  it("jumpToEnd lands on the target for the demo shortcut", () => {
    const sim = simulator();
    const sample = sim.jumpToEnd();

    expect(distanceMeters(sample.coordinates, demoQuestTarget)).toBeCloseTo(
      0,
      3,
    );
  });

  it("reports a progress fraction that climbs from 0 to 1", () => {
    const sim = simulator();

    expect(sim.progress).toBe(0);
    sim.seek((sim.totalMeters / 2 / (bakeryRoute?.speedMps ?? 1)) * 1000);
    expect(sim.progress).toBeCloseTo(0.5, 2);
  });

  it("walks a looping route back and forth without teleporting", () => {
    const sim = simulator("route-schenley-loop");
    const trace = sim.trace(30_000, 40);

    for (let index = 1; index < trace.length; index += 1) {
      const previous = trace[index - 1];
      const next = trace[index];
      if (!previous || !next) continue;
      // 30s at 1.6 m/s is ~48m; a wrap-around would show as a large jump.
      expect(
        distanceMeters(previous.coordinates, next.coordinates),
      ).toBeLessThan(100);
    }
  });

  it("resets back to the origin", () => {
    const sim = simulator();
    sim.advance(600_000);
    sim.reset();

    expect(distanceMeters(sim.current().coordinates, demoOrigin)).toBeCloseTo(
      0,
      6,
    );
  });

  it("rejects a route with no waypoints", () => {
    expect(
      () =>
        new LocationSimulator({
          route: {
            id: "empty",
            label: "Empty",
            waypoints: [],
            speedMps: 1,
            baseAccuracyMeters: 10,
            accuracyJitterMeters: 1,
          },
          startedAt,
        }),
    ).toThrow(/waypoint/);
  });
});

describe("simulated evidence is accepted end to end", () => {
  const policy = defaultLocationPolicy;
  const requirement: GpsRequirement = {
    type: "GPS",
    target: demoQuestTarget,
    radiusMeters: 40,
    maxAccuracyMeters: 50,
  };

  it("produces samples that survive validation and plausible-travel checks", () => {
    const sim = simulator();
    const trace = sim.trace(30_000, 25);

    for (let index = 0; index < trace.length; index += 1) {
      const sample = trace[index];
      if (!sample) continue;

      const normalized = normalizeSample(sample);
      expect(normalized.ok).toBe(true);

      const accuracyOk =
        sample.accuracyMeters <= policy.ingest.maxAccuracyMeters;
      expect(accuracyOk).toBe(true);

      const previous = trace[index - 1];
      if (!previous) continue;
      const travel = checkPlausibleTravel({
        previous,
        next: sample,
        policy: policy.ingest,
      });
      expect(travel.ok).toBe(true);
    }
  });

  it("walks the demo user into the quest radius and verifies arrival", () => {
    const sim = simulator();
    let arrivedAtMs: number | undefined;

    for (let elapsed = 0; elapsed <= 20 * 60_000; elapsed += 30_000) {
      const sample = sim.seek(elapsed);
      const evaluation = evaluateArrival({
        sample,
        requirement,
        now: startedAt + elapsed,
        policy: policy.arrival,
      });
      if (evaluation.arrived) {
        arrivedAtMs = elapsed;
        break;
      }
    }

    expect(arrivedAtMs).toBeDefined();
    // The walk is ~900m at 1.35 m/s, so arrival lands around the 11 minute mark.
    expect(arrivedAtMs).toBeLessThan(15 * 60_000);
  });

  it("does not report arrival before the player has walked there", () => {
    const evaluation = evaluateArrival({
      sample: simulator().current(),
      requirement,
      now: startedAt,
      policy: policy.arrival,
    });

    expect(evaluation.arrived).toBe(false);
    expect(evaluation.failedConditions).toEqual(["DISTANCE"]);
  });

  it("the weak-signal route demonstrates the accuracy failure state", () => {
    const sim = simulator("route-poor-signal");
    const sample = sim.seek(60_000);

    const evaluation = evaluateArrival({
      sample,
      requirement: {
        type: "GPS",
        target: sample.coordinates,
        radiusMeters: 40,
        maxAccuracyMeters: 50,
      },
      now: startedAt + 60_000,
      policy: policy.arrival,
    });

    // Standing on the target, but the fix is too vague to count as evidence.
    expect(evaluation.arrived).toBe(false);
    expect(evaluation.failedConditions).toEqual(["ACCURACY"]);
  });
});

describe("demo routes", () => {
  it("exposes a stable catalogue", () => {
    expect(demoRoutes.map((route) => route.id)).toEqual([
      "route-craig-street-bakery",
      "route-schenley-loop",
      "route-poor-signal",
    ]);
  });

  it("returns undefined for an unknown route", () => {
    expect(findDemoRoute("route-nowhere")).toBeUndefined();
  });
});
