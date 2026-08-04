-- ═══════════════════════════════════════════════════════════════════
-- CramForge Physics practice pack — Papers D and E (4 new files)
-- Papers A, B, C and the two reference PDFs are already loaded.
-- Run in Supabase → SQL Editor. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Clear any previous import of D and E only ─────────────────
delete from public.past_papers
where subject = 'Physics' and source = 'CramForge'
  and file_path like '%Physics-D-%';

delete from public.past_papers
where subject = 'Physics' and source = 'CramForge'
  and file_path like '%Physics-E-%';


-- ── 2. Insert the 4 new rows ─────────────────────────────────────
insert into public.past_papers (subject, year, paper_type, title, file_path, source) values

  ('Physics', 2026, 'Practice Exam',
   '2026 Physics Practice Exam — Paper D (CramForge)',
   'Physics/Cram Forge/Physics-D-Exam.pdf', 'CramForge'),

  ('Physics', 2026, 'Solutions',
   '2026 Physics Worked Solutions — Paper D (CramForge)',
   'Physics/Cram Forge/Physics-D-Solutions.pdf', 'CramForge'),

  ('Physics', 2026, 'Practice Exam',
   '2026 Physics Practice Exam — Paper E (CramForge)',
   'Physics/Cram Forge/Physics-E-Exam.pdf', 'CramForge'),

  ('Physics', 2026, 'Solutions',
   '2026 Physics Worked Solutions — Paper E (CramForge)',
   'Physics/Cram Forge/Physics-E-Solutions.pdf', 'CramForge');


-- ── 3. Check every Physics row points at a real file ─────────────
-- Should return ZERO rows.
select p.title, p.file_path
from public.past_papers p
left join storage.objects o
  on o.bucket_id = 'past-papers' and o.name = p.file_path
where p.subject = 'Physics' and p.source = 'CramForge' and o.id is null;


-- ── 4. Repair — only if section 3 returned rows ──────────────────
update public.past_papers p
set file_path = o.name
from storage.objects o
where o.bucket_id = 'past-papers'
  and p.subject = 'Physics'
  and p.source = 'CramForge'
  and o.name like '%' || substring(p.file_path from '[^/]+$')
  and o.name <> p.file_path;


-- ── 5. Final state — expect 12 rows ──────────────────────────────
select paper_type, title, file_path
from public.past_papers
where subject = 'Physics' and source = 'CramForge'
order by file_path;
