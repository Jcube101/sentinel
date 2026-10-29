-- 009 · The tables from before migration 001 are no longer public
-- Part C of the frontend switch-over (docs/severity-pipeline.md, Follow-ups).
--
-- Paste the whole file into the Supabase SQL editor and run it once.
-- Safe to re-run. The pipeline is unaffected: it uses the service role, which keeps
-- every privilege and bypasses row level security.
--
-- Why: the Situation Report (live since 29 Oct 2026) reads none of events,
-- aqi_readings, sources or categories. Its queries (frontend/src) touch only
-- desk_items, desk_item_snapshots, desk_watch, desk_watch_snapshots, category_status,
-- pipeline_runs, fire_events, fire_state_daily and fire_day_points. Old /event/:id
-- links resolve through desk_items.source_ref, and the Sources page reads
-- pipeline_runs.sources.
--
-- What it does, per table: SELECT revoked from anon and authenticated (007 already took
-- every other privilege), and the read-everything policy from 007 dropped, so with RLS
-- still on, nothing but the service role sees a row even if a grant comes back.

begin;

do $$
declare
  t text;
begin
  foreach t in array array['events', 'aqi_readings', 'sources', 'categories'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || ' readable by everyone', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end
$$;

commit;

-- Check (read-only): every table and view in public, after the change.
-- Expected: anon_select false on events, aqi_readings, sources and categories, true on
-- every other row; anon_write and authenticated_write false everywhere.
select c.relname as name,
       case c.relkind when 'v' then 'view' else 'table' end as kind,
       c.relrowsecurity as rls,
       has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
       has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_select,
       (has_table_privilege('anon', c.oid, 'INSERT') or has_table_privilege('anon', c.oid, 'UPDATE')
        or has_table_privilege('anon', c.oid, 'DELETE') or has_table_privilege('anon', c.oid, 'TRUNCATE'))
         as anon_write,
       (has_table_privilege('authenticated', c.oid, 'INSERT') or has_table_privilege('authenticated', c.oid, 'UPDATE')
        or has_table_privilege('authenticated', c.oid, 'DELETE') or has_table_privilege('authenticated', c.oid, 'TRUNCATE'))
         as authenticated_write
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'v')
order by anon_select, kind, name;
