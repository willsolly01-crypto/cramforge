-- Referral system migration
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS referral_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonus_gen int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referral_credited boolean NOT NULL DEFAULT false;

-- Generate a referral code for every existing profile that doesn't have one yet
UPDATE public.profiles
SET referral_code = substring(replace(gen_random_uuid()::text, '-', ''), 1, 8)
WHERE referral_code IS NULL;

-- Ensure future inserts always get a referral code (handled in _auth.js, but belt-and-suspenders)
CREATE OR REPLACE FUNCTION public.set_referral_code()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := substring(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_referral_code ON public.profiles;
CREATE TRIGGER trg_set_referral_code
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_referral_code();
