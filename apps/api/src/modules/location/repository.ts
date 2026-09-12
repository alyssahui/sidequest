import type {
  LocationSample,
  LocationSession,
  LocationSharingPreference,
} from "@sidequest/contracts/location";

/**
 * A raw sample as stored. `id` is opaque; nothing outside this module reads
 * `sample.coordinates` except the evaluation code, and nothing ever returns it
 * to a client other than the user who produced it.
 */
export type StoredSample = {
  id: string;
  userId: string;
  sessionId: string;
  questInstanceId?: string;
  partyId?: string;
  sample: LocationSample;
  receivedAt: string;
  /** Set when the client supplied one, used to make ingest idempotent. */
  idempotencyKey?: string;
};

export type AppendSampleResult = {
  record: StoredSample;
  /** True when an identical idempotency key had already been stored. */
  duplicate: boolean;
};

export type PresenceCandidate = {
  userId: string;
  sample: LocationSample;
  sharing: boolean;
};

/**
 * Persistence boundary for the location module.
 *
 * Deliberately narrow: no other module may implement or import this, and it
 * exposes no way to list another user's raw samples. Proximity is answered by
 * the store itself so coordinates never have to travel to the caller.
 */
export interface LocationRepository {
  createSession(session: LocationSession): Promise<LocationSession>;
  getSession(sessionId: string): Promise<LocationSession | undefined>;
  saveSession(session: LocationSession): Promise<LocationSession>;
  listSessionsForUser(userId: string): Promise<readonly LocationSession[]>;
  listSessionsForParty(partyId: string): Promise<readonly LocationSession[]>;

  appendSample(record: StoredSample): Promise<AppendSampleResult>;
  latestSampleForUser(
    userId: string,
    filter?: { questInstanceId?: string; sessionId?: string },
  ): Promise<StoredSample | undefined>;

  /**
   * Most recent sample per user recorded at or after `notBefore`, for presence
   * clustering. Implementations must exclude users whose session is not active
   * at `now` or who have turned presence sharing off.
   *
   * `now` is passed in rather than read from the system clock so session expiry
   * is evaluated against the service's injected clock — otherwise a store would
   * silently disagree with the rest of the module about what is still active.
   */
  latestSamplesForParty(
    partyId: string,
    notBefore: string,
    now: string,
  ): Promise<readonly PresenceCandidate[]>;

  countSamplesForUser(userId: string): Promise<number>;
  oldestSampleAtForUser(userId: string): Promise<string | null>;

  deleteSamplesForUser(userId: string): Promise<number>;
  deleteSamplesOlderThan(cutoff: string): Promise<number>;

  getSharingPreference(userId: string): Promise<LocationSharingPreference>;
  saveSharingPreference(
    userId: string,
    preference: LocationSharingPreference,
  ): Promise<LocationSharingPreference>;
}

export const defaultSharingPreference: LocationSharingPreference = {
  sharingEnabled: true,
  sharePartyPresence: true,
  // Off by default: background collection is opt-in per the privacy contract,
  // and the app stays useful without it.
  allowBackgroundDuringQuest: false,
  defaultSessionDurationMs: 45 * 60_000,
};
