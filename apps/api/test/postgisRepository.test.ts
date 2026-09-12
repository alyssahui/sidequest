import { describe, expect, it } from "vitest";

import type { LocationSession } from "@sidequest/contracts/location";

import {
  PostgisLocationRepository,
  type SqlClient,
} from "../src/modules/location/postgisRepository";
import type { StoredSample } from "../src/modules/location/repository";

type Call = { text: string; params: readonly unknown[] };

/** Records the SQL issued so ordering and parameters can be asserted. */
function fakeSql(rowsFor: (text: string) => unknown[] = () => []) {
  const calls: Call[] = [];
  const client: SqlClient = {
    async query(text, params = []) {
      calls.push({ text, params });
      const rows = rowsFor(text);
      return { rows: rows as never[], rowCount: rows.length };
    },
  };
  return { client, calls };
}

const cmuTheCut = { latitude: 40.4433, longitude: -79.9436 };

const sample: StoredSample = {
  id: "sample-1",
  userId: "user-zuri",
  sessionId: "session-1",
  questInstanceId: "quest-1",
  partyId: "party-demo",
  sample: {
    coordinates: cmuTheCut,
    accuracyMeters: 12,
    recordedAt: "2026-09-11T18:00:00.000Z",
    source: "GPS",
  },
  receivedAt: "2026-09-11T18:00:01.000Z",
  idempotencyKey: "key-1",
};

describe("PostgisLocationRepository coordinate ordering", () => {
  it("writes ST_MakePoint longitude-first", async () => {
    const { client, calls } = fakeSql();
    await new PostgisLocationRepository(client).appendSample(sample);

    const insert = calls[0];
    expect(insert?.text).toContain("ST_MakePoint($6, $7)");

    // $6 is longitude and $7 is latitude. Getting this pair backwards is the
    // single most common PostGIS bug, and it stays silently valid at runtime.
    expect(insert?.params[5]).toBe(cmuTheCut.longitude);
    expect(insert?.params[6]).toBe(cmuTheCut.latitude);
  });

  it("reads ST_X back as longitude and ST_Y as latitude", async () => {
    const { client } = fakeSql((text) =>
      text.includes("SELECT")
        ? [
            {
              id: "sample-1",
              user_id: "user-zuri",
              session_id: "session-1",
              quest_instance_id: "quest-1",
              party_id: "party-demo",
              longitude: cmuTheCut.longitude,
              latitude: cmuTheCut.latitude,
              accuracy_meters: 12,
              altitude_meters: null,
              speed_mps: null,
              source: "GPS",
              recorded_at: "2026-09-11T18:00:00.000Z",
              received_at: "2026-09-11T18:00:01.000Z",
              idempotency_key: "key-1",
            },
          ]
        : [],
    );

    const stored = await new PostgisLocationRepository(
      client,
    ).latestSampleForUser("user-zuri");

    expect(stored?.sample.coordinates).toEqual(cmuTheCut);
  });

  it("stores the geography as SRID 4326", async () => {
    const { client, calls } = fakeSql();
    await new PostgisLocationRepository(client).appendSample(sample);

    expect(calls[0]?.text).toContain("ST_SetSRID");
    expect(calls[0]?.text).toContain("4326");
    expect(calls[0]?.text).toContain("::geography");
  });
});

describe("PostgisLocationRepository idempotency", () => {
  it("reports a first insert as new", async () => {
    const { client } = fakeSql((text) =>
      text.startsWith("INSERT INTO location_samples")
        ? [
            {
              id: "sample-1",
              user_id: "user-zuri",
              session_id: "session-1",
              quest_instance_id: null,
              party_id: null,
              longitude: cmuTheCut.longitude,
              latitude: cmuTheCut.latitude,
              accuracy_meters: 12,
              altitude_meters: null,
              speed_mps: null,
              source: "GPS",
              recorded_at: "2026-09-11T18:00:00.000Z",
              received_at: "2026-09-11T18:00:01.000Z",
              idempotency_key: "key-1",
            },
          ]
        : [],
    );

    const result = await new PostgisLocationRepository(client).appendSample(
      sample,
    );
    expect(result.duplicate).toBe(false);
  });

  it("reports a conflicting insert as a duplicate and returns the original", async () => {
    // INSERT ... ON CONFLICT DO NOTHING returns no rows; the follow-up SELECT
    // finds the row that is already there.
    const { client, calls } = fakeSql((text) =>
      text.startsWith("SELECT")
        ? [
            {
              id: "sample-original",
              user_id: "user-zuri",
              session_id: "session-1",
              quest_instance_id: null,
              party_id: null,
              longitude: cmuTheCut.longitude,
              latitude: cmuTheCut.latitude,
              accuracy_meters: 12,
              altitude_meters: null,
              speed_mps: null,
              source: "GPS",
              recorded_at: "2026-09-11T18:00:00.000Z",
              received_at: "2026-09-11T18:00:01.000Z",
              idempotency_key: "key-1",
            },
          ]
        : [],
    );

    const result = await new PostgisLocationRepository(client).appendSample(
      sample,
    );

    expect(calls[0]?.text).toContain("ON CONFLICT (user_id, idempotency_key)");
    expect(result.duplicate).toBe(true);
    expect(result.record.id).toBe("sample-original");
  });
});

describe("PostgisLocationRepository presence query", () => {
  it("enforces consent and the injected clock in SQL", async () => {
    const { client, calls } = fakeSql();

    await new PostgisLocationRepository(client).latestSamplesForParty(
      "party-demo",
      "2026-09-11T17:45:00.000Z",
      "2026-09-11T18:00:00.000Z",
    );

    const text = calls[0]?.text ?? "";
    expect(text).toContain("DISTINCT ON (s.user_id)");
    expect(text).toContain("sess.status = 'ACTIVE'");
    expect(text).toContain("COALESCE(p.sharing_enabled, true)");
    expect(text).toContain("COALESCE(p.share_party_presence, true)");

    // Expiry compares against the passed instant, not the database's now().
    expect(text).toContain("sess.expires_at > $3");
    expect(text).not.toContain("expires_at > now()");
    expect(calls[0]?.params[2]).toBe("2026-09-11T18:00:00.000Z");
  });
});

describe("PostgisLocationRepository sessions", () => {
  const session: LocationSession = {
    id: "session-1",
    userId: "user-zuri",
    purpose: "ACTIVE_QUEST",
    mode: "FOREGROUND",
    status: "ACTIVE",
    questInstanceId: "quest-1",
    startedAt: "2026-09-11T18:00:00.000Z",
    expiresAt: "2026-09-11T18:45:00.000Z",
  };

  it("writes nulls rather than undefined for absent ids", async () => {
    const { client, calls } = fakeSql();
    await new PostgisLocationRepository(client).createSession(session);

    // party_id is the seventh parameter and must be an explicit null.
    expect(calls[0]?.params[6]).toBeNull();
    expect(calls[0]?.params).not.toContain(undefined);
  });

  it("omits optional fields when reading a session back", async () => {
    const { client } = fakeSql(() => [
      {
        id: "session-1",
        user_id: "user-zuri",
        purpose: "ACTIVE_QUEST",
        mode: "FOREGROUND",
        status: "ACTIVE",
        quest_instance_id: "quest-1",
        party_id: null,
        started_at: "2026-09-11T18:00:00.000Z",
        expires_at: "2026-09-11T18:45:00.000Z",
        paused_at: null,
        ended_at: null,
      },
    ]);

    const loaded = await new PostgisLocationRepository(client).getSession(
      "session-1",
    );

    expect(loaded).toEqual(session);
    expect(loaded).not.toHaveProperty("partyId");
    expect(loaded).not.toHaveProperty("pausedAt");
  });
});
