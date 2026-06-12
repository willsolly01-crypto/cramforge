-- CramForge Study Feed Migration
-- Photo posts of study sessions + friend system.
-- Run AFTER supabase-social-migration.sql (needs profiles.username).

-- ── 1. Friendships ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.friendships (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  requester  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (requester, addressee),
  CHECK (requester <> addressee)
);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
-- No policies: only serverless functions (service role) touch this table.

CREATE INDEX IF NOT EXISTS idx_friendships_requester ON public.friendships (requester, status);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON public.friendships (addressee, status);

-- ── 2. Study posts ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.study_posts (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  photo_path       TEXT NOT NULL,           -- path inside the study-photos bucket
  caption          TEXT,
  unit_name        TEXT,
  duration_minutes INT CHECK (duration_minutes IS NULL OR duration_minutes BETWEEN 1 AND 1440),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.study_posts ENABLE ROW LEVEL SECURITY;
-- No policies: feed reads/writes go through the serverless API.

CREATE INDEX IF NOT EXISTS idx_study_posts_user    ON public.study_posts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_study_posts_created ON public.study_posts (created_at DESC);

-- ── 3. Storage bucket for photos ────────────────────────────────────────────
-- Public bucket: photos are served by URL. Paths contain a random UUID so they
-- are unguessable. Uploads happen server-side only (service role).

INSERT INTO storage.buckets (id, name, public)
VALUES ('study-photos', 'study-photos', true)
ON CONFLICT (id) DO NOTHING;
