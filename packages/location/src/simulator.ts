import type {
  Coordinates,
  LocationSample,
  LocationSource,
} from "@sidequest/contracts/location";

import { distanceMeters, interpolate } from "./geometry";

/**
 * A scripted walk. Waypoints are joined by great-circle segments and traversed
 * at a constant speed, so the position at any elapsed time is a pure function
 * of the route — no timers, no randomness, no network.
 */
export type SimulatedRoute = {
  id: string;
  label: string;
  waypoints: readonly Coordinates[];
  speedMps: number;
  baseAccuracyMeters: number;
  /** Peak deviation of the deterministic accuracy wobble. */
  accuracyJitterMeters: number;
  /** Stop at the final waypoint instead of looping back and forth. */
  loop?: boolean;
};

export type SimulatorOptions = {
  route: SimulatedRoute;
  /** Epoch milliseconds the walk begins at. */
  startedAt: number;
  source?: LocationSource;
  /** Changes the accuracy wobble without changing the path. */
  seed?: number;
};

/**
 * Deterministic pseudo-random in [0, 1) from an integer tick.
 *
 * A hash rather than a stateful PRNG so `sampleAt` stays pure: replaying the
 * same elapsed time always yields the same accuracy, which is what makes the
 * simulator usable as a test fixture and as a reproducible demo.
 */
function hashUnit(tick: number, seed: number): number {
  let value = (tick ^ seed) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b) >>> 0;
  value = (value ^ (value >>> 16)) >>> 0;
  return value / 0x1_0000_0000;
}

type RouteGeometry = {
  segments: readonly { from: Coordinates; to: Coordinates; length: number }[];
  totalMeters: number;
};

function buildGeometry(route: SimulatedRoute): RouteGeometry {
  const segments: { from: Coordinates; to: Coordinates; length: number }[] = [];
  let totalMeters = 0;

  for (let index = 0; index < route.waypoints.length - 1; index += 1) {
    const from = route.waypoints[index];
    const to = route.waypoints[index + 1];
    if (!from || !to) continue;
    const length = distanceMeters(from, to);
    segments.push({ from, to, length });
    totalMeters += length;
  }

  return { segments, totalMeters };
}

function positionAtDistance(
  geometry: RouteGeometry,
  fallback: Coordinates,
  meters: number,
): Coordinates {
  if (geometry.segments.length === 0) return { ...fallback };

  let remaining = meters;
  for (const segment of geometry.segments) {
    if (remaining <= segment.length || segment.length === 0) {
      const fraction = segment.length === 0 ? 0 : remaining / segment.length;
      return interpolate(segment.from, segment.to, fraction);
    }
    remaining -= segment.length;
  }

  const last = geometry.segments[geometry.segments.length - 1];
  return last ? { ...last.to } : { ...fallback };
}

/**
 * Drives a scripted position for emulators, CI, and the tokenless demo.
 *
 * The simulator is the reason the whole location stack can be exercised with no
 * device, no Mapbox token, and no database: it is a `LocationProvider` source
 * that produces the same trace on every run.
 */
export class LocationSimulator {
  readonly route: SimulatedRoute;

  readonly #geometry: RouteGeometry;
  readonly #startedAt: number;
  readonly #source: LocationSource;
  readonly #seed: number;
  #elapsedMs = 0;

  constructor({
    route,
    startedAt,
    source = "SIMULATED",
    seed = 1,
  }: SimulatorOptions) {
    if (route.waypoints.length === 0) {
      throw new Error("A simulated route needs at least one waypoint");
    }
    this.route = route;
    this.#geometry = buildGeometry(route);
    this.#startedAt = startedAt;
    this.#source = source;
    this.#seed = seed;
  }

  get elapsedMs(): number {
    return this.#elapsedMs;
  }

  get totalMeters(): number {
    return this.#geometry.totalMeters;
  }

  /** Distance covered so far, in [0, totalMeters]. */
  get travelledMeters(): number {
    return this.#travelledAt(this.#elapsedMs);
  }

  /** Fraction of the route completed, in [0, 1]. */
  get progress(): number {
    if (this.#geometry.totalMeters === 0) return 1;
    return Math.min(1, this.travelledMeters / this.#geometry.totalMeters);
  }

  get finished(): boolean {
    return !this.route.loop && this.progress >= 1;
  }

  #travelledAt(elapsedMs: number): number {
    const raw = (this.route.speedMps * Math.max(0, elapsedMs)) / 1000;
    const total = this.#geometry.totalMeters;
    if (total === 0) return 0;
    if (!this.route.loop) return Math.min(total, raw);

    // Loop mode walks the route forwards then backwards, so the demo can run
    // indefinitely without teleporting back to the start.
    const cycle = raw % (total * 2);
    return cycle <= total ? cycle : total * 2 - cycle;
  }

  /** Pure: the sample the walk would produce at `elapsedMs`. */
  sampleAt(elapsedMs: number): LocationSample {
    const travelled = this.#travelledAt(elapsedMs);
    const first = this.route.waypoints[0];
    if (!first)
      throw new Error("A simulated route needs at least one waypoint");
    const coordinates = positionAtDistance(this.#geometry, first, travelled);

    // Tick granularity of one second keeps the wobble stable across small
    // timestep changes while still varying over the walk.
    const tick = Math.floor(Math.max(0, elapsedMs) / 1000);
    const wobble = (hashUnit(tick, this.#seed) - 0.5) * 2;
    const accuracyMeters = Math.max(
      1,
      Number(
        (
          this.route.baseAccuracyMeters +
          wobble * this.route.accuracyJitterMeters
        ).toFixed(2),
      ),
    );

    return {
      coordinates,
      accuracyMeters,
      recordedAt: new Date(
        this.#startedAt + Math.max(0, elapsedMs),
      ).toISOString(),
      source: this.#source,
      speedMps: this.route.speedMps,
    };
  }

  /** Advances the walk and returns the new sample. */
  advance(deltaMs: number): LocationSample {
    this.#elapsedMs = Math.max(0, this.#elapsedMs + deltaMs);
    return this.sampleAt(this.#elapsedMs);
  }

  current(): LocationSample {
    return this.sampleAt(this.#elapsedMs);
  }

  seek(elapsedMs: number): LocationSample {
    this.#elapsedMs = Math.max(0, elapsedMs);
    return this.current();
  }

  reset(): void {
    this.#elapsedMs = 0;
  }

  /** Jumps to the end of the route — the demo's "I'm already there" button. */
  jumpToEnd(): LocationSample {
    if (this.#geometry.totalMeters === 0 || this.route.speedMps <= 0) {
      return this.current();
    }
    return this.seek((this.#geometry.totalMeters / this.route.speedMps) * 1000);
  }

  /** Every sample the walk produces at a fixed cadence, for tests. */
  trace(stepMs: number, steps: number): LocationSample[] {
    return Array.from({ length: steps }, (_unused, index) =>
      this.sampleAt(index * stepMs),
    );
  }
}

/* ------------------------------------------------------------------ */
/* Curated demo routes                                                 */
/* ------------------------------------------------------------------ */

/** Where the demo player starts: the CMU Cut. */
export const demoOrigin: Coordinates = {
  latitude: 40.4433,
  longitude: -79.9436,
};

/** The demo GPS quest target: a bakery on Craig Street. */
export const demoQuestTarget: Coordinates = {
  latitude: 40.4494,
  longitude: -79.9497,
};

export const demoRoutes: readonly SimulatedRoute[] = [
  {
    id: "route-craig-street-bakery",
    label: "Walk to the Craig Street bakery",
    waypoints: [
      demoOrigin,
      { latitude: 40.4448, longitude: -79.9452 },
      { latitude: 40.4471, longitude: -79.9471 },
      demoQuestTarget,
    ],
    // A brisk campus walk. ~900m of route arrives in a little under 12 minutes.
    speedMps: 1.35,
    baseAccuracyMeters: 12,
    accuracyJitterMeters: 6,
  },
  {
    id: "route-schenley-loop",
    label: "Loop through Schenley Park",
    waypoints: [
      demoOrigin,
      { latitude: 40.4405, longitude: -79.9425 },
      { latitude: 40.4381, longitude: -79.9436 },
      { latitude: 40.4392, longitude: -79.9478 },
    ],
    speedMps: 1.6,
    baseAccuracyMeters: 18,
    accuracyJitterMeters: 10,
    loop: true,
  },
  {
    id: "route-poor-signal",
    label: "Indoors with a weak fix",
    waypoints: [demoOrigin, { latitude: 40.4435, longitude: -79.9439 }],
    speedMps: 0.4,
    // Deliberately above the arrival accuracy ceiling so the "signal too weak"
    // state can be demonstrated on demand.
    baseAccuracyMeters: 120,
    accuracyJitterMeters: 40,
    loop: true,
  },
];

export function findDemoRoute(routeId: string): SimulatedRoute | undefined {
  return demoRoutes.find((route) => route.id === routeId);
}
