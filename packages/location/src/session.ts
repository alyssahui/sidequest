import type {
  LocationRejection,
  LocationSession,
  LocationSessionMode,
  LocationSessionPurpose,
} from "@sidequest/contracts/location";

import type { SessionPolicy } from "./policy";
import { rejection } from "./samples";

export type StartSessionInput = {
  id: string;
  userId: string;
  purpose: LocationSessionPurpose;
  mode: LocationSessionMode;
  requestedDurationMs?: number;
  questInstanceId?: string;
  partyId?: string;
  now: number;
  policy: SessionPolicy;
};

/**
 * Creates a session. There is no open-ended variant on purpose: consent is
 * always bounded, so `expiresAt` is computed here and clamped to the policy
 * maximum for the purpose even if the client asks for longer.
 */
export function startSession({
  id,
  userId,
  purpose,
  mode,
  requestedDurationMs,
  questInstanceId,
  partyId,
  now,
  policy,
}: StartSessionInput): LocationSession {
  const maxDurationMs = policy.maxDurationMs[purpose];
  const requested =
    requestedDurationMs && requestedDurationMs > 0
      ? requestedDurationMs
      : policy.defaultDurationMs;
  const durationMs = Math.min(requested, maxDurationMs);

  const session: LocationSession = {
    id,
    userId,
    purpose,
    mode,
    status: "ACTIVE",
    startedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + durationMs).toISOString(),
  };

  if (questInstanceId) session.questInstanceId = questInstanceId;
  if (partyId) session.partyId = partyId;
  return session;
}

export function isExpired(session: LocationSession, now: number): boolean {
  return Date.parse(session.expiresAt) <= now;
}

/**
 * Folds elapsed time into the stored status.
 *
 * Expiry is evaluated on read rather than by a timer so a process restart, a
 * backgrounded app, or a missed job can never leave a session collecting
 * location past its window.
 */
export function settleSession(
  session: LocationSession,
  now: number,
): LocationSession {
  if (session.status === "STOPPED" || session.status === "EXPIRED") {
    return session;
  }
  if (!isExpired(session, now)) return session;
  return { ...session, status: "EXPIRED", endedAt: session.expiresAt };
}

export function pauseSession(
  session: LocationSession,
  now: number,
): LocationSession {
  const settled = settleSession(session, now);
  if (settled.status !== "ACTIVE") return settled;
  return {
    ...settled,
    status: "PAUSED",
    pausedAt: new Date(now).toISOString(),
  };
}

/** Resuming never extends `expiresAt`; a pause spends the window, not pauses it. */
export function resumeSession(
  session: LocationSession,
  now: number,
): LocationSession {
  const settled = settleSession(session, now);
  if (settled.status !== "PAUSED") return settled;
  const { pausedAt: _pausedAt, ...rest } = settled;
  return { ...rest, status: "ACTIVE" };
}

export function stopSession(
  session: LocationSession,
  now: number,
): LocationSession {
  if (session.status === "STOPPED" || session.status === "EXPIRED") {
    return session;
  }
  return {
    ...session,
    status: "STOPPED",
    endedAt: new Date(now).toISOString(),
  };
}

export type SessionAcceptance =
  | { ok: true; session: LocationSession }
  | { ok: false; session: LocationSession; rejection: LocationRejection };

/**
 * The single authorization gate for ingest: the session must exist, belong to
 * this user, be active, be unexpired, and — for quest evidence — be attached to
 * the quest the sample claims.
 */
export function acceptsSamples(input: {
  session: LocationSession | undefined;
  userId: string;
  now: number;
  questInstanceId?: string;
}):
  | SessionAcceptance
  | { ok: false; session?: undefined; rejection: LocationRejection } {
  const { session, userId, now, questInstanceId } = input;

  if (!session) return { ok: false, rejection: rejection("NO_ACTIVE_SESSION") };

  if (session.userId !== userId) {
    return { ok: false, session, rejection: rejection("SESSION_NOT_OWNED") };
  }

  const settled = settleSession(session, now);

  if (settled.status === "EXPIRED") {
    return {
      ok: false,
      session: settled,
      rejection: rejection("SESSION_EXPIRED"),
    };
  }
  if (settled.status === "STOPPED") {
    return {
      ok: false,
      session: settled,
      rejection: rejection("NO_ACTIVE_SESSION"),
    };
  }
  if (settled.status === "PAUSED") {
    return {
      ok: false,
      session: settled,
      rejection: rejection("SESSION_PAUSED"),
    };
  }

  if (
    questInstanceId &&
    settled.questInstanceId &&
    settled.questInstanceId !== questInstanceId
  ) {
    return {
      ok: false,
      session: settled,
      rejection: rejection("SESSION_QUEST_MISMATCH"),
    };
  }

  return { ok: true, session: settled };
}

/** Sessions that must be torn down for a lifecycle event such as logout. */
export function sessionsToStopOn(
  sessions: readonly LocationSession[],
  event:
    | { type: "LOGOUT"; userId: string }
    | { type: "PARTY_EXIT"; userId: string; partyId: string }
    | { type: "QUEST_RESOLVED"; questInstanceId: string }
    | { type: "SHARING_DISABLED"; userId: string },
): readonly LocationSession[] {
  return sessions.filter((session) => {
    if (session.status !== "ACTIVE" && session.status !== "PAUSED")
      return false;
    switch (event.type) {
      case "LOGOUT":
      case "SHARING_DISABLED":
        return session.userId === event.userId;
      case "PARTY_EXIT":
        return (
          session.userId === event.userId && session.partyId === event.partyId
        );
      case "QUEST_RESOLVED":
        return session.questInstanceId === event.questInstanceId;
    }
  });
}
