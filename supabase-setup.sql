-- Run this once in Supabase: SQL Editor → New query → paste → Run

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  plan text not null default 'free',
  stripe_customer_id text,
  stripe_subscription_id text,
  plan_checked_at timestamptz
);
alter table public.profiles enable row level security;

create table if not exists public.usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  gen int not null default 0,
  grade int not null default 0,
  ingest int not null default 0,
  unique (user_id, day)
);
alter table public.usage enable row level security;

-- No RLS policies are created on purpose: the browser never touches these
-- tables directly. Only the serverless functions (using the service role key,
-- which bypasses RLS) read and write them.
