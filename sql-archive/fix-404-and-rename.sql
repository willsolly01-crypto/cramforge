-- ═══════════════════════════════════════════════════════════
-- STEP 1 — DIAGNOSE THE 404
-- Run this FIRST and paste the output back.
-- ═══════════════════════════════════════════════════════════

-- 1a. What is ACTUALLY in the bucket? (the real object names)
select name, round((metadata->>'size')::numeric / 1024) as kb
from storage.objects
where bucket_id = 'past-papers'
  and name ilike '%method%'
order by name;

-- 1b. Which rows point at an object that does not exist?
--     Anything listed here is the cause of the 404.
select p.title, p.file_path
from public.past_papers p
left join storage.objects o
  on o.bucket_id = 'past-papers' and o.name = p.file_path
where p.source = 'CramForge' and o.id is null
order by p.file_path;


-- ═══════════════════════════════════════════════════════════
-- STEP 2 — RENAME THE PAPERS
-- Safe to run now. Titles are keyed on file_path, so this works
-- regardless of the 404 (the rows are fine; the files are missing).
-- ═══════════════════════════════════════════════════════════

-- Match the VCAA badge style: Exam 1 / Exam 2 / Solutions / Reference
update public.past_papers set paper_type = 'Exam 1'
  where source = 'CramForge' and file_path like '%-Exam1.pdf';

update public.past_papers set paper_type = 'Exam 2'
  where source = 'CramForge' and file_path like '%-Exam2.pdf';

update public.past_papers set paper_type = 'Solutions'
  where source = 'CramForge' and file_path like '%-Solutions.pdf';

-- Titles in the same shape as "2025 Mathematical Methods Exam 1 (VCAA)"
update public.past_papers set title =
  '2026 Mathematical Methods Exam 1 — Paper A (CramForge)'
  where file_path like '%Methods-A-Exam1.pdf';

update public.past_papers set title =
  '2026 Mathematical Methods Exam 2 — Paper A (CramForge)'
  where file_path like '%Methods-A-Exam2.pdf';

update public.past_papers set title =
  '2026 Mathematical Methods Solutions — Paper A (CramForge)'
  where file_path like '%Methods-A-Solutions.pdf';

update public.past_papers set title =
  '2026 Mathematical Methods Exam 1 — Paper B (CramForge)'
  where file_path like '%Methods-B-Exam1.pdf';

update public.past_papers set title =
  '2026 Mathematical Methods Exam 2 — Paper B (CramForge)'
  where file_path like '%Methods-B-Exam2.pdf';

update public.past_papers set title =
  '2026 Mathematical Methods Solutions — Paper B (CramForge)'
  where file_path like '%Methods-B-Solutions.pdf';

update public.past_papers set title =
  '2026 Mathematical Methods Exam 1 — Paper C (CramForge)'
  where file_path like '%Methods-C-Exam1.pdf';

update public.past_papers set title =
  '2026 Mathematical Methods Exam 2 — Paper C (CramForge)'
  where file_path like '%Methods-C-Exam2.pdf';

update public.past_papers set title =
  '2026 Mathematical Methods Solutions — Paper C (CramForge)'
  where file_path like '%Methods-C-Solutions.pdf';

update public.past_papers set title =
  '2026 Mathematical Methods Formula Sheet (CramForge)'
  where file_path like '%Methods-Formula-Sheet.pdf';

update public.past_papers set title =
  'How to use the practice pack (CramForge)'
  where file_path like '%Methods-Practice-Guide.pdf';


-- ── CHECK ────────────────────────────────────────────────────
select paper_type, title, file_path
from public.past_papers
where source = 'CramForge'
order by file_path;
