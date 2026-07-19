-- Run if you already created profiles without display_name
alter table public.profiles add column if not exists display_name text;

update public.profiles
set display_name = coalesce(display_name, split_part(email, '@', 1))
where display_name is null and email is not null;
