-- 006 · data.gov.in as a source: CPCB's real-time AQI feed for the air desk item
-- datagov.py / air.py (follow-up "Fresher air source" in docs/severity-pipeline.md).
--
-- Paste the whole file into the Supabase SQL editor and run it once.
-- Safe to re-run. Changes nothing the frontend reads today (its list of
-- sources is written into the pages, not read from this table).
--
-- desk_items.source and category_status.source reference sources (id): the
-- air item names DATAGOV when the feed set its level and OPENAQ when the
-- OpenAQ fallback did. The air stage keeps this row's freshness columns
-- (last_attempt_at, last_success_at, newest_observation_at, ...) like the
-- fetchers do for theirs. No grant changes: sources keeps its existing ones.

begin;

insert into public.sources (id, name, description, url, is_active)
values ('DATAGOV',
        'CPCB real-time AQI (data.gov.in)',
        'Air quality index (primary for the air desk item)',
        'https://data.gov.in/resource/real-time-air-quality-index-various-locations',
        true)
on conflict (id) do update
  set name = excluded.name,
      description = excluded.description,
      url = excluded.url;

commit;
