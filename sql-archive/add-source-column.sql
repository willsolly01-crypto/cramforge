-- CramForge — add a `source` column so the Papers tab can split
-- VCAA past exams from CramForge original practice papers.
-- Run in Supabase: SQL Editor -> New query -> paste -> Run

-- 1. Add the column. Everything already in the table is a VCAA paper,
--    so VCAA is the default and existing rows are backfilled automatically.
alter table public.past_papers
  add column if not exists source text not null default 'VCAA';

-- 2. Flag the practice pack as CramForge originals.
update public.past_papers
set source = 'CramForge'
where file_path like 'methods/practice/%';

-- 3. Make sure the practice pack is filed under the same subject label
--    as the VCAA Methods papers (run this if you haven't already).
update public.past_papers
set subject = 'Mathematical Methods'
where subject = 'Methods';


-- ── VERIFICATION ─────────────────────────────────────────────
-- Expect: Mathematical Methods / CramForge = 11
--         Mathematical Methods / VCAA      = 10
--         every other subject              = VCAA only
select subject, source, count(*)
from public.past_papers
group by subject, source
order by subject, source;
