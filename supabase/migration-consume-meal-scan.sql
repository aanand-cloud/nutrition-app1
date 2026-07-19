-- Run in Supabase SQL Editor — atomic meal-scan consumption (prevents race abuse)

create or replace function public.consume_meal_scan(p_user_id uuid, p_local_day text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_plan text;
  v_period text;
  v_used int;
  v_allowance int;
  v_topup int;
  v_limit int;
begin
  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Account profile not found');
  end if;

  v_plan := case
    when v_profile.plan in ('pro', 'daily25') then 'daily25'
    when v_profile.plan = 'daily10' then 'daily10'
    else 'free'
  end;

  if v_plan = 'free' then
    v_period := coalesce(nullif(trim(p_local_day), ''), to_char(now(), 'YYYY-MM-DD'));
    v_used := case when v_profile.scan_month = v_period then coalesce(v_profile.scan_used, 0) else 0 end;
    v_limit := 1;
    if v_used >= v_limit then
      return jsonb_build_object('ok', false, 'error', 'Daily meal log limit reached. Resets at midnight.');
    end if;
    update public.profiles
    set scan_month = v_period, scan_used = v_used + 1, updated_at = now()
    where id = p_user_id;
    return jsonb_build_object(
      'ok', true,
      'plan', v_plan,
      'used', v_used + 1,
      'limit', v_limit,
      'remaining', greatest(0, v_limit - (v_used + 1)),
      'isDaily', true
    );
  end if;

  v_period := to_char(now() at time zone 'utc', 'YYYY-MM');
  v_used := case when v_profile.scan_month = v_period then coalesce(v_profile.scan_used, 0) else 0 end;
  v_allowance := case v_plan when 'daily10' then 300 when 'daily25' then 750 else 0 end;
  v_topup := coalesce(v_profile.topup_balance, 0);
  v_limit := v_allowance + v_topup;

  if v_used >= v_limit then
    return jsonb_build_object('ok', false, 'error', 'Monthly meal log limit reached.');
  end if;

  update public.profiles
  set scan_month = v_period, scan_used = v_used + 1, updated_at = now()
  where id = p_user_id;

  return jsonb_build_object(
    'ok', true,
    'plan', v_plan,
    'used', v_used + 1,
    'limit', v_limit,
    'remaining', greatest(0, v_limit - (v_used + 1)),
    'allowance', v_allowance,
    'topup', v_topup,
    'isDaily', false
  );
end;
$$;

revoke all on function public.consume_meal_scan(uuid, text) from public;
grant execute on function public.consume_meal_scan(uuid, text) to service_role;
