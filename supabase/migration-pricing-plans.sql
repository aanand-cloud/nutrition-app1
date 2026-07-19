-- Run in Supabase SQL Editor (after full-setup.sql)
-- Expands plans + safe discount fields (no ID storage)

alter table public.profiles drop constraint if exists profiles_plan_check;

alter table public.profiles
  add column if not exists discount_senior boolean not null default false,
  add column if not exists discount_work_email text,
  add column if not exists discount_public_sector boolean not null default false;

update public.profiles set plan = 'daily25' where plan = 'pro';

alter table public.profiles
  add constraint profiles_plan_check
  check (plan in ('free', 'daily10', 'daily25'));

-- Auto-flag public sector from account email
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
