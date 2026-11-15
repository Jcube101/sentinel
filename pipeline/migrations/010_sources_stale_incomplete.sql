-- 010 · sources.last_status also allows 'stale' and 'incomplete'
-- air.py (completeness guard for the data.gov.in feed, 15 Nov 2026).
--
-- Paste the whole file into the Supabase SQL editor and run it once.
-- Safe to re-run. Changes only the CHECK on sources.last_status; no data, no grants.
--
-- When data.gov.in answers but its snapshot can't be used, the DATAGOV row now
-- says why instead of "ok":
--   stale       the snapshot is older than [air.datagov] max_snapshot_age_hours
--   incomplete  it has far fewer stations or cities than usual
-- (the other values are unchanged: ok | empty | timeout | error).
-- Merge the code only after this has run: without it, writing 'stale' or
-- 'incomplete' to sources fails the check and the run is marked failed.

begin;

alter table public.sources drop constraint if exists sources_last_status_check;
alter table public.sources add constraint sources_last_status_check
  check (last_status is null
         or last_status in ('ok', 'empty', 'timeout', 'error', 'stale', 'incomplete'));

commit;

-- Check (should return one row with both new values in the definition):
-- select pg_get_constraintdef(oid) from pg_constraint where conname = 'sources_last_status_check';
