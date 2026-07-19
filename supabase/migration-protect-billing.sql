-- Run in Supabase SQL Editor — prevents users editing plan/scans/top-up via API

create or replace function public.protect_billing_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service role (Netlify functions) may update billing fields
  if auth.uid() is null then
    return new;
  end if;

  if auth.uid() = old.id then
    if new.plan is distinct from old.plan
      or new.topup_balance is distinct from old.topup_balance
      or new.scan_used is distinct from old.scan_used
      or new.scan_month is distinct from old.scan_month
      or new.stripe_customer_id is distinct from old.stripe_customer_id then
      raise exception 'Billing fields are managed by NutriLog checkout only';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_billing_profile_fields on public.profiles;
create trigger protect_billing_profile_fields
  before update on public.profiles
  for each row execute function public.protect_billing_profile_fields();
