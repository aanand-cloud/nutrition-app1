-- Run in Supabase SQL editor (Dashboard → SQL)

-- Profiles (extends auth.users)
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

-- Meals
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

-- RLS
alter table public.profiles enable row level security;
alter table public.meals enable row level security;

create policy "Users read own profile"
  on public.profiles for select using (auth.uid() = id);

create policy "Users update own profile"
  on public.profiles for update using (auth.uid() = id);

create policy "Users insert own profile"
  on public.profiles for insert with check (auth.uid() = id);

create policy "Users read own meals"
  on public.meals for select using (auth.uid() = user_id);

create policy "Users insert own meals"
  on public.meals for insert with check (auth.uid() = user_id);

create policy "Users update own meals"
  on public.meals for update using (auth.uid() = user_id);

create policy "Users delete own meals"
  on public.meals for delete using (auth.uid() = user_id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Storage bucket for meal photos (create in Dashboard → Storage → New bucket: meal-photos, private)
-- Policy: authenticated users can upload/read own files under {user_id}/

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid references auth.users on delete set null,
  p256dh text,
  auth text,
  user_agent text,
  updated_at timestamptz default now()
);

alter table public.push_subscriptions enable row level security;
