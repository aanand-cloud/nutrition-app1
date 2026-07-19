-- Run in Supabase SQL Editor (after migration-pricing-plans.sql)
-- Tracks NUTRIPROMO (or other) voucher redemption per account

alter table public.profiles
  add column if not exists discount_voucher_redeemed boolean not null default false;
