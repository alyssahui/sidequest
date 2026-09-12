import { afterEach, describe, expect, it, vi } from "vitest";

import type { LocationSample } from "@sidequest/contracts/location";
import {
  demoOrigin,
  demoQuestTarget,
  destinationPoint,
  distanceMeters,
  evaluateArrival,
  defaultLocationPolicy,
} from "@sidequest/location";

import { LocationApi, LocationApiError } from "../src/features/location/api";
import {
  canUseMapbox,
  readLocationConfig,
} from "../src/features/location/config";
import { buildDemoQuestMarkers } from "../src/features/location/demoQuests";
import {
  formatDistance,
  formatTimeRemaining,
  markerKinds,
  markerStyleFor,
} from "../src/features/location/map/markerRegistry";
import {
  clampToEdge,
  fitViewport,
  isOnScreen,
  project,
} from "../src/features/location/map/projection";
import { shouldUseFallbackMap } from "../src/features/location/map/fallbackPolicy";
import { chooseProvider } from "../src/features/location/providers";
import { BrowserLocationProvider } from "../src/features/location/providers/browserLocationProvider";
import { createSimulatedProvider } from "../src/features/location/providers/simulatedLocationProvider";

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

describe("readLocationConfig", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("works with no environment at all", () => {
    delete process.env.EXPO_PUBLIC_API_URL;
    delete process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
    delete process.env.EXPO_PUBLIC_LOCATION_PROVIDER;

    const config = readLocationConfig();

    expect(config.apiUrl).toBe("http://localhost:3000");
    expect(config.mapboxToken).toBeNull();
    expect(canUseMapbox(config)).toBe(false);
    expect(config.simulatedRouteId).toBe("route-craig-street-bakery");
  });

  it("treats an empty token as absent", () => {
    process.env.EXPO_PUBLIC_MAPBOX_TOKEN = "";
    expect(canUseMapbox(readLocationConfig())).toBe(false);
  });

  it("enables Mapbox only when a token is present", () => {
    process.env.EXPO_PUBLIC_MAPBOX_TOKEN = "pk.demo";
    expect(canUseMapbox(readLocationConfig())).toBe(true);
  });

  it("honours an explicit simulator request", () => {
    process.env.EXPO_PUBLIC_LOCATION_PROVIDER = "simulated";
    expect(readLocationConfig().providerKind).toBe("SIMULATED");
  });
});

describe("chooseProvider", () => {
  it("uses the real provider when the native module is there", () => {
    expect(chooseProvider({ providerKind: "EXPO" }, true)).toEqual({
      kind: "EXPO",
      reason: "CONFIGURED_EXPO",
    });
  });

  it("keeps the browser permission probe separate from the click-triggered request", () => {
    expect(chooseProvider({ providerKind: "BROWSER" }, true)).toEqual({
      kind: "BROWSER",
      reason: "CONFIGURED_BROWSER",
    });
  });

  it("does not request browser location while checking a prompt permission", async () => {
    const getCurrentPosition = vi.fn();
    vi.stubGlobal("window", { isSecureContext: true });
    vi.stubGlobal("navigator", {
      geolocation: { getCurrentPosition },
      permissions: { query: vi.fn().mockResolvedValue({ state: "prompt" }) },
    });
    const provider = new BrowserLocationProvider();
    await expect(provider.getAvailability()).resolves.toMatchObject({
      permission: "NOT_REQUESTED",
    });
    expect(getCurrentPosition).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("falls back to the simulator rather than failing", () => {
    expect(chooseProvider({ providerKind: "EXPO" }, false)).toEqual({
      kind: "SIMULATED",
      reason: "NATIVE_MODULE_MISSING",
    });
  });

  it("respects an explicit simulator choice even on a real device", () => {
    expect(chooseProvider({ providerKind: "SIMULATED" }, true).kind).toBe(
      "SIMULATED",
    );
  });
});

describe("web map fallback policy", () => {
  it("falls back when a tile/CSP error happens before MapLibre loads", () => {
    expect(
      shouldUseFallbackMap({
        loaded: false,
        errorCount: 1,
        tileUrl: "https://tiles.example/{z}/{x}/{y}.png",
      }),
    ).toBe(true);
  });

  it("rejects a missing or malformed tile template before rendering a blank map", () => {
    expect(
      shouldUseFallbackMap({ loaded: false, errorCount: 0, tileUrl: "" }),
    ).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Simulated provider                                                  */
/* ------------------------------------------------------------------ */

describe("SimulatedLocationProvider", () => {
  it("reports a usable foreground permission by default", async () => {
    const provider = createSimulatedProvider("route-craig-street-bakery");
    const availability = await provider.getAvailability();

    expect(availability.permission).toBe("FOREGROUND");
    expect(availability.service.servicesEnabled).toBe(true);
  });

  it("can be forced into any permission state for demo purposes", async () => {
    const provider = createSimulatedProvider("route-craig-street-bakery");

    provider.setPermission("DENIED");
    expect((await provider.getAvailability()).permission).toBe("DENIED");
    // A denied state stays denied: requesting again must not silently grant it.
    expect(await provider.requestPermission("FOREGROUND")).toBe("DENIED");

    provider.setServicesEnabled(false);
    expect((await provider.getAvailability()).service.servicesEnabled).toBe(
      false,
    );
  });

  it("upgrades to background when asked", async () => {
    const provider = createSimulatedProvider("route-craig-street-bakery");
    expect(await provider.requestPermission("BACKGROUND")).toBe("BACKGROUND");
  });

  it("throws for an unknown route rather than walking nowhere", () => {
    expect(() => createSimulatedProvider("route-atlantis")).toThrow(
      /Unknown demo route/,
    );
  });

  it("emits a first sample immediately so the map is never blank", async () => {
    vi.useFakeTimers();
    try {
      const provider = createSimulatedProvider("route-craig-street-bakery", {
        tickMs: 1_000,
      });
      const samples: LocationSample[] = [];

      await provider.watch(
        {
          sessionId: "session-1",
          mode: "FOREGROUND",
          intervalMs: 1_000,
          distanceIntervalMeters: 5,
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
        },
        (event) => {
          if (event.type === "SAMPLE") samples.push(event.sample);
        },
      );

      expect(samples).toHaveLength(1);
      expect(distanceMeters(samples[0]!.coordinates, demoOrigin)).toBeCloseTo(
        0,
        3,
      );
      expect(samples[0]!.sessionId).toBe("session-1");
    } finally {
      vi.useRealTimers();
    }
  });

  it("walks toward the quest target on each tick", async () => {
    vi.useFakeTimers();
    try {
      const provider = createSimulatedProvider("route-craig-street-bakery", {
        tickMs: 100,
        secondsPerTick: 60,
      });
      const samples: LocationSample[] = [];

      await provider.watch(
        {
          sessionId: "session-1",
          mode: "FOREGROUND",
          intervalMs: 100,
          distanceIntervalMeters: 5,
          questInstanceId: "quest-1",
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        },
        (event) => {
          if (event.type === "SAMPLE") samples.push(event.sample);
        },
      );

      await vi.advanceTimersByTimeAsync(500);

      expect(samples.length).toBeGreaterThan(3);
      const first = samples[0]!;
      const last = samples[samples.length - 1]!;
      expect(distanceMeters(last.coordinates, demoQuestTarget)).toBeLessThan(
        distanceMeters(first.coordinates, demoQuestTarget),
      );
      expect(last.questInstanceId).toBe("quest-1");
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops itself at the session expiry without being asked", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-11T18:00:00.000Z"));
    try {
      const provider = createSimulatedProvider("route-craig-street-bakery", {
        tickMs: 100,
      });
      let stoppedReason: string | null = null;

      await provider.watch(
        {
          sessionId: "session-1",
          mode: "FOREGROUND",
          intervalMs: 100,
          distanceIntervalMeters: 5,
          // Expires almost immediately.
          expiresAt: new Date(Date.now() + 250).toISOString(),
        },
        (event) => {
          if (event.type === "STOPPED") stoppedReason = event.reason;
        },
      );

      await vi.advanceTimersByTimeAsync(1_000);

      // A crashed screen must not be able to leave the walk running.
      expect(stoppedReason).toBe("EXPIRED");
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops cleanly on request and emits no further samples", async () => {
    vi.useFakeTimers();
    try {
      const provider = createSimulatedProvider("route-craig-street-bakery", {
        tickMs: 100,
      });
      const samples: LocationSample[] = [];
      let stopped = false;

      const subscription = await provider.watch(
        {
          sessionId: "session-1",
          mode: "FOREGROUND",
          intervalMs: 100,
          distanceIntervalMeters: 5,
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        },
        (event) => {
          if (event.type === "SAMPLE") samples.push(event.sample);
          if (event.type === "STOPPED") stopped = true;
        },
      );

      await vi.advanceTimersByTimeAsync(300);
      const countAtStop = samples.length;

      await subscription.stop();
      await vi.advanceTimersByTimeAsync(1_000);

      expect(stopped).toBe(true);
      expect(samples.length).toBe(countAtStop);
    } finally {
      vi.useRealTimers();
    }
  });

  it("produces evidence that satisfies the quest requirement once it arrives", async () => {
    const provider = createSimulatedProvider("route-craig-street-bakery");
    const sample = provider.simulator.jumpToEnd();

    const evaluation = evaluateArrival({
      sample,
      requirement: {
        type: "GPS",
        target: demoQuestTarget,
        radiusMeters: 40,
        maxAccuracyMeters: 50,
      },
      now: Date.parse(sample.recordedAt),
      policy: defaultLocationPolicy.arrival,
    });

    expect(evaluation.arrived).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Map projection                                                      */
/* ------------------------------------------------------------------ */

describe("map projection", () => {
  const viewport = {
    width: 360,
    height: 360,
    center: demoOrigin,
    spanMeters: 1_000,
  };

  it("puts the viewport centre in the middle of the screen", () => {
    expect(project(demoOrigin, viewport)).toEqual({ x: 180, y: 180 });
  });

  it("maps north to up and east to right", () => {
    const north = project(destinationPoint(demoOrigin, 0, 100), viewport);
    const east = project(destinationPoint(demoOrigin, 90, 100), viewport);

    // Screen y grows downward, so north must have a smaller y.
    expect(north.y).toBeLessThan(180);
    expect(north.x).toBeCloseTo(180, 2);
    expect(east.x).toBeGreaterThan(180);
    // A great-circle step due east drifts a fraction of a metre in latitude;
    // sub-pixel is the meaningful tolerance here, not 1e-6.
    expect(east.y).toBeCloseTo(180, 2);
  });

  it("scales distance linearly", () => {
    const near = project(destinationPoint(demoOrigin, 90, 100), viewport);
    const far = project(destinationPoint(demoOrigin, 90, 200), viewport);

    expect(far.x - 180).toBeCloseTo((near.x - 180) * 2, 4);
  });

  it("takes the short way across the antimeridian", () => {
    const antimeridian = {
      ...viewport,
      center: { latitude: 0, longitude: 179.99 },
    };

    const justEast = project({ latitude: 0, longitude: -179.99 }, antimeridian);

    // 0.02 degrees at the equator is ~2.2km, so with a 1km viewport the point
    // lands a few hundred pixels east of centre. A naive subtraction would
    // treat it as 359.98 degrees away and put it ~18,000x further out.
    const naiveOffset =
      (-359.98 * (Math.PI * 6_371_008.8)) / 180 / (1_000 / 360);
    expect(justEast.x).toBeGreaterThan(180);
    expect(justEast.x - 180).toBeLessThan(1_000);
    expect(Math.abs(justEast.x - 180)).toBeLessThan(
      Math.abs(naiveOffset) / 1_000,
    );
  });

  it("detects off-screen points and clamps them to the edge", () => {
    const faraway = project(destinationPoint(demoOrigin, 90, 50_000), viewport);

    expect(isOnScreen(faraway, viewport)).toBe(false);

    const clamped = clampToEdge(faraway, viewport, 24);
    expect(clamped.x).toBeLessThanOrEqual(viewport.width - 24);
    expect(clamped.x).toBeGreaterThanOrEqual(24);
    expect(isOnScreen(clamped, viewport)).toBe(true);
  });
});

describe("fitViewport", () => {
  const size = { width: 360, height: 400 };

  it("frames every point", () => {
    const markers = buildDemoQuestMarkers(Date.now());
    const points = [demoOrigin, ...markers.map((m) => m.coordinates)];

    const viewport = fitViewport(points, size);

    for (const point of points) {
      const projected = project(point, viewport);
      expect(isOnScreen(projected, viewport, 40)).toBe(true);
    }
  });

  it("does not zoom absurdly far in on a single point", () => {
    const viewport = fitViewport([demoOrigin], size, { minSpanMeters: 400 });
    expect(viewport.spanMeters).toBe(400);
  });

  it("survives an empty point list", () => {
    const viewport = fitViewport([], size);
    expect(viewport.spanMeters).toBeGreaterThan(0);
    expect(Number.isFinite(viewport.center.latitude)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Marker registry                                                     */
/* ------------------------------------------------------------------ */

describe("marker registry", () => {
  it("gives every kind a visually distinct style", () => {
    const glyphs = markerKinds.map((kind) => markerStyleFor(kind).glyph);
    expect(new Set(glyphs).size).toBe(markerKinds.length);

    const labels = markerKinds.map((kind) => markerStyleFor(kind).label);
    expect(new Set(labels).size).toBe(markerKinds.length);
  });

  it("gives every kind an accessible description and a real touch target", () => {
    for (const kind of markerKinds) {
      const style = markerStyleFor(kind);
      expect(style.accessibilityPrefix.length).toBeGreaterThan(0);
      // 44x44 is the platform minimum touch target. The drawn pin is smaller
      // so the map stays readable, with the pressable as transparent padding.
      expect(style.size).toBeGreaterThanOrEqual(44);
      expect(style.visualSize).toBeLessThan(style.size);
      expect(style.glyphSize).toBeLessThan(style.visualSize);
    }
  });

  it("falls back to a plain spawn for a kind it does not know", () => {
    const unknown = markerStyleFor("SEASON_FINALE" as never);
    expect(unknown.glyph).toBe(markerStyleFor("ADAPTIVE").glyph);
  });
});

describe("formatDistance", () => {
  it.each([
    [5, "you're here"],
    [14, "you're here"],
    [42, "40m away"],
    [300, "300m away"],
    [999, "1000m away"],
    [1_500, "1.5km away"],
  ])("formats %sm as %s", (meters, expected) => {
    expect(formatDistance(meters)).toBe(expected);
  });
});

describe("formatTimeRemaining", () => {
  const now = Date.parse("2026-09-11T18:00:00.000Z");

  it.each([
    [42 * 60_000, "42 min left"],
    [90 * 60_000, "1h 30m left"],
    [3 * 24 * 60 * 60_000, "3d left"],
  ])("formats a %sms window", (offset, expected) => {
    expect(formatTimeRemaining(new Date(now + offset).toISOString(), now)).toBe(
      expected,
    );
  });

  it("never shows a negative countdown", () => {
    expect(formatTimeRemaining(new Date(now - 60_000).toISOString(), now)).toBe(
      "expired",
    );
  });

  it("handles an unparseable expiry", () => {
    expect(formatTimeRemaining("never", now)).toBe("expired");
  });
});

describe("demo quest markers", () => {
  it("covers every marker kind the map can draw except party presence", () => {
    const kinds = new Set(buildDemoQuestMarkers(Date.now()).map((m) => m.kind));

    expect(kinds).toContain("ADAPTIVE");
    expect(kinds).toContain("MULTIPLAYER");
    expect(kinds).toContain("RAID");
    expect(kinds).toContain("LIMITED_TIME");
    // Party members are a coarse HUD badge, never a marker at a coordinate.
    expect(kinds).not.toContain("PARTY_MEMBER");
  });

  it("is deterministic relative to the supplied start time", () => {
    const start = Date.parse("2026-09-11T18:00:00.000Z");
    expect(buildDemoQuestMarkers(start)).toEqual(buildDemoQuestMarkers(start));
  });

  it("spawns the quests around whatever origin it is given", () => {
    const start = Date.parse("2026-09-11T18:00:00.000Z");
    // Somewhere nowhere near the default: the demo has to work anywhere.
    const tokyo = { latitude: 35.6762, longitude: 139.6503 };

    for (const marker of buildDemoQuestMarkers(start, tokyo)) {
      const away = distanceMeters(tokyo, marker.coordinates);
      expect(away).toBeGreaterThan(100);
      expect(away).toBeLessThan(1_000);
      // The GPS requirement must follow the marker, not stay behind.
      expect(marker.requirement.target).toEqual(marker.coordinates);
    }
  });
});

/* ------------------------------------------------------------------ */
/* API client                                                          */
/* ------------------------------------------------------------------ */

describe("LocationApi", () => {
  function stubFetch(
    handler: (
      url: string,
      init: RequestInit,
    ) => { status: number; body: unknown },
  ) {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      const { status, body } = handler(url, init);
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
      } as Response;
    }) as unknown as typeof fetch;

    return { fetchImpl, calls };
  }

  it("strips a trailing slash from the base URL", async () => {
    const { fetchImpl, calls } = stubFetch(() => ({
      status: 200,
      body: { sessions: [] },
    }));

    await new LocationApi({
      baseUrl: "http://localhost:3000/",
      fetchImpl,
    }).listSessions();

    expect(calls[0]?.url).toBe("http://localhost:3000/v1/location/sessions");
  });

  it("sends the idempotency key as a header", async () => {
    const { fetchImpl, calls } = stubFetch(() => ({
      status: 202,
      body: { accepted: true, sampleId: "s1", duplicate: false },
    }));

    const api = new LocationApi({ baseUrl: "http://x", fetchImpl });
    await api.submitSample(
      "session-1",
      {
        coordinates: demoOrigin,
        accuracyMeters: 10,
        recordedAt: new Date().toISOString(),
        source: "SIMULATED",
      },
      "key-1",
    );

    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers["idempotency-key"]).toBe("key-1");
    expect(headers["content-type"]).toBe("application/json");
  });

  it("returns a rejection rather than throwing on 422", async () => {
    const { fetchImpl } = stubFetch(() => ({
      status: 422,
      body: {
        accepted: false,
        rejection: {
          code: "ACCURACY_TOO_LOW",
          message: "Signal is too weak right now.",
          retryable: true,
        },
      },
    }));

    const result = await new LocationApi({
      baseUrl: "http://x",
      fetchImpl,
    }).submitSample("session-1", {
      coordinates: demoOrigin,
      accuracyMeters: 900,
      recordedAt: new Date().toISOString(),
      source: "GPS",
    });

    // A weak signal is guidance for the player, not an exception.
    expect(result.accepted).toBe(false);
    if (result.accepted) return;
    expect(result.rejection.code).toBe("ACCURACY_TOO_LOW");
  });

  it("returns a rejection rather than throwing on 429", async () => {
    const { fetchImpl } = stubFetch(() => ({
      status: 429,
      body: {
        accepted: false,
        rejection: {
          code: "RATE_LIMITED",
          message: "Too many readings.",
          retryable: true,
        },
      },
    }));

    const result = await new LocationApi({
      baseUrl: "http://x",
      fetchImpl,
    }).submitSample("session-1", {
      coordinates: demoOrigin,
      accuracyMeters: 10,
      recordedAt: new Date().toISOString(),
      source: "GPS",
    });

    expect(result.accepted).toBe(false);
  });

  it("throws a typed error carrying the server code", async () => {
    const { fetchImpl } = stubFetch(() => ({
      status: 403,
      body: { error: { code: "FORBIDDEN", message: "Not your party." } },
    }));

    const api = new LocationApi({ baseUrl: "http://x", fetchImpl });

    await expect(api.getPartyPresence("party-other")).rejects.toThrow(
      LocationApiError,
    );
    await expect(api.getPartyPresence("party-other")).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
  });

  it("survives a response body that is not JSON", async () => {
    const fetchImpl = (async () =>
      ({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error("not json");
        },
      }) as unknown as Response) as unknown as typeof fetch;

    await expect(
      new LocationApi({ baseUrl: "http://x", fetchImpl }).listSessions(),
    ).rejects.toMatchObject({ code: "UNKNOWN", status: 500 });
  });

  it("escapes ids in the path", async () => {
    const { fetchImpl, calls } = stubFetch(() => ({
      status: 200,
      body: { presence: {} },
    }));

    await new LocationApi({ baseUrl: "http://x", fetchImpl }).getPartyPresence(
      "party/../admin",
    );

    expect(calls[0]?.url).toBe(
      "http://x/v1/location/party/party%2F..%2Fadmin/presence",
    );
  });
});
