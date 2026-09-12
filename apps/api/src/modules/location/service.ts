import type {
  Clock,
  DomainEvent,
  EventPublisher,
  IdGenerator,
  PartyMembershipPort,
} from "@sidequest/contracts";
import type {
  GpsEvidenceRequest,
  GpsEvidenceResult,
  GpsEvidenceService,
  LocationDeletionResult,
  LocationPrivacySummary,
  LocationRejection,
  LocationSession,
  LocationSharingPreference,
  PartyPresenceChangedPayload,
  PartyPresenceSnapshot,
  StartLocationSessionRequest,
  SubmitLocationSampleRequest,
  SubmitLocationSampleResponse,
} from "@sidequest/contracts/location";
import { locationPartyPresenceChangedEventType } from "@sidequest/contracts/location";
import {
  RateLimiter,
  acceptsSamples,
  assertNoCoordinates,
  checkAccuracy,
  checkFreshness,
  checkPlausibleTravel,
  createGridAreaResolver,
  defaultLocationPolicy,
  derivePartyPresence,
  evaluateArrival,
  initialPresenceState,
  normalizeSample,
  pauseSession,
  redactSample,
  reducePresence,
  rejection,
  resumeSession,
  sessionsToStopOn,
  settleSession,
  startSession,
  stopSession,
  type CoarseAreaResolver,
  type LocationPolicy,
  type PresenceState,
  type RedactedSample,
} from "@sidequest/location";

import type { LocationRepository, StoredSample } from "./repository";

export class LocationServiceError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.name = "LocationServiceError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export type LocationAuditEvent =
  | { type: "SAMPLE_ACCEPTED"; userId: string; sample: RedactedSample }
  | {
      type: "SAMPLE_REJECTED";
      userId: string;
      reason: string;
      sample: RedactedSample;
    }
  | { type: "SESSION_STARTED"; userId: string; sessionId: string }
  | {
      type: "SESSION_ENDED";
      userId: string;
      sessionId: string;
      reason: string;
    };

export type LocationServiceOptions = {
  repository: LocationRepository;
  events: EventPublisher;
  memberships: PartyMembershipPort;
  clock: Clock;
  ids: IdGenerator;
  policy?: LocationPolicy;
  areaResolver?: CoarseAreaResolver;
  /**
   * Audit sink. Receives already-redacted payloads only; there is no code path
   * that hands it raw coordinates.
   */
  audit?: (event: LocationAuditEvent) => void;
};

/**
 * Application service for the location module.
 *
 * Everything that touches a coordinate happens inside this class. Callers get
 * typed accept/reject results, coarse presence, and arrival evaluations — never
 * a position.
 */
export class LocationService implements GpsEvidenceService {
  readonly #repository: LocationRepository;
  readonly #events: EventPublisher;
  readonly #memberships: PartyMembershipPort;
  readonly #clock: Clock;
  readonly #ids: IdGenerator;
  readonly #policy: LocationPolicy;
  readonly #areaResolver: CoarseAreaResolver;
  readonly #audit: (event: LocationAuditEvent) => void;
  readonly #limiter: RateLimiter;
  readonly #presenceStates = new Map<string, PresenceState>();

  constructor(options: LocationServiceOptions) {
    this.#repository = options.repository;
    this.#events = options.events;
    this.#memberships = options.memberships;
    this.#clock = options.clock;
    this.#ids = options.ids;
    this.#policy = options.policy ?? defaultLocationPolicy;
    this.#areaResolver =
      options.areaResolver ??
      createGridAreaResolver({
        gridMeters: this.#policy.presence.areaGridMeters,
      });
    this.#audit = options.audit ?? (() => {});
    this.#limiter = new RateLimiter(this.#policy.ingest.rateLimit);
  }

  get policy(): LocationPolicy {
    return this.#policy;
  }

  #now(): number {
    return this.#clock.now().getTime();
  }

  /* ---------------------------------------------------------------- */
  /* Sessions                                                          */
  /* ---------------------------------------------------------------- */

  async startSession(
    userId: string,
    request: StartLocationSessionRequest,
  ): Promise<LocationSession> {
    const preference = await this.#repository.getSharingPreference(userId);
    if (!preference.sharingEnabled) {
      throw new LocationServiceError(
        "SHARING_DISABLED",
        "Location sharing is turned off in your privacy settings.",
        403,
      );
    }

    if (request.purpose === "ACTIVE_QUEST" && !request.questInstanceId) {
      throw new LocationServiceError(
        "INVALID_REQUEST",
        "An active-quest session must name the quest it is for.",
        400,
      );
    }

    if (request.purpose === "PARTY_SESSION" && !request.partyId) {
      throw new LocationServiceError(
        "INVALID_REQUEST",
        "A party session must name the party it is for.",
        400,
      );
    }

    if (request.partyId) {
      await this.#assertPartyMember(userId, request.partyId);
    }

    // Background is a second, separate consent. A client asking for it without
    // the preference set is silently downgraded rather than refused, so the
    // quest still works in the foreground.
    const mode =
      request.mode === "BACKGROUND" && !preference.allowBackgroundDuringQuest
        ? "FOREGROUND"
        : request.mode;

    const now = this.#now();
    const existing = await this.#repository.listSessionsForUser(userId);
    const active = existing
      .map((session) => settleSession(session, now))
      .filter((session) => session.status === "ACTIVE");

    if (active.length >= this.#policy.session.maxSessionsPerUser) {
      throw new LocationServiceError(
        "INVALID_REQUEST",
        "Too many location sessions are already running. Stop one first.",
        409,
      );
    }

    const session = startSession({
      id: this.#ids.next(),
      userId,
      purpose: request.purpose,
      mode,
      requestedDurationMs:
        request.durationMs && request.durationMs > 0
          ? request.durationMs
          : preference.defaultSessionDurationMs,
      ...(request.questInstanceId
        ? { questInstanceId: request.questInstanceId }
        : {}),
      ...(request.partyId ? { partyId: request.partyId } : {}),
      now,
      policy: this.#policy.session,
    });

    await this.#repository.createSession(session);
    this.#audit({ type: "SESSION_STARTED", userId, sessionId: session.id });
    return session;
  }

  async listSessions(userId: string): Promise<readonly LocationSession[]> {
    const now = this.#now();
    const sessions = await this.#repository.listSessionsForUser(userId);
    return sessions.map((session) => settleSession(session, now));
  }

  async #ownedSession(
    userId: string,
    sessionId: string,
  ): Promise<LocationSession> {
    const session = await this.#repository.getSession(sessionId);
    // A session belonging to someone else reads as absent rather than
    // forbidden, so probing cannot confirm that an id exists.
    if (!session || session.userId !== userId) {
      throw new LocationServiceError(
        "NOT_FOUND",
        "No such location session.",
        404,
      );
    }
    return session;
  }

  async pauseSession(userId: string, sessionId: string) {
    const session = await this.#ownedSession(userId, sessionId);
    return this.#repository.saveSession(pauseSession(session, this.#now()));
  }

  async resumeSession(userId: string, sessionId: string) {
    const session = await this.#ownedSession(userId, sessionId);
    return this.#repository.saveSession(resumeSession(session, this.#now()));
  }

  async stopSession(userId: string, sessionId: string, reason = "REQUESTED") {
    const session = await this.#ownedSession(userId, sessionId);
    const stopped = stopSession(session, this.#now());
    await this.#repository.saveSession(stopped);
    this.#audit({ type: "SESSION_ENDED", userId, sessionId, reason });
    return stopped;
  }

  /**
   * Bulk teardown for lifecycle events. The quest module calls this with
   * `QUEST_RESOLVED` so a finished quest cannot leave location running.
   */
  async stopSessionsFor(
    event: Parameters<typeof sessionsToStopOn>[1],
    scope: { userId?: string; partyId?: string },
  ): Promise<number> {
    const now = this.#now();
    const sessions = scope.userId
      ? await this.#repository.listSessionsForUser(scope.userId)
      : scope.partyId
        ? await this.#repository.listSessionsForParty(scope.partyId)
        : [];

    const stopping = sessionsToStopOn(sessions, event);
    for (const session of stopping) {
      await this.#repository.saveSession(stopSession(session, now));
      this.#audit({
        type: "SESSION_ENDED",
        userId: session.userId,
        sessionId: session.id,
        reason: event.type,
      });
    }
    return stopping.length;
  }

  /* ---------------------------------------------------------------- */
  /* Ingest                                                            */
  /* ---------------------------------------------------------------- */

  async submitSample(
    userId: string,
    request: SubmitLocationSampleRequest,
  ): Promise<SubmitLocationSampleResponse> {
    const now = this.#now();

    const normalized = normalizeSample(request.sample);
    if (!normalized.ok) {
      // No redacted payload here: the input was not a valid sample, so there is
      // nothing safe to describe beyond the reason.
      this.#audit({
        type: "SAMPLE_REJECTED",
        userId,
        reason: normalized.rejection.code,
        sample: {
          source: "MANUAL",
          recordedAt: new Date(now).toISOString(),
          accuracyBucket: "POOR",
        },
      });
      return { accepted: false, rejection: normalized.rejection };
    }

    const sample = normalized.value;
    const redacted = redactSample(sample);

    const reject = (value: LocationRejection): SubmitLocationSampleResponse => {
      this.#audit({
        type: "SAMPLE_REJECTED",
        userId,
        reason: value.code,
        sample: redacted,
      });
      return { accepted: false, rejection: value };
    };

    const limit = this.#limiter.consume(userId, now);
    if (!limit.allowed) return reject(rejection("RATE_LIMITED"));

    const preference = await this.#repository.getSharingPreference(userId);
    if (!preference.sharingEnabled) {
      return reject(rejection("NO_ACTIVE_SESSION"));
    }

    const stored = await this.#repository.getSession(request.sessionId);
    const acceptance = acceptsSamples({
      session: stored,
      userId,
      now,
      ...(sample.questInstanceId
        ? { questInstanceId: sample.questInstanceId }
        : {}),
    });

    if (!acceptance.ok) {
      // Expiry discovered on read is written back, so the session does not stay
      // nominally active in storage.
      if (acceptance.session && acceptance.session !== stored) {
        await this.#repository.saveSession(acceptance.session);
      }
      return reject(acceptance.rejection);
    }

    const session = acceptance.session;

    const freshness = checkFreshness({
      sample,
      now,
      policy: this.#policy.ingest,
    });
    if (!freshness.ok) return reject(freshness.rejection);

    const accuracy = checkAccuracy(
      sample,
      this.#policy.ingest.maxAccuracyMeters,
    );
    if (!accuracy.ok) return reject(accuracy.rejection);

    const previous = await this.#repository.latestSampleForUser(userId, {
      sessionId: session.id,
    });
    if (previous) {
      const travel = checkPlausibleTravel({
        previous: previous.sample,
        next: sample,
        policy: this.#policy.ingest,
      });
      if (!travel.ok) return reject(travel.rejection);
    }

    const record: StoredSample = {
      id: this.#ids.next(),
      userId,
      sessionId: session.id,
      sample: { ...sample, sessionId: session.id },
      receivedAt: new Date(now).toISOString(),
      ...(session.questInstanceId
        ? { questInstanceId: session.questInstanceId }
        : {}),
      ...(session.partyId ? { partyId: session.partyId } : {}),
      ...(request.idempotencyKey
        ? { idempotencyKey: request.idempotencyKey }
        : {}),
    };

    const { record: saved, duplicate } =
      await this.#repository.appendSample(record);

    this.#audit({ type: "SAMPLE_ACCEPTED", userId, sample: redacted });

    if (session.partyId && preference.sharePartyPresence) {
      await this.#refreshPartyPresence(session.partyId, userId);
    }

    return { accepted: true, sampleId: saved.id, duplicate };
  }

  /* ---------------------------------------------------------------- */
  /* GPS evidence                                                      */
  /* ---------------------------------------------------------------- */

  /**
   * The seam quest verification calls.
   *
   * Returns normalized evidence and the measurements behind it. It does not
   * transition the quest, write a ledger entry, or award anything — resolution
   * stays entirely with the quest module.
   */
  async evaluate(request: GpsEvidenceRequest): Promise<GpsEvidenceResult> {
    const evaluatedAtMs = request.evaluatedAt
      ? Date.parse(request.evaluatedAt)
      : this.#now();
    const evaluatedAt = new Date(evaluatedAtMs).toISOString();

    const latest = await this.#repository.latestSampleForUser(request.userId, {
      questInstanceId: request.questInstanceId,
    });

    if (!latest) {
      // Cannot distinguish "never sent" from "swept by retention" without
      // keeping a tombstone, so report the honest, less alarming reason.
      return {
        status: "NO_EVIDENCE",
        questInstanceId: request.questInstanceId,
        evaluatedAt,
        evaluation: null,
        noEvidenceReason: "NO_SAMPLES",
      };
    }

    const evaluation = evaluateArrival({
      sample: latest.sample,
      requirement: request.requirement,
      now: evaluatedAtMs,
      policy: this.#policy.arrival,
    });

    // `evaluation.failedConditions` already says precisely what fell short, so
    // there is no second, lossier list of reasons to keep in step with it.
    return {
      status: evaluation.arrived ? "SATISFIED" : "NOT_SATISFIED",
      questInstanceId: request.questInstanceId,
      evaluatedAt,
      evaluation,
      sampleId: latest.id,
    };
  }

  /* ---------------------------------------------------------------- */
  /* Presence                                                          */
  /* ---------------------------------------------------------------- */

  async #assertPartyMember(userId: string, partyId: string) {
    if (!(await this.#memberships.isMember(userId, partyId))) {
      throw new LocationServiceError(
        "FORBIDDEN",
        "You are not a member of that party.",
        403,
      );
    }
  }

  async getPartyPresence(
    userId: string,
    partyId: string,
  ): Promise<PartyPresenceSnapshot> {
    await this.#assertPartyMember(userId, partyId);

    const now = this.#now();
    const notBefore = new Date(
      now - this.#policy.presence.maxPresenceAgeMs,
    ).toISOString();
    const candidates = await this.#repository.latestSamplesForParty(
      partyId,
      notBefore,
      new Date(now).toISOString(),
    );

    const state = this.#presenceStates.get(partyId) ?? initialPresenceState;

    const snapshot = derivePartyPresence({
      partyId,
      selfUserId: userId,
      observations: candidates.map((candidate) => ({
        userId: candidate.userId,
        sample: candidate.sample,
        sharing: candidate.sharing,
      })),
      now,
      policy: this.#policy.presence,
      areaResolver: this.#areaResolver,
      previouslyNearbyUserIds: state.publishedUserIds,
    });

    // Belt and braces: the snapshot type has no coordinate field, and this
    // asserts no future change smuggles one in at runtime either.
    assertNoCoordinates(snapshot, "party presence snapshot");
    return snapshot;
  }

  /**
   * Recomputes the cluster after a new sample and publishes a debounced
   * `location.party_presence_changed` event when the set actually settles.
   */
  async #refreshPartyPresence(partyId: string, actorUserId: string) {
    const now = this.#now();
    const notBefore = new Date(
      now - this.#policy.presence.maxPresenceAgeMs,
    ).toISOString();
    const candidates = await this.#repository.latestSamplesForParty(
      partyId,
      notBefore,
      new Date(now).toISOString(),
    );

    const state = this.#presenceStates.get(partyId) ?? initialPresenceState;

    // The cluster is measured from the member who just moved.
    const snapshot = derivePartyPresence({
      partyId,
      selfUserId: actorUserId,
      observations: candidates.map((candidate) => ({
        userId: candidate.userId,
        sample: candidate.sample,
        sharing: candidate.sharing,
      })),
      now,
      policy: this.#policy.presence,
      areaResolver: this.#areaResolver,
      previouslyNearbyUserIds: state.publishedUserIds,
    });

    const transition = reducePresence(state, {
      partyId,
      candidateUserIds: snapshot.nearbyUserIds,
      ...(snapshot.clusterAreaLabel
        ? { clusterAreaLabel: snapshot.clusterAreaLabel }
        : {}),
      now,
      policy: this.#policy.presence,
    });

    this.#presenceStates.set(partyId, transition.state);
    if (!transition.change) return;

    await this.#publishPresenceChanged(partyId, actorUserId, transition.change);
  }

  async #publishPresenceChanged(
    partyId: string,
    actorUserId: string,
    payload: PartyPresenceChangedPayload,
  ) {
    const event: DomainEvent<
      typeof locationPartyPresenceChangedEventType,
      PartyPresenceChangedPayload
    > = {
      id: this.#ids.next(),
      type: locationPartyPresenceChangedEventType,
      version: 1,
      occurredAt: new Date(this.#now()).toISOString(),
      actorUserId,
      partyId,
      aggregateId: partyId,
      correlationId: this.#ids.next(),
      payload,
    };

    // The event crosses module and process boundaries and lands in the feed,
    // so it is checked for coordinates before it is ever published.
    assertNoCoordinates(event, "location.party_presence_changed");
    await this.#events.publish(event);
  }

  /* ---------------------------------------------------------------- */
  /* Privacy controls                                                  */
  /* ---------------------------------------------------------------- */

  async getPrivacySummary(userId: string): Promise<LocationPrivacySummary> {
    const now = this.#now();
    const sessions = await this.#repository.listSessionsForUser(userId);

    return {
      userId,
      storedSampleCount: await this.#repository.countSamplesForUser(userId),
      activeSessions: sessions
        .map((session) => settleSession(session, now))
        .filter(
          (session) =>
            session.status === "ACTIVE" || session.status === "PAUSED",
        ),
      rawSampleRetentionMs: this.#policy.retention.rawSampleTtlMs,
      oldestSampleAt: await this.#repository.oldestSampleAtForUser(userId),
    };
  }

  async getSharingPreference(userId: string) {
    return this.#repository.getSharingPreference(userId);
  }

  async updateSharingPreference(
    userId: string,
    patch: Partial<LocationSharingPreference>,
  ): Promise<LocationSharingPreference> {
    const current = await this.#repository.getSharingPreference(userId);
    const next: LocationSharingPreference = { ...current, ...patch };
    await this.#repository.saveSharingPreference(userId, next);

    // Turning sharing off is an immediate stop, not a preference that takes
    // effect at the next session.
    if (!next.sharingEnabled) {
      await this.stopSessionsFor(
        { type: "SHARING_DISABLED", userId },
        { userId },
      );
    }

    return next;
  }

  /** Deletes every raw sample for the user and stops their sessions. */
  async deleteMyLocationData(userId: string): Promise<LocationDeletionResult> {
    const stoppedSessionCount = await this.stopSessionsFor(
      { type: "LOGOUT", userId },
      { userId },
    );
    const deletedSampleCount =
      await this.#repository.deleteSamplesForUser(userId);

    return { deletedSampleCount, stoppedSessionCount };
  }

  /** Retention sweep. Safe to call repeatedly; returns what it removed. */
  async sweepExpiredSamples(): Promise<number> {
    const cutoff = new Date(
      this.#now() - this.#policy.retention.rawSampleTtlMs,
    ).toISOString();
    return this.#repository.deleteSamplesOlderThan(cutoff);
  }
}
