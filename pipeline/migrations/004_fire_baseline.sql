-- 004 · Seasonal fire baseline: normal fire activity per state per week
-- Step 5 of docs/severity-pipeline.md (baseline.py, tools/build_fire_baseline.py).
--
-- Paste the whole file into the Supabase SQL editor and run it once.
-- Safe to re-run. Changes nothing the frontend reads today.
-- Grant pattern (pipeline/CLAUDE.md): anon reads, only the service role writes.

begin;

-- Built once from the FIRMS VIIRS NOAA-20 standard-processing archive
-- (2024-2025), counted exactly like live fire_events: nominal/high
-- confidence vegetation fires, static heat sources masked, 1.5 km clusters
-- per UTC day, India's districts minus excluded ones. Days without fires
-- count as zero. state = 'India' is the national total.
-- week = (day of year - 1) / 7 + 1, with days 358-366 folded into week 52.
create table if not exists public.fire_baseline (
  state                  text not null,
  week                   smallint not null check (week between 1 and 52),
  mean_daily_events      numeric not null,   -- the norm: smoothed over weeks w-1..w+1
  mean_daily_events_week numeric not null,   -- this week only
  mean_daily_hotspots    numeric not null,   -- smoothed, like mean_daily_events
  max_daily_events       integer not null,   -- busiest single day in the smoothing window
  days                   integer not null,   -- archive days behind the smoothed norm
  years                  text not null,      -- '2024-2025'
  built_at               timestamptz not null,
  primary key (state, week)
);

comment on table public.fire_baseline is
  'Seasonal fire norm per state and calendar week from the FIRMS archive. Written by tools/build_fire_baseline.py.';

alter table public.fire_baseline enable row level security;
drop policy if exists "fire_baseline readable by everyone" on public.fire_baseline;
create policy "fire_baseline readable by everyone"
  on public.fire_baseline for select
  to anon, authenticated
  using (true);

revoke all on public.fire_baseline from anon, authenticated;
grant select on public.fire_baseline to anon;
grant select, insert, update, delete on public.fire_baseline to service_role;

commit;
