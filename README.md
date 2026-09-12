# SideQuest

HackCMU 2026 — a multiplayer game layered onto real life. Friends discover nearby quests, challenge one another, make play-money predictions, and turn useful or surprising activities into shared stories.

## Foundation

The repository is a TypeScript pnpm workspace:

- `apps/mobile`: Expo SDK 57 + Expo Router mobile shell
- `apps/api`: Fastify API shell with credential-free demo adapters
- `packages/contracts`: framework-free integration types and ports
- `packages/location`: location policy, geometry, proximity, and the GPS simulator
- `packages/ui`: shared SideQuest theme and mobile HUD primitives

The canonical navigation is Map, Quests, Party, Feed, and Profile. Prediction markets are contextual rather than a separate tab.

## Start locally

Node 22.13 or newer is required. Use the repository-pinned pnpm version through Corepack:

```bash
corepack pnpm install
corepack pnpm dev
```

Run the API separately:

```bash
corepack pnpm dev:api
```

Verify the workspace:

```bash
corepack pnpm check
```

Copy `.env.example` to `.env` only when adding live services. The default app and API intentionally run without Mapbox, database, auth, or AI credentials.

## Parallel feature work

Read `agents/README.md` and `agents/SHARED_CONTRACT.md` before branching. Feature-specific contracts should be added in separate files and exported as package subpaths where possible, keeping shared barrel files and app/API registration as small integration hotspots.

The quest branch owns quest lifecycle/UI; the market branch owns the real ledger and prediction settlement.

## Location

The MAP tab is the location feature. It works with no Mapbox token, no database, and no device: the provider falls back to a deterministic location simulator and the map to a surface that projects real coordinates. See [`packages/location/README.md`](packages/location/README.md) for the API surface, privacy and retention rules, the `GpsEvidenceService` seam that quest verification consumes, and the device-testing checklist.

Background location needs a development build — Expo Go cannot carry the required entitlements. Make one early rather than on demo day.
