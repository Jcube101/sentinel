-- 008 · Per-edition archive: every past edition rebuilds exactly as published
-- Part B of the frontend switch-over (docs/situation-report-plan.md, section 7: P1-P4),
-- plus last_known in desk_last_level3.
--
-- Paste the whole file into the Supabase SQL editor and run it once.
-- Safe to re-run. Adds columns and tables only; nothing existing changes meaning,
-- and the live site reads none of it. The pipeline writes the new columns and
-- tables only once the code that needs them is merged (after this is applied).
-- Grant pattern (pipeline/CLAUDE.md): anon reads, only the service role writes.

begin;

-- P1 · Each item's title, place and map position as of that run. Fire and air titles
-- change between runs, fire centroids move every day, a cyclone moves with its storm.
-- Null on snapshots taken before the pipeline wrote them.
alter table public.desk_item_snapshots
  add column if not exists title      text,
  add column if not exists place_name text,
  add column if not exists latitude   numeric,
  add column if not exists longitude  numeric;

-- P2 · The watching list as of each run: one row per watch subject per run (every
-- subject, not only those watching), the desk_watch columns minus the trend, which
-- the earlier runs' rows already hold.
create table if not exists public.desk_watch_snapshots (
  run_id                bigint not null references public.pipeline_runs (id) on delete cascade,
  subject_id            text not null,          -- desk_watch.id: fire:punjab, air:IN, earthquake:USGS-...
  category              text not null
                        check (category in ('earthquake', 'flood', 'cyclone', 'fire', 'air')),
  title                 text not null,
  item_id               text references public.desk_items (id) on delete set null,
  level                 smallint check (level between 1 and 4),
  next_level            smallint check (next_level between 1 and 4),
  metric                text,
  value                 numeric,
  next_threshold        numeric,
  distance_to_threshold numeric,
  rising_updates        smallint not null default 0,
  watching              boolean not null,
  watch_reason          text,
  source_updated_at     timestamptz,
  taken_at              timestamptz not null,
  primary key (run_id, subject_id)
);

comment on table public.desk_watch_snapshots is
  'Watching list per pipeline run: every watch subject, as desk_watch held it that run. Written by watch.py.';

create index if not exists desk_watch_snapshots_subject_idx
  on public.desk_watch_snapshots (subject_id, run_id desc);

-- P3 · The thresholds each edition ran with: severity.toml as JSON, a full copy per run
-- (~1.6 KB). Editions 1-28 are backfilled from severity.toml's git history.
alter table public.pipeline_runs
  add column if not exists severity_config jsonb;

-- P4 · Fire points per UTC day, kept indefinitely (fire_events keeps 14 days). One row
-- per day, rewritten by every run whose FIRMS window holds the day, so a day's row is
-- final once the day leaves the window. points: one array per fire event,
--   [latitude, longitude, hotspots, frp_max, first_seen, state]
-- first_seen = the event's earliest acquisition, minutes after 00:00 UTC that day, so a
-- past edition shows only the points it had (first_seen <= its data time); state = an
-- index into states.
create table if not exists public.fire_day_points (
  acq_date     date primary key,
  fire_events  integer not null,
  states       text[] not null,
  points       jsonb not null,
  last_run_id  bigint references public.pipeline_runs (id) on delete set null,
  updated_at   timestamptz not null default now()
);

comment on table public.fire_day_points is
  'FIRMS fire events per UTC day as compact points [lat, lon, hotspots, frp_max, first_seen minute UTC, state index], kept indefinitely. Written by fire.py.';

-- The most recent Level 3+ snapshot, now saying whether it was last-known (the source
-- had failed and the level was carried over), e.g. ARNAB-26 in editions 23-24.
create or replace view public.desk_last_level3 with (security_invoker = true) as
select s.item_id, i.title, s.category, s.severity_level, s.severity_reason, s.taken_at,
       (now() at time zone 'Asia/Kolkata')::date - (s.taken_at at time zone 'Asia/Kolkata')::date as days_since,
       s.last_known
from public.desk_item_snapshots s
join public.desk_items i on i.id = s.item_id
where s.status = 'open' and s.severity_level >= 3
order by s.taken_at desc
limit 1;

-- RLS: everyone can read, nobody but the service role writes.
alter table public.desk_watch_snapshots enable row level security;
drop policy if exists "desk_watch_snapshots readable by everyone" on public.desk_watch_snapshots;
create policy "desk_watch_snapshots readable by everyone"
  on public.desk_watch_snapshots for select to anon, authenticated using (true);

alter table public.fire_day_points enable row level security;
drop policy if exists "fire_day_points readable by everyone" on public.fire_day_points;
create policy "fire_day_points readable by everyone"
  on public.fire_day_points for select to anon, authenticated using (true);

revoke all on public.desk_watch_snapshots from anon, authenticated;
revoke all on public.fire_day_points from anon, authenticated;
revoke all on public.desk_last_level3 from anon, authenticated;
grant select on public.desk_watch_snapshots to anon;
grant select on public.fire_day_points to anon;
grant select on public.desk_last_level3 to anon;
grant select, insert, update, delete on public.desk_watch_snapshots to service_role;
grant select, insert, update, delete on public.fire_day_points to service_role;
grant select on public.desk_last_level3 to service_role;

commit;

-- Check (read-only): the new columns, tables and view column, and their grants.
select 'desk_item_snapshots.' || column_name as what, data_type as detail
from information_schema.columns
where table_schema = 'public' and table_name = 'desk_item_snapshots'
  and column_name in ('title', 'place_name', 'latitude', 'longitude')
union all
select 'pipeline_runs.severity_config', data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'pipeline_runs' and column_name = 'severity_config'
union all
select 'desk_last_level3.last_known', data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'desk_last_level3' and column_name = 'last_known'
union all
select c.relname || ' grants',
       'rls ' || c.relrowsecurity
       || ', anon select ' || has_table_privilege('anon', c.oid, 'SELECT')
       || ', anon write ' || (has_table_privilege('anon', c.oid, 'INSERT') or has_table_privilege('anon', c.oid, 'UPDATE')
                              or has_table_privilege('anon', c.oid, 'DELETE'))
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('desk_watch_snapshots', 'fire_day_points', 'desk_last_level3')
order by 1;
