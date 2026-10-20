-- 002 · Severity desk: current items + one snapshot per item per run
-- Step 2 of docs/severity-pipeline.md (quakes, floods, cyclones first;
-- fire and air items use the same tables in later steps).
--
-- Paste the whole file into the Supabase SQL editor and run it once.
-- Safe to re-run. Changes nothing the frontend reads today.
--
-- Grant pattern (pipeline/CLAUDE.md): anon gets select only, the service
-- role (the pipeline) writes. Supabase's default privileges also hand
-- anon/authenticated insert/update/delete on every new table (RLS is what
-- stops them), so each table revokes those explicitly.

begin;

-- Current state of every desk item. One row per item, updated each run.
create table if not exists public.desk_items (
  id                text primary key,       -- earthquake:USGS-us6000u2wp, flood:GDACS-FL-1104154, cyclone:GDACS-TC-1001326
  category          text not null
                    check (category in ('earthquake', 'flood', 'cyclone', 'fire', 'air')),
  source            text not null references public.sources (id),
  source_ref        text,                   -- events.id it comes from; null for roll-ups (fire per state, air)
  title             text not null,
  place_name        text,
  latitude          numeric,
  longitude         numeric,
  severity_level    smallint not null check (severity_level between 1 and 4),
  severity_reason   text not null,          -- shown in the UI, e.g. 'GDACS Orange alert', 'M5.4, 63 km from India (USGS)'
  peak_level        smallint not null check (peak_level between 1 and 4),
  status            text not null check (status in ('open', 'closed')),
  opened_at         timestamptz not null,
  escalated_at      timestamptz,            -- last level increase
  closed_at         timestamptz,
  last_known        boolean not null default false,  -- source failed this run; showing the last known state
  observed_at       timestamptz,            -- when it happened / started (quake time, GDACS fromdate)
  source_updated_at timestamptz,            -- when the source last revised it (USGS updated, GDACS datemodified)
  figures           jsonb not null default '{}'::jsonb,  -- key figures: magnitude, depth_km, km_from_india, alert scores...
  first_run_id      bigint references public.pipeline_runs (id) on delete set null,
  last_run_id       bigint references public.pipeline_runs (id) on delete set null,
  updated_at        timestamptz not null default now()
);

comment on table public.desk_items is
  'Severity desk items, one 1-4 level each. Written by the Pi pipeline (desk.py).';

create index if not exists desk_items_open_idx
  on public.desk_items (severity_level desc, opened_at desc) where status = 'open';
create index if not exists desk_items_category_status_idx
  on public.desk_items (category, status);

-- A snapshot of every open (or just-closed) item on every run: powers
-- "since yesterday", item history, trend charts and the edition strip.
create table if not exists public.desk_item_snapshots (
  run_id          bigint not null references public.pipeline_runs (id) on delete cascade,
  item_id         text not null references public.desk_items (id) on delete cascade,
  taken_at        timestamptz not null,
  category        text not null,
  status          text not null check (status in ('open', 'closed')),
  severity_level  smallint not null check (severity_level between 1 and 4),
  severity_reason text not null,
  last_known      boolean not null,
  new_data        boolean not null,         -- the source revised this item since the last snapshot
  change          text check (change in ('opened', 'reopened', 'escalated', 'deescalated', 'closed')),
  figures         jsonb not null default '{}'::jsonb,
  primary key (run_id, item_id)
);

comment on table public.desk_item_snapshots is
  'One row per desk item per pipeline run (open or just closed).';

create index if not exists desk_item_snapshots_item_idx
  on public.desk_item_snapshots (item_id, run_id desc);
create index if not exists desk_item_snapshots_taken_at_idx
  on public.desk_item_snapshots (taken_at);

-- RLS: everyone can read, nobody but the service role writes.
alter table public.desk_items enable row level security;
drop policy if exists "desk_items readable by everyone" on public.desk_items;
create policy "desk_items readable by everyone"
  on public.desk_items for select
  to anon, authenticated
  using (true);

alter table public.desk_item_snapshots enable row level security;
drop policy if exists "desk_item_snapshots readable by everyone" on public.desk_item_snapshots;
create policy "desk_item_snapshots readable by everyone"
  on public.desk_item_snapshots for select
  to anon, authenticated
  using (true);

-- Grants: read-only for the public key; only the service role writes.
revoke all on public.desk_items from anon, authenticated;
revoke all on public.desk_item_snapshots from anon, authenticated;
grant select on public.desk_items to anon;
grant select on public.desk_item_snapshots to anon;
grant select, insert, update, delete on public.desk_items to service_role;
grant select, insert, update, delete on public.desk_item_snapshots to service_role;

-- Same fix for the table from 001: anon/authenticated had write privileges
-- from Supabase's defaults (RLS blocked them). Make it read-only by grant too.
revoke all on public.pipeline_runs from anon, authenticated;
grant select on public.pipeline_runs to anon;

commit;
