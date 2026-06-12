-- Bank migration: adds featured flag + question_count + view_count to shared_sets.
-- Also adds the 'featured' boolean used by the question bank admin feature.
-- Run after supabase-shared-sets-migration.sql.

-- Add featured column for admin-curated sets
ALTER TABLE public.shared_sets
  ADD COLUMN IF NOT EXISTS featured      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS question_count INT GENERATED ALWAYS AS (jsonb_array_length(questions)) STORED,
  ADD COLUMN IF NOT EXISTS view_count    INT NOT NULL DEFAULT 0;

-- Rename views → view_count if old column exists (safe no-op if already renamed)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shared_sets' AND column_name = 'views'
  ) THEN
    ALTER TABLE public.shared_sets RENAME COLUMN views TO view_count;
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

-- Index for fast featured/subject browsing
CREATE INDEX IF NOT EXISTS idx_shared_sets_featured ON public.shared_sets (featured, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shared_sets_subject  ON public.shared_sets (subject_type, view_count DESC);
CREATE INDEX IF NOT EXISTS idx_shared_sets_popular  ON public.shared_sets (view_count DESC);
