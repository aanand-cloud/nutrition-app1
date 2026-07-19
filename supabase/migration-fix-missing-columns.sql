-- Run once in Supabase SQL Editor if signup/login fails after account creation.
-- Brings an older database up to date with the current app.

-- Pricing / discount fields
alter table public.profiles drop constraint if exists profiles_plan_check;

alter table public.profiles
  add column if not exists discount_senior boolean not null default false,
  add column if not exists discount_work_email text,
  add column if not exists discount_public_sector boolean not null default false,
  add column if not exists discount_voucher_redeemed boolean not null default false;

update public.profiles set plan = 'daily25' where plan = 'pro';

alter table public.profiles
  add constraint profiles_plan_check
  check (plan in ('free', 'daily10', 'daily25'));

-- Meal extras
alter table public.meals
  add column if not exists meal_type text,
  add column if not exists meal_notes text;

-- Public-sector discount trigger (from migration-pricing-plans.sql)
create or replace function public.sync_public_sector_discount()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is not null and (
    new.email ilike '%@nhs.net'
    or new.email ilike '%@%.nhs.uk'
    or new.email ilike '%@nhs.uk'
    or new.email ilike '%@%.gov.uk'
    or new.email ilike '%@gov.uk'
    or new.email ilike '%@%.police.uk'
    or new.email ilike '%@mod.uk'
    or new.email ilike '%@%.ac.uk'
  ) then
    new.discount_public_sector := true;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_public_sector_discount on public.profiles;
create trigger profiles_public_sector_discount
  before insert or update of email, discount_work_email on public.profiles
  for each row execute function public.sync_public_sector_discount();
