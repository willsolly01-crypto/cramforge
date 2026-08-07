-- Weak topic tracker. One row per (user, subject, topic). ~60 bytes each.
-- A student doing every subject all year stays under 2 KB total.
-- Run once: Supabase → SQL Editor → paste → Run.

create table if not exists public.weak_topics (
  user_id   uuid not null references auth.users(id) on delete cascade,
  subject   text not null,
  topic     text not null,
  box       smallint not null default 0,  -- Leitner box 0-4; 4 = mastered
  streak    smallint not null default 0,  -- consecutive correct in this topic
  wrong     smallint not null default 0,  -- lifetime wrong count
  correct   smallint not null default 0,  -- lifetime correct count
  missed    text[]   not null default '{}', -- refs like 'Methods-A-Exam1:7', capped at 20 by the API
  next_due  date     not null default current_date,
  updated_at timestamptz not null default now(),
  primary key (user_id, subject, topic)
);

alter table public.weak_topics enable row level security;
-- No policies on purpose: same pattern as profiles/usage — the browser never
-- touches this table; only api/weak-topics.js via the service role key.

create index if not exists weak_topics_due
  on public.weak_topics (user_id, next_due);
