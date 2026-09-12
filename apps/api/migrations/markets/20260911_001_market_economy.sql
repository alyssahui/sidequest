-- SideQuest market/economy schema. Apply with the integration branch's migration runner.
-- State transitions, ledger entries, settlement, idempotency, and outbox writes belong in one DB transaction.

create table if not exists ledger_accounts (
  id uuid primary key,
  account_key text not null unique,
  account_type text not null check (account_type in ('USER', 'MARKET_ESCROW', 'BOUNTY_ESCROW', 'SYSTEM')),
  user_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists ledger_transactions (
  id uuid primary key,
  operation_id text not null unique,
  reason text not null,
  related_entity_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists ledger_entries (
  id uuid primary key,
  transaction_id uuid not null references ledger_transactions(id),
  leg_index integer not null,
  account_id uuid not null references ledger_accounts(id),
  amount bigint not null check (amount <> 0),
  balance_after bigint not null,
  created_at timestamptz not null default now(),
  unique (transaction_id, leg_index)
);

create table if not exists prediction_markets (
  id uuid primary key,
  quest_instance_id uuid not null,
  participant_user_id uuid not null,
  party_id uuid not null,
  prompt text not null,
  status text not null check (status in ('DRAFT', 'OPEN', 'CLOSED', 'SETTLED', 'VOID')),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  outcome text check (outcome in ('COMPLETE', 'FAIL')),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  check (closes_at > opens_at)
);

create table if not exists prediction_bets (
  id uuid primary key,
  market_id uuid not null references prediction_markets(id),
  bettor_user_id uuid not null,
  outcome text not null check (outcome in ('COMPLETE', 'FAIL')),
  amount bigint not null check (amount > 0),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (market_id, idempotency_key),
  unique (market_id, id)
);

create index if not exists prediction_bets_market_outcome_idx
  on prediction_bets (market_id, outcome, created_at, id);

create table if not exists market_settlements (
  id uuid primary key,
  market_id uuid not null unique references prediction_markets(id),
  outcome text check (outcome in ('COMPLETE', 'FAIL')),
  refund_all boolean not null default false,
  settled_at timestamptz not null default now()
);

create table if not exists command_idempotency (
  scope text not null,
  idempotency_key text not null,
  response_json jsonb not null,
  created_at timestamptz not null default now(),
  primary key (scope, idempotency_key)
);

create table if not exists domain_outbox (
  id uuid primary key,
  event_type text not null,
  aggregate_id uuid not null,
  correlation_id text not null,
  payload jsonb not null,
  occurred_at timestamptz not null,
  published_at timestamptz
);

-- Deferred to integration: add foreign keys to users, parties, and quest_instances once their migrations land.
