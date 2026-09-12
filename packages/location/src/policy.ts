import type {
  ArrivalMode,
  PresenceFreshness,
} from "@sidequest/contracts/location";

/**
 * Every threshold in the location system lives here. Nothing in this package
 * reads a magic number inline, so a product change is a policy change and the
 * tests can assert behaviour at exact boundaries.
 */
export type ArrivalPolicy = {
  mode: ArrivalMode;
  /** Ceiling on horizontal accuracy before a sample is unusable as evidence. */
  maxAccuracyMeters: number;
  /** A sample older than this cannot prove present-tense arrival. */
  maxSampleAgeMs: number;
};

export type IngestPolicy = {
  /** Samples older than this are rejected at ingest. */
  maxSampleAgeMs: number;
  /** Tolerance for device clock skew running ahead of the server. */
  maxClockSkewAheadMs: number;
  /** Samples less accurate than this are rejected at ingest. */
  maxAccuracyMeters: number;
  /**
   * Fastest believable ground speed. 60 m/s (~134 mph) accepts highway travel
   * and trains while rejecting teleports. This is a sanity check on data
   * quality, not anti-cheat.
   */
  maxPlausibleSpeedMps: number;
  /** Movement under this is treated as jitter, not travel. */
  jitterGraceMeters: number;
  /** Sustained-rate ceiling per user. */
  rateLimit: {
    capacity: number;
    refillPerMinute: number;
  };
};

export type PresencePolicy = {
  /** A member outside the cluster joins it inside this radius. */
  enterRadiusMeters: number;
  /**
   * A member already in the cluster leaves it only beyond this radius.
   * Strictly greater than `enterRadiusMeters`: the gap is the hysteresis band
   * that stops a member standing on the boundary from flapping.
   */
  exitRadiusMeters: number;
  /** A candidate set must hold steady this long before it is published. */
  debounceMs: number;
  /** Presence older than this is not considered for clustering at all. */
  maxPresenceAgeMs: number;
  /** Freshness bucket upper bounds, in milliseconds. */
  freshnessBucketsMs: Record<Exclude<PresenceFreshness, "OFFLINE">, number>;
  /** Edge length of the coarse area grid used for area labels. */
  areaGridMeters: number;
};

export type SessionPolicy = {
  /** Longest a single session may run, by purpose. */
  maxDurationMs: Record<"ACTIVE_QUEST" | "PARTY_SESSION", number>;
  /** Duration used when the client does not request one. */
  defaultDurationMs: number;
  /** A paused session that is never resumed still expires on schedule. */
  maxSessionsPerUser: number;
};

export type RetentionPolicy = {
  /**
   * Raw samples are transient working data. Derived verification and presence
   * records outlive them; the coordinates themselves do not.
   */
  rawSampleTtlMs: number;
  /** How often the sweeper runs when it is scheduled. */
  sweepIntervalMs: number;
};

export type LocationPolicy = {
  arrival: ArrivalPolicy;
  ingest: IngestPolicy;
  presence: PresencePolicy;
  session: SessionPolicy;
  retention: RetentionPolicy;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const defaultLocationPolicy: LocationPolicy = {
  arrival: {
    mode: "UNCERTAINTY_ADJUSTED",
    maxAccuracyMeters: 75,
    maxSampleAgeMs: 3 * MINUTE,
  },
  ingest: {
    maxSampleAgeMs: 10 * MINUTE,
    maxClockSkewAheadMs: 30_000,
    maxAccuracyMeters: 250,
    maxPlausibleSpeedMps: 60,
    jitterGraceMeters: 25,
    rateLimit: { capacity: 30, refillPerMinute: 30 },
  },
  presence: {
    enterRadiusMeters: 150,
    exitRadiusMeters: 260,
    debounceMs: 45_000,
    maxPresenceAgeMs: 15 * MINUTE,
    freshnessBucketsMs: {
      LIVE: 2 * MINUTE,
      RECENT: 10 * MINUTE,
      STALE: 30 * MINUTE,
    },
    areaGridMeters: 600,
  },
  session: {
    maxDurationMs: {
      ACTIVE_QUEST: 4 * HOUR,
      PARTY_SESSION: 2 * HOUR,
    },
    defaultDurationMs: 45 * MINUTE,
    maxSessionsPerUser: 3,
  },
  retention: {
    rawSampleTtlMs: 6 * HOUR,
    sweepIntervalMs: 15 * MINUTE,
  },
};

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

/** Shallow-merges each policy section so tests can override one threshold. */
export function withPolicy(
  overrides: DeepPartial<LocationPolicy>,
): LocationPolicy {
  return {
    arrival: { ...defaultLocationPolicy.arrival, ...overrides.arrival },
    ingest: {
      ...defaultLocationPolicy.ingest,
      ...overrides.ingest,
      rateLimit: {
        ...defaultLocationPolicy.ingest.rateLimit,
        ...overrides.ingest?.rateLimit,
      },
    },
    presence: {
      ...defaultLocationPolicy.presence,
      ...overrides.presence,
      freshnessBucketsMs: {
        ...defaultLocationPolicy.presence.freshnessBucketsMs,
        ...overrides.presence?.freshnessBucketsMs,
      },
    },
    session: {
      ...defaultLocationPolicy.session,
      ...overrides.session,
      maxDurationMs: {
        ...defaultLocationPolicy.session.maxDurationMs,
        ...overrides.session?.maxDurationMs,
      },
    },
    retention: { ...defaultLocationPolicy.retention, ...overrides.retention },
  };
}

/** Fails fast on a policy that cannot behave sensibly. */
export function assertPolicyInvariants(policy: LocationPolicy): void {
  if (policy.presence.exitRadiusMeters <= policy.presence.enterRadiusMeters) {
    throw new Error(
      "presence.exitRadiusMeters must exceed enterRadiusMeters to provide hysteresis",
    );
  }
  if (policy.arrival.maxAccuracyMeters > policy.ingest.maxAccuracyMeters) {
    throw new Error(
      "arrival.maxAccuracyMeters cannot exceed ingest.maxAccuracyMeters; evidence would never be stored",
    );
  }
  if (policy.retention.rawSampleTtlMs < policy.ingest.maxSampleAgeMs) {
    throw new Error(
      "retention.rawSampleTtlMs must outlive ingest.maxSampleAgeMs or samples expire before they can be used",
    );
  }
}
