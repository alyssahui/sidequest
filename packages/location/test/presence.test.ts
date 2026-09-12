import { describe, expect, it } from "vitest";

import type {
  LocationSample,
  PartyPresenceChangedPayload,
} from "@sidequest/contracts/location";

import { createGridAreaResolver, gridCellId } from "../src/area";
import { destinationPoint } from "../src/geometry";
import {
  assertPolicyInvariants,
  defaultLocationPolicy,
  withPolicy,
} from "../src/policy";
import {
  derivePartyPresence,
  freshnessFor,
  initialPresenceState,
  reducePresence,
  type MemberObservation,
  type PresenceState,
} from "../src/presence";
import { findCoordinateLeaks } from "../src/redaction";

const policy = defaultLocationPolicy.presence;
const now = Date.parse("2026-09-11T18:00:00.000Z");
const origin = { latitude: 40.4433, longitude: -79.9436 };
const areaResolver = createGridAreaResolver({
  gridMeters: policy.areaGridMeters,
});

function observation(
  userId: string,
  metersFromOrigin: number,
  overrides: Partial<LocationSample> & { sharing?: boolean } = {},
): MemberObservation {
  const { sharing, ...sampleOverrides } = overrides;
  return {
    userId,
    ...(sharing === undefined ? {} : { sharing }),
    sample: {
      coordinates: destinationPoint(origin, 90, metersFromOrigin),
      accuracyMeters: 10,
      recordedAt: new Date(now).toISOString(),
      source: "GPS",
      ...sampleOverrides,
    },
  };
}

describe("derivePartyPresence — privacy", () => {
  it("returns no coordinates anywhere in the snapshot", () => {
    const snapshot = derivePartyPresence({
      partyId: "party-demo",
      selfUserId: "user-zuri",
      observations: [
        observation("user-zuri", 0),
        observation("user-alyssa", 40),
        observation("user-ben", 5_000),
      ],
      now,
      policy,
      areaResolver,
    });

    expect(findCoordinateLeaks(snapshot)).toEqual([]);
  });

  it("reports age in whole minutes rather than exact timing", () => {
    const snapshot = derivePartyPresence({
      partyId: "party-demo",
      selfUserId: "user-zuri",
      observations: [
        observation("user-zuri", 0),
        observation("user-alyssa", 40, {
          recordedAt: new Date(now - 95_000).toISOString(),
        }),
      ],
      now,
      policy,
      areaResolver,
    });

    const alyssa = snapshot.members.find((m) => m.userId === "user-alyssa");
    expect(alyssa?.ageMinutes).toBe(1);
  });
});

describe("derivePartyPresence — clustering", () => {
  it("marks a close member nearby and a distant one not", () => {
    const snapshot = derivePartyPresence({
      partyId: "party-demo",
      selfUserId: "user-zuri",
      observations: [
        observation("user-zuri", 0),
        observation("user-alyssa", 40),
        observation("user-ben", 5_000),
      ],
      now,
      policy,
      areaResolver,
    });

    expect(snapshot.nearbyUserIds).toEqual(["user-alyssa"]);
    expect(snapshot.nearbyCount).toBe(1);
  });

  it("never counts the viewer as nearby themselves", () => {
    const snapshot = derivePartyPresence({
      partyId: "party-demo",
      selfUserId: "user-zuri",
      observations: [observation("user-zuri", 0)],
      now,
      policy,
      areaResolver,
    });

    expect(snapshot.nearbyUserIds).toEqual([]);
    expect(snapshot.members[0]?.nearSelf).toBe(false);
  });

  it("excludes a member who paused sharing entirely", () => {
    const snapshot = derivePartyPresence({
      partyId: "party-demo",
      selfUserId: "user-zuri",
      observations: [
        observation("user-zuri", 0),
        observation("user-alyssa", 40, { sharing: false }),
      ],
      now,
      policy,
      areaResolver,
    });

    expect(snapshot.members.map((m) => m.userId)).toEqual(["user-zuri"]);
  });

  it("drops observations older than the presence window", () => {
    const snapshot = derivePartyPresence({
      partyId: "party-demo",
      selfUserId: "user-zuri",
      observations: [
        observation("user-zuri", 0),
        observation("user-alyssa", 40, {
          recordedAt: new Date(now - policy.maxPresenceAgeMs - 1).toISOString(),
        }),
      ],
      now,
      policy,
      areaResolver,
    });

    expect(snapshot.members.map((m) => m.userId)).toEqual(["user-zuri"]);
  });

  it("reports nobody as nearby when the viewer's own fix is stale", () => {
    const snapshot = derivePartyPresence({
      partyId: "party-demo",
      selfUserId: "user-zuri",
      observations: [
        observation("user-zuri", 0, {
          recordedAt: new Date(now - policy.maxPresenceAgeMs - 1).toISOString(),
        }),
        observation("user-alyssa", 40),
      ],
      now,
      policy,
      areaResolver,
    });

    expect(snapshot.nearbyUserIds).toEqual([]);
  });

  it("returns a shared label only when the cluster agrees on an area", () => {
    const together = derivePartyPresence({
      partyId: "party-demo",
      selfUserId: "user-zuri",
      observations: [
        observation("user-zuri", 0),
        observation("user-alyssa", 30),
      ],
      now,
      policy,
      areaResolver,
    });

    expect(together.clusterAreaLabel).toBe("on CMU campus");
  });
});

describe("derivePartyPresence — hysteresis", () => {
  const between = (policy.enterRadiusMeters + policy.exitRadiusMeters) / 2;

  it("does not admit a member sitting inside the hysteresis band", () => {
    const snapshot = derivePartyPresence({
      partyId: "party-demo",
      selfUserId: "user-zuri",
      observations: [
        observation("user-zuri", 0, { accuracyMeters: 0 }),
        observation("user-alyssa", between, { accuracyMeters: 0 }),
      ],
      now,
      policy,
      areaResolver,
      previouslyNearbyUserIds: [],
    });

    expect(snapshot.nearbyUserIds).toEqual([]);
  });

  it("keeps an already-nearby member in the band", () => {
    const snapshot = derivePartyPresence({
      partyId: "party-demo",
      selfUserId: "user-zuri",
      observations: [
        observation("user-zuri", 0, { accuracyMeters: 0 }),
        observation("user-alyssa", between, { accuracyMeters: 0 }),
      ],
      now,
      policy,
      areaResolver,
      previouslyNearbyUserIds: ["user-alyssa"],
    });

    expect(snapshot.nearbyUserIds).toEqual(["user-alyssa"]);
  });

  it("finally drops a member past the exit radius", () => {
    const snapshot = derivePartyPresence({
      partyId: "party-demo",
      selfUserId: "user-zuri",
      observations: [
        observation("user-zuri", 0, { accuracyMeters: 0 }),
        observation("user-alyssa", policy.exitRadiusMeters + 50, {
          accuracyMeters: 0,
        }),
      ],
      now,
      policy,
      areaResolver,
      previouslyNearbyUserIds: ["user-alyssa"],
    });

    expect(snapshot.nearbyUserIds).toEqual([]);
  });

  it("does not let two imprecise fixes fake togetherness without limit", () => {
    // Both fixes accurate to 500m. If accuracy were subtracted unbounded, a
    // member a kilometre away would read as nearby.
    const snapshot = derivePartyPresence({
      partyId: "party-demo",
      selfUserId: "user-zuri",
      observations: [
        observation("user-zuri", 0, { accuracyMeters: 500 }),
        observation("user-alyssa", 1_000, { accuracyMeters: 500 }),
      ],
      now,
      policy,
      areaResolver,
    });

    expect(snapshot.nearbyUserIds).toEqual([]);
  });
});

describe("reducePresence — debounce", () => {
  const debouncePolicy = { debounceMs: policy.debounceMs };

  function step(
    state: PresenceState,
    candidateUserIds: string[],
    atMs: number,
  ) {
    return reducePresence(state, {
      partyId: "party-demo",
      candidateUserIds,
      now: now + atMs,
      policy: debouncePolicy,
    });
  }

  it("publishes nothing until the candidate set has held long enough", () => {
    const first = step(initialPresenceState, ["user-alyssa"], 0);
    expect(first.change).toBeUndefined();

    const tooSoon = step(first.state, ["user-alyssa"], policy.debounceMs - 1);
    expect(tooSoon.change).toBeUndefined();

    const settled = step(tooSoon.state, ["user-alyssa"], policy.debounceMs);
    expect(settled.change?.nearbyUserIds).toEqual(["user-alyssa"]);
    expect(settled.change?.joinedUserIds).toEqual(["user-alyssa"]);
    expect(settled.change?.departedUserIds).toEqual([]);
  });

  it("emits nothing at all when a member flickers in and back out", () => {
    let state = initialPresenceState;
    const events: PartyPresenceChangedPayload[] = [];

    // Alyssa appears, vanishes, and reappears, all inside one debounce window.
    for (const [atMs, candidate] of [
      [0, ["user-alyssa"]],
      [5_000, []],
      [10_000, ["user-alyssa"]],
      [15_000, []],
      [20_000, ["user-alyssa"]],
      [25_000, []],
    ] as const) {
      const transition = step(state, [...candidate], atMs);
      state = transition.state;
      if (transition.change) events.push(transition.change);
    }

    expect(events).toEqual([]);
    expect(state.publishedUserIds).toEqual([]);
  });

  it("reports joins and departures against the last published set", () => {
    let state = initialPresenceState;
    state = step(state, ["user-alyssa"], 0).state;
    const published = step(state, ["user-alyssa"], policy.debounceMs);
    state = published.state;

    state = step(
      state,
      ["user-alyssa", "user-ben"],
      policy.debounceMs + 1,
    ).state;
    const second = step(
      state,
      ["user-alyssa", "user-ben"],
      policy.debounceMs * 2 + 2,
    );

    expect(second.change?.joinedUserIds).toEqual(["user-ben"]);
    expect(second.change?.departedUserIds).toEqual([]);

    state = second.state;
    state = step(state, [], policy.debounceMs * 3).state;
    const third = step(state, [], policy.debounceMs * 4 + 1);

    expect(third.change?.departedUserIds).toEqual(["user-alyssa", "user-ben"]);
    expect(third.change?.nearbyCount).toBe(0);
  });

  it("restarts the window when the candidate set changes mid-wait", () => {
    let state = initialPresenceState;
    state = step(state, ["user-alyssa"], 0).state;
    state = step(
      state,
      ["user-alyssa", "user-ben"],
      policy.debounceMs - 1,
    ).state;

    // The original window has elapsed, but the set changed, so nothing fires.
    const atOldDeadline = step(
      state,
      ["user-alyssa", "user-ben"],
      policy.debounceMs,
    );
    expect(atOldDeadline.change).toBeUndefined();

    const atNewDeadline = step(
      atOldDeadline.state,
      ["user-alyssa", "user-ben"],
      policy.debounceMs * 2,
    );
    expect(atNewDeadline.change?.nearbyUserIds).toEqual([
      "user-alyssa",
      "user-ben",
    ]);
  });

  it("ignores the order the candidates arrive in", () => {
    let state = initialPresenceState;
    state = step(state, ["user-ben", "user-alyssa"], 0).state;
    const settled = step(state, ["user-alyssa", "user-ben"], policy.debounceMs);

    expect(settled.change?.nearbyUserIds).toEqual(["user-alyssa", "user-ben"]);
  });

  it("emits a payload free of coordinates", () => {
    let state = initialPresenceState;
    state = step(state, ["user-alyssa"], 0).state;
    const settled = step(state, ["user-alyssa"], policy.debounceMs);

    expect(findCoordinateLeaks(settled.change)).toEqual([]);
  });
});

describe("freshnessFor", () => {
  it.each([
    [0, "LIVE"],
    [policy.freshnessBucketsMs.LIVE, "LIVE"],
    [policy.freshnessBucketsMs.LIVE + 1, "RECENT"],
    [policy.freshnessBucketsMs.RECENT + 1, "STALE"],
    [policy.freshnessBucketsMs.STALE + 1, "OFFLINE"],
  ])("buckets an age of %sms as %s", (ageMs, expected) => {
    expect(freshnessFor(ageMs, policy)).toBe(expected);
  });
});

describe("gridCellId", () => {
  it("gives nearby points the same cell and distant points different cells", () => {
    const nearby = destinationPoint(origin, 90, 20);
    const faraway = destinationPoint(origin, 90, 20_000);

    expect(gridCellId(nearby, 600)).toBe(gridCellId(origin, 600));
    expect(gridCellId(faraway, 600)).not.toBe(gridCellId(origin, 600));
  });

  it("produces an id that carries no readable coordinate", () => {
    const id = gridCellId(origin, 600);

    expect(id).not.toContain("40.44");
    expect(id).not.toContain("-79.94");
  });
});

describe("createGridAreaResolver", () => {
  it("prefers the nearest named area", () => {
    expect(areaResolver.resolve(origin).label).toBe("on CMU campus");
  });

  it("falls back to an anonymous cell outside every named area", () => {
    const resolved = areaResolver.resolve({ latitude: 0, longitude: 0 });

    expect(resolved.id.startsWith("cell:")).toBe(true);
    expect(resolved.label).toBe("somewhere out in the world");
  });

  it("honours a custom named-area list", () => {
    const custom = createGridAreaResolver({
      gridMeters: 600,
      namedAreas: [
        {
          id: "area-test",
          label: "at the test site",
          center: origin,
          radiusMeters: 100,
        },
      ],
    });

    expect(custom.resolve(origin).label).toBe("at the test site");
  });
});

describe("policy invariants", () => {
  it("keeps the exit radius wider than the enter radius by default", () => {
    expect(policy.exitRadiusMeters).toBeGreaterThan(policy.enterRadiusMeters);
    expect(() => assertPolicyInvariants(defaultLocationPolicy)).not.toThrow();
  });

  it("refuses a presence policy with no hysteresis band", () => {
    const inverted = withPolicy({
      presence: { enterRadiusMeters: 300, exitRadiusMeters: 100 },
    });

    expect(() => assertPolicyInvariants(inverted)).toThrow(/hysteresis/);
  });

  it("refuses an arrival ceiling looser than the ingest ceiling", () => {
    const impossible = withPolicy({ arrival: { maxAccuracyMeters: 10_000 } });

    expect(() => assertPolicyInvariants(impossible)).toThrow(/never be stored/);
  });

  it("refuses a retention window shorter than the accepted sample age", () => {
    const tooShort = withPolicy({ retention: { rawSampleTtlMs: 1_000 } });

    expect(() => assertPolicyInvariants(tooShort)).toThrow(/outlive/);
  });
});
