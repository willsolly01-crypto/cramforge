-- Migration: add monthly usage tracking for Pro users
-- Run in Supabase SQL Editor → New query → paste → Run

create table if not exists public.monthly_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null, -- format: YYYY-MM
  gen int not null default 0,
  grade int not null default 0,
  ingest int not null default 0,
  unique (user_id, month)
);
alter table public.monthly_usage enable row level security;

-- No RLS policies: only service role (serverless functions) touches this table.
