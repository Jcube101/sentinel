-- 005 · Quiet-day desk: watching list, per-category status, daily max level, last Level 3+
-- Step 7 of docs/severity-pipeline.md (watch.py).
--
-- Paste the whole file into the Supabase SQL editor and run it once.
-- Safe to re-run. Changes nothing the frontend reads today.
-- Grant pattern (pipeline/CLAUDE.md): anon reads, only the service role writes.

begin;

-- The watching list and the trend behind it: one row per subject the desk
-- measures against its next level (an open desk item, or a fire state below
-- Level 2), updated each run while the subject's source is good. Rows not
-- updated for [watching] keep_days (severity.toml) are deleted.
create table if not exists public.desk_watch (
  id                    text primary key,        -- fire:punjab, air:IN, earthquake:USGS-us6000u2wp
  category              text not null
                        check (category in ('earthquake', 'flood', 'cyclone', 'fire', 'air')),
  title                 text not null,           -- 'Punjab', 'Air quality (India)', the quake's title
  item_id               text references public.desk_items (id) on delete set null,  -- open desk item, if any
  level                 smallint check (level between 1 and 4),        -- current level; null = nothing at Level 1
  next_level            smallint check (next_level between 1 and 4),   -- level it is measured against; null = none reachable
  metric                text,                    -- what value measures, e.g. 'fire events on 20 Oct', 'magnitude'
  value                 numeric,
  next_threshold        numeric,                 -- value at which next_level starts; null when there is none (GDACS)
  distance_to_threshold numeric,                 -- (next_threshold - value) / next_threshold: 0.04 = 4% below
  trend                 jsonb not null default '[]'::jsonb,  -- last source updates, oldest first: [{at, value, threshold, next_level}]
  rising_updates        smallint not null default 0,  -- consecutive source updates that moved value toward next_threshold
  watching              boolean not null default false,
  watch_reason          text,                    -- '4% below Level 3 (M6.0)', 'rising for 3 updates toward Level 2'
  source_updated_at     timestamptz,             -- the source data the row was last computed from
  last_run_id           bigint references public.pipeline_runs (id) on delete set null,
  updated_at            timestamptz not null default now()
);

comment on table public.desk_watch is
  'Watching list: distance to the next severity level and recent trend per subject. Written by the Pi pipeline (watch.py).';

create index if not exists desk_watch_watching_idx
  on public.desk_watch (category) where watching;

-- Per-category status for every run, so the desk shows an all-clear table
-- instead of an empty list (and an older edition can show its own).
create table if not exists public.category_status (
  run_id        bigint not null references public.pipeline_runs (id) on delete cascade,
  category      text not null
                check (category in ('earthquake', 'flood', 'cyclone', 'fire', 'air')),
  level         smallint check (level between 1 and 4),  -- highest open level; null = none open
  open_items    integer not null,
  last_known    boolean not null,         -- the source failed this run; levels are the last known
  summary       text not null,            -- one line, e.g. 'No current GDACS flood alerts for India'
  source        text not null references public.sources (id),
  source_status text,                     -- this run's fetch: ok | empty | timeout | error
  watching      integer not null default 0,  -- subjects on the watching list
  taken_at      timestamptz not null,
  primary key (run_id, category)
);

comment on table public.category_status is
  'One row per category per pipeline run: level or none open, one-line summary, source. Written by watch.py.';

-- The latest run's status for each category.
create or replace view public.category_status_latest with (security_invoker = true) as
select *
from public.category_status
where run_id = (select max(run_id) from public.category_status);

-- Most severe open item per IST day, for the 14-day strip. One row per day
-- from the first pipeline run to today. max_level: 0 = runs that day but
-- nothing open (a quiet day); null = no runs that day (no data).
create or replace view public.desk_daily_max with (security_invoker = true) as
with days as (
  select generate_series(
           (select min((started_at at time zone 'Asia/Kolkata')::date) from public.pipeline_runs),
           (now() at time zone 'Asia/Kolkata')::date,
           interval '1 day')::date as day
), runs as (
  select (started_at at time zone 'Asia/Kolkata')::date as day, count(*) as runs
  from public.pipeline_runs
  group by 1
), top as (
  select distinct on ((taken_at at time zone 'Asia/Kolkata')::date)
         (taken_at at time zone 'Asia/Kolkata')::date as day,
         severity_level, item_id, category, severity_reason
  from public.desk_item_snapshots
  where status = 'open'
  order by (taken_at at time zone 'Asia/Kolkata')::date, severity_level desc, taken_at desc
)
select d.day,
       coalesce(r.runs, 0) as runs,
       case when r.runs is null then null else coalesce(t.severity_level, 0) end as max_level,
       t.item_id, t.category, t.severity_reason
from days d
left join runs r on r.day = d.day
left join top t on t.day = d.day;

-- The most recent Level 3+ snapshot and how many IST days ago it was.
-- Empty until the desk has had a Level 3+ item.
create or replace view public.desk_last_level3 with (security_invoker = true) as
select s.item_id, i.title, s.category, s.severity_level, s.severity_reason, s.taken_at,
       (now() at time zone 'Asia/Kolkata')::date - (s.taken_at at time zone 'Asia/Kolkata')::date as days_since
from public.desk_item_snapshots s
join public.desk_items i on i.id = s.item_id
where s.status = 'open' and s.severity_level >= 3
order by s.taken_at desc
limit 1;

-- RLS: everyone can read, nobody but the service role writes.
alter table public.desk_watch enable row level security;
drop policy if exists "desk_watch readable by everyone" on public.desk_watch;
create policy "desk_watch readable by everyone"
  on public.desk_watch for select
  to anon, authenticated
  using (true);

alter table public.category_status enable row level security;
drop policy if exists "category_status readable by everyone" on public.category_status;
create policy "category_status readable by everyone"
  on public.category_status for select
  to anon, authenticated
  using (true);

revoke all on public.desk_watch from anon, authenticated;
revoke all on public.category_status from anon, authenticated;
revoke all on public.category_status_latest from anon, authenticated;
revoke all on public.desk_daily_max from anon, authenticated;
revoke all on public.desk_last_level3 from anon, authenticated;
grant select on public.desk_watch to anon;
grant select on public.category_status to anon;
grant select on public.category_status_latest to anon;
grant select on public.desk_daily_max to anon;
grant select on public.desk_last_level3 to anon;
grant select, insert, update, delete on public.desk_watch to service_role;
grant select, insert, update, delete on public.category_status to service_role;
grant select on public.category_status_latest to service_role;
grant select on public.desk_daily_max to service_role;
grant select on public.desk_last_level3 to service_role;

commit;
