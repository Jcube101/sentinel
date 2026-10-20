-- 001 · Pipeline run records (edition numbers) + per-source freshness
-- Step 1 of docs/severity-pipeline.md.
--
-- Paste the whole file into the Supabase SQL editor and run it once.
-- Safe to re-run: every statement is idempotent. Changes nothing the
-- frontend reads today (events, aqi_readings); only adds a table and
-- adds nullable columns to sources.

begin;

-- One row per (non-dry) pipeline run. id is the edition number ("No. 292").
create table if not exists public.pipeline_runs (
  id              bigint generated always as identity primary key,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  status          text not null default 'running'
                  check (status in ('running', 'ok', 'failed')),
  duration_s      numeric,
  events_upserted integer,
  aqi_upserted    integer,
  -- Per-source result for this run, keyed by sources.id, e.g.
  -- {"FIRMS": {"status": "ok", "rows": 2724, "duration_s": 3.1, "error": null,
  --            "newest_observation_at": "2026-10-20T08:12:00+00:00",
  --            "new_data": true}, ...}
  -- new_data = this run brought observations newer than any seen before;
  -- trend rules count these updates, not runs.
  sources         jsonb not null default '{}'::jsonb
);

comment on table public.pipeline_runs is
  'One row per pipeline run; id is the edition number. Written by the Pi pipeline.';

create index if not exists pipeline_runs_started_at_idx
  on public.pipeline_runs (started_at desc);

alter table public.pipeline_runs enable row level security;
drop policy if exists "pipeline_runs readable by everyone" on public.pipeline_runs;
create policy "pipeline_runs readable by everyone"
  on public.pipeline_runs for select
  to anon, authenticated
  using (true);

-- Data API grants for tables created after 30 Oct 2026 (pipeline/CLAUDE.md).
-- Read-only for the public key; only the service role (the pipeline) writes.
grant select on public.pipeline_runs to anon;
grant select, insert, update, delete on public.pipeline_runs to service_role;
-- The pipeline inserts with the service key; make sure it can draw ids.
do $$
begin
  execute format(
    'grant usage, select on sequence %s to service_role',
    pg_get_serial_sequence('public.pipeline_runs', 'id')
  );
end
$$;

-- Per-source freshness, updated by every non-dry run.
--   last_attempt_at        when the pipeline last tried this source
--   last_success_at        last good fetch: data fetched AND written
--   last_status            ok | empty (dense source returned nothing) | timeout | error
--   last_error             error text of the last attempt (API keys redacted); null when ok
--   last_row_count         rows returned by the last attempt
--   newest_observation_at  newest observation time ever delivered by a good fetch
--   last_new_data_at       when newest_observation_at last moved forward
--   last_run_id            pipeline_runs.id of the last attempt
alter table public.sources
  add column if not exists last_attempt_at       timestamptz,
  add column if not exists last_success_at       timestamptz,
  add column if not exists last_status           text,
  add column if not exists last_error            text,
  add column if not exists last_row_count        integer,
  add column if not exists newest_observation_at timestamptz,
  add column if not exists last_new_data_at      timestamptz,
  add column if not exists last_run_id           bigint
    references public.pipeline_runs (id) on delete set null;

alter table public.sources drop constraint if exists sources_last_status_check;
alter table public.sources add constraint sources_last_status_check
  check (last_status is null or last_status in ('ok', 'empty', 'timeout', 'error'));

commit;
