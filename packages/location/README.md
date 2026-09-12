# SideQuest location, proximity, and GPS verification

This document covers the whole location stack: the domain package, the API
module, the mobile feature, privacy and retention, and how to test it on a real
device.

Owned files:

```text
packages/location/                        domain logic (framework-free)
packages/contracts/src/location.ts        cross-process types
apps/api/src/modules/location/            routes, services, storage, migration
apps/mobile/src/features/location/        providers, map, permission and privacy UI
```

## Start here

Nothing below needs a credential. The app and API run with deterministic demo
adapters, an in-memory store, a scripted location simulator, and a projected
game-world map.

```bash
corepack pnpm install
corepack pnpm dev:api      # Fastify on :3000, in-memory location store
corepack pnpm dev          # Expo; MAP tab is the location feature
corepack pnpm check        # format, typecheck, all tests
```

To force the simulator on a real device (useful for demoing indoors):

```bash
EXPO_PUBLIC_LOCATION_PROVIDER=SIMULATED corepack pnpm dev
```

## Privacy invariants

These are enforced in code and asserted in tests, not just documented.

- **Peer coordinates never leave the server.** `PartyPresenceSnapshot` and
  `PartyMemberPresence` have no coordinate field at any depth, and
  `assertNoCoordinates` runs over both the presence response and every
  `location.party_presence_changed` event before it is published.
- **Coordinates never reach logs.** Everything that describes a sample goes
  through `redactSample`, which drops the position and buckets accuracy. The
  audit sink is typed to accept only redacted payloads.
- **Consent is always scoped and time-boxed.** There is no open-ended session.
  A session names its purpose and its quest or party, and carries an
  `expiresAt` that is clamped to the policy maximum server-side.
- **Background is a second, separate consent.** It is off by default. A client
  asking for `BACKGROUND` without the preference set is silently downgraded to
  foreground rather than refused, because the quest still works that way.
- **Nothing keeps running after its reason is gone.** Sessions are torn down on
  expiry, logout, party exit, quest resolution, explicit stop, and when sharing
  is switched off. Expiry is settled on read, so a missed timer or a process
  restart cannot leave collection running.
- **Background location is never collected just to animate the map.** It runs
  only for an active quest or an explicitly started party session.
- **GPS is game evidence, not proof.** Implausible-travel and accuracy checks
  exist to reject unusable data, not to catch cheats. There is no device
  fingerprinting, no mock-location detection, and no invasive anti-cheat.

## Retention

| Data                 | Retention                                    |
| -------------------- | -------------------------------------------- |
| Raw location samples | 6 hours (`retention.rawSampleTtlMs`)         |
| Sessions             | Kept as an audit record; status only         |
| Sharing preferences  | Until changed                                |
| Presence events      | No coordinates, so nothing positional stored |

The sweep runs every 15 minutes in a non-test process and is also exposed at
`POST /v1/location/retention/sweep`. `DELETE /v1/location/me/samples` deletes
every stored reading for the caller and stops their sessions.

Derived records — a verification result, a presence change — outlive the raw
samples. The coordinates themselves do not.

## Domain package

Everything is a pure function over an explicit policy. `defaultLocationPolicy`
holds every threshold; there are no magic numbers inline.

### Arrival

Arrival requires **all** configured conditions: inside the radius, accurate
enough, and recent enough.

The default mode is `UNCERTAINTY_ADJUSTED`: the reported accuracy is subtracted
from the distance before comparing to the radius. This is a deliberate product
decision. City phones routinely report 20–35m accuracy, so strict point
comparison against a 30m radius produces constant false negatives for players
who are genuinely standing at the target. The adjustment cannot rescue a fix
that is too imprecise to believe — the accuracy ceiling is checked separately,
and a requirement may tighten that ceiling but never loosen it.

`STRICT_DISTANCE` is available for quests that need it. Either way the
evaluation returns every measurement used:

```ts
const evaluation = evaluateArrival({ sample, requirement, now, policy });
// {
//   arrived: false, mode: "UNCERTAINTY_ADJUSTED",
//   distanceMeters: 82.4, effectiveDistanceMeters: 60.4,
//   radiusMeters: 40, accuracyMeters: 22, maxAccuracyMeters: 50,
//   sampleAgeMs: 4200, maxSampleAgeMs: 180000,
//   failedConditions: ["DISTANCE"],
// }
explainArrival(evaluation); // "20m to go"
```

### Proximity

Presence uses server-side clustering, hysteresis, and a debounce:

- a member joins the cluster inside `enterRadiusMeters` (150m) but leaves it
  only beyond `exitRadiusMeters` (260m), so standing on the boundary does not
  flap;
- a candidate set must hold steady for `debounceMs` (45s) before it is
  published, and flipping back to the published set cancels the pending change
  outright — so a member walking in and out emits no events at all;
- combined accuracy is added to the separation, capped, so two imprecise fixes
  cannot fake togetherness;
- the result is nearby member ids, a count, and a coarse area label.

### Simulator

`LocationSimulator` walks a scripted route. `sampleAt(elapsedMs)` is pure, so
seeking equals stepping and the same demo replays identically. Routes:

| Route id                    | What it demonstrates                                    |
| --------------------------- | ------------------------------------------------------- |
| `route-craig-street-bakery` | ~900m walk that arrives at a GPS quest                  |
| `route-schenley-loop`       | A looping walk that never finishes                      |
| `route-poor-signal`         | Accuracy above the ceiling: the "signal too weak" state |

## API

All routes require an authenticated principal and act only on that user. No
handler reads an actor id from a body or query string.

| Method   | Path                                   | Purpose                      |
| -------- | -------------------------------------- | ---------------------------- |
| `GET`    | `/v1/location/config`                  | Client-visible thresholds    |
| `POST`   | `/v1/location/sessions`                | Start a time-boxed session   |
| `GET`    | `/v1/location/sessions`                | The caller's own sessions    |
| `POST`   | `/v1/location/sessions/:id/pause`      | Pause sharing                |
| `POST`   | `/v1/location/sessions/:id/resume`     | Resume sharing               |
| `DELETE` | `/v1/location/sessions/:id`            | Stop now                     |
| `POST`   | `/v1/location/samples`                 | Submit a reading             |
| `POST`   | `/v1/location/evidence/gps`            | Evaluate arrival (read-only) |
| `GET`    | `/v1/location/party/:partyId/presence` | Coarse presence              |
| `GET`    | `/v1/location/me/privacy`              | What is stored, and settings |
| `PATCH`  | `/v1/location/me/privacy`              | Change sharing settings      |
| `DELETE` | `/v1/location/me/samples`              | Delete all stored readings   |
| `POST`   | `/v1/location/retention/sweep`         | Run the retention sweep      |

### Starting a session

```http
POST /v1/location/sessions
{ "purpose": "ACTIVE_QUEST", "mode": "FOREGROUND",
  "questInstanceId": "quest-1", "durationMs": 2700000 }

201
{ "session": { "id": "…", "userId": "…", "purpose": "ACTIVE_QUEST",
               "mode": "FOREGROUND", "status": "ACTIVE",
               "questInstanceId": "quest-1",
               "startedAt": "2026-09-11T18:00:00.000Z",
               "expiresAt": "2026-09-11T18:45:00.000Z" } }
```

### Submitting a reading

```http
POST /v1/location/samples
Idempotency-Key: session-1:7
{ "sessionId": "…",
  "sample": { "coordinates": { "latitude": 40.4494, "longitude": -79.9497 },
              "accuracyMeters": 12, "recordedAt": "2026-09-11T18:11:00.000Z",
              "source": "GPS" } }

202  { "accepted": true, "sampleId": "…", "duplicate": false }
422  { "accepted": false,
       "rejection": { "code": "ACCURACY_TOO_LOW",
                      "message": "Signal is too weak right now…",
                      "retryable": true } }
429  { "accepted": false, "rejection": { "code": "RATE_LIMITED", … } }
```

A rejection is a normal outcome the UI renders as guidance, not an exception.
Clients branch on `code`, never on the message. Rejection codes:
`INVALID_COORDINATES`, `COORDINATES_LOOK_SWAPPED`, `INVALID_ACCURACY`,
`INVALID_TIMESTAMP`, `SAMPLE_IN_FUTURE`, `SAMPLE_STALE`, `ACCURACY_TOO_LOW`,
`IMPLAUSIBLE_TRAVEL`, `NON_MONOTONIC_SAMPLE`, `NO_ACTIVE_SESSION`,
`SESSION_EXPIRED`, `SESSION_PAUSED`, `SESSION_NOT_OWNED`,
`SESSION_QUEST_MISMATCH`, `RATE_LIMITED`.

Rate limit: a burst of 30 readings per user, refilling at 30/minute. A token
bucket rather than a fixed window, so a phone flushing queued fixes after a
tunnel is absorbed rather than rejected.

### Demo quests spawn around the player

`buildDemoQuestMarkers(now, origin)` places its quests by bearing and distance
from an origin, and the map anchors that origin to the player's first real fix.
Hardcoded coordinates would put the quests in Pittsburgh no matter where the
player is, which makes every distance meaningless and pushes the player marker
off the map. The quests branch replaces this wholesale; the relative placement
is what makes the demo work anywhere in the meantime.

## For the quest agent

Quest verification consumes `GpsEvidenceService` **in process**. Do not call the
HTTP endpoint from the server.

```ts
import type { GpsEvidenceService } from "@sidequest/contracts/location";

const result = await gpsEvidence.evaluate({
  userId: principal.userId,
  questInstanceId: instance.id,
  requirement: { type: "GPS", target, radiusMeters: 40, maxAccuracyMeters: 50 },
});

// result.status      "SATISFIED" | "NOT_SATISFIED" | "NO_EVIDENCE"
// result.evaluation  the full ArrivalEvaluation, or null
// result.sampleId    opaque id for audit, no coordinates
```

It returns evidence and an explanation. **It never transitions a quest, writes a
ledger entry, or awards coins** — that stays entirely with the quest module.

The instance is available from `registerLocationModule(...)`:

```ts
const location = registerLocationModule(app, {
  events,
  memberships,
  clock,
  ids,
});
registerQuestModule(app, { gpsEvidence: location.gpsEvidence /* … */ });
```

When a quest resolves, stop its location session so tracking does not outlive
the quest:

```ts
await location.service.stopSessionsFor(
  { type: "QUEST_RESOLVED", questInstanceId },
  { userId },
);
```

Depend on the `GpsEvidenceService` type from `@sidequest/contracts/location`,
not on `LocationService`.

## Storage

The module selects storage in one place. With no `DATABASE_URL` it uses
`InMemoryLocationRepository`, which is what makes the whole feature demonstrable
without credentials. Pass a `sql` client to use PostGIS:

```ts
registerLocationModule(app, { events, memberships, clock, ids, sql });
```

`SqlClient` is a one-method interface (`query(text, params)`), so the API needs
no database driver dependency and the SQL is unit-tested against a fake.

Migration: `apps/api/src/modules/location/migrations/20260911T120000_location_init.sql`.
Timestamped and feature-prefixed so parallel branches do not compete for a
sequence number. If the chosen runner keeps a shared journal, the integration
branch regenerates it; this file is the source. Requires the `postgis`
extension.

Coordinates are stored as `geography(Point, 4326)` so `ST_DWithin` answers in
real meters and the antimeridian is the database's problem. Objects use
`{ latitude, longitude }`; PostGIS is longitude-first. Every crossing goes
through `toPostGisPoint` / `fromPostGisPoint`, which return a nominal type so a
hand-written `[number, number]` is a compile error. The range heuristic
`looksLikeSwappedCoordinates` catches only pairs that are invalid as given —
Pittsburgh's longitude of -79.94 is also a valid latitude, so the converters are
the real defence.

## Mobile

Provider selection is automatic. `EXPO` is the default; the Expo provider is
imported dynamically and probed, and a runtime with no native module falls back
to the simulator rather than failing to open. `EXPO_PUBLIC_LOCATION_PROVIDER=SIMULATED`
forces the simulator.

### Map

On **web** the map is real: MapLibre GL JS over OpenStreetMap raster tiles. No
native module, no development build, and no access token, so it satisfies the
no-credentials rule while showing actual streets. OSM ships a light basemap, so
the tiles are inverted in CSS to match the dark HUD — set
`EXPO_PUBLIC_MAP_DARK=false` to keep them light. Override the source with
`EXPO_PUBLIC_MAP_TILE_URL` and `EXPO_PUBLIC_MAP_ATTRIBUTION`; attribution is
required by the providers' terms and is rendered by the map's own control.

CARTO's dark basemap would suit the palette better but now stamps "API KEY
REQUIRED" across every unkeyed tile, so it is opt-in via those variables rather
than the default. Respect the OSM tile usage policy for anything beyond a demo.

Markers are not MapLibre markers — they are the same React Native views the
fallback uses, positioned from `map.project()` and repositioned on each camera
move, so there is one marker registry and one set of accessibility labels
across both surfaces. If MapLibre fails to load, the surface degrades to the
deterministic one rather than breaking the screen.

On **native** there is still no real basemap.
`@rnmapbox/maps` is deliberately **not** a dependency of this workspace. It is a
native module that cannot run in Expo Go and would force every parallel branch
through a prebuild. `MapSurface` is the adapter; `FallbackMapSurface` is the
default and is not a placeholder — it projects real coordinates, so markers sit
in true relative positions and walking moves the player across it.

To enable Mapbox: install `@rnmapbox/maps`, add its config plugin to
`app.json`, set `EXPO_PUBLIC_MAPBOX_TOKEN`, make a development build, and
implement `MapboxMapSurface` against the same props. Nothing above `MapSurface`
changes, because the rest of the feature talks in coordinates and markers.

### Environment

| Variable                        | Default                     | Effect                           |
| ------------------------------- | --------------------------- | -------------------------------- |
| `EXPO_PUBLIC_API_URL`           | `http://localhost:3000`     | API base URL                     |
| `EXPO_PUBLIC_LOCATION_PROVIDER` | `EXPO`                      | `SIMULATED` forces the simulator |
| `EXPO_PUBLIC_LOCATION_ROUTE`    | `route-craig-street-bakery` | Which demo route to walk         |
| `EXPO_PUBLIC_MAPBOX_TOKEN`      | unset                       | Enables the Mapbox surface       |
| `DATABASE_URL`                  | unset                       | Enables PostGIS storage          |

## Web and PWA

The app builds as an installable PWA and the whole GPS flow works in a browser.

```bash
corepack pnpm dev:api      # API on :3000
corepack pnpm build:web    # expo export -> apps/mobile/dist, then Workbox
```

`build:web` runs `expo export --platform web` and then `workbox generateSW`,
which precaches the shell into `dist/sw.js`. `expo.web.output` is `"static"`,
which is what makes `app/+html.tsx` apply; the manifest and icons live in
`apps/mobile/public/`. Workbox's `navigateFallbackDenylist` keeps `/v1/*` out of
the service worker entirely — a cached location reading is worse than none.

On web the API base URL defaults to a relative path so the app and API are
same-origin and no CORS setup is needed. Serve `apps/mobile/dist` behind a host
that proxies `/v1/*` to the API.

What works in a browser: foreground GPS through `expo-location`'s web
implementation, the projected map, quest tracking, arrival verification,
presence, and the privacy controls. What does not: background location. There
is no TaskManager on web, so `backgroundSupported` is false and the UI stops
offering the background prompt.

**The browser blocks geolocation outside a secure context.** `localhost` counts
as secure, so desktop testing just works. A phone hitting a LAN address over
plain HTTP does not, and the service worker will not register either. For phone
testing use an HTTPS tunnel (`cloudflared tunnel --url http://localhost:8088`
or `ngrok http 8088`), or run with
`EXPO_PUBLIC_LOCATION_PROVIDER=SIMULATED`, which needs no permission at all.

Icons are SVG-first with PNG companions. iOS ignores both the manifest and SVG
icons when adding to the home screen, so the PNG `apple-touch-icon` is what
gives the installed app a real icon rather than a screenshot of the page.

## Device testing

### Expo Go is not sufficient

Expo Go can read **foreground** location, so nearby quests and GPS verification
work there while the app is open. It cannot run background location:

- Expo Go's own Info.plist and AndroidManifest are fixed, so it does not carry
  the `UIBackgroundModes: location` entitlement or Android's
  `ACCESS_BACKGROUND_LOCATION` and `FOREGROUND_SERVICE_LOCATION` permissions;
- `startLocationUpdatesAsync` with a `foregroundService` needs a declared
  foreground service type that Expo Go does not declare;
- the task registered by `TaskManager.defineTask` is not restored after Expo Go
  is killed, so the OS has nothing to deliver background updates to.

The provider reports this honestly through `backgroundSupported: false`, and the
UI stops offering the background prompt rather than failing. **Make a
development build early, not on demo day.**

```bash
npx expo install expo-dev-client
eas build --profile development --platform ios      # or android
```

### Required declarations for the development build

`app.json` already carries these under the location branch's integration commit:

iOS `infoPlist`:

- `NSLocationWhenInUseUsageDescription`
- `NSLocationAlwaysAndWhenInUseUsageDescription`
- `UIBackgroundModes: ["location"]`

Android `permissions`:

- `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION`
- `ACCESS_BACKGROUND_LOCATION`
- `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`

The `expo-location` config plugin is registered in `plugins`.

### Manual device checklist

Run the API on a machine the device can reach and set `EXPO_PUBLIC_API_URL` to
that host's LAN address, not `localhost`.

Foreground:

1. Open MAP on a fresh install. The permission card explains the value **before**
   any OS dialog appears.
2. Tap `ENABLE LOCATION`, accept. Your marker appears at your real position.
3. Tap a quest marker, tap `TRACK THIS QUEST`. Walk toward it and confirm the
   distance counts down and the progress bar advances.
4. Reach the target. Confirm `📍 LOCATION VERIFIED` and that the explanation
   states the measurements.

Permission and error states:

5. Deny permission on a fresh install. Confirm the card offers `OPEN SETTINGS`
   and that the rest of the app still works.
6. iOS: turn **Precise Location** off in Settings. Confirm the `LIMITED` badge,
   that quests still list, and that verification is blocked with an explanation.
7. Turn device location services off entirely. Confirm the services-off card.
8. Revoke permission in Settings while the app is backgrounded, then return.
   Confirm tracking pauses rather than silently failing.
9. Turn on airplane mode mid-walk. Confirm the offline notice and that tracking
   resumes when connectivity returns, with no duplicated readings.
10. Go indoors, or set `EXPO_PUBLIC_LOCATION_ROUTE=route-poor-signal`. Confirm
    the "signal too weak" guidance rather than a false arrival.

Background (development build only):

11. Enable **Allow background during a quest** in the privacy controls, start a
    quest, and background the app. Confirm the OS location indicator and the
    Android notification are both visible.
12. Walk, then reopen. Confirm the readings taken while backgrounded were
    accepted.
13. Stop the quest. Confirm the indicator and notification disappear promptly.
14. Force-quit the app mid-session. Confirm tracking does not silently continue.

Privacy:

15. Open the privacy controls. Pause, confirm readings stop being accepted, then
    resume.
16. Turn **Share location at all** off. Confirm running sessions stop
    immediately and a new session is refused.
17. Tap **Delete my location data**. Confirm the stored-reading count drops to
    zero.
18. On a second device in the same party, confirm presence shows an area label
    and freshness and **never** a map pin at a real position.

Accessibility:

19. Enable VoiceOver or TalkBack. Confirm every marker announces its kind,
    title, distance, and reward, and that every control has a label.
20. Enable Reduce Motion. Confirm marker pulsing stops.
21. Set the largest dynamic text size. Confirm no control is clipped and all
    targets stay at least 44x44.

## Tests

```bash
corepack pnpm vitest run packages/location   # domain
corepack pnpm vitest run apps/api            # API and storage
corepack pnpm vitest run apps/mobile         # providers, map, client
corepack pnpm check                          # everything
```

Coverage of note: distance edge cases including the antimeridian and the poles,
swapped coordinate order, arrival boundaries at exactly the radius, stale and
inaccurate samples, plausible travel with accuracy noise, presence hysteresis
and debounce flapping, session expiry and teardown, every permission state,
rate-limit exhaustion and refill, idempotent retries, PostGIS coordinate
ordering, and assertions that no emitted event or audit payload contains a
coordinate.
