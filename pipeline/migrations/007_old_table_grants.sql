-- 007 · Read-only Data API grants on the tables from before migration 001
-- Follow-up "Grants on sources" in docs/severity-pipeline.md.
--
-- Paste the whole file into the Supabase SQL editor and run it once.
-- Safe to re-run. The live site keeps working: anon keeps SELECT on all four
-- tables (it reads events and aqi_readings). Only the service role (the Pi
-- pipeline) can write afterwards.
--
-- Why: events, aqi_readings, sources and categories predate the grant
-- pattern in pipeline/CLAUDE.md. A probe with the anon key on 28 Oct 2026
-- (an update matching no row) got HTTP 200 on all four, so anon still holds
-- UPDATE; on every table from 001 on it gets "permission denied". Row level
-- security stopped the write, the grant didn't.
--
-- What it does, per table: the standard pattern (as in 002-005). RLS on,
-- with a read-everything policy so anon reads keep working whether or not
-- RLS was on before; every privilege revoked from anon and authenticated;
-- SELECT back to anon; reads and writes to service_role; and the same for
-- the table's id sequence, if it has one (aqi_readings.id).
-- Removing anon's SELECT waits for the frontend switch (Part C).

begin;

do $$
declare
  t   text;
  seq text;
begin
  foreach t in array array['events', 'aqi_readings', 'sources', 'categories'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || ' readable by everyone', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)',
                   t || ' readable by everyone', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);

    seq := pg_get_serial_sequence('public.' || t, 'id');
    if seq is not null then
      execute format('revoke all on sequence %s from anon, authenticated', seq);
      execute format('grant usage, select on sequence %s to service_role', seq);
    end if;
  end loop;
end
$$;

commit;

-- Check (read-only): every table and view in public, after the change.
-- Expected: anon_write and authenticated_write false on every row,
-- anon_select true on every row, rls true on every table (views show false).
select c.relname as name,
       case c.relkind when 'v' then 'view' else 'table' end as kind,
       c.relrowsecurity as rls,
       has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
       (has_table_privilege('anon', c.oid, 'INSERT') or has_table_privilege('anon', c.oid, 'UPDATE')
        or has_table_privilege('anon', c.oid, 'DELETE') or has_table_privilege('anon', c.oid, 'TRUNCATE'))
         as anon_write,
       (has_table_privilege('authenticated', c.oid, 'INSERT') or has_table_privilege('authenticated', c.oid, 'UPDATE')
        or has_table_privilege('authenticated', c.oid, 'DELETE') or has_table_privilege('authenticated', c.oid, 'TRUNCATE'))
         as authenticated_write
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'v')
order by kind, name;
