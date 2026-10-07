-- Boarding House server tables (run once in the Supabase SQL editor).
-- The server uses the service-role key, so RLS can stay enabled with no public policies:
-- the browser never talks to Supabase directly.

create table if not exists npc_memory (
  id uuid primary key, created_at timestamptz not null default now(),
  player_id text not null, npc_key text not null, note text not null
);
create index if not exists npc_memory_lookup on npc_memory (player_id, npc_key, created_at desc);

create table if not exists ledger (            -- what the AI granted (caps per day)
  id uuid primary key, created_at timestamptz not null default now(),
  player_id text not null, day text not null, kind text not null, amount integer not null, npc_key text
);
create index if not exists ledger_lookup on ledger (player_id, day, kind);

create table if not exists usage (             -- AI calls per player per day (budget)
  id uuid primary key, created_at timestamptz not null default now(),
  player_id text not null, day text not null, kind text not null, cost integer not null default 1, cached boolean default false
);
create index if not exists usage_lookup on usage (player_id, day);

create table if not exists board_posts (       -- school noticeboard
  id uuid primary key, created_at timestamptz not null default now(),
  school_id text not null, player_id text not null, author text not null,
  text text not null, status text not null default 'visible', reports integer not null default 0
);
create index if not exists board_school on board_posts (school_id, created_at desc);

create table if not exists graffiti (          -- desks & walls, persists across terms
  id uuid primary key, created_at timestamptz not null default now(),
  school_id text not null, map_id text not null, spot text not null, player_id text not null, author text not null,
  text text not null, status text not null default 'visible', reports integer not null default 0
);
create index if not exists graffiti_spot on graffiti (school_id, map_id);

create table if not exists shirts (            -- sign-out day shirts
  id uuid primary key, created_at timestamptz not null default now(),
  owner_id text not null, owner_name text not null, school_id text not null,
  signatures jsonb not null default '[]'::jsonb, status text not null default 'open'
);

create table if not exists slambooks (
  id uuid primary key, created_at timestamptz not null default now(),
  owner_id text not null, owner_name text not null, questions jsonb not null,
  entries jsonb not null default '[]'::jsonb
);

create table if not exists reports (           -- kept with the ORIGINAL text for moderators
  id uuid primary key, created_at timestamptz not null default now(),
  item_type text not null, item_id text not null, original_text text not null,
  reporter_id text not null, reason text, resolved boolean not null default false
);

create table if not exists settings (
  id uuid primary key, created_at timestamptz not null default now(),
  key text unique not null, value jsonb
);

alter table npc_memory enable row level security;
alter table ledger enable row level security;
alter table usage enable row level security;
alter table board_posts enable row level security;
alter table graffiti enable row level security;
alter table shirts enable row level security;
alter table slambooks enable row level security;
alter table reports enable row level security;
alter table settings enable row level security;
