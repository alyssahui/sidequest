# SideQuest agent runbook

This directory contains ready-to-paste prompts for four Codex instances. Each prompt is intentionally self-contained, but every agent must also read `agents/SHARED_CONTRACT.md`, `agents/INIT_PROMPTS.txt`, and the files in `design/` before editing code.

## Decisions made during review

- The canonical navigation is `MAP · QUESTS · PARTY · FEED · PROFILE`. The mockup's `BET` tab is superseded by the written five-tab specification. Betting opens contextually from a quest, challenge, feed event, or member profile.
- The palette and arcade/HUD direction in `design/sidequest.png` are references, not a pixel-perfect mandate. Preserve the warm orange, oxblood, cream, and deep-teal character while improving hierarchy, spacing, contrast, touch targets, and safe-area handling.
- `agents/SIDEQUEST.txt` is truncated at the end. Where it is incomplete, `agents/INIT_PROMPTS.txt` and `agents/SHARED_CONTRACT.md` are authoritative.
- Coins are closed-loop virtual points: never purchasable, cashable, transferable outside the game, or described as investments. The product is a friendly prediction game, not real-money gambling.
- GPS, photo, and time are the only MVP verification factors. AI may suggest or explain quests, but it must not settle coins or be the sole judge of a disputed outcome.
- Location sharing is consent-based and ephemeral. Background tracking is enabled only for an active quest or an explicitly enabled, time-boxed party session.

## Required branch order

Do not start all four agents from today's nearly empty repository. They would each create incompatible project scaffolding and produce a painful merge.

1. Create a foundation branch from `main` and run `01_UI_UX_APP.md`.
2. Review and merge the foundation commit into `main`. Confirm that the workspace installs and the mobile shell starts.
3. Create three branches from that exact merged commit and run these in parallel:
   - `02_LOCATION_TRACKING.md`
   - `03_PREDICTION_MARKET.md`
   - `04_QUESTS_CHALLENGES.md`
4. Merge feature branches one at a time. Resolve composition files manually; do not accept an entire side of a conflict in shared manifests, route files, database metadata, or API registration.
5. Run the integration checklist below on the combined branch.

Suggested branch names:

```text
codex/foundation-ui
codex/location
codex/markets
codex/quests-challenges
codex/integration
```

## Ownership map

| Workstream | Primary ownership | Avoid editing |
|---|---|---|
| UI/UX/app foundation | workspace configuration, `apps/mobile/app`, `apps/mobile/src/features/shell`, `party`, `feed`, `profile`, `packages/ui`, shared identity/party/event/economy ports in `packages/contracts`, API shell and demo adapters | domain implementations for location, markets, quests, or challenges |
| Location | `packages/location`, `packages/contracts/src/location.ts`, `apps/mobile/src/features/location`, `apps/api/src/modules/location` | theme internals, market or quest lifecycle code |
| Prediction market | `packages/market-core`, `packages/contracts/src/market.ts`, `apps/mobile/src/features/markets`, `apps/api/src/modules/markets`, market migrations | quest resolution and location tracking internals |
| Quests/challenges | `packages/quest-core`, `packages/contracts/src/quest.ts`, `challenge.ts`, `apps/mobile/src/features/quests`, `challenges`, `apps/api/src/modules/quests`, `challenges`, quest migrations | market settlement, location provider internals, global theme |

Shared composition files—workspace manifests, lockfile, Expo config, route files, API server registration, database migration journal, and contract exports—are integration hotspots. Feature agents should expose a route/component/plugin from their owned module and keep edits to those hotspots minimal and isolated in a clearly labeled commit.

Feature migrations should have timestamped, feature-prefixed names rather than competing generic sequence names. If the chosen migration tool keeps one shared journal, feature branches should commit migration source/schema but leave final journal regeneration to the integration branch.

## Integration contracts

The modules communicate through IDs, typed commands/results, and domain events defined in `SHARED_CONTRACT.md`. They must not import another feature's database repository or mutate another feature's tables directly.

The key end-to-end chain is:

```text
location evidence -> quest verification -> quest.resolved event
quest.resolved -> market settlement + economy ledger entries
quest/challenge/market events -> feed projection + notifications
```

The economy ledger is the source of truth for balances. Quest and market modules request ledger transactions through an interface; they never update a balance column themselves.

## Integration checklist

- Fresh install succeeds using the repository's documented package manager.
- Typecheck, lint, unit tests, and API tests pass from the repository root.
- The app works without external credentials in demo mode with deterministic seeded data.
- The app explains how to add map, database, auth, push, and optional AI credentials without committing secrets.
- Denied location permission, stale coordinates, offline mode, loading, empty, and error states are visible and recoverable.
- One demo journey works: discover quest on Map, accept it, place virtual prediction, submit verification, settle once, and render a feed event.
- Retrying any accept, bet, verification, or settlement command does not duplicate state or coins.
- All controls meet mobile accessibility basics: labels, 44x44 minimum targets, adequate contrast, reduced-motion behavior, dynamic text tolerance.
- No screen implies real-money value, guaranteed return, or public precise-location sharing.

## What the project owner must provide

Development can proceed in demo mode before these exist. Before a device demo, provide:

- an iOS and/or Android test device and decide which platform is the primary judging target;
- a Mapbox public token if Mapbox is retained;
- an Expo/EAS project for development builds, push credentials, and background-location entitlements;
- a PostgreSQL/PostGIS database URL for the shared backend (local or hosted);
- an auth-provider configuration, or approval to use the demo identity adapter for the hackathon;
- privacy copy naming what location is collected, why, who can see it, and when it expires;
- a short curated list of safe Pittsburgh/CMU-area demo quests and locations;
- later, an `XAI_API_KEY` only on the server if Grok-powered suggestions are added. Never place this key in the mobile bundle.

The native location stack cannot be judged reliably in Expo Go. Plan to make an Expo development build early, not on demo day.
