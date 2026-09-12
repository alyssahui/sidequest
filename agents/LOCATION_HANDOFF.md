# Location branch — integration handoff

**Status:** merged into `main`; integration wiring added on top
**State:** `corepack pnpm check` green — 364 tests across all 7 projects
**Scope:** location, proximity, GPS verification, the map, and the web/PWA shell

Read this before touching the location stack. The **Have nots** section is the part that matters:
several things look finished and are not, and one of them is a privacy
invariant this branch itself documents.

---

## 1. What is done, and how far it was actually verified

| Area                                                 | Verified by                                      | Confidence                                   |
| ---------------------------------------------------- | ------------------------------------------------ | -------------------------------------------- |
| Domain logic (`packages/location`)                   | 183 unit tests                                   | High — pure functions, boundaries tested     |
| API module (`apps/api/src/modules/location`)         | 62 tests incl. PostGIS SQL against a fake client | High for logic, **none for a real database** |
| Mobile feature (`apps/mobile/src/features/location`) | 51 unit tests + headless Chromium                | Medium — browser only, never a device        |
| Web / PWA                                            | Headless Chromium, 27/27 checks                  | Medium — never installed to a home screen    |
| Native (iOS/Android)                                 | **Nothing**                                      | **Zero — no code has ever run on hardware**  |

### Delivered

- **`packages/location`** — framework-free: haversine geometry with antimeridian
  and pole cases, one policy object holding every threshold, sample validation
  (freshness / accuracy / plausible travel) returning stable retryable rejection
  codes, uncertainty-adjusted arrival evaluation, coarse party presence with
  hysteresis and debounce, time-boxed session state machine, coordinate
  redaction, and a deterministic route simulator.
- **`packages/contracts/src/location.ts`** — cross-process types. `GpsEvidenceService`
  is the seam quest verification consumes.
- **`apps/api/src/modules/location`** — 11 routes (below), token-bucket rate
  limiting, idempotent ingest, retention sweep, deletion, PostGIS repository
  behind a one-method `SqlClient` interface, and an in-memory repository that is
  the default so the app runs with no `DATABASE_URL`.
- **`apps/mobile/src/features/location`** — Expo + simulated providers with
  runtime selection and fallback, a display-only position hook, a quest-tracking
  session hook, permission UX for all six states, privacy controls, a marker
  registry, and a real MapLibre basemap on web.

### API surface

```
GET    /v1/location/config                     client-visible thresholds
POST   /v1/location/sessions                   start a time-boxed session
GET    /v1/location/sessions                   the caller's own sessions
POST   /v1/location/sessions/:id/pause
POST   /v1/location/sessions/:id/resume
DELETE /v1/location/sessions/:id
POST   /v1/location/samples                    submit a reading
POST   /v1/location/evidence/gps               evaluate arrival (read-only)
GET    /v1/location/party/:partyId/presence    coarse presence, no coordinates
GET    /v1/location/me/privacy                 what is stored + settings
PATCH  /v1/location/me/privacy
DELETE /v1/location/me/samples                 delete everything stored
POST   /v1/location/retention/sweep
```

---

## 2. Have nots — read this before you trust the green checkmarks

### 2.1 Bugs and gaps in this branch's own scope

> **Update — integration wiring landed.** Three gaps this document flagged are
> now closed: quest verification is backed by the location module rather than a
> second GPS implementation, the evidence endpoint no longer trusts coordinates
> from the request body when a stored reading exists, and `quest.resolved`
> settles the market through an event consumer. A quest-lifecycle bug found in
> the same pass — malformed evidence resolving a quest terminally — is fixed.
> Items A and B below remain open.

**A. The location session does not stop when you arrive.** _(privacy, partly addressed)_

The server now stops a quest's session when `quest.resolved` fires, so a
verified quest no longer leaves location running. The client-side gap remains:
the map still shows a verified badge beside a "STOP LOCATION SHARING" button
rather than a completion state.

The original report:
Arriving flips the HUD to `LOCATION VERIFIED`, but the session stays open until
the player taps stop or it expires (45 min). This branch's own documented
invariant is "nothing keeps running after its reason is gone." Once the GPS
requirement is satisfied, tracking should end.

I started this fix — confirm the evidence with the server, then stop, and show a
completion state instead of a verified badge sitting next to a "STOP LOCATION
SHARING" button — and reverted it unfinished because of **B**.

**B. Server rejects arrival as stale in the headless harness.** _(unresolved)_
`POST /v1/location/evidence/gps` returns `NOT_SATISFIED` with
`failedConditions: ["FRESHNESS"]` and `sampleAgeMs: 287252` — a ~5-minute-old
sample in a 40-second test. Coordinates update; the timestamp does not.

Most likely Chromium's mocked geolocation returning a fixed timestamp, i.e. a
test artifact. **Not proven.** Settle this before trusting arrival end-to-end,
because it also means the existing "arriving verifies the location" check only
ever validated the **local** evaluation, not the server's. Start at
`toSample()` in `providers/expoLocationProvider.ts` and the `checkFreshness`
policy in `packages/location/src/samples.ts`.

**C. Demo quests are fabricated points, not places.** _(expected, but say it out loud)_
`buildDemoQuestMarkers` places four quests at fixed bearings and distances from
the player: 35°/420m, 145°/260m, 250°/700m, 320°/340m. There is **no POI
lookup** — the "bakery" quest can land on a parking lot, a river, or the middle
of a road. Real spawning needs a POI source (Overpass, Places) and belongs to
the quests branch. The relative placement exists only so the demo works
anywhere rather than pinning everything to Pittsburgh.

**D. No native basemap.** On iOS/Android the map is the deterministic projected
surface, not a real map. Web has a real MapLibre basemap. To get one natively,
add `@rnmapbox/maps` or `react-native-maps` behind the existing `MapSurface`
adapter — that seam is why the web map was one new file.

**E. Service worker updates do not land until every tab closes.**
`workbox-config.cjs` sets `skipWaiting: false`, so a rebuild does not reach an
open tab; you must hard-reload or close all tabs. Painful while iterating.
Setting `skipWaiting: true` fixes it; the tradeoff is assets swapping under a
running page, which is generally safe with content-hashed bundles.

**F. `expo start --web` does not work.** The web build defaults to a _relative_
API base so the app and API are same-origin. The dev server has no such proxy,
and the API sends no CORS headers. Only the **static export behind a proxy**
path is tested. Add `@fastify/cors` if you want the dev-server loop.

**G. ~~Nothing serves the built PWA in-repo.~~** _(fixed)_
`corepack pnpm serve:web` runs `scripts/serve-web.mjs`, which serves
`apps/mobile/dist` with extensionless routing and `/v1/*` proxied to the API,
so the app and its API share an origin and no CORS setup is needed.

**H. `.nvmrc` is untracked.** Node 24 is what all of this was built and verified
against; `package.json` only says `>=22.13.0`. It predates this branch so I left
it alone, but somebody should commit it.

### 2.2 Never tested at all

Ranked by how likely each is to bite you:

1. **A real device.** Background location, the Android foreground-service
   notification, real GPS drift, the actual OS permission dialogs. The 21-step
   checklist in `packages/location/README.md` is written and **unexecuted**.
   Expo Go cannot cover this — background location needs a development build.
   Make one early, not on demo day.
2. **The arrival → reward chain.** Blocked on the quests and markets branches.
   `location evidence → quest verification → quest.resolved → payout → feed`
   has never run.
3. **PWA install + standalone.** Verified _installable_; never actually
   installed to a home screen and launched.
4. **PostGIS.** Migration never applied, `DATABASE_URL` never set. The SQL is
   unit-tested against a fake client only.
5. **Two-device party presence.** Only exercised through API tests.
6. **Offline mid-walk.** The code paths exist; never exercised in a browser.

---

## 3. Merging

`main` has already moved once (`06452a4`, the PWA commit) and three feature
branches are still open: `ui/ux`, `codex/markets`, `codex/quests-challenges`.
Expect the same collisions each time.

### Conflict hotspots — union them, never take a side

| File                              | What this branch adds                                                            |
| --------------------------------- | -------------------------------------------------------------------------------- |
| `apps/mobile/package.json`        | `@sidequest/location`, `expo-location`, `expo-task-manager`, `maplibre-gl`       |
| `apps/mobile/app.json`            | `expo-location` plugin, `ios.infoPlist.UIBackgroundModes`, `android.permissions` |
| `packages/contracts/package.json` | `./location` export subpath                                                      |
| `packages/contracts/src/index.ts` | `export * from "./location"`                                                     |
| `apps/api/src/app.ts`             | `registerLocationModule` + `onClose` teardown                                    |
| `apps/mobile/app/_layout.tsx`     | `<Head><title>` — see note below                                                 |
| `apps/mobile/app/(tabs)/map.tsx`  | points at `LocationMapScreen`                                                    |
| `pnpm-workspace.yaml`             | three `minimumReleaseAge` exclusions the lockfile needs                          |
| `pnpm-lock.yaml`                  | regenerate rather than hand-resolve                                              |

**The `<Head><title>` in `_layout.tsx` is load-bearing.** Expo Router's head
manager always emits a `<title>`, and its empty one overrides any static tag in
`+html.tsx`. Without those lines the document is untitled. This file is UI/UX
territory — flag it to them rather than silently dropping it.

All shared-file edits were isolated in `6825b82 chore(location): integration
wiring` to make this easy to review.

### After merging

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm check          # format, typecheck, 296 tests
corepack pnpm build:web      # expo export + workbox
```

Migration: `apps/api/src/modules/location/migrations/20260911T120000_location_init.sql`.
Timestamped and feature-prefixed so branches do not compete for a sequence
number. If your runner keeps a shared journal, regenerate it on the integration
branch; this file is the source. Requires the `postgis` extension.

---

## 4. Wiring for the other agents

### Quests

Consume `GpsEvidenceService` **in process**. Do not call the HTTP endpoint from
the server.

```ts
const location = registerLocationModule(app, {
  events,
  memberships,
  clock,
  ids,
});
registerQuestModule(app, { gpsEvidence: location.gpsEvidence /* … */ });
```

```ts
const result = await gpsEvidence.evaluate({
  userId: principal.userId,
  questInstanceId: instance.id,
  requirement: { type: "GPS", target, radiusMeters: 40, maxAccuracyMeters: 50 },
});
// result.status      "SATISFIED" | "NOT_SATISFIED" | "NO_EVIDENCE"
// result.evaluation  full ArrivalEvaluation, or null
// result.sampleId    opaque id for audit, no coordinates
```

It returns evidence and an explanation. **It never transitions a quest, writes a
ledger entry, or awards coins.** Depend on the type from
`@sidequest/contracts/location`, not on `LocationService`.

When a quest resolves, stop its session so tracking does not outlive it:

```ts
await location.service.stopSessionsFor(
  { type: "QUEST_RESOLVED", questInstanceId },
  { userId },
);
```

Also replace `buildDemoQuestMarkers` in
`apps/mobile/src/features/location/demoQuests.ts` with real `QuestInstance`
data. The shape it returns is the shape to supply.

### Markets / feed

Subscribe to `location.party_presence_changed`. The payload carries nearby user
ids, a count, and a coarse area label — **never coordinates**, by construction
and asserted at runtime. Use it for proximity-triggered multiplayer spawns.

---

## 5. Privacy invariants — do not regress these

Enforced in code and asserted in tests, not merely documented:

- **Peer coordinates never leave the server.** `PartyPresenceSnapshot` has no
  coordinate field at any depth, and `assertNoCoordinates` runs over the
  presence response and every emitted event before publication.
- **Coordinates never reach logs.** Everything describing a sample goes through
  `redactSample`; the audit sink is typed to accept only redacted payloads.
- **Consent is scoped and time-boxed.** No open-ended sessions; `expiresAt` is
  clamped server-side.
- **Background is a second, separate consent**, off by default, and downgraded
  silently rather than refused.
- **Showing yourself on your own map opens no session and uploads nothing.**
- **GPS is game evidence, not proof.** No device fingerprinting, no
  mock-location detection, no anti-cheat.

Raw samples are deleted after 6 hours. `DELETE /v1/location/me/samples` removes
everything for the caller and stops their sessions.

---

## 6. Decisions someone needs to make

1. **Mapbox token, or stay on OpenStreetMap?** OSM tiles are free and unkeyed
   but their usage policy expects a proper User-Agent and modest volume — fine
   for a demo, not for real users. CARTO now stamps "API KEY REQUIRED" across
   every unkeyed tile (verified against their CDN), so it is opt-in via
   `EXPO_PUBLIC_MAP_TILE_URL` only.
2. **Which platform is the judging target?** If it is a phone browser, the PWA
   path is ready and background location is out of scope. If it is native, a
   development build is required and should be made now.
3. **Is a real database in scope for the demo?** If not, say so — the in-memory
   store is complete and the PostGIS path can stay unexercised.
4. **Commit the browser test suite?** The projection bug that shipped in
   `0830a51` and was fixed in `e531308` was caught by a measurement harness that
   lived in a scratchpad and is now gone. Committing it means adding Playwright
   as a dev dependency and a browser download in CI.

---

## 7. Useful commands

```bash
corepack pnpm dev:api        # API on :3000, in-memory store
corepack pnpm build:web      # export + workbox -> apps/mobile/dist
corepack pnpm check          # format, typecheck, 296 tests

# Force the scripted walk — no permission needed, works indoors and in CI
EXPO_PUBLIC_LOCATION_PROVIDER=SIMULATED corepack pnpm dev
```

**Browser geolocation needs a secure context.** `localhost` counts; a phone on a
LAN address over plain HTTP does not, and the service worker will not register
either. Use an HTTPS tunnel (`cloudflared tunnel --url http://localhost:8088`)
or the simulator.

Full detail — the arrival-mode decision, presence tuning, retention, and the
device checklist — is in `packages/location/README.md`.
