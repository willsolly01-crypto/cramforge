-- CramForge Quick Study Migration
-- Adds XP / lifetime stats to profiles.
-- Adds increment_xp RPC for atomic XP accumulation.
-- Adds mode + quick-stats columns to study_sessions.
-- Run AFTER supabase-social-migration.sql.

-- ── 1. Profile XP and lifetime accuracy counters ────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS total_xp           INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS questions_answered INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS questions_correct  INT NOT NULL DEFAULT 0;

-- ── 2. study_sessions: mode + per-session stats ──────────────────────────────

ALTER TABLE public.study_sessions
  ADD COLUMN IF NOT EXISTS mode             TEXT    DEFAULT 'timer',   -- 'timer' | 'quick'
  ADD COLUMN IF NOT EXISTS xp_earned        INT     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qs_correct       INT     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qs_total         INT     DEFAULT 0;

-- ── 3. Atomic XP / stats increment RPC ──────────────────────────────────────
-- Called from the server after a Quick Study session completes.
-- SECURITY DEFINER so it runs with elevated rights; input is validated by the caller.

CREATE OR REPLACE FUNCTION public.increment_quick_stats(
  p_user_id  UUID,
  p_xp       INT,
  p_correct  INT,
  p_total    INT
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.profiles
  SET
    total_xp           = COALESCE(total_xp, 0)           + GREATEST(0, p_xp),
    questions_correct  = COALESCE(questions_correct, 0)  + GREATEST(0, p_correct),
    questions_answered = COALESCE(questions_answered, 0) + GREATEST(0, p_total)
  WHERE id = p_user_id;
$$;

-- Grant execute to authenticated users (called via service-role key on the server)
GRANT EXECUTE ON FUNCTION public.increment_quick_stats TO authenticated;

-- ── 4. Update weekly_leaderboard view to include XP ──────────────────────────

CREATE OR REPLACE VIEW public.weekly_leaderboard AS
  SELECT
    p.id              AS user_id,
    p.username,
    p.display_name,
    p.total_xp,
    SUM(s.duration_seconds)                               AS total_seconds,
    COUNT(*)                                              AS session_count,
    COUNT(DISTINCT DATE(s.started_at AT TIME ZONE 'UTC')) AS active_days,
    COALESCE(SUM(s.qs_correct), 0)                       AS weekly_correct,
    COALESCE(SUM(s.qs_total),   0)                       AS weekly_total
  FROM public.study_sessions s
  JOIN public.profiles p ON p.id = s.user_id
  WHERE s.started_at >= (NOW() - INTERVAL '7 days')
    AND p.is_public   = true
    AND p.username IS NOT NULL
  GROUP BY p.id, p.username, p.display_name, p.total_xp
  ORDER BY total_seconds DESC;
