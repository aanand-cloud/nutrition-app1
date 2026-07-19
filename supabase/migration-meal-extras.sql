-- Run in Supabase SQL Editor (optional — local app works without this)
alter table public.meals
  add column if not exists meal_type text,
  add column if not exists meal_notes text;
