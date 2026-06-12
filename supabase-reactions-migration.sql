-- CramForge Reactions Migration
-- Emoji reactions on study feed posts. Run AFTER supabase-feed-migration.sql.

CREATE TABLE IF NOT EXISTS public.post_reactions (
  post_id    UUID NOT NULL REFERENCES public.study_posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji      TEXT NOT NULL CHECK (emoji IN ('🔥','📚','💀','👏')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id, emoji)
);

ALTER TABLE public.post_reactions ENABLE ROW LEVEL SECURITY;
-- No policies: only the serverless API (service role) touches this table.

CREATE INDEX IF NOT EXISTS idx_post_reactions_post ON public.post_reactions (post_id);
