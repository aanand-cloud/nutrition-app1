-- Run in Supabase SQL Editor — prevents top-up / checkout replay abuse

create table if not exists public.checkout_redemptions (
  session_id text primary key,
  user_id uuid references auth.users on delete set null,
  redemption_type text not null check (redemption_type in ('subscription', 'topup')),
  scans_added int,
  redeemed_at timestamptz default now()
);

alter table public.checkout_redemptions enable row level security;

-- Only service role should insert (Netlify functions)
create policy "No public access to checkout_redemptions"
  on public.checkout_redemptions for all using (false);

-- Optional: server-side scan tracking for signed-in users
alter table public.profiles
  add column if not exists scan_month text,
  add column if not exists scan_used int not null default 0,
  add column if not exists topup_balance int not null default 0;
