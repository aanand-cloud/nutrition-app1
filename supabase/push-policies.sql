-- Push subscription policies (users save their own device tokens)
drop policy if exists "Users manage own push subs" on public.push_subscriptions;

create policy "Users manage own push subs"
  on public.push_subscriptions for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Allow anonymous push subs before login (optional — endpoint only)
drop policy if exists "Anyone can register push endpoint" on public.push_subscriptions;

create policy "Anyone can register push endpoint"
  on public.push_subscriptions for insert to anon, authenticated
  with check (true);

drop policy if exists "Anyone can delete own push endpoint" on public.push_subscriptions;

create policy "Anyone can delete own push endpoint"
  on public.push_subscriptions for delete to anon, authenticated
  using (true);
