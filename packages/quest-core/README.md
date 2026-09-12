# Quest core

Framework-free quest, challenge, verification, spawning, and want/need orchestration. External location, economy, membership, social-safety, time, IDs, and event delivery enter through ports.

The in-memory adapters support deterministic demos. Production repositories must save a state transition and its outbox event in one database transaction. Raw GPS and photo references remain in verification attempts and are never copied into public domain events.

Seed content covers CMU/Pittsburgh community cleanup, reconnection, teaching, mutual aid, accessibility-aware exploration, gentle wellness, and local-place support. Every template is curated and safety-approved; generated free-form physical tasks are intentionally unsupported.

Run `pnpm --filter @sidequest/quest-core test` for domain coverage.
