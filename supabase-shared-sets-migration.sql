-- Shared question sets migration
-- Run in Supabase Dashboard → SQL Editor → New query

create table if not exists public.shared_sets (
  id text primary key,                  -- 8-char random slug used in share URL
  user_id uuid references auth.users(id) on delete set null,
  unit_name text not null,
  subject_type text,
  questions jsonb not null,
  created_at timestamptz not null default now(),
  views int not null default 0
);

alter table public.shared_sets enable row level security;

-- Anyone can read a shared set (used by the public SharedView page)
create policy "public read shared sets"
  on public.shared_sets for select
  using (true);

-- Only authenticated users can insert their own sets
-- (enforced doubly server-side via service role — this is belt-and-suspenders)
create policy "users insert own shared sets"
  on public.shared_sets for insert
  with check (auth.uid() = user_id);

-- Index for fast lookup by user (for future "my shared sets" feature)
create index if not exists shared_sets_user_id_idx on public.shared_sets (user_id);
