import type {
  LocationSample,
  LocationSession,
  LocationSessionMode,
  LocationSessionPurpose,
  LocationSessionStatus,
  LocationSharingPreference,
} from "@sidequest/contracts/location";
import { fromPostGisPoint, toPostGisPoint } from "@sidequest/location";

import {
  defaultSharingPreference,
  type AppendSampleResult,
  type LocationRepository,
  type PresenceCandidate,
  type StoredSample,
} from "./repository";

/**
 * The narrowest possible database surface.
 *
 * Taking a `query` function rather than a `pg.Pool` keeps this file free of a
 * driver dependency, lets the API ship without `pg` installed, and makes the
 * SQL unit-testable against a fake client.
 */
export interface SqlClient {
  query<TRow = Record<string, unknown>>(
    text: string,
    params?: readonly unknown[],
  ): Promise<{ rows: TRow[]; rowCount: number }>;
}

type SessionRow = {
  id: string;
  user_id: string;
  purpose: LocationSessionPurpose;
  mode: LocationSessionMode;
  status: LocationSessionStatus;
  quest_instance_id: string | null;
  party_id: string | null;
  started_at: Date | string;
  expires_at: Date | string;
  paused_at: Date | string | null;
  ended_at: Date | string | null;
};

type SampleRow = {
  id: string;
  user_id: string;
  session_id: string;
  quest_instance_id: string | null;
  party_id: string | null;
  longitude: number;
  latitude: number;
  accuracy_meters: number;
  altitude_meters: number | null;
  speed_mps: number | null;
  source: LocationSample["source"];
  recorded_at: Date | string;
  received_at: Date | string;
  idempotency_key: string | null;
};

const iso = (value: Date | string) =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

function toSession(row: SessionRow): LocationSession {
  const session: LocationSession = {
    id: row.id,
    userId: row.user_id,
    purpose: row.purpose,
    mode: row.mode,
    status: row.status,
    startedAt: iso(row.started_at),
    expiresAt: iso(row.expires_at),
  };
  if (row.quest_instance_id) session.questInstanceId = row.quest_instance_id;
  if (row.party_id) session.partyId = row.party_id;
  if (row.paused_at) session.pausedAt = iso(row.paused_at);
  if (row.ended_at) session.endedAt = iso(row.ended_at);
  return session;
}

function toStoredSample(row: SampleRow): StoredSample {
  // Read back through the converter so the longitude-first database ordering is
  // undone in exactly one place.
  const sample: LocationSample = {
    coordinates: fromPostGisPoint([row.longitude, row.latitude]),
    accuracyMeters: Number(row.accuracy_meters),
    recordedAt: iso(row.recorded_at),
    source: row.source,
    sessionId: row.session_id,
  };
  if (row.altitude_meters !== null)
    sample.altitudeMeters = Number(row.altitude_meters);
  if (row.speed_mps !== null) sample.speedMps = Number(row.speed_mps);
  if (row.quest_instance_id) sample.questInstanceId = row.quest_instance_id;

  const stored: StoredSample = {
    id: row.id,
    userId: row.user_id,
    sessionId: row.session_id,
    sample,
    receivedAt: iso(row.received_at),
  };
  if (row.quest_instance_id) stored.questInstanceId = row.quest_instance_id;
  if (row.party_id) stored.partyId = row.party_id;
  if (row.idempotency_key) stored.idempotencyKey = row.idempotency_key;
  return stored;
}

/**
 * PostGIS-backed store, used when DATABASE_URL is configured.
 *
 * Geography (not geometry) columns are used so `ST_DWithin` returns real meters
 * and the antimeridian is handled by the database rather than by hand.
 */
export class PostgisLocationRepository implements LocationRepository {
  readonly #sql: SqlClient;

  constructor(sql: SqlClient) {
    this.#sql = sql;
  }

  async createSession(session: LocationSession) {
    await this.#sql.query(
      `INSERT INTO location_sessions
         (id, user_id, purpose, mode, status, quest_instance_id, party_id,
          started_at, expires_at, paused_at, ended_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        session.id,
        session.userId,
        session.purpose,
        session.mode,
        session.status,
        session.questInstanceId ?? null,
        session.partyId ?? null,
        session.startedAt,
        session.expiresAt,
        session.pausedAt ?? null,
        session.endedAt ?? null,
      ],
    );
    return session;
  }

  async getSession(sessionId: string) {
    const { rows } = await this.#sql.query<SessionRow>(
      `SELECT * FROM location_sessions WHERE id = $1`,
      [sessionId],
    );
    const row = rows[0];
    return row ? toSession(row) : undefined;
  }

  async saveSession(session: LocationSession) {
    await this.#sql.query(
      `UPDATE location_sessions
          SET status = $2, paused_at = $3, ended_at = $4
        WHERE id = $1`,
      [
        session.id,
        session.status,
        session.pausedAt ?? null,
        session.endedAt ?? null,
      ],
    );
    return session;
  }

  async listSessionsForUser(userId: string) {
    const { rows } = await this.#sql.query<SessionRow>(
      `SELECT * FROM location_sessions WHERE user_id = $1 ORDER BY started_at DESC`,
      [userId],
    );
    return rows.map(toSession);
  }

  async listSessionsForParty(partyId: string) {
    const { rows } = await this.#sql.query<SessionRow>(
      `SELECT * FROM location_sessions WHERE party_id = $1 ORDER BY started_at DESC`,
      [partyId],
    );
    return rows.map(toSession);
  }

  async appendSample(record: StoredSample): Promise<AppendSampleResult> {
    const point = toPostGisPoint(record.sample.coordinates);

    // ON CONFLICT DO NOTHING plus a follow-up read makes ingest idempotent
    // inside the database rather than in a racy read-then-write.
    const { rows } = await this.#sql.query<SampleRow>(
      `INSERT INTO location_samples
         (id, user_id, session_id, quest_instance_id, party_id, position,
          accuracy_meters, altitude_meters, speed_mps, source, recorded_at,
          received_at, idempotency_key)
       VALUES ($1, $2, $3, $4, $5,
               ST_SetSRID(ST_MakePoint($6, $7), 4326)::geography,
               $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (user_id, idempotency_key) DO NOTHING
       RETURNING id, user_id, session_id, quest_instance_id, party_id,
                 ST_X(position::geometry) AS longitude,
                 ST_Y(position::geometry) AS latitude,
                 accuracy_meters, altitude_meters, speed_mps, source,
                 recorded_at, received_at, idempotency_key`,
      [
        record.id,
        record.userId,
        record.sessionId,
        record.questInstanceId ?? null,
        record.partyId ?? null,
        point[0],
        point[1],
        record.sample.accuracyMeters,
        record.sample.altitudeMeters ?? null,
        record.sample.speedMps ?? null,
        record.sample.source,
        record.sample.recordedAt,
        record.receivedAt,
        record.idempotencyKey ?? null,
      ],
    );

    const inserted = rows[0];
    if (inserted) return { record: toStoredSample(inserted), duplicate: false };

    const { rows: existing } = await this.#sql.query<SampleRow>(
      `SELECT id, user_id, session_id, quest_instance_id, party_id,
              ST_X(position::geometry) AS longitude,
              ST_Y(position::geometry) AS latitude,
              accuracy_meters, altitude_meters, speed_mps, source,
              recorded_at, received_at, idempotency_key
         FROM location_samples
        WHERE user_id = $1 AND idempotency_key = $2`,
      [record.userId, record.idempotencyKey ?? null],
    );

    const previous = existing[0];
    return previous
      ? { record: toStoredSample(previous), duplicate: true }
      : { record, duplicate: false };
  }

  async latestSampleForUser(
    userId: string,
    filter: { questInstanceId?: string; sessionId?: string } = {},
  ) {
    const { rows } = await this.#sql.query<SampleRow>(
      `SELECT id, user_id, session_id, quest_instance_id, party_id,
              ST_X(position::geometry) AS longitude,
              ST_Y(position::geometry) AS latitude,
              accuracy_meters, altitude_meters, speed_mps, source,
              recorded_at, received_at, idempotency_key
         FROM location_samples
        WHERE user_id = $1
          AND ($2::uuid IS NULL OR quest_instance_id = $2)
          AND ($3::uuid IS NULL OR session_id = $3)
        ORDER BY recorded_at DESC
        LIMIT 1`,
      [userId, filter.questInstanceId ?? null, filter.sessionId ?? null],
    );

    const row = rows[0];
    return row ? toStoredSample(row) : undefined;
  }

  /**
   * Latest sample per sharing member.
   *
   * DISTINCT ON is the cheap Postgres idiom for "most recent row per user", and
   * the join onto active sessions enforces consent in the query rather than
   * relying on the caller to filter afterwards.
   */
  async latestSamplesForParty(
    partyId: string,
    notBefore: string,
    now: string,
  ): Promise<readonly PresenceCandidate[]> {
    const { rows } = await this.#sql.query<SampleRow>(
      `SELECT DISTINCT ON (s.user_id)
              s.id, s.user_id, s.session_id, s.quest_instance_id, s.party_id,
              ST_X(s.position::geometry) AS longitude,
              ST_Y(s.position::geometry) AS latitude,
              s.accuracy_meters, s.altitude_meters, s.speed_mps, s.source,
              s.recorded_at, s.received_at, s.idempotency_key
         FROM location_samples s
         JOIN location_sessions sess ON sess.id = s.session_id
         LEFT JOIN location_sharing_preferences p ON p.user_id = s.user_id
        WHERE s.party_id = $1
          AND s.recorded_at >= $2
          AND sess.status = 'ACTIVE'
          AND sess.expires_at > $3
          AND COALESCE(p.sharing_enabled, true)
          AND COALESCE(p.share_party_presence, true)
        ORDER BY s.user_id, s.recorded_at DESC`,
      [partyId, notBefore, now],
    );

    return rows.map((row) => ({
      userId: row.user_id,
      sample: toStoredSample(row).sample,
      sharing: true,
    }));
  }

  async countSamplesForUser(userId: string) {
    const { rows } = await this.#sql.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM location_samples WHERE user_id = $1`,
      [userId],
    );
    return Number(rows[0]?.count ?? 0);
  }

  async oldestSampleAtForUser(userId: string) {
    const { rows } = await this.#sql.query<{
      recorded_at: Date | string | null;
    }>(
      `SELECT MIN(recorded_at) AS recorded_at FROM location_samples WHERE user_id = $1`,
      [userId],
    );
    const value = rows[0]?.recorded_at;
    return value ? iso(value) : null;
  }

  async deleteSamplesForUser(userId: string) {
    const result = await this.#sql.query(
      `DELETE FROM location_samples WHERE user_id = $1`,
      [userId],
    );
    return result.rowCount;
  }

  async deleteSamplesOlderThan(cutoff: string) {
    const result = await this.#sql.query(
      `DELETE FROM location_samples WHERE recorded_at < $1`,
      [cutoff],
    );
    return result.rowCount;
  }

  async getSharingPreference(
    userId: string,
  ): Promise<LocationSharingPreference> {
    const { rows } = await this.#sql.query<{
      sharing_enabled: boolean;
      share_party_presence: boolean;
      allow_background_during_quest: boolean;
      default_session_duration_ms: string | number;
    }>(
      `SELECT sharing_enabled, share_party_presence,
              allow_background_during_quest, default_session_duration_ms
         FROM location_sharing_preferences
        WHERE user_id = $1`,
      [userId],
    );

    const row = rows[0];
    if (!row) return defaultSharingPreference;

    return {
      sharingEnabled: row.sharing_enabled,
      sharePartyPresence: row.share_party_presence,
      allowBackgroundDuringQuest: row.allow_background_during_quest,
      defaultSessionDurationMs: Number(row.default_session_duration_ms),
    };
  }

  async saveSharingPreference(
    userId: string,
    preference: LocationSharingPreference,
  ) {
    await this.#sql.query(
      `INSERT INTO location_sharing_preferences
         (user_id, sharing_enabled, share_party_presence,
          allow_background_during_quest, default_session_duration_ms)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE
          SET sharing_enabled = EXCLUDED.sharing_enabled,
              share_party_presence = EXCLUDED.share_party_presence,
              allow_background_during_quest = EXCLUDED.allow_background_during_quest,
              default_session_duration_ms = EXCLUDED.default_session_duration_ms`,
      [
        userId,
        preference.sharingEnabled,
        preference.sharePartyPresence,
        preference.allowBackgroundDuringQuest,
        preference.defaultSessionDurationMs,
      ],
    );
    return preference;
  }
}
