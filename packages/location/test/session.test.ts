import { describe, expect, it } from "vitest";

import type { LocationSession } from "@sidequest/contracts/location";

import { defaultLocationPolicy } from "../src/policy";
import {
  acceptsSamples,
  isExpired,
  pauseSession,
  resumeSession,
  sessionsToStopOn,
  settleSession,
  startSession,
  stopSession,
} from "../src/session";

const policy = defaultLocationPolicy.session;
const now = Date.parse("2026-09-11T18:00:00.000Z");

function quest(overrides: Partial<LocationSession> = {}): LocationSession {
  return {
    ...startSession({
      id: "session-1",
      userId: "user-zuri",
      purpose: "ACTIVE_QUEST",
      mode: "FOREGROUND",
      questInstanceId: "quest-1",
      now,
      policy,
    }),
    ...overrides,
  };
}

describe("startSession", () => {
  it("always sets an expiry", () => {
    const session = quest();

    expect(session.status).toBe("ACTIVE");
    expect(Date.parse(session.expiresAt)).toBe(now + policy.defaultDurationMs);
  });

  it("clamps a request longer than the purpose maximum", () => {
    const session = startSession({
      id: "session-2",
      userId: "user-zuri",
      purpose: "PARTY_SESSION",
      mode: "BACKGROUND",
      partyId: "party-demo",
      requestedDurationMs: 24 * 60 * 60_000,
      now,
      policy,
    });

    expect(Date.parse(session.expiresAt) - now).toBe(
      policy.maxDurationMs.PARTY_SESSION,
    );
  });

  it("falls back to the default duration for a nonsensical request", () => {
    const session = startSession({
      id: "session-3",
      userId: "user-zuri",
      purpose: "ACTIVE_QUEST",
      mode: "FOREGROUND",
      requestedDurationMs: -1,
      now,
      policy,
    });

    expect(Date.parse(session.expiresAt) - now).toBe(policy.defaultDurationMs);
  });

  it("omits ids that were not supplied rather than storing undefined", () => {
    const session = startSession({
      id: "session-4",
      userId: "user-zuri",
      purpose: "ACTIVE_QUEST",
      mode: "FOREGROUND",
      now,
      policy,
    });

    expect(session).not.toHaveProperty("questInstanceId");
    expect(session).not.toHaveProperty("partyId");
  });
});

describe("settleSession", () => {
  it("expires on read without needing a timer to have fired", () => {
    const session = quest();
    const after = Date.parse(session.expiresAt) + 1;

    expect(isExpired(session, after)).toBe(true);
    expect(settleSession(session, after).status).toBe("EXPIRED");
  });

  it("expires a paused session too, so pausing cannot outlive consent", () => {
    const paused = pauseSession(quest(), now + 1_000);
    const after = Date.parse(paused.expiresAt) + 1;

    expect(settleSession(paused, after).status).toBe("EXPIRED");
  });

  it("leaves a stopped session alone", () => {
    const stopped = stopSession(quest(), now + 1_000);
    const after = Date.parse(stopped.expiresAt) + 1;

    expect(settleSession(stopped, after)).toBe(stopped);
  });

  it("treats the expiry instant itself as expired", () => {
    const session = quest();
    expect(isExpired(session, Date.parse(session.expiresAt))).toBe(true);
  });
});

describe("pause and resume", () => {
  it("round-trips back to active", () => {
    const paused = pauseSession(quest(), now + 1_000);
    expect(paused.status).toBe("PAUSED");
    expect(paused.pausedAt).toBe(new Date(now + 1_000).toISOString());

    const resumed = resumeSession(paused, now + 2_000);
    expect(resumed.status).toBe("ACTIVE");
    expect(resumed).not.toHaveProperty("pausedAt");
  });

  it("does not extend the window across a pause", () => {
    const session = quest();
    const resumed = resumeSession(
      pauseSession(session, now + 1_000),
      now + 10 * 60_000,
    );

    expect(resumed.expiresAt).toBe(session.expiresAt);
  });

  it("cannot resume an expired session", () => {
    const paused = pauseSession(quest(), now + 1_000);
    const resumed = resumeSession(paused, Date.parse(paused.expiresAt) + 1);

    expect(resumed.status).toBe("EXPIRED");
  });

  it("is idempotent when stopped twice", () => {
    const stopped = stopSession(quest(), now + 1_000);
    expect(stopSession(stopped, now + 2_000)).toBe(stopped);
  });
});

describe("acceptsSamples", () => {
  it("accepts an active, owned, unexpired session", () => {
    const result = acceptsSamples({
      session: quest(),
      userId: "user-zuri",
      now: now + 1_000,
      questInstanceId: "quest-1",
    });

    expect(result.ok).toBe(true);
  });

  it("rejects a missing session", () => {
    const result = acceptsSamples({
      session: undefined,
      userId: "user-zuri",
      now,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection.code).toBe("NO_ACTIVE_SESSION");
  });

  it("rejects a session belonging to somebody else", () => {
    const result = acceptsSamples({
      session: quest(),
      userId: "user-ben",
      now: now + 1_000,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection.code).toBe("SESSION_NOT_OWNED");
  });

  it("rejects an expired session", () => {
    const session = quest();
    const result = acceptsSamples({
      session,
      userId: "user-zuri",
      now: Date.parse(session.expiresAt) + 1,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection.code).toBe("SESSION_EXPIRED");
  });

  it("rejects a paused session with a distinct code", () => {
    const result = acceptsSamples({
      session: pauseSession(quest(), now + 1_000),
      userId: "user-zuri",
      now: now + 2_000,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection.code).toBe("SESSION_PAUSED");
  });

  it("rejects a stopped session", () => {
    const result = acceptsSamples({
      session: stopSession(quest(), now + 1_000),
      userId: "user-zuri",
      now: now + 2_000,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection.code).toBe("NO_ACTIVE_SESSION");
  });

  it("rejects evidence aimed at a different quest", () => {
    const result = acceptsSamples({
      session: quest(),
      userId: "user-zuri",
      now: now + 1_000,
      questInstanceId: "quest-other",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection.code).toBe("SESSION_QUEST_MISMATCH");
  });

  it("allows a party session to carry samples with no quest attached", () => {
    const party = startSession({
      id: "session-party",
      userId: "user-zuri",
      purpose: "PARTY_SESSION",
      mode: "FOREGROUND",
      partyId: "party-demo",
      now,
      policy,
    });

    const result = acceptsSamples({
      session: party,
      userId: "user-zuri",
      now: now + 1_000,
    });

    expect(result.ok).toBe(true);
  });
});

describe("sessionsToStopOn", () => {
  const zuriQuest = quest();
  const zuriParty = startSession({
    id: "session-party",
    userId: "user-zuri",
    purpose: "PARTY_SESSION",
    mode: "BACKGROUND",
    partyId: "party-demo",
    now,
    policy,
  });
  const benQuest = quest({ id: "session-ben", userId: "user-ben" });
  const alreadyStopped = stopSession(quest({ id: "session-old" }), now + 1_000);
  const sessions = [zuriQuest, zuriParty, benQuest, alreadyStopped];

  it("stops every session for the user on logout", () => {
    const stopping = sessionsToStopOn(sessions, {
      type: "LOGOUT",
      userId: "user-zuri",
    });

    expect(stopping.map((s) => s.id)).toEqual(["session-1", "session-party"]);
  });

  it("stops only the matching party session on party exit", () => {
    const stopping = sessionsToStopOn(sessions, {
      type: "PARTY_EXIT",
      userId: "user-zuri",
      partyId: "party-demo",
    });

    expect(stopping.map((s) => s.id)).toEqual(["session-party"]);
  });

  it("stops every user's session attached to a resolved quest", () => {
    const stopping = sessionsToStopOn(sessions, {
      type: "QUEST_RESOLVED",
      questInstanceId: "quest-1",
    });

    expect(stopping.map((s) => s.id)).toEqual(["session-1", "session-ben"]);
  });

  it("stops sharing entirely when the privacy switch is turned off", () => {
    const stopping = sessionsToStopOn(sessions, {
      type: "SHARING_DISABLED",
      userId: "user-zuri",
    });

    expect(stopping.map((s) => s.id)).toEqual(["session-1", "session-party"]);
  });

  it("never re-stops a session that already ended", () => {
    const stopping = sessionsToStopOn(sessions, {
      type: "LOGOUT",
      userId: "user-zuri",
    });

    expect(stopping.map((s) => s.id)).not.toContain("session-old");
  });
});
