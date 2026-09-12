-- SideQuest location module — initial schema.
--
-- Feature-prefixed and timestamped so parallel feature branches do not compete
-- for a generic sequence number. If the chosen migration runner keeps a shared
-- journal, the integration branch regenerates it; this file is the source.
--
-- Forward-only. Raw samples are transient working data with a short retention
-- window (see location_samples.recorded_at and the retention sweep); derived
-- verification results are owned by the quest module and outlive them.

CREATE EXTENSION IF NOT EXISTS postgis;

-- Consent is always scoped and time-boxed: there is no open-ended session.
CREATE TABLE IF NOT EXISTS location_sessions (
  id                  uuid PRIMARY KEY,
  user_id             uuid NOT NULL,
  purpose             text NOT NULL
                        CHECK (purpose IN ('ACTIVE_QUEST', 'PARTY_SESSION')),
  mode                text NOT NULL
                        CHECK (mode IN ('FOREGROUND', 'BACKGROUND')),
  status              text NOT NULL
                        CHECK (status IN ('ACTIVE', 'PAUSED', 'EXPIRED', 'STOPPED')),
  quest_instance_id   uuid,
  party_id            uuid,
  started_at          timestamptz NOT NULL,
  expires_at          timestamptz NOT NULL,
  paused_at           timestamptz,
  ended_at            timestamptz,

  CONSTRAINT location_sessions_expiry_after_start
    CHECK (expires_at > started_at),
  -- An active-quest session must say which quest it is for, and a party
  -- session which party, so a session can never collect location for an
  -- unnamed purpose.
  CONSTRAINT location_sessions_purpose_target
    CHECK (
      (purpose = 'ACTIVE_QUEST'  AND quest_instance_id IS NOT NULL)
      OR
      (purpose = 'PARTY_SESSION' AND party_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS location_sessions_user_active_idx
  ON location_sessions (user_id, status, expires_at);

CREATE INDEX IF NOT EXISTS location_sessions_party_idx
  ON location_sessions (party_id, status)
  WHERE party_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS location_sessions_quest_idx
  ON location_sessions (quest_instance_id)
  WHERE quest_instance_id IS NOT NULL;

-- Raw positional samples. Short-lived by design.
CREATE TABLE IF NOT EXISTS location_samples (
  id                  uuid PRIMARY KEY,
  user_id             uuid NOT NULL,
  session_id          uuid NOT NULL
                        REFERENCES location_sessions (id) ON DELETE CASCADE,
  quest_instance_id   uuid,
  party_id            uuid,
  -- geography, not geometry: ST_DWithin then answers in real meters and the
  -- antimeridian is the database's problem rather than ours.
  position            geography(Point, 4326) NOT NULL,
  accuracy_meters     double precision NOT NULL CHECK (accuracy_meters >= 0),
  altitude_meters     double precision,
  speed_mps           double precision,
  source              text NOT NULL
                        CHECK (source IN ('GPS', 'FUSED', 'NETWORK', 'SIMULATED', 'MANUAL')),
  recorded_at         timestamptz NOT NULL,
  received_at         timestamptz NOT NULL DEFAULT now(),
  idempotency_key     text
);

-- Makes a client retry a no-op rather than a second point on the trace.
-- NULLS NOT DISTINCT is deliberately NOT used: samples without a key are
-- independent readings, not duplicates of one another.
CREATE UNIQUE INDEX IF NOT EXISTS location_samples_idempotency_idx
  ON location_samples (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Serves both "latest fix for this user" and the per-quest evidence lookup.
CREATE INDEX IF NOT EXISTS location_samples_user_recorded_idx
  ON location_samples (user_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS location_samples_quest_idx
  ON location_samples (quest_instance_id, recorded_at DESC)
  WHERE quest_instance_id IS NOT NULL;

-- Presence clustering: latest row per user within a party.
CREATE INDEX IF NOT EXISTS location_samples_party_recorded_idx
  ON location_samples (party_id, user_id, recorded_at DESC)
  WHERE party_id IS NOT NULL;

-- Spatial index for radius queries (nearby quests, proximity grouping).
CREATE INDEX IF NOT EXISTS location_samples_position_idx
  ON location_samples USING GIST (position);

-- Drives the retention sweep.
CREATE INDEX IF NOT EXISTS location_samples_recorded_at_idx
  ON location_samples (recorded_at);

-- Per-user privacy controls. Absent row means the documented defaults.
CREATE TABLE IF NOT EXISTS location_sharing_preferences (
  user_id                        uuid PRIMARY KEY,
  sharing_enabled                boolean NOT NULL DEFAULT true,
  share_party_presence           boolean NOT NULL DEFAULT true,
  -- Background collection is opt-in. The app stays useful without it.
  allow_background_during_quest  boolean NOT NULL DEFAULT false,
  default_session_duration_ms    bigint NOT NULL DEFAULT 2700000
                                   CHECK (default_session_duration_ms > 0),
  updated_at                     timestamptz NOT NULL DEFAULT now()
);
