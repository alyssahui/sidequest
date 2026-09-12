import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Clock, DomainEvent, IdGenerator } from "@sidequest/contracts";
import type {
  LocationSample,
  LocationSession,
  PartyPresenceSnapshot,
  SubmitLocationSampleResponse,
} from "@sidequest/contracts/location";
import {
  LocationSimulator,
  defaultLocationPolicy,
  demoOrigin,
  demoQuestTarget,
  destinationPoint,
  findCoordinateLeaks,
  findDemoRoute,
  withPolicy,
} from "@sidequest/location";

import {
  DemoPartyMemberships,
  InMemoryEventBus,
} from "../src/foundation/demoAdapters";
import {
  registerLocationModule,
  type LocationAuditEvent,
  type LocationModule,
} from "../src/modules/location";

const START = Date.parse("2026-09-11T18:00:00.000Z");
const PARTY = "party-demo";
const ZURI = "user-zuri";
const ALYSSA = "user-alyssa";

/** Controllable clock: every test advances time explicitly. */
class TestClock implements Clock {
  ms = START;
  now() {
    return new Date(this.ms);
  }
  advance(deltaMs: number) {
    this.ms += deltaMs;
  }
}

/** Sequential ids so assertions and failures are readable. */
class SequentialIds implements IdGenerator {
  #next = 0;
  next() {
    this.#next += 1;
    return `id-${this.#next}`;
  }
}

type Harness = {
  app: FastifyInstance;
  clock: TestClock;
  events: InMemoryEventBus;
  audit: LocationAuditEvent[];
  module: LocationModule;
  /** Impersonates a user for the next requests. */
  as(userId: string): void;
};

const harnesses: Harness[] = [];

function buildHarness(
  options: { policy?: ReturnType<typeof withPolicy> } = {},
): Harness {
  const app = Fastify({ logger: false });
  const clock = new TestClock();
  const events = new InMemoryEventBus();
  const audit: LocationAuditEvent[] = [];
  let currentUser = ZURI;

  app.decorateRequest("principal", {
    getter() {
      return { userId: currentUser, partyIds: [PARTY] };
    },
  });

  const module = registerLocationModule(app, {
    events,
    memberships: new DemoPartyMemberships(),
    clock,
    ids: new SequentialIds(),
    ...(options.policy ? { policy: options.policy } : {}),
    audit: (event) => audit.push(event),
  });

  const harness: Harness = {
    app,
    clock,
    events,
    audit,
    module,
    as(userId) {
      currentUser = userId;
    },
  };

  harnesses.push(harness);
  return harness;
}

afterEach(async () => {
  await Promise.all(
    harnesses.splice(0).map(async (harness) => {
      harness.module.stop();
      await harness.app.close();
    }),
  );
});

/* ------------------------------------------------------------------ */
/* Request helpers                                                     */
/* ------------------------------------------------------------------ */

async function startSession(
  harness: Harness,
  body: Record<string, unknown> = {},
): Promise<LocationSession> {
  const response = await harness.app.inject({
    method: "POST",
    url: "/v1/location/sessions",
    payload: {
      purpose: "ACTIVE_QUEST",
      mode: "FOREGROUND",
      questInstanceId: "quest-1",
      ...body,
    },
  });

  expect(response.statusCode).toBe(201);
  return response.json().session as LocationSession;
}

function sampleAt(
  metersFromOrigin: number,
  overrides: Partial<LocationSample> = {},
): LocationSample {
  return {
    coordinates: destinationPoint(demoOrigin, 45, metersFromOrigin),
    accuracyMeters: 10,
    recordedAt: new Date(START).toISOString(),
    source: "GPS",
    ...overrides,
  };
}

async function submit(
  harness: Harness,
  sessionId: string,
  sample: unknown,
  headers: Record<string, string> = {},
) {
  const response = await harness.app.inject({
    method: "POST",
    url: "/v1/location/samples",
    headers,
    payload: { sessionId, sample },
  });
  return {
    status: response.statusCode,
    body: response.json() as SubmitLocationSampleResponse,
  };
}

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

describe("POST /v1/location/sessions", () => {
  let harness: Harness;

  beforeEach(() => {
    harness = buildHarness();
  });

  it("creates a time-boxed session owned by the caller", async () => {
    const session = await startSession(harness);

    expect(session.userId).toBe(ZURI);
    expect(session.status).toBe("ACTIVE");
    expect(Date.parse(session.expiresAt)).toBeGreaterThan(START);
  });

  it("ignores any actor id supplied in the body", async () => {
    const session = await startSession(harness, { userId: ALYSSA });

    // The principal is the only source of identity.
    expect(session.userId).toBe(ZURI);
  });

  it("clamps a session longer than the policy maximum", async () => {
    const session = await startSession(harness, {
      durationMs: 24 * 60 * 60_000,
    });

    expect(Date.parse(session.expiresAt) - START).toBe(
      defaultLocationPolicy.session.maxDurationMs.ACTIVE_QUEST,
    );
  });

  it("rejects an active-quest session with no quest", async () => {
    const response = await harness.app.inject({
      method: "POST",
      url: "/v1/location/sessions",
      payload: { purpose: "ACTIVE_QUEST", mode: "FOREGROUND" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("INVALID_REQUEST");
  });

  it("rejects an unknown purpose", async () => {
    const response = await harness.app.inject({
      method: "POST",
      url: "/v1/location/sessions",
      payload: { purpose: "SURVEILLANCE", mode: "FOREGROUND" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("refuses a party session for a party the user is not in", async () => {
    const response = await harness.app.inject({
      method: "POST",
      url: "/v1/location/sessions",
      payload: {
        purpose: "PARTY_SESSION",
        mode: "FOREGROUND",
        partyId: "party-strangers",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("FORBIDDEN");
  });

  it("downgrades background to foreground until the player opts in", async () => {
    const session = await startSession(harness, { mode: "BACKGROUND" });

    // Background is a second, separate consent; the quest still works without it.
    expect(session.mode).toBe("FOREGROUND");

    await harness.app.inject({
      method: "PATCH",
      url: "/v1/location/me/privacy",
      payload: { allowBackgroundDuringQuest: true },
    });

    const upgraded = await startSession(harness, {
      mode: "BACKGROUND",
      questInstanceId: "quest-2",
    });
    expect(upgraded.mode).toBe("BACKGROUND");
  });

  it("caps how many sessions one user can run at once", async () => {
    for (let index = 0; index < 3; index += 1) {
      await startSession(harness, { questInstanceId: `quest-${index}` });
    }

    const response = await harness.app.inject({
      method: "POST",
      url: "/v1/location/sessions",
      payload: {
        purpose: "ACTIVE_QUEST",
        mode: "FOREGROUND",
        questInstanceId: "quest-overflow",
      },
    });

    expect(response.statusCode).toBe(409);
  });
});

describe("session lifecycle", () => {
  let harness: Harness;

  beforeEach(() => {
    harness = buildHarness();
  });

  it("pauses, resumes, and stops", async () => {
    const session = await startSession(harness);

    const paused = await harness.app.inject({
      method: "POST",
      url: `/v1/location/sessions/${session.id}/pause`,
    });
    expect(paused.json().session.status).toBe("PAUSED");

    const resumed = await harness.app.inject({
      method: "POST",
      url: `/v1/location/sessions/${session.id}/resume`,
    });
    expect(resumed.json().session.status).toBe("ACTIVE");

    const stopped = await harness.app.inject({
      method: "DELETE",
      url: `/v1/location/sessions/${session.id}`,
    });
    expect(stopped.json().session.status).toBe("STOPPED");
  });

  it("hides another user's session behind a 404 rather than a 403", async () => {
    const session = await startSession(harness);
    harness.as(ALYSSA);

    const response = await harness.app.inject({
      method: "DELETE",
      url: `/v1/location/sessions/${session.id}`,
    });

    // A 403 would confirm the id exists.
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("NOT_FOUND");
  });

  it("reports a session as expired once its window passes", async () => {
    await startSession(harness);
    harness.clock.advance(defaultLocationPolicy.session.defaultDurationMs + 1);

    const response = await harness.app.inject({
      method: "GET",
      url: "/v1/location/sessions",
    });

    expect(response.json().sessions[0].status).toBe("EXPIRED");
  });

  it("only lists the caller's own sessions", async () => {
    await startSession(harness);
    harness.as(ALYSSA);

    const response = await harness.app.inject({
      method: "GET",
      url: "/v1/location/sessions",
    });

    expect(response.json().sessions).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Ingest                                                              */
/* ------------------------------------------------------------------ */

describe("POST /v1/location/samples", () => {
  let harness: Harness;

  beforeEach(() => {
    harness = buildHarness();
  });

  it("accepts a valid reading against an active session", async () => {
    const session = await startSession(harness);
    const { status, body } = await submit(harness, session.id, sampleAt(0));

    expect(status).toBe(202);
    expect(body.accepted).toBe(true);
    if (!body.accepted) return;
    expect(body.duplicate).toBe(false);
  });

  it("rejects a reading with no session", async () => {
    const { status, body } = await submit(harness, "session-nope", sampleAt(0));

    expect(status).toBe(422);
    expect(body.accepted).toBe(false);
    if (body.accepted) return;
    expect(body.rejection.code).toBe("NO_ACTIVE_SESSION");
  });

  it("rejects a reading against someone else's session", async () => {
    const session = await startSession(harness);
    harness.as(ALYSSA);

    const { body } = await submit(harness, session.id, sampleAt(0));

    expect(body.accepted).toBe(false);
    if (body.accepted) return;
    expect(body.rejection.code).toBe("SESSION_NOT_OWNED");
  });

  it("rejects readings while sharing is paused", async () => {
    const session = await startSession(harness);
    await harness.app.inject({
      method: "POST",
      url: `/v1/location/sessions/${session.id}/pause`,
    });

    const { body } = await submit(harness, session.id, sampleAt(0));

    expect(body.accepted).toBe(false);
    if (body.accepted) return;
    expect(body.rejection.code).toBe("SESSION_PAUSED");
    expect(body.rejection.retryable).toBe(false);
  });

  it("rejects readings after the session expires", async () => {
    const session = await startSession(harness);
    harness.clock.advance(defaultLocationPolicy.session.defaultDurationMs + 1);

    const { body } = await submit(
      harness,
      session.id,
      sampleAt(0, { recordedAt: harness.clock.now().toISOString() }),
    );

    expect(body.accepted).toBe(false);
    if (body.accepted) return;
    expect(body.rejection.code).toBe("SESSION_EXPIRED");
  });

  it.each([
    [
      "reversed coordinates",
      { coordinates: { latitude: 139.69, longitude: 35.68 } },
      "COORDINATES_LOOK_SWAPPED",
    ],
    [
      "out-of-range longitude",
      { coordinates: { latitude: 40.44, longitude: 999 } },
      "INVALID_COORDINATES",
    ],
    ["negative accuracy", { accuracyMeters: -5 }, "INVALID_ACCURACY"],
    ["bad timestamp", { recordedAt: "soon" }, "INVALID_TIMESTAMP"],
  ])("rejects %s with a stable code", async (_label, overrides, code) => {
    const session = await startSession(harness);
    const { status, body } = await submit(harness, session.id, {
      ...sampleAt(0),
      ...overrides,
    });

    expect(status).toBe(422);
    expect(body.accepted).toBe(false);
    if (body.accepted) return;
    expect(body.rejection.code).toBe(code);
  });

  it("rejects a stale reading as retryable", async () => {
    const session = await startSession(harness);
    const { body } = await submit(
      harness,
      session.id,
      sampleAt(0, {
        recordedAt: new Date(
          START - defaultLocationPolicy.ingest.maxSampleAgeMs - 1,
        ).toISOString(),
      }),
    );

    expect(body.accepted).toBe(false);
    if (body.accepted) return;
    expect(body.rejection.code).toBe("SAMPLE_STALE");
    expect(body.rejection.retryable).toBe(true);
  });

  it("rejects a reading too inaccurate to be usable", async () => {
    const session = await startSession(harness);
    const { body } = await submit(
      harness,
      session.id,
      sampleAt(0, { accuracyMeters: 5_000 }),
    );

    expect(body.accepted).toBe(false);
    if (body.accepted) return;
    expect(body.rejection.code).toBe("ACCURACY_TOO_LOW");
  });

  it("rejects a teleport between consecutive readings", async () => {
    const session = await startSession(harness);
    await submit(harness, session.id, sampleAt(0));

    const { body } = await submit(
      harness,
      session.id,
      sampleAt(500_000, { recordedAt: new Date(START + 1_000).toISOString() }),
    );

    expect(body.accepted).toBe(false);
    if (body.accepted) return;
    expect(body.rejection.code).toBe("IMPLAUSIBLE_TRAVEL");
  });

  it("rejects a body with no sessionId", async () => {
    const response = await harness.app.inject({
      method: "POST",
      url: "/v1/location/samples",
      payload: { sample: sampleAt(0) },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("INVALID_REQUEST");
  });
});

describe("ingest idempotency", () => {
  let harness: Harness;

  beforeEach(() => {
    harness = buildHarness();
  });

  it("returns the original result for a repeated idempotency key", async () => {
    const session = await startSession(harness);
    const headers = { "idempotency-key": "retry-1" };

    const first = await submit(harness, session.id, sampleAt(0), headers);
    const second = await submit(harness, session.id, sampleAt(0), headers);

    expect(first.body.accepted && second.body.accepted).toBe(true);
    if (!first.body.accepted || !second.body.accepted) return;

    expect(second.body.sampleId).toBe(first.body.sampleId);
    expect(second.body.duplicate).toBe(true);

    const privacy = await harness.app.inject({
      method: "GET",
      url: "/v1/location/me/privacy",
    });
    // The retry did not add a second point to the trace.
    expect(privacy.json().summary.storedSampleCount).toBe(1);
  });

  it("treats readings with no key as independent", async () => {
    const session = await startSession(harness);

    await submit(harness, session.id, sampleAt(0));
    await submit(
      harness,
      session.id,
      sampleAt(5, { recordedAt: new Date(START + 30_000).toISOString() }),
    );

    const privacy = await harness.app.inject({
      method: "GET",
      url: "/v1/location/me/privacy",
    });
    expect(privacy.json().summary.storedSampleCount).toBe(2);
  });
});

describe("rate limiting", () => {
  it("returns 429 once the burst is spent and recovers after a refill", async () => {
    const harness = buildHarness({
      policy: withPolicy({
        ingest: { rateLimit: { capacity: 3, refillPerMinute: 60 } },
      }),
    });
    const session = await startSession(harness);

    for (let index = 0; index < 3; index += 1) {
      const { status } = await submit(
        harness,
        session.id,
        sampleAt(index, {
          recordedAt: new Date(START + index * 1_000).toISOString(),
        }),
      );
      expect(status).toBe(202);
    }

    const limited = await submit(
      harness,
      session.id,
      sampleAt(4, { recordedAt: new Date(START + 3_000).toISOString() }),
    );
    expect(limited.status).toBe(429);
    expect(limited.body.accepted).toBe(false);
    if (limited.body.accepted) return;
    expect(limited.body.rejection.code).toBe("RATE_LIMITED");
    expect(limited.body.rejection.retryable).toBe(true);

    // One token refills each second at 60/minute. The reading must also be
    // newer than the last accepted one, or it fails the monotonicity check
    // instead and the rate limiter is not what is being measured.
    harness.clock.advance(4_000);
    const recovered = await submit(
      harness,
      session.id,
      sampleAt(5, { recordedAt: harness.clock.now().toISOString() }),
    );
    expect(recovered.status).toBe(202);
  });

  it("limits each user separately", async () => {
    const harness = buildHarness({
      policy: withPolicy({
        ingest: { rateLimit: { capacity: 1, refillPerMinute: 1 } },
      }),
    });

    const zuriSession = await startSession(harness);
    expect((await submit(harness, zuriSession.id, sampleAt(0))).status).toBe(
      202,
    );
    expect((await submit(harness, zuriSession.id, sampleAt(1))).status).toBe(
      429,
    );

    harness.as(ALYSSA);
    const alyssaSession = await startSession(harness, {
      questInstanceId: "quest-alyssa",
    });
    // Zuri exhausting their bucket must not throttle Alyssa.
    expect((await submit(harness, alyssaSession.id, sampleAt(0))).status).toBe(
      202,
    );
  });
});

/* ------------------------------------------------------------------ */
/* GPS evidence                                                        */
/* ------------------------------------------------------------------ */

describe("POST /v1/location/evidence/gps", () => {
  let harness: Harness;

  beforeEach(() => {
    harness = buildHarness();
  });

  const requirement = {
    questInstanceId: "quest-1",
    target: demoQuestTarget,
    radiusMeters: 40,
    maxAccuracyMeters: 50,
  };

  it("reports NO_EVIDENCE before any reading arrives", async () => {
    const response = await harness.app.inject({
      method: "POST",
      url: "/v1/location/evidence/gps",
      payload: requirement,
    });

    expect(response.json().evidence.status).toBe("NO_EVIDENCE");
    expect(response.json().evidence.noEvidenceReason).toBe("NO_SAMPLES");
    expect(response.json().evidence.evaluation).toBeNull();
  });

  it("explains how far the player still has to go", async () => {
    const session = await startSession(harness);
    await submit(harness, session.id, sampleAt(0));

    const response = await harness.app.inject({
      method: "POST",
      url: "/v1/location/evidence/gps",
      payload: requirement,
    });

    const evidence = response.json().evidence;
    expect(evidence.status).toBe("NOT_SATISFIED");
    expect(evidence.evaluation.failedConditions).toEqual(["DISTANCE"]);
    expect(evidence.evaluation.distanceMeters).toBeGreaterThan(500);
  });

  it("returns SATISFIED once the player is inside the radius", async () => {
    const session = await startSession(harness);
    await submit(harness, session.id, {
      ...sampleAt(0),
      coordinates: demoQuestTarget,
    });

    const response = await harness.app.inject({
      method: "POST",
      url: "/v1/location/evidence/gps",
      payload: requirement,
    });

    expect(response.json().evidence.status).toBe("SATISFIED");
    expect(response.json().evidence.evaluation.arrived).toBe(true);
  });

  it("never reads evidence belonging to another player", async () => {
    const session = await startSession(harness);
    await submit(harness, session.id, {
      ...sampleAt(0),
      coordinates: demoQuestTarget,
    });

    harness.as(ALYSSA);
    const response = await harness.app.inject({
      method: "POST",
      url: "/v1/location/evidence/gps",
      payload: requirement,
    });

    // Zuri stood on the target; Alyssa cannot borrow that.
    expect(response.json().evidence.status).toBe("NO_EVIDENCE");
  });

  it("rejects a malformed requirement", async () => {
    const response = await harness.app.inject({
      method: "POST",
      url: "/v1/location/evidence/gps",
      payload: { questInstanceId: "quest-1", radiusMeters: -10 },
    });

    expect(response.statusCode).toBe(400);
  });

  it("awards nothing and resolves nothing: it only reports", async () => {
    const session = await startSession(harness);
    await submit(harness, session.id, {
      ...sampleAt(0),
      coordinates: demoQuestTarget,
    });

    await harness.app.inject({
      method: "POST",
      url: "/v1/location/evidence/gps",
      payload: requirement,
    });

    // No quest or economy event is emitted by evaluating evidence.
    expect(harness.events.events.map((event) => event.type)).not.toContain(
      "quest.resolved",
    );
  });
});

/* ------------------------------------------------------------------ */
/* Presence                                                            */
/* ------------------------------------------------------------------ */

describe("party presence", () => {
  let harness: Harness;

  beforeEach(() => {
    harness = buildHarness();
  });

  async function shareFrom(userId: string, metersFromOrigin: number) {
    harness.as(userId);
    const session = await startSession(harness, {
      purpose: "PARTY_SESSION",
      mode: "FOREGROUND",
      partyId: PARTY,
      questInstanceId: undefined,
    });
    await submit(
      harness,
      session.id,
      sampleAt(metersFromOrigin, {
        recordedAt: harness.clock.now().toISOString(),
      }),
    );
    return session;
  }

  it("returns coarse presence with no coordinates anywhere", async () => {
    await shareFrom(ZURI, 0);
    await shareFrom(ALYSSA, 50);
    harness.as(ZURI);

    const response = await harness.app.inject({
      method: "GET",
      url: `/v1/location/party/${PARTY}/presence`,
    });

    const presence = response.json().presence as PartyPresenceSnapshot;
    expect(findCoordinateLeaks(presence)).toEqual([]);
    expect(presence.nearbyUserIds).toEqual([ALYSSA]);
    expect(presence.members.every((member) => "areaLabel" in member)).toBe(
      true,
    );
  });

  it("refuses presence for a party the caller is not in", async () => {
    const response = await harness.app.inject({
      method: "GET",
      url: "/v1/location/party/party-strangers/presence",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("FORBIDDEN");
  });

  it("drops a member who turns off presence sharing", async () => {
    await shareFrom(ZURI, 0);
    await shareFrom(ALYSSA, 50);

    harness.as(ALYSSA);
    await harness.app.inject({
      method: "PATCH",
      url: "/v1/location/me/privacy",
      payload: { sharePartyPresence: false },
    });

    harness.as(ZURI);
    const response = await harness.app.inject({
      method: "GET",
      url: `/v1/location/party/${PARTY}/presence`,
    });

    expect(response.json().presence.nearbyUserIds).toEqual([]);
  });

  it("emits location.party_presence_changed with no coordinates", async () => {
    await shareFrom(ZURI, 0);
    await shareFrom(ALYSSA, 50);

    // Hold the cluster steady past the debounce window, then move again.
    harness.clock.advance(defaultLocationPolicy.presence.debounceMs + 1_000);
    await shareFrom(ALYSSA, 55);

    const presenceEvents = harness.events.events.filter(
      (event: DomainEvent) => event.type === "location.party_presence_changed",
    );

    expect(presenceEvents.length).toBeGreaterThan(0);
    for (const event of presenceEvents) {
      expect(findCoordinateLeaks(event)).toEqual([]);
      expect(JSON.stringify(event)).not.toMatch(/latitude|longitude/i);
    }
  });

  it("does not fire an event before the debounce window elapses", async () => {
    await shareFrom(ZURI, 0);
    await shareFrom(ALYSSA, 50);

    const early = harness.events.events.filter(
      (event: DomainEvent) => event.type === "location.party_presence_changed",
    );

    expect(early).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Privacy controls and retention                                      */
/* ------------------------------------------------------------------ */

describe("privacy controls", () => {
  let harness: Harness;

  beforeEach(() => {
    harness = buildHarness();
  });

  it("summarises what is stored without listing any of it", async () => {
    const session = await startSession(harness);
    await submit(harness, session.id, sampleAt(0));

    const response = await harness.app.inject({
      method: "GET",
      url: "/v1/location/me/privacy",
    });

    const body = response.json();
    expect(body.summary.storedSampleCount).toBe(1);
    expect(body.summary.rawSampleRetentionMs).toBe(
      defaultLocationPolicy.retention.rawSampleTtlMs,
    );
    expect(findCoordinateLeaks(body)).toEqual([]);
  });

  it("deletes every stored reading on request", async () => {
    const session = await startSession(harness);
    await submit(harness, session.id, sampleAt(0));

    const deleted = await harness.app.inject({
      method: "DELETE",
      url: "/v1/location/me/samples",
    });

    expect(deleted.json().deletedSampleCount).toBe(1);
    expect(deleted.json().stoppedSessionCount).toBe(1);

    const after = await harness.app.inject({
      method: "GET",
      url: "/v1/location/me/privacy",
    });
    expect(after.json().summary.storedSampleCount).toBe(0);
  });

  it("only deletes the caller's own data", async () => {
    const session = await startSession(harness);
    await submit(harness, session.id, sampleAt(0));

    harness.as(ALYSSA);
    const deleted = await harness.app.inject({
      method: "DELETE",
      url: "/v1/location/me/samples",
    });
    expect(deleted.json().deletedSampleCount).toBe(0);

    harness.as(ZURI);
    const after = await harness.app.inject({
      method: "GET",
      url: "/v1/location/me/privacy",
    });
    expect(after.json().summary.storedSampleCount).toBe(1);
  });

  it("stops running sessions the moment sharing is switched off", async () => {
    const session = await startSession(harness);

    await harness.app.inject({
      method: "PATCH",
      url: "/v1/location/me/privacy",
      payload: { sharingEnabled: false },
    });

    const sessions = await harness.app.inject({
      method: "GET",
      url: "/v1/location/sessions",
    });
    expect(sessions.json().sessions[0].status).toBe("STOPPED");

    const blocked = await submit(harness, session.id, sampleAt(0));
    expect(blocked.body.accepted).toBe(false);

    const restart = await harness.app.inject({
      method: "POST",
      url: "/v1/location/sessions",
      payload: {
        purpose: "ACTIVE_QUEST",
        mode: "FOREGROUND",
        questInstanceId: "quest-2",
      },
    });
    expect(restart.statusCode).toBe(403);
    expect(restart.json().error.code).toBe("SHARING_DISABLED");
  });

  it("rejects a privacy patch with nothing recognisable in it", async () => {
    const response = await harness.app.inject({
      method: "PATCH",
      url: "/v1/location/me/privacy",
      payload: { trackMeEverywhere: true },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe("retention", () => {
  it("sweeps readings past the retention window and keeps the rest", async () => {
    const harness = buildHarness();
    const session = await startSession(harness);
    await submit(harness, session.id, sampleAt(0));

    const noop = await harness.app.inject({
      method: "POST",
      url: "/v1/location/retention/sweep",
    });
    expect(noop.json().deletedSampleCount).toBe(0);

    harness.clock.advance(
      defaultLocationPolicy.retention.rawSampleTtlMs + 60_000,
    );

    const swept = await harness.app.inject({
      method: "POST",
      url: "/v1/location/retention/sweep",
    });
    expect(swept.json().deletedSampleCount).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* Logging and audit                                                   */
/* ------------------------------------------------------------------ */

describe("audit trail", () => {
  it("never carries coordinates, and buckets accuracy", async () => {
    const harness = buildHarness();
    const session = await startSession(harness);

    await submit(harness, session.id, sampleAt(0));
    await submit(
      harness,
      session.id,
      sampleAt(0, {
        accuracyMeters: 9_999,
        recordedAt: new Date(START + 1_000).toISOString(),
      }),
    );

    expect(harness.audit.length).toBeGreaterThan(0);
    expect(findCoordinateLeaks(harness.audit)).toEqual([]);
    expect(JSON.stringify(harness.audit)).not.toMatch(/latitude|longitude/i);

    const accepted = harness.audit.find(
      (event) => event.type === "SAMPLE_ACCEPTED",
    );
    expect(accepted).toBeDefined();
    if (!accepted || accepted.type !== "SAMPLE_ACCEPTED") return;
    expect(accepted.sample.accuracyBucket).toBe("FINE");
    expect(accepted.sample).not.toHaveProperty("accuracyMeters");

    const rejected = harness.audit.find(
      (event) => event.type === "SAMPLE_REJECTED",
    );
    expect(rejected).toBeDefined();
    if (!rejected || rejected.type !== "SAMPLE_REJECTED") return;
    expect(rejected.reason).toBe("ACCURACY_TOO_LOW");
  });
});

/* ------------------------------------------------------------------ */
/* Simulator: the credential-free demo path                            */
/* ------------------------------------------------------------------ */

describe("simulated walk to a quest", () => {
  it("moves the demo user to the target and produces accepted GPS evidence", async () => {
    const harness = buildHarness();
    const session = await startSession(harness);

    const route = findDemoRoute("route-craig-street-bakery");
    expect(route).toBeDefined();
    if (!route) return;

    const sim = new LocationSimulator({ route, startedAt: START });
    const requirement = {
      questInstanceId: "quest-1",
      target: demoQuestTarget,
      radiusMeters: 40,
      maxAccuracyMeters: 50,
    };

    let satisfied = false;
    let accepted = 0;

    // Walk in 30-second steps until the evidence is good enough.
    for (let step = 0; step < 40 && !satisfied; step += 1) {
      const elapsed = step * 30_000;
      harness.clock.ms = START + elapsed;

      const result = await submit(harness, session.id, sim.seek(elapsed));
      if (result.body.accepted) accepted += 1;

      const evidence = await harness.app.inject({
        method: "POST",
        url: "/v1/location/evidence/gps",
        payload: requirement,
      });
      satisfied = evidence.json().evidence.status === "SATISFIED";
    }

    expect(accepted).toBeGreaterThan(5);
    expect(satisfied).toBe(true);
  });

  it("runs with no database, no token, and no external service", async () => {
    // The harness above constructs the module with no `sql` client, which is
    // the same path `buildApp()` takes when DATABASE_URL is unset.
    const harness = buildHarness();
    const response = await harness.app.inject({
      method: "GET",
      url: "/v1/location/config",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().arrival.mode).toBe("UNCERTAINTY_ADJUSTED");
  });
});
