# SideQuest shared architecture and product contract

This file is the integration contract for every branch. Existing repository choices win if the foundation agent has already implemented an equivalent decision; feature agents should adapt rather than replace working infrastructure.

## Product outcome

Build a hackathon-quality mobile experience that helps friends turn healthy, useful, curious, and generous real-world actions into shared play. The strongest demo is a small reliable loop with social delight, not a wide set of disconnected screens.

The friendship track should be visible in the mechanics:

- favor cooperative and in-person quests, encouragement, rematches, and shared memories;
- make trash talk opt-in and playful rather than humiliating;
- reward showing up together, helping a friend, and completing group goals—not only winning bets;
- provide decline, mute, block/report, location pause, and audience controls without punishment;
- never reveal a user's exact live location by default.

The “furthering humanity” story should be concrete: a curated quest category for mutual aid, community service, learning, wellness, and reconnection; party impact summaries; and safety rules that reject dangerous, illegal, coercive, discriminatory, or humiliating quests.

## Default technology

- TypeScript throughout, in a pnpm workspace.
- `apps/mobile`: React Native with Expo and Expo Router.
- `apps/api`: Fastify, structured as independently registered modules/plugins.
- `packages/contracts`: framework-free schemas and DTOs, preferably Zod plus inferred TypeScript types.
- `packages/ui`: theme tokens and reusable presentation components.
- `packages/quest-core`, `packages/market-core`, `packages/location`: framework-free domain logic where practical.
- PostgreSQL with PostGIS; migrations are committed and forward-only.
- TanStack Query for remote state and Zustand only for ephemeral client/UI state.
- Mapbox through `@rnmapbox/maps` for the game-world map; isolate it behind an app-level map adapter.
- Expo Location and Task Manager for foreground/background location; Expo Notifications for notifications.
- WebSocket or Supabase Realtime may later carry events, but the MVP must also work by polling/refetching.

Do not replace the stack on a feature branch. Do not make live services or credentials necessary to open the app: provide typed adapters and a deterministic demo implementation selected by environment configuration.

## Repository shape

```text
apps/
  mobile/
    app/                       # thin Expo Router composition
    src/features/<feature>/    # screens, hooks, adapters, feature components
  api/
    src/modules/<feature>/     # routes, application services, repositories
packages/
  contracts/src/               # cross-process schemas; feature-owned files
  ui/src/                      # tokens and reusable UI
  quest-core/src/              # lifecycle and verification orchestration
  market-core/src/             # pricing/payout/settlement rules
  location/src/                # policy, geometry, freshness rules
```

Use dependency direction `apps -> feature packages -> contracts`. Framework-free packages must not import React Native, Expo, Fastify, or database clients.

## IDs, time, money, and commands

- IDs are opaque UUID strings. Never infer entity type from an ID.
- API timestamps are UTC ISO-8601 strings. Persist instants, not formatted local time.
- Distances are meters; coordinate order in objects is `{ latitude, longitude }`. Convert explicitly at the PostGIS boundary, which conventionally uses longitude first.
- Coins are non-negative integer units. No floats.
- Every state-changing API command accepts an idempotency key. Duplicate keys return the original result.
- Every entity participating in concurrent actions has a `version` or guarded status transition.
- Error responses use stable codes plus safe messages; client behavior must not parse prose.

The foundation must define these shared ports in actual framework-free code before feature branches are created:

- `RequestPrincipal`/`AuthPort`: authenticated user ID and safe party claims; never trust actor IDs from request bodies.
- `PartyMembershipPort`: membership/role checks without importing the party repository.
- `EventPublisher`: publishes the event envelope below and supports an in-memory demo adapter.
- `EconomyPort`: idempotent debit/escrow/reward/refund/payout requests without exposing ledger storage.
- `Clock` and `IdGenerator`: injectable for deterministic domain tests.

Feature packages consume these ports. They must not declare private, incompatible copies.

## Canonical quest lifecycle

```text
SPAWNED -> ACCEPTED -> IN_PROGRESS -> VERIFIED
                               \----> FAILED
SPAWNED/ACCEPTED/IN_PROGRESS -------> EXPIRED
SPAWNED -> DISMISSED
```

Transitions are explicit and server-authoritative. `VERIFIED`, `FAILED`, `EXPIRED`, and `DISMISSED` are terminal. Retried resolution returns the existing resolution.

A `QuestTemplate` is reusable content and safety/eligibility metadata. A `QuestInstance` is a concrete offer with participants, destination/evidence requirements, reward, deadline, and state. Never collapse them into one catch-all object.

Verification uses composable requirements:

```ts
type VerificationRequirement =
  | {
      type: "GPS";
      target: Coordinates;
      radiusMeters: number;
      maxAccuracyMeters: number;
    }
  | { type: "PHOTO"; prompt: string }
  | { type: "TIME"; notBefore?: string; deadline: string };
```

The server evaluates normalized evidence and records a `VerificationAttempt`; it does not trust a client boolean such as `isVerified`.

## Challenge rule

For the MVP, a challenge is a consent-based duel with symmetric integer stakes:

- The issuer escrows one stake when issuing.
- The recipient may decline; declining returns the issuer stake and has no penalty.
- Accepting escrows the same amount from the recipient and creates/attaches a quest instance.
- On verified completion, the recipient receives the pot. On failure/expiry, the issuer receives the pot.
- Cancellation after acceptance requires a defined administrative/refund path; it must never silently burn coins.

If product design later chooses asymmetric stakes, change this contract deliberately across quest, market, and economy tests.

## Prediction-market rule

This is a binary, play-money, pari-mutuel pool—not an exchange and not the Kalshi API.

- Outcomes are `COMPLETE` and `FAIL` for an accepted quest/challenge.
- A player places an integer coin amount into exactly one outcome pool before `closesAt`.
- Stake is escrowed immediately through the ledger. Insufficient balance rejects atomically.
- The quest participant cannot bet on their own outcome. A self-bounty is a separate mechanic.
- On resolution, winners receive their original stake plus a pro-rata share of the losing pool. Integer remainders are distributed deterministically by bet creation order/ID.
- If there are no winning bets, refund all stakes for the MVP. If the market is void/cancelled, refund all stakes.
- A unique settlement record and database transaction make settlement exactly-once from the user's perspective.
- UI displays pool totals and an estimated payout per stake, not financial “odds,” yield, profit guarantees, or dollar equivalents.

## Economy contract

`LedgerEntry` is append-only and authoritative. Balance is a derived sum or transactionally maintained cache.

Each economic operation has a unique reference such as `(operationType, operationId, userId, leg)`. Double-entry-style legs are preferred for escrow and pot movement. No feature may directly mutate `users.coins_balance`.

Required reasons include `WELCOME_GRANT`, `QUEST_REWARD`, `CHALLENGE_ESCROW`, `CHALLENGE_PAYOUT`, `MARKET_ESCROW`, `MARKET_PAYOUT`, `REFUND`, and `SELF_BOUNTY`.

## Domain events

Features publish versioned events through an `EventPublisher` interface. Persist an outbox record in the same transaction as important state changes; delivery may be at-least-once, so consumers must deduplicate by event ID.

Event envelope:

```ts
type DomainEvent<TType extends string, TPayload> = {
  id: string;
  type: TType;
  version: 1;
  occurredAt: string;
  actorUserId?: string;
  partyId?: string;
  aggregateId: string;
  correlationId: string;
  payload: TPayload;
};
```

Initial event names:

```text
quest.spawned
quest.accepted
quest.verification_submitted
quest.resolved
challenge.issued
challenge.accepted
challenge.declined
market.opened
market.bet_placed
market.closed
market.settled
location.party_presence_changed
feed.event_created
```

Feed events are durable projections of these domain events. UI code must render unknown event types with a safe generic fallback.

## Location and privacy contract

- Permission states are first-class: unavailable, not requested, denied, approximate, foreground, and background.
- Request foreground permission in context. Request background permission only after explaining the active feature that needs it.
- An active quest may upload timestamp, coordinates, accuracy, source, and quest/session ID. Raw samples have short retention; derived verification/presence records may persist.
- Party presence shares an approximate area and freshness (“near campus, 5 min ago”) by default. Exact coordinates are not returned to other party members.
- Automatically stop location sessions on expiry, logout, party exit, or explicit pause.
- Reject stale, impossible, or too-inaccurate samples with a retryable reason. GPS is reasonable game evidence, not anti-cheat proof.
- Provide deletion and sharing controls. Never run continuous background tracking merely to populate a map.

## Optional AI/Grok boundary

Grok is optional and server-only behind an interface such as `QuestSuggestionProvider` or `MarketCommentaryProvider`.

Good uses: remixing a curated safe quest template for a party, generating playful non-abusive copy, or summarizing why friends predicted an outcome. Bad uses: moving coins, setting market outcomes, revealing precise location, diagnosing health, or inventing unmoderated physical tasks.

Require structured JSON output, schema validation, timeouts, redacted inputs, a deterministic fallback, and post-generation safety checks. The app must demo successfully with the provider disabled.

## Definition of done for every branch

- Inspect before editing and preserve changes outside the owned scope.
- Implement actual behavior, not only mock screens, while retaining a demo adapter where external services are unavailable.
- Add focused tests for domain invariants and failure paths.
- Run formatting, typecheck, lint, and relevant tests; report exact commands and results.
- Document environment/config changes in `.env.example` and the relevant README without secrets.
- End with a concise summary of decisions, files changed, verification, assumptions, and integration steps.
