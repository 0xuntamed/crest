-- Crest schema v1
-- Authors are anonymous: a random secret lives in an httpOnly cookie, we only store its hash.
create table if not exists authors (
  id            uuid primary key default gen_random_uuid(),
  token_hash    text not null unique,
  display_name  text not null default '',
  created_at    timestamptz not null default now()
);

-- A draft is a live, append-only writing session.
-- content/origins are the server's authoritative replay of every batch so far.
create table if not exists drafts (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null references authors(id) on delete cascade,
  title         text not null default '',
  content       text not null default '',
  origins       text not null default '',      -- one char per UTF-16 unit of content: t|p|o
  seq           integer not null default 0,     -- number of batches appended
  head_hash     text not null,                  -- hash of the latest batch (or genesis)
  last_t        bigint not null default 0,      -- last client event timestamp (ms)
  status        text not null default 'open' check (status in ('open','sealed')),
  created_ms    bigint not null,                -- part of the genesis hash
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists drafts_author_idx on drafts(author_id, updated_at desc);

-- Each batch is a link in the hash chain. events_json is stored verbatim so anyone can re-hash it.
create table if not exists batches (
  draft_id      uuid not null references drafts(id) on delete cascade,
  seq           integer not null,
  events_json   text not null,
  received_at   timestamptz not null,
  received_ms   bigint not null,
  prev_hash     text not null,
  hash          text not null,
  primary key (draft_id, seq)
);

-- A crest is the sealed, signed, immutable result of a draft.
create table if not exists crests (
  slug          text primary key,
  draft_id      uuid not null unique references drafts(id) on delete cascade,
  author_name   text not null default '',
  title         text not null default '',
  content       text not null,
  origins       text not null,
  content_hash  text not null,                  -- sha256(content), exact
  lookup_hash   text not null,                  -- sha256(normalized content), for /verify
  content_norm  text not null,                  -- normalized content, for snippet lookup
  metrics       jsonb not null,
  tier          text not null,
  chain_head    text not null,
  chain_length  integer not null,
  signature     text not null,
  is_public     boolean not null default true,
  sealed_at     timestamptz not null default now()
);
create index if not exists crests_lookup_idx on crests(lookup_hash);
create index if not exists crests_public_idx on crests(is_public, sealed_at desc);

-- Server signing key (Ed25519). Used only when CREST_SIGNING_KEY env is not provided.
create table if not exists server_keys (
  id            integer primary key check (id = 1),
  private_pem   text not null,
  public_pem    text not null,
  created_at    timestamptz not null default now()
);
