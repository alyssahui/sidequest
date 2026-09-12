# SideQuest

HackCMU 2026 — a multiplayer game layered onto real life. Friends discover nearby quests, challenge one another, make play-money predictions, and turn useful or surprising activities into shared stories.

## Foundation

The repository is a TypeScript pnpm workspace:

- `apps/mobile`: Expo SDK 57 + Expo Router app for iOS, Android, and installable PWA
- `apps/api`: Fastify API shell with credential-free demo adapters
- `packages/contracts`: framework-free integration types and ports
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

Run the web/PWA version during development:

```bash
corepack pnpm --filter @sidequest/mobile web
```

Create the deployable static PWA in `apps/mobile/dist`:

```bash
corepack pnpm build:web
```

The production PWA must be served over HTTPS for service workers and browser location permissions. The generated service worker precaches the static app shell but deliberately does not cache authenticated API responses.

Verify the workspace:

```bash
corepack pnpm check
```

Copy `.env.example` to `.env` only when adding live services. The default app and API intentionally run without Mapbox, database, auth, or AI credentials.

## Parallel feature work

Read `agents/README.md` and `agents/SHARED_CONTRACT.md` before branching. Feature-specific contracts should be added in separate files and exported as package subpaths where possible, keeping shared barrel files and app/API registration as small integration hotspots.

The current map is a deterministic game-world placeholder. The location branch owns the native location provider and Mapbox adapter; the quest branch owns quest lifecycle/UI; the market branch owns the real ledger and prediction settlement.

## Play-money predictions

The market feature uses binary `COMPLETE`/`FAIL` pari-mutuel pools backed by an append-only, balanced ledger. It is a social game mechanic only: Coins cannot be purchased, transferred for value, or cashed out. See `apps/api/src/modules/markets/README.md` for API and quest-event integration.
