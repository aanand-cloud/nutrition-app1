-- ═══════════════════════════════════════════════════════════
-- NutriLog — FULL SUPABASE SETUP (run once in SQL Editor)
-- Dashboard → SQL → New query → Paste all → Run
-- ═══════════════════════════════════════════════════════════

-- ── 1. Tables + RLS + signup trigger ──

create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  display_name text,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  stripe_customer_id text,
  goals jsonb default '{"calories_kcal":2000,"protein_g":100,"carbs_g":250,"fat_g":65,"fibre_g":30,"sugar_g":50,"salt_mg":6000}',
  unit_prefs jsonb default '{"energy":"kcal","weight":"g"}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles add column if not exists display_name text;

create table if not exists public.meals (
  id text primary key,
  user_id uuid references auth.users on delete cascade not null,
  date date not null,
  meal_summary text,
  total_calories_kcal numeric,
  total_nutrition jsonb,
  items jsonb,
  confidence_score numeric,
  clarifications jsonb,
  photo_path text,
  created_at timestamptz default now()
);

create index if not exists meals_user_date_idx on public.meals (user_id, date desc);

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid references auth.users on delete set null,
  p256dh text,
  auth text,
  user_agent text,
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;
alter table public.meals enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists "Users read own profile" on public.profiles;
drop policy if exists "Users update own profile" on public.profiles;
drop policy if exists "Users insert own profile" on public.profiles;
drop policy if exists "Users read own meals" on public.meals;
drop policy if exists "Users insert own meals" on public.meals;
drop policy if exists "Users update own meals" on public.meals;
drop policy if exists "Users delete own meals" on public.meals;

create policy "Users read own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users insert own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "Users read own meals" on public.meals for select using (auth.uid() = user_id);
create policy "Users insert own meals" on public.meals for insert with check (auth.uid() = user_id);
create policy "Users update own meals" on public.meals for update using (auth.uid() = user_id);
create policy "Users delete own meals" on public.meals for delete using (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute procedure public.handle_new_user();

-- ── 2. Storage bucket for meal photos ──

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meal-photos', 'meal-photos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "Users upload own meal photos" on storage.objects;
drop policy if exists "Users read own meal photos" on storage.objects;
drop policy if exists "Users delete own meal photos" on storage.objects;

create policy "Users upload own meal photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users read own meal photos"
  on storage.objects for select to authenticated
  using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users delete own meal photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Done! Enable Email auth in Dashboard → Authentication → Providers
