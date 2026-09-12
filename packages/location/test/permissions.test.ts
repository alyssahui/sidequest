import { describe, expect, it } from "vitest";

import type {
  LocationAvailability,
  LocationPermissionState,
} from "@sidequest/contracts/location";
import { locationPermissionStates } from "@sidequest/contracts/location";

import { capabilityFor, guidanceFor, isAtLeast } from "../src/permissions";
import { LocationProviderError, toProviderError } from "../src/provider";
import {
  accuracyBucket,
  assertNoCoordinates,
  findCoordinateLeaks,
  redactSample,
} from "../src/redaction";

function availability(
  permission: LocationPermissionState,
  overrides: Partial<LocationAvailability["service"]> = {},
): LocationAvailability {
  return {
    permission,
    service: { servicesEnabled: true, backgroundSupported: true, ...overrides },
  };
}

describe("capabilityFor", () => {
  it("handles every permission state without falling through", () => {
    for (const permission of locationPermissionStates) {
      expect(() => capabilityFor(availability(permission))).not.toThrow();
      expect(() => guidanceFor(availability(permission))).not.toThrow();
    }
  });

  it("asks for foreground permission first", () => {
    expect(capabilityFor(availability("NOT_REQUESTED")).nextRequest).toBe(
      "FOREGROUND",
    );
  });

  it("does not re-prompt after a denial, because the OS will not show it", () => {
    const capability = capabilityFor(availability("DENIED"));

    expect(capability.nextRequest).toBeNull();
    expect(guidanceFor(availability("DENIED")).action).toBe("OPEN_SETTINGS");
  });

  it("keeps discovery working on approximate location but blocks verification", () => {
    const capability = capabilityFor(availability("APPROXIMATE"));

    expect(capability.canReadPosition).toBe(true);
    expect(capability.canVerifyArrival).toBe(false);
    expect(capability.bestAvailableMode).toBe("FOREGROUND");
  });

  it("keeps foreground-only useful", () => {
    const capability = capabilityFor(availability("FOREGROUND"));

    expect(capability.canReadPosition).toBe(true);
    expect(capability.canVerifyArrival).toBe(true);
    expect(capability.canRunBackground).toBe(false);
    expect(capability.bestAvailableMode).toBe("FOREGROUND");
  });

  it("only offers background when the build actually supports it", () => {
    const unsupported = capabilityFor(
      availability("FOREGROUND", { backgroundSupported: false }),
    );
    expect(unsupported.nextRequest).toBeNull();

    const supported = capabilityFor(availability("FOREGROUND"));
    expect(supported.nextRequest).toBe("BACKGROUND");
  });

  it("degrades background permission to foreground in Expo Go", () => {
    const capability = capabilityFor(
      availability("BACKGROUND", { backgroundSupported: false }),
    );

    expect(capability.canRunBackground).toBe(false);
    expect(capability.bestAvailableMode).toBe("FOREGROUND");
  });

  it("blocks everything when device services are switched off", () => {
    const capability = capabilityFor(
      availability("BACKGROUND", { servicesEnabled: false }),
    );

    expect(capability.canReadPosition).toBe(false);
    expect(capability.bestAvailableMode).toBeNull();
  });

  it("offers no dead ends: every state has guidance", () => {
    for (const permission of locationPermissionStates) {
      const guidance = guidanceFor(availability(permission));
      expect(guidance.title.length).toBeGreaterThan(0);
      expect(guidance.body.length).toBeGreaterThan(0);
      if (guidance.action !== "NONE") {
        expect(guidance.actionLabel).not.toBeNull();
      }
    }
  });

  it("explains the value before requesting foreground permission", () => {
    const guidance = guidanceFor(availability("NOT_REQUESTED"));

    expect(guidance.action).toBe("REQUEST_FOREGROUND");
    expect(guidance.body).toMatch(/never shown to your party/i);
  });

  it("names the active feature before requesting background permission", () => {
    const guidance = guidanceFor(availability("FOREGROUND"));

    expect(guidance.action).toBe("REQUEST_BACKGROUND");
    expect(guidance.body).toMatch(/active quest/i);
    expect(guidance.body).toMatch(/stops automatically|pause/i);
  });
});

describe("isAtLeast", () => {
  it.each([
    ["FOREGROUND", "FOREGROUND", true],
    ["BACKGROUND", "FOREGROUND", true],
    ["APPROXIMATE", "FOREGROUND", true],
    ["DENIED", "FOREGROUND", false],
    ["FOREGROUND", "BACKGROUND", false],
    ["BACKGROUND", "BACKGROUND", true],
  ] as const)("%s satisfies %s: %s", (state, level, expected) => {
    expect(isAtLeast(state, level)).toBe(expected);
  });
});

describe("toProviderError", () => {
  it.each([
    ["E_LOCATION_UNAUTHORIZED", "PERMISSION_DENIED"],
    ["Location services are disabled", "SERVICES_DISABLED"],
    ["Background location is not enabled", "BACKGROUND_UNSUPPORTED"],
    ["Native module cannot be null", "MODULE_UNAVAILABLE"],
    ["Request timed out", "TIMEOUT"],
    ["Something odd happened", "UNKNOWN"],
  ])("maps %s to %s", (message, code) => {
    expect(toProviderError(new Error(message)).code).toBe(code);
  });

  it("passes an already-mapped error through untouched", () => {
    const original = new LocationProviderError("TIMEOUT", "Slow fix");
    expect(toProviderError(original)).toBe(original);
  });

  it("survives a thrown non-error", () => {
    expect(toProviderError(null).code).toBe("UNKNOWN");
    expect(toProviderError("oops").code).toBe("UNKNOWN");
  });

  it("marks recoverable failures as retryable", () => {
    expect(toProviderError(new Error("Request timed out")).retryable).toBe(
      true,
    );
    expect(
      toProviderError(new Error("E_LOCATION_UNAUTHORIZED")).retryable,
    ).toBe(false);
  });
});

describe("redaction", () => {
  const sample = {
    coordinates: { latitude: 40.4433, longitude: -79.9436 },
    accuracyMeters: 12,
    recordedAt: "2026-09-11T18:00:00.000Z",
    source: "GPS" as const,
    sessionId: "session-1",
    questInstanceId: "quest-1",
  };

  it("strips coordinates from a sample", () => {
    const redacted = redactSample(sample);

    expect(findCoordinateLeaks(redacted)).toEqual([]);
    expect(redacted.sessionId).toBe("session-1");
    expect(redacted.accuracyBucket).toBe("FINE");
  });

  it("buckets accuracy rather than reporting the exact value", () => {
    expect(accuracyBucket(5)).toBe("FINE");
    expect(accuracyBucket(15)).toBe("FINE");
    expect(accuracyBucket(16)).toBe("GOOD");
    expect(accuracyBucket(50)).toBe("GOOD");
    expect(accuracyBucket(51)).toBe("COARSE");
    expect(accuracyBucket(150)).toBe("COARSE");
    expect(accuracyBucket(151)).toBe("POOR");
    expect(redactSample(sample)).not.toHaveProperty("accuracyMeters");
  });

  it("omits optional ids instead of writing undefined", () => {
    const redacted = redactSample({
      coordinates: sample.coordinates,
      accuracyMeters: 12,
      recordedAt: sample.recordedAt,
      source: "GPS",
    });

    expect(redacted).not.toHaveProperty("sessionId");
    expect(redacted).not.toHaveProperty("questInstanceId");
  });

  it("finds coordinates nested anywhere in a payload", () => {
    expect(findCoordinateLeaks({ a: { b: [{ latitude: 1 }] } })).toEqual([
      "$.a.b[0].latitude",
    ]);
    expect(findCoordinateLeaks({ event: { payload: { coords: {} } } })).toEqual(
      ["$.event.payload.coords"],
    );
    expect(findCoordinateLeaks({ point: null })).toEqual(["$.point"]);
  });

  it("survives a cyclic payload", () => {
    const cyclic: Record<string, unknown> = { safe: true };
    cyclic.self = cyclic;

    expect(findCoordinateLeaks(cyclic)).toEqual([]);
  });

  it("throws a named error when a payload would leak", () => {
    expect(() =>
      assertNoCoordinates({ sample }, "party presence event"),
    ).toThrow(/party presence event/);
  });

  it("passes a clean payload", () => {
    expect(() =>
      assertNoCoordinates({ nearbyUserIds: ["user-ben"] }, "presence"),
    ).not.toThrow();
  });
});
