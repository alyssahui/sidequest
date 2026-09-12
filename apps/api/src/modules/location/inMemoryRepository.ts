import type {
  LocationSession,
  LocationSharingPreference,
} from "@sidequest/contracts/location";
import { settleSession } from "@sidequest/location";

import {
  defaultSharingPreference,
  type AppendSampleResult,
  type LocationRepository,
  type PresenceCandidate,
  type StoredSample,
} from "./repository";

/**
 * Demo and test store.
 *
 * This is the default implementation: the API runs with no DATABASE_URL, which
 * is what keeps the whole feature demonstrable without credentials. It holds
 * the same invariants the PostGIS repository does, so the API tests exercise
 * real behaviour rather than a stub.
 */
export class InMemoryLocationRepository implements LocationRepository {
  readonly #sessions = new Map<string, LocationSession>();
  readonly #samples: StoredSample[] = [];
  readonly #idempotency = new Map<string, string>();
  readonly #preferences = new Map<string, LocationSharingPreference>();

  async createSession(session: LocationSession) {
    this.#sessions.set(session.id, session);
    return session;
  }

  async getSession(sessionId: string) {
    return this.#sessions.get(sessionId);
  }

  async saveSession(session: LocationSession) {
    this.#sessions.set(session.id, session);
    return session;
  }

  async listSessionsForUser(userId: string) {
    return [...this.#sessions.values()].filter(
      (session) => session.userId === userId,
    );
  }

  async listSessionsForParty(partyId: string) {
    return [...this.#sessions.values()].filter(
      (session) => session.partyId === partyId,
    );
  }

  async appendSample(record: StoredSample): Promise<AppendSampleResult> {
    if (record.idempotencyKey) {
      const key = `${record.userId}:${record.idempotencyKey}`;
      const existingId = this.#idempotency.get(key);
      if (existingId) {
        const existing = this.#samples.find(
          (sample) => sample.id === existingId,
        );
        // The original result is returned so a client retry is a no-op rather
        // than a second point on the trace.
        if (existing) return { record: existing, duplicate: true };
      }
      this.#idempotency.set(key, record.id);
    }

    this.#samples.push(record);
    return { record, duplicate: false };
  }

  async latestSampleForUser(
    userId: string,
    filter: { questInstanceId?: string; sessionId?: string } = {},
  ) {
    let latest: StoredSample | undefined;

    for (const stored of this.#samples) {
      if (stored.userId !== userId) continue;
      if (filter.sessionId && stored.sessionId !== filter.sessionId) continue;
      if (
        filter.questInstanceId &&
        stored.questInstanceId !== filter.questInstanceId
      ) {
        continue;
      }
      if (
        !latest ||
        Date.parse(stored.sample.recordedAt) >=
          Date.parse(latest.sample.recordedAt)
      ) {
        latest = stored;
      }
    }

    return latest;
  }

  async latestSamplesForParty(
    partyId: string,
    notBefore: string,
    now: string,
  ): Promise<readonly PresenceCandidate[]> {
    const cutoff = Date.parse(notBefore);
    const nowMs = Date.parse(now);

    // Only users with a live, unpaused, presence-sharing session contribute.
    // Consent is re-checked here rather than assumed from the stored sample.
    const sharingUserIds = new Map<string, boolean>();
    for (const session of this.#sessions.values()) {
      if (session.partyId !== partyId) continue;
      const settled = settleSession(session, nowMs);
      if (settled.status !== "ACTIVE") continue;
      const preference =
        this.#preferences.get(settled.userId) ?? defaultSharingPreference;
      if (!preference.sharingEnabled || !preference.sharePartyPresence)
        continue;
      sharingUserIds.set(settled.userId, true);
    }

    const latest = new Map<string, PresenceCandidate>();
    for (const stored of this.#samples) {
      if (!sharingUserIds.has(stored.userId)) continue;
      if (stored.partyId !== partyId) continue;
      if (Date.parse(stored.sample.recordedAt) < cutoff) continue;

      const existing = latest.get(stored.userId);
      if (
        !existing ||
        Date.parse(stored.sample.recordedAt) >=
          Date.parse(existing.sample.recordedAt)
      ) {
        latest.set(stored.userId, {
          userId: stored.userId,
          sample: stored.sample,
          sharing: true,
        });
      }
    }

    return [...latest.values()];
  }

  async countSamplesForUser(userId: string) {
    return this.#samples.filter((sample) => sample.userId === userId).length;
  }

  async oldestSampleAtForUser(userId: string) {
    const owned = this.#samples.filter((sample) => sample.userId === userId);
    if (owned.length === 0) return null;
    return owned.reduce(
      (oldest, sample) =>
        Date.parse(sample.sample.recordedAt) < Date.parse(oldest)
          ? sample.sample.recordedAt
          : oldest,
      owned[0]!.sample.recordedAt,
    );
  }

  async deleteSamplesForUser(userId: string) {
    return this.#removeWhere((sample) => sample.userId === userId);
  }

  async deleteSamplesOlderThan(cutoff: string) {
    const cutoffMs = Date.parse(cutoff);
    return this.#removeWhere(
      (stored) => Date.parse(stored.sample.recordedAt) < cutoffMs,
    );
  }

  #removeWhere(predicate: (sample: StoredSample) => boolean) {
    let removed = 0;
    for (let index = this.#samples.length - 1; index >= 0; index -= 1) {
      const stored = this.#samples[index];
      if (!stored || !predicate(stored)) continue;
      this.#samples.splice(index, 1);
      removed += 1;
      if (stored.idempotencyKey) {
        this.#idempotency.delete(`${stored.userId}:${stored.idempotencyKey}`);
      }
    }
    return removed;
  }

  async getSharingPreference(userId: string) {
    return this.#preferences.get(userId) ?? defaultSharingPreference;
  }

  async saveSharingPreference(
    userId: string,
    preference: LocationSharingPreference,
  ) {
    this.#preferences.set(userId, preference);
    return preference;
  }
}
