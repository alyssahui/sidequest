import type {
  LocationSample,
  PartyMemberPresence,
  PartyPresenceChangedPayload,
  PartyPresenceSnapshot,
  PresenceFreshness,
} from "@sidequest/contracts/location";

import type { CoarseAreaResolver } from "./area";
import { clusterAreaLabel } from "./area";
import { distanceMeters } from "./geometry";
import type { PresencePolicy } from "./policy";
import { parseInstant } from "./samples";

/** One member's most recent sample, as known to the server only. */
export type MemberObservation = {
  userId: string;
  sample: LocationSample;
  /** False when the member has paused sharing; they are excluded entirely. */
  sharing?: boolean;
};

export type PresenceState = {
  /** The set most recently published as a presence change. */
  publishedUserIds: readonly string[];
  /** Candidate set waiting out the debounce window. */
  pendingUserIds?: readonly string[];
  pendingSince?: number;
  lastPublishedAt?: number;
};

export const initialPresenceState: PresenceState = { publishedUserIds: [] };

export function freshnessFor(
  ageMs: number,
  policy: PresencePolicy,
): PresenceFreshness {
  const buckets = policy.freshnessBucketsMs;
  if (ageMs <= buckets.LIVE) return "LIVE";
  if (ageMs <= buckets.RECENT) return "RECENT";
  if (ageMs <= buckets.STALE) return "STALE";
  return "OFFLINE";
}

export type DerivePresenceInput = {
  partyId: string;
  /** The member whose view is being built; the cluster is measured from them. */
  selfUserId: string;
  observations: readonly MemberObservation[];
  now: number;
  policy: PresencePolicy;
  areaResolver: CoarseAreaResolver;
  /** The set currently treated as nearby, which drives hysteresis. */
  previouslyNearbyUserIds?: readonly string[];
};

/**
 * Builds the coarse view one party member is allowed to have of the others.
 *
 * Two properties matter more than anything else here:
 *
 * 1. The returned snapshot has no coordinates anywhere in it. Distances are
 *    computed server-side and collapsed to a boolean plus an area label.
 * 2. Membership uses hysteresis. A member joins the cluster inside
 *    `enterRadiusMeters` but only leaves it beyond `exitRadiusMeters`, so
 *    someone sitting on the boundary does not toggle on every fix.
 */
export function derivePartyPresence({
  partyId,
  selfUserId,
  observations,
  now,
  policy,
  areaResolver,
  previouslyNearbyUserIds = [],
}: DerivePresenceInput): PartyPresenceSnapshot {
  const previouslyNearby = new Set(previouslyNearbyUserIds);
  const self = observations.find(
    (observation) => observation.userId === selfUserId,
  );

  const selfUsable =
    self !== undefined &&
    self.sharing !== false &&
    now - parseInstant(self.sample.recordedAt) <= policy.maxPresenceAgeMs;

  const members: PartyMemberPresence[] = [];
  const nearbyUserIds: string[] = [];
  const nearbyAreas: { id: string; label: string }[] = [];

  for (const observation of observations) {
    if (observation.sharing === false) continue;

    const recordedAt = parseInstant(observation.sample.recordedAt);
    if (Number.isNaN(recordedAt)) continue;

    const ageMs = Math.max(0, now - recordedAt);
    if (ageMs > policy.maxPresenceAgeMs) continue;

    const area = areaResolver.resolve(observation.sample.coordinates);
    const isSelf = observation.userId === selfUserId;

    let nearSelf = false;
    if (!isSelf && selfUsable && self) {
      const separation = distanceMeters(
        self.sample.coordinates,
        observation.sample.coordinates,
      );
      // Accuracy is added to the separation so a pair of imprecise fixes is not
      // counted as "together" purely because both are uncertain.
      const conservative =
        separation -
        Math.min(
          self.sample.accuracyMeters + observation.sample.accuracyMeters,
          policy.enterRadiusMeters / 2,
        );
      const threshold = previouslyNearby.has(observation.userId)
        ? policy.exitRadiusMeters
        : policy.enterRadiusMeters;
      nearSelf = conservative <= threshold;
    }

    if (nearSelf) {
      nearbyUserIds.push(observation.userId);
      nearbyAreas.push(area);
    }

    members.push({
      userId: observation.userId,
      areaId: area.id,
      areaLabel: area.label,
      freshness: freshnessFor(ageMs, policy),
      // Minute granularity: exact seconds would let a watcher time movements.
      ageMinutes: Math.floor(ageMs / 60_000),
      nearSelf,
    });
  }

  nearbyUserIds.sort();

  return {
    partyId,
    observedAt: new Date(now).toISOString(),
    members,
    nearbyUserIds,
    nearbyCount: nearbyUserIds.length,
    clusterAreaLabel: clusterAreaLabel(nearbyAreas),
  };
}

export type PresenceTransition = {
  state: PresenceState;
  /** Present only when the debounced set actually changed. */
  change?: PartyPresenceChangedPayload;
};

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

/**
 * Debounces presence changes.
 *
 * A candidate set must hold steady for `debounceMs` before it is published. Any
 * flip back to the published set cancels the pending change outright, so a
 * member walking in and out of range produces no events at all rather than a
 * pair of them.
 */
export function reducePresence(
  state: PresenceState,
  input: {
    partyId: string;
    candidateUserIds: readonly string[];
    clusterAreaLabel?: string;
    now: number;
    policy: Pick<PresencePolicy, "debounceMs">;
  },
): PresenceTransition {
  const candidate = [...input.candidateUserIds].sort();

  if (sameSet(candidate, state.publishedUserIds)) {
    // Settled back to what everyone already believes: drop any pending change.
    return {
      state: {
        publishedUserIds: state.publishedUserIds,
        lastPublishedAt: state.lastPublishedAt,
      },
    };
  }

  if (!state.pendingUserIds || !sameSet(candidate, state.pendingUserIds)) {
    return {
      state: {
        ...state,
        pendingUserIds: candidate,
        pendingSince: input.now,
      },
    };
  }

  const heldForMs = input.now - (state.pendingSince ?? input.now);
  if (heldForMs < input.policy.debounceMs) {
    return { state };
  }

  const published = new Set(state.publishedUserIds);
  const nextSet = new Set(candidate);

  return {
    state: {
      publishedUserIds: candidate,
      lastPublishedAt: input.now,
    },
    change: {
      partyId: input.partyId,
      nearbyUserIds: candidate,
      nearbyCount: candidate.length,
      clusterAreaLabel: input.clusterAreaLabel,
      joinedUserIds: candidate.filter((userId) => !published.has(userId)),
      departedUserIds: state.publishedUserIds.filter(
        (userId) => !nextSet.has(userId),
      ),
    },
  };
}
