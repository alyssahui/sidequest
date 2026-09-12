# SideQuest

HackCMU 2026 — a multiplayer game layered onto real life. Friends discover nearby quests, challenge one another, make play-money predictions, and turn useful or surprising activities into shared stories.

SideQuest is an Expo/React Native app that runs on iOS, Android, and the web as an installable PWA. It includes a credential-free demo, so you do not need a database, Mapbox token, authentication provider, or AI key to get started.

## Hackathon demo flow

The web app is now a shared, interactive demo rather than a set of disconnected mock screens:

1. Open the app in two browser windows. Use the **PLAYING AS** bar to choose Zuri in one and Ben in the other.
2. As Zuri, open **Quests**, press `+`, choose **Challenge**, describe a societal-impact goal, and press **DESIGN + PRICE WITH GROK**.
3. With `XAI_API_KEY` configured, Grok reasons about safety, impact, verification, and a fair play-money stake. Generate a Grok Imagine mission card and play the Grok Voice briefing, then send the challenge.
4. In Ben's window, the challenge appears within three seconds. Accept it, resolve it, and watch both users' shared state and credit update.
5. Open **Bet**, place a real play-money prediction, or ask Grok to forecast sentiment and add 20 clearly labeled synthetic predictors to the live pool.

Starter quests, friends, and identities are intentionally seeded. Challenge decisions, escrow, shared quest state, prediction bets, balances, and crowd simulation run through the API. In-memory state resets when the service restarts.

## Grok integration

All xAI calls are server-side; `XAI_API_KEY` is never included in the Expo bundle.

- **Grok reasoning:** converts an open-ended need into a concise impact quest, verification plan, and effort-based virtual-credit stake using structured output.
- **Grok Imagine:** generates a cinematic 16:9 visual for the mission with `grok-imagine-image-2.0` by default.
- **Grok Voice:** produces an expressive spoken mission briefing with the `eve` voice by default.
- **Grok crowd lab:** estimates calibrated synthetic sentiment, then drives labeled bot accounts through the real market and ledger services.

Without an API key, reasoning and crowd forecasting use a visibly labeled deterministic fallback; Imagine and Voice explain that a key is needed instead of pretending to be live AI. Model and voice defaults can be overridden with the variables in `.env.example`.

## Deploy one public link

[`render.yaml`](render.yaml) defines a single Render web service that builds the PWA and serves it from the same Fastify process as the API. In Render, create a Blueprint from this repository, enter `XAI_API_KEY` when prompted, and deploy. Render will provide an HTTPS `*.onrender.com` URL suitable for the submission.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/alyssahui/sidequest)

The same production setup can be tested locally:

```bash
corepack pnpm build:web
SERVE_WEB=true PORT=3000 corepack pnpm --filter @sidequest/api start
```

Then open `http://localhost:3000`. The API remains available under `/v1/*` on the same origin.

## Quick start: web/PWA

Prerequisites:

- Node.js 22.13 or newer
- Git
- Corepack, which is included with supported Node installations

Clone the repository, install the workspace, and start Expo for web:

```bash
git clone https://github.com/alyssahui/sidequest.git
cd sidequest
corepack pnpm install
corepack pnpm --filter @sidequest/mobile web
```

Open the local URL printed by Expo, normally `http://localhost:8081`. No `.env` file is required for the demo.

To force the deterministic location walk instead of requesting browser/device location:

```bash
EXPO_PUBLIC_LOCATION_PROVIDER=SIMULATED corepack pnpm --filter @sidequest/mobile web
```

On the Map tab, select a quest and start tracking to see the simulated player move toward it. The Quests tab includes the quest lifecycle and challenges. Party combines the roster with the story feed. Bet is the play-money COMPLETE / FAIL market for friends' accepted quests.

## Run the app and API together

Use two terminals from the repository root.

Terminal 1 — start the Fastify API on `http://localhost:3000`:

```bash
corepack pnpm dev:api
```

Confirm it is running:

```bash
curl http://localhost:3000/health
```

Terminal 2 — start Expo:

```bash
corepack pnpm dev
```

The Expo terminal displays shortcuts and a QR code. Press `w` for web, `i` for the iOS Simulator, or `a` for an Android emulator. You can also launch a platform directly:

```bash
corepack pnpm --filter @sidequest/mobile ios
corepack pnpm --filter @sidequest/mobile android
```

Starter content remains deterministic, while the interactive challenge, location, ledger, prediction-market, AI, and crowd flows use the API. State is held in memory and resets when the API restarts.

## Environment configuration

The defaults are intentionally credential-free. Copy `.env.example` to `.env` only when you need to override them:

```bash
cp .env.example .env
```

Useful variables:

| Variable                                  | Purpose                                                                                                                                |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_API_URL`                     | API address used by a native app; use your computer's LAN address when testing on a physical phone, such as `http://192.168.1.20:3000` |
| `EXPO_PUBLIC_LOCATION_PROVIDER=SIMULATED` | Forces the deterministic indoor-friendly demo route                                                                                    |
| `EXPO_PUBLIC_LOCATION_ROUTE`              | Selects a scripted route such as `route-craig-street-bakery` or `route-poor-signal`                                                    |
| `EXPO_PUBLIC_MAPBOX_TOKEN`                | Optional future/native Mapbox adapter token; the web demo uses an unkeyed basemap                                                      |
| `DATABASE_URL`                            | Reserved for PostgreSQL/PostGIS persistence                                                                                            |
| `XAI_API_KEY`                             | Enables server-side Grok reasoning, Imagine, Voice, and synthetic-crowd forecasting; never expose it to the client                     |
| `XAI_TEXT_MODEL`                          | Optional reasoning-model override; defaults to `grok-4.20-reasoning-latest`                                                            |
| `XAI_IMAGE_MODEL`                         | Optional Imagine-model override; defaults to `grok-imagine-image-2.0`                                                                  |
| `XAI_VOICE_ID`                            | Optional TTS voice override; defaults to `eve`                                                                                         |

For a physical device, the phone and development computer must be on the same network, and the API must be reachable through the computer's firewall. `localhost` on a phone refers to the phone itself.

## Test and build

Run formatting checks, TypeScript checks, and the complete test suite:

```bash
corepack pnpm check
```

Build the production PWA into `apps/mobile/dist` and generate its service worker:

```bash
corepack pnpm build:web
```

Serve `apps/mobile/dist` through an HTTPS host for deployment. Browsers allow service workers on `localhost` during development, but production service workers and location permissions require HTTPS. The service worker precaches the static application shell and does not cache authenticated API responses.

## What to try

- **Map:** grant location permission or use the simulator, inspect nearby quests, start/stop tracking, and open the privacy controls.
- **Quests:** reveal and accept a nearby quest, simulate evidence, create a custom challenge, or turn a want/need into a quest.
- **Bet:** choose `COMPLETE` or `FAIL` on a friend's accepted quest, select a virtual-credit stake, and confirm. Credit has no monetary value and cannot be purchased or cashed out.
- **Party:** inspect the roster under Squad and the activity story under Story.
- **API:** use the tests in `apps/api/test` as executable examples for quest, location, market, and self-bounty requests.

## Native location note

Foreground location can be tested through Expo Go where supported. Background location requires an Expo development build because Expo Go cannot include the required iOS/Android entitlements. See [`packages/location/README.md`](packages/location/README.md) for the device checklist, privacy guarantees, retention policy, simulator routes, and location API examples.

## Repository layout

```text
apps/mobile          Expo Router app for iOS, Android, and PWA
apps/api             Fastify API and independently registered modules
packages/contracts   Shared framework-free types and ports
packages/location    Location, privacy, geometry, and proximity rules
packages/quest-core  Quest and challenge lifecycle logic
packages/market-core Ledger, predictions, payouts, and self-bounties
packages/ui          Shared theme and React Native HUD components
agents               Architecture contract and feature-agent instructions
```

The canonical navigation is Map, Quests, Party, Bet, and Profile. Quest lifecycle, location evidence, and market settlement remain isolated in feature packages and are composed by the API and mobile apps.

Contributors working on separate branches should read [`agents/README.md`](agents/README.md) and [`agents/SHARED_CONTRACT.md`](agents/SHARED_CONTRACT.md) before editing integration surfaces.
