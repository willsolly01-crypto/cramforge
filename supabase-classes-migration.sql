-- CramForge Classes Migration
-- Allows tutors to create classes, share a 6-char join code with students,
-- and see aggregate progress across all students in the class.
-- Run in Supabase SQL editor after supabase-social-migration.sql

-- ── 1. Classes ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.classes (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  tutor_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  -- 6-char uppercase join code, auto-generated, unique
  code       TEXT        NOT NULL UNIQUE
               DEFAULT upper(substring(md5(random()::text), 1, 6)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

-- Tutor can create/read/update/delete their own classes
CREATE POLICY "tutor_manages_classes"
  ON public.classes
  USING  (auth.uid() = tutor_id)
  WITH CHECK (auth.uid() = tutor_id);

-- Students can read a class once they're a member (needed for join by code)
CREATE POLICY "member_reads_class"
  ON public.classes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.class_members
      WHERE class_id = id AND student_id = auth.uid()
    )
  );

-- Anyone authenticated can look up a class by code (to join)
CREATE POLICY "authenticated_lookup_by_code"
  ON public.classes FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_classes_tutor ON public.classes (tutor_id);
CREATE INDEX IF NOT EXISTS idx_classes_code  ON public.classes (code);

-- ── 2. Class members ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.class_members (
  class_id   UUID        NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id UUID        NOT NULL REFERENCES auth.users(id)    ON DELETE CASCADE,
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (class_id, student_id)
);

ALTER TABLE public.class_members ENABLE ROW LEVEL SECURITY;

-- Tutor sees all members of their class
CREATE POLICY "tutor_sees_members"
  ON public.class_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.classes
      WHERE id = class_id AND tutor_id = auth.uid()
    )
  );

-- Students see their own membership(s)
CREATE POLICY "student_sees_own_membership"
  ON public.class_members FOR SELECT
  USING (auth.uid() = student_id);

-- Authenticated users can join (insert themselves)
CREATE POLICY "student_can_join"
  ON public.class_members FOR INSERT
  WITH CHECK (auth.uid() = student_id);

-- Students can leave a class
CREATE POLICY "student_can_leave"
  ON public.class_members FOR DELETE
  USING (auth.uid() = student_id);

CREATE INDEX IF NOT EXISTS idx_class_members_class   ON public.class_members (class_id);
CREATE INDEX IF NOT EXISTS idx_class_members_student ON public.class_members (student_id);
