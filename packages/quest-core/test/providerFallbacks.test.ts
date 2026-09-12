import { describe, expect, it } from "vitest";
import { VerificationRegistry } from "../src";

const clock = { now: () => new Date("2026-09-12T16:00:00.000Z") };
const ids = { next: () => "attempt-provider" };

describe("verification provider fallbacks", () => {
  it("routes a GPS outage to review instead of failing the quest", async () => {
    const registry = new VerificationRegistry(
      clock,
      ids,
      {
        evaluate: async () => {
          throw new Error("offline");
        },
      },
      { inspectReference: async () => ({ safe: true }) },
    );
    const attempt = await registry.evaluate(
      "quest-1",
      "user-1",
      [
        {
          type: "GPS",
          target: { latitude: 40.44, longitude: -79.94 },
          radiusMeters: 50,
          maxAccuracyMeters: 30,
        },
      ],
      {
        gps: {
          coordinates: { latitude: 40.44, longitude: -79.94 },
          accuracyMeters: 10,
          capturedAt: clock.now().toISOString(),
          source: "device",
        },
      },
    );
    expect(attempt).toMatchObject({
      decision: "PENDING_REVIEW",
      checks: [{ code: "GPS_SERVICE_UNAVAILABLE" }],
    });
  });

  it("never lets a confident CV recommendation resolve without review", async () => {
    const registry = new VerificationRegistry(
      clock,
      ids,
      { evaluate: async () => ({ accepted: true, code: "GPS_OK" }) },
      {
        inspectReference: async () => ({
          safe: true,
          recommendation: "MATCH",
          code: "PHOTO_MATCH_AWAITING_REVIEW",
        }),
      },
    );
    const attempt = await registry.evaluate(
      "quest-1",
      "user-1",
      [
        {
          type: "PHOTO",
          prompt: "show a cleaned park",
          review: "MANUAL_OR_DEMO",
        },
      ],
      { photo: { mediaRef: "media://uploads/photo-1" } },
    );
    expect(attempt.decision).toBe("PENDING_REVIEW");
  });
});
