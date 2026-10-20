-- 003 · Fire events: FIRMS hotspots clustered per UTC day, by district
-- Step 4 of docs/severity-pipeline.md (fire.py).
--
-- Paste the whole file into the Supabase SQL editor and run it once.
-- Safe to re-run. Changes nothing the frontend reads today.
-- Grant pattern (pipeline/CLAUDE.md): anon reads, only the service role writes.

begin;

-- One row per fire event: nominal/high-confidence hotspots within 1.5 km
-- of each other on the same UTC day (acq_date), placed in the district
-- holding the centroid. India only. Each run rebuilds today and yesterday;
-- rows older than fire.events_retention_days (14) are deleted.
create table if not exists public.fire_events (
  id                 text primary key,     -- FIRE-<lat>-<lon>-<acq_date>-<acq_time> of the earliest hotspot
  acq_date           date not null,        -- UTC day of the hotspots
  latitude           numeric not null,     -- centroid
  longitude          numeric not null,
  hotspot_count      integer not null,
  frp_max            numeric,              -- fire radiative power, MW
  frp_sum            numeric,
  first_seen         timestamptz not null,
  last_seen          timestamptz not null,
  confidence_nominal integer not null,
  confidence_high    integer not null,
  district_id        text not null,        -- geoBoundaries shapeID
  district           text not null,
  state              text not null,
  last_run_id        bigint references public.pipeline_runs (id) on delete set null,
  updated_at         timestamptz not null default now()
);

comment on table public.fire_events is
  'FIRMS hotspots clustered into fire events per UTC day, with district and state. Written by the Pi pipeline (fire.py).';

create index if not exists fire_events_acq_date_idx on public.fire_events (acq_date);
create index if not exists fire_events_state_date_idx on public.fire_events (state, acq_date);

-- "Fire activity in N districts": daily roll-ups by district and by state.
create or replace view public.fire_district_daily with (security_invoker = true) as
select acq_date, state, district_id, district,
       count(*)           as fire_events,
       sum(hotspot_count) as hotspots,
       sum(frp_sum)       as frp_sum,
       max(frp_max)       as frp_max
from public.fire_events
group by acq_date, state, district_id, district;

create or replace view public.fire_state_daily with (security_invoker = true) as
select acq_date, state,
       count(*)                    as fire_events,
       count(distinct district_id) as districts,
       sum(hotspot_count)          as hotspots,
       sum(frp_sum)                as frp_sum,
       max(frp_max)                as frp_max
from public.fire_events
group by acq_date, state;

-- RLS: everyone can read, nobody but the service role writes.
alter table public.fire_events enable row level security;
drop policy if exists "fire_events readable by everyone" on public.fire_events;
create policy "fire_events readable by everyone"
  on public.fire_events for select
  to anon, authenticated
  using (true);

revoke all on public.fire_events from anon, authenticated;
revoke all on public.fire_district_daily from anon, authenticated;
revoke all on public.fire_state_daily from anon, authenticated;
grant select on public.fire_events to anon;
grant select on public.fire_district_daily to anon;
grant select on public.fire_state_daily to anon;
grant select, insert, update, delete on public.fire_events to service_role;
grant select on public.fire_district_daily to service_role;
grant select on public.fire_state_daily to service_role;

commit;
