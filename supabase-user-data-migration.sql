-- User data sync migration — enables cross-device progress persistence
-- Run in Supabase Dashboard → SQL Editor → New query

create table if not exists public.user_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{"units":{},"activeUnitId":null}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_data enable row level security;

-- No browser-direct policies: only the service role key (serverless) touches this table.
-- RLS is enabled so the table is locked down by default.
