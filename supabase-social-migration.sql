-- CramForge Social Migration
-- Run in Supabase SQL editor → Dashboard → SQL Editor → New query

-- ── 1. Extend profiles with social fields ───────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username        TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS display_name   TEXT,
  ADD COLUMN IF NOT EXISTS is_public      BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pdf_demo_used  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS streak_count   INT     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS streak_last_day TEXT;   -- YYYY-MM-DD of last active day

-- Fast lookup by username
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles (username);

-- ── 2. Study sessions ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.study_sessions (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id        UUID   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  unit_name      TEXT,
  duration_seconds INT  NOT NULL CHECK (duration_seconds >= 30),
  started_at     TIMESTAMPTZ NOT NULL,
  ended_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;

-- Owner can insert / read / delete their own sessions
CREATE POLICY "owner_study_sessions"
  ON public.study_sessions
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Public profiles: anyone can read their sessions (for the social leaderboard)
CREATE POLICY "public_profile_sessions_readable"
  ON public.study_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = user_id AND is_public = true
    )
  );

CREATE INDEX IF NOT EXISTS idx_study_sessions_user_id ON public.study_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_study_sessions_started ON public.study_sessions (started_at DESC);

-- ── 3. Quick aggregated view for leaderboard ─────────────────────────────────

CREATE OR REPLACE VIEW public.weekly_leaderboard AS
  SELECT
    p.id           AS user_id,
    p.username,
    p.display_name,
    SUM(s.duration_seconds)                        AS total_seconds,
    COUNT(*)                                       AS session_count,
    COUNT(DISTINCT DATE(s.started_at AT TIME ZONE 'UTC')) AS active_days
  FROM public.study_sessions s
  JOIN public.profiles p ON p.id = s.user_id
  WHERE s.started_at >= (NOW() - INTERVAL '7 days')
    AND p.is_public   = true
    AND p.username IS NOT NULL
  GROUP BY p.id, p.username, p.display_name
  ORDER BY total_seconds DESC;
