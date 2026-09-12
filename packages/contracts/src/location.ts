/**
 * Cross-process location contract.
 *
 * Privacy rule that shapes every type in this file: raw peer coordinates never
 * leave the server. Types that describe another party member expose a coarse
 * area label and a freshness bucket only — never a `Coordinates`.
 */

/** Coordinate order is always `{ latitude, longitude }` in objects. */
export type Coordinates = {
  latitude: number;
  longitude: number;
};

export const locationSources = [
  "GPS",
  "FUSED",
  "NETWORK",
  "SIMULATED",
  "MANUAL",
] as const;

export type LocationSource = (typeof locationSources)[number];

/** One normalized positional reading. Distances and accuracy are meters. */
export type LocationSample = {
  coordinates: Coordinates;
  accuracyMeters: number;
  /** UTC ISO-8601 instant the device recorded the fix. */
  recordedAt: string;
  source: LocationSource;
  sessionId?: string;
  questInstanceId?: string;
  /** Meters above the ellipsoid, when the platform supplies it. */
  altitudeMeters?: number;
  /** Device-reported ground speed in meters per second, when available. */
  speedMps?: number;
};

/* ------------------------------------------------------------------ */
/* Permission and service state                                        */
/* ------------------------------------------------------------------ */

export const locationPermissionStates = [
  /** No location hardware/module, or the platform does not support it. */
  "UNAVAILABLE",
  /** The OS dialog has not been shown yet. */
  "NOT_REQUESTED",
  "DENIED",
  /** iOS reduced accuracy or Android coarse permission. */
  "APPROXIMATE",
  "FOREGROUND",
  "BACKGROUND",
] as const;

export type LocationPermissionState = (typeof locationPermissionStates)[number];

export type LocationPermissionLevel = "FOREGROUND" | "BACKGROUND";

export type LocationServiceState = {
  /** Device location services toggle. */
  servicesEnabled: boolean;
  /** Whether background updates can actually run on this build. */
  backgroundSupported: boolean;
};

export type LocationAvailability = {
  permission: LocationPermissionState;
  service: LocationServiceState;
};

/* ------------------------------------------------------------------ */
/* Sessions: consent is always scoped and time-boxed                   */
/* ------------------------------------------------------------------ */

export const locationSessionPurposes = [
  "ACTIVE_QUEST",
  "PARTY_SESSION",
] as const;

export type LocationSessionPurpose = (typeof locationSessionPurposes)[number];

export type LocationSessionMode = "FOREGROUND" | "BACKGROUND";

export const locationSessionStatuses = [
  "ACTIVE",
  "PAUSED",
  "EXPIRED",
  "STOPPED",
] as const;

export type LocationSessionStatus = (typeof locationSessionStatuses)[number];

export type LocationSession = {
  id: string;
  userId: string;
  purpose: LocationSessionPurpose;
  mode: LocationSessionMode;
  status: LocationSessionStatus;
  /** Present when `purpose` is `ACTIVE_QUEST`. */
  questInstanceId?: string;
  /** Present when the session also feeds party presence. */
  partyId?: string;
  startedAt: string;
  /** Hard stop. Sessions are never open-ended. */
  expiresAt: string;
  pausedAt?: string;
  endedAt?: string;
};

export type StartLocationSessionRequest = {
  purpose: LocationSessionPurpose;
  mode: LocationSessionMode;
  /** Requested duration; the server clamps it to the policy maximum. */
  durationMs: number;
  questInstanceId?: string;
  partyId?: string;
  idempotencyKey?: string;
};

/* ------------------------------------------------------------------ */
/* Ingest                                                              */
/* ------------------------------------------------------------------ */

export const locationRejectionCodes = [
  "INVALID_COORDINATES",
  "COORDINATES_LOOK_SWAPPED",
  "INVALID_ACCURACY",
  "INVALID_TIMESTAMP",
  "SAMPLE_IN_FUTURE",
  "SAMPLE_STALE",
  "ACCURACY_TOO_LOW",
  "IMPLAUSIBLE_TRAVEL",
  "NON_MONOTONIC_SAMPLE",
  "NO_ACTIVE_SESSION",
  "SESSION_EXPIRED",
  "SESSION_PAUSED",
  "SESSION_NOT_OWNED",
  "SESSION_QUEST_MISMATCH",
  "RATE_LIMITED",
] as const;

export type LocationRejectionCode = (typeof locationRejectionCodes)[number];

export type LocationRejection = {
  code: LocationRejectionCode;
  /** Safe for display. Never contains coordinates. */
  message: string;
  /** True when re-sending a corrected or newer sample can succeed. */
  retryable: boolean;
};

export type SubmitLocationSampleRequest = {
  sessionId: string;
  sample: LocationSample;
  /** Duplicate keys return the original result instead of storing twice. */
  idempotencyKey?: string;
};

export type SubmitLocationSampleResponse =
  | {
      accepted: true;
      sampleId: string;
      /** True when an identical idempotency key was already recorded. */
      duplicate: boolean;
      /** Present when the session is attached to a GPS-verified quest. */
      arrival?: ArrivalEvaluation;
    }
  | {
      accepted: false;
      rejection: LocationRejection;
    };

/* ------------------------------------------------------------------ */
/* Arrival and GPS evidence                                            */
/* ------------------------------------------------------------------ */

/**
 * How arrival treats horizontal uncertainty.
 *
 * - `STRICT_DISTANCE` compares the raw point distance to the radius.
 * - `UNCERTAINTY_ADJUSTED` subtracts the reported accuracy first, so a fix that
 *   *could* be inside the radius counts. This is the default: SideQuest treats
 *   GPS as game evidence, and strict comparison produces constant false
 *   negatives on phones reporting 20-35m accuracy in cities.
 *
 * Either way the sample must still satisfy the accuracy and freshness ceilings,
 * and the measurements used are returned so the UI can explain the verdict.
 */
export type ArrivalMode = "STRICT_DISTANCE" | "UNCERTAINTY_ADJUSTED";

export type ArrivalCondition = "DISTANCE" | "ACCURACY" | "FRESHNESS";

export type ArrivalEvaluation = {
  arrived: boolean;
  mode: ArrivalMode;
  /** Great-circle distance from the sample to the target. */
  distanceMeters: number;
  /** Distance after the mode's uncertainty adjustment. */
  effectiveDistanceMeters: number;
  radiusMeters: number;
  accuracyMeters: number;
  maxAccuracyMeters: number;
  sampleAgeMs: number;
  maxSampleAgeMs: number;
  /** Empty when `arrived` is true. */
  failedConditions: readonly ArrivalCondition[];
};

/** Mirrors the `GPS` arm of the shared `VerificationRequirement` union. */
export type GpsRequirement = {
  type: "GPS";
  target: Coordinates;
  radiusMeters: number;
  maxAccuracyMeters: number;
};

export type GpsEvidenceRequest = {
  userId: string;
  questInstanceId: string;
  requirement: GpsRequirement;
  /** Defaults to the service clock. */
  evaluatedAt?: string;
};

export type GpsEvidenceStatus = "SATISFIED" | "NOT_SATISFIED" | "NO_EVIDENCE";

export type GpsEvidenceResult = {
  status: GpsEvidenceStatus;
  questInstanceId: string;
  evaluatedAt: string;
  /** Null only when `status` is `NO_EVIDENCE`. */
  evaluation: ArrivalEvaluation | null;
  /** Opaque id of the sample used, for audit without storing coordinates. */
  sampleId?: string;
  reasons: readonly LocationRejectionCode[];
};

/**
 * The seam quest verification consumes.
 *
 * It returns normalized evidence and an explanation. It never transitions a
 * quest, writes a ledger entry, or awards coins — the quest module owns that.
 */
export interface GpsEvidenceService {
  evaluate(request: GpsEvidenceRequest): Promise<GpsEvidenceResult>;
}

/* ------------------------------------------------------------------ */
/* Party presence (coarse by construction)                             */
/* ------------------------------------------------------------------ */

export const presenceFreshnessBuckets = [
  "LIVE",
  "RECENT",
  "STALE",
  "OFFLINE",
] as const;

export type PresenceFreshness = (typeof presenceFreshnessBuckets)[number];

/**
 * What one party member is allowed to learn about another.
 * Deliberately has no coordinates field, at any nesting depth.
 */
export type PartyMemberPresence = {
  userId: string;
  /** Coarse, human-readable area such as "near Craig Street". */
  areaLabel: string;
  /** Stable id of the coarse grid cell, for grouping without coordinates. */
  areaId: string;
  freshness: PresenceFreshness;
  /** Bucketed to the minute; exact ages leak movement timing. */
  ageMinutes: number;
  nearSelf: boolean;
};

export type PartyPresenceSnapshot = {
  partyId: string;
  observedAt: string;
  members: readonly PartyMemberPresence[];
  nearbyUserIds: readonly string[];
  nearbyCount: number;
  /** Coarse area shared by the nearby cluster, when there is one. */
  clusterAreaLabel?: string;
};

export type PartyPresenceChangedPayload = {
  partyId: string;
  nearbyUserIds: readonly string[];
  nearbyCount: number;
  clusterAreaLabel?: string;
  /** Members who entered the cluster since the last published change. */
  joinedUserIds: readonly string[];
  /** Members who left the cluster since the last published change. */
  departedUserIds: readonly string[];
};

export const locationPartyPresenceChangedEventType =
  "location.party_presence_changed" as const;

/* ------------------------------------------------------------------ */
/* Privacy controls                                                    */
/* ------------------------------------------------------------------ */

export type LocationPrivacySummary = {
  userId: string;
  /** Count only. Listing raw samples back to the client is not supported. */
  storedSampleCount: number;
  activeSessions: readonly LocationSession[];
  /** Retention window applied to raw samples, in milliseconds. */
  rawSampleRetentionMs: number;
  /** Oldest retained sample instant, or null when nothing is stored. */
  oldestSampleAt: string | null;
};

export type LocationDeletionResult = {
  deletedSampleCount: number;
  stoppedSessionCount: number;
};

/** Options a player controls directly from the privacy sheet. */
export type LocationSharingPreference = {
  /** Master switch. When false no session may be started. */
  sharingEnabled: boolean;
  /** Share coarse presence with the party while a session is active. */
  sharePartyPresence: boolean;
  /** Allow background updates during an active quest. */
  allowBackgroundDuringQuest: boolean;
  /** Default requested session length in milliseconds. */
  defaultSessionDurationMs: number;
};

/* ------------------------------------------------------------------ */
/* Error envelope                                                      */
/* ------------------------------------------------------------------ */

export const locationErrorCodes = [
  ...locationRejectionCodes,
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "INVALID_REQUEST",
  "SHARING_DISABLED",
] as const;

export type LocationErrorCode = (typeof locationErrorCodes)[number];

export type LocationErrorResponse = {
  error: {
    code: LocationErrorCode;
    /** Safe prose. Clients branch on `code`, never on this string. */
    message: string;
  };
};
