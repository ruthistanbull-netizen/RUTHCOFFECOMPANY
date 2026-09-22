begin;

create table if not exists public.loyalty_reward_settings (
  id text primary key default 'default' check (id = 'default'),
  signup_points integer not null default 2000 check (signup_points between 0 and 10000000),
  birthday_points integer not null default 0 check (birthday_points between 0 and 10000000),
  updated_at timestamptz not null default now(),
  updated_by_profile_id uuid references public.profiles(id) on delete set null
);

insert into public.loyalty_reward_settings (id, signup_points, birthday_points)
values ('default', 2000, 0)
on conflict (id) do nothing;

-- Existing balances remain untouched. Only profiles created after this migration
-- start from zero and receive the configured welcome award through the ledger.
alter table public.profiles alter column reward_points_balance set default 0;

alter table public.loyalty_reward_settings enable row level security;
revoke all on table public.loyalty_reward_settings from public, anon, authenticated;
grant select, insert, update on table public.loyalty_reward_settings to service_role;

create index if not exists profiles_birth_month_day_idx
  on public.profiles ((extract(month from birth_date)), (extract(day from birth_date)))
  where birth_date is not null and auth_user_id is not null;

create or replace function public.record_ruthie_reward_snapshot(
  p_profile_id uuid,
  p_points integer,
  p_reason text,
  p_transaction_type text,
  p_reference_type text,
  p_reference_id text,
  p_admin_profile_id uuid default null
)
returns table(points_awarded integer, balance integer, transaction_id uuid)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_current_balance integer;
  v_new_balance integer;
  v_transaction_id uuid;
  v_existing public.ruthie_point_transactions%rowtype;
begin
  if p_profile_id is null then raise exception 'Profil gerekli.'; end if;
  if p_points is null or p_points < 0 or p_points > 10000000 then
    raise exception 'Yapılandırılmış puan miktarı geçersiz.';
  end if;
  if nullif(trim(coalesce(p_transaction_type, '')), '') is null
    or nullif(trim(coalesce(p_reference_type, '')), '') is null
    or nullif(trim(coalesce(p_reference_id, '')), '') is null then
    raise exception 'Puan snapshot referansı gerekli.';
  end if;

  select coalesce(reward_points_balance, 0)
    into v_current_balance
  from public.profiles
  where id = p_profile_id
  for update;

  if not found then raise exception 'Müşteri profili bulunamadı.'; end if;

  select * into v_existing
  from public.ruthie_point_transactions
  where profile_id = p_profile_id
    and transaction_type = trim(p_transaction_type)
    and reference_type = trim(p_reference_type)
    and reference_id = trim(p_reference_id)
  order by created_at asc, id asc
  limit 1;

  if found then
    return query select v_existing.amount, v_existing.balance_after, v_existing.id;
    return;
  end if;

  v_new_balance := v_current_balance + p_points;
  if p_points > 0 then
    update public.profiles
    set reward_points_balance = v_new_balance,
        updated_at = now()
    where id = p_profile_id;
  end if;

  insert into public.ruthie_point_transactions (
    profile_id,
    amount,
    balance_after,
    transaction_type,
    reason,
    reference_type,
    reference_id,
    admin_profile_id
  ) values (
    p_profile_id,
    p_points,
    v_new_balance,
    trim(p_transaction_type),
    nullif(trim(coalesce(p_reason, '')), ''),
    trim(p_reference_type),
    trim(p_reference_id),
    p_admin_profile_id
  )
  returning id into v_transaction_id;

  return query select p_points, v_new_balance, v_transaction_id;
end;
$$;

create or replace function public.award_ruthie_signup_reward(p_profile_id uuid)
returns table(points_awarded integer, balance integer, transaction_id uuid)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_points integer;
  v_auth_user_id uuid;
begin
  select signup_points
    into v_points
  from public.loyalty_reward_settings
  where id = 'default'
  for share;

  if not found then raise exception 'Ruthie Points ödül ayarı bulunamadı.'; end if;

  select auth_user_id
    into v_auth_user_id
  from public.profiles
  where id = p_profile_id;

  if not found or v_auth_user_id is null then
    raise exception 'Üyelik profili bulunamadı.';
  end if;

  return query
  select * from public.record_ruthie_reward_snapshot(
    p_profile_id,
    v_points,
    'Yeni üyelik hoş geldin puanı',
    'welcome',
    'registration',
    v_auth_user_id::text,
    null
  );
end;
$$;

create or replace function public.claim_ruthie_birthday_reward(
  p_profile_id uuid,
  p_now timestamptz default now()
)
returns table(
  processed boolean,
  points_awarded integer,
  balance integer,
  claim_year integer,
  transaction_id uuid
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_today date := (p_now at time zone 'Europe/Istanbul')::date;
  v_year integer := extract(year from (p_now at time zone 'Europe/Istanbul'))::integer;
  v_birth_date date;
  v_current_balance integer;
  v_points integer;
  v_result record;
  v_existing public.ruthie_point_transactions%rowtype;
begin
  select birth_date, coalesce(reward_points_balance, 0)
    into v_birth_date, v_current_balance
  from public.profiles
  where id = p_profile_id
    and auth_user_id is not null
  for update;

  if not found then raise exception 'Üyelik profili bulunamadı.'; end if;

  if v_birth_date is null
    or extract(month from v_birth_date) <> extract(month from v_today)
    or extract(day from v_birth_date) <> extract(day from v_today) then
    return query select false, 0, v_current_balance, v_year, null::uuid;
    return;
  end if;

  select * into v_existing
  from public.ruthie_point_transactions
  where profile_id = p_profile_id
    and transaction_type = 'birthday'
    and reference_type = 'birthday_year'
    and reference_id = v_year::text
  order by created_at asc, id asc
  limit 1;

  if found then
    update public.profiles
    set birthday_reward_claimed_year = v_year,
        birthday_reward_claimed_at = coalesce(birthday_reward_claimed_at, v_existing.created_at),
        birthday_reward_points = coalesce((
          select sum(greatest(amount, 0))::integer
          from public.ruthie_point_transactions
          where profile_id = p_profile_id and transaction_type = 'birthday'
        ), 0)
    where id = p_profile_id;

    return query select false, v_existing.amount, v_existing.balance_after, v_year, v_existing.id;
    return;
  end if;

  select birthday_points
    into v_points
  from public.loyalty_reward_settings
  where id = 'default'
  for share;

  if not found then raise exception 'Ruthie Points ödül ayarı bulunamadı.'; end if;

  select * into v_result
  from public.record_ruthie_reward_snapshot(
    p_profile_id,
    v_points,
    v_year::text || ' doğum günü puanı',
    'birthday',
    'birthday_year',
    v_year::text,
    null
  );

  update public.profiles
  set birthday_reward_claimed_year = v_year,
      birthday_reward_claimed_at = p_now,
      birthday_reward_points = coalesce((
        select sum(greatest(amount, 0))::integer
        from public.ruthie_point_transactions
        where profile_id = p_profile_id and transaction_type = 'birthday'
      ), 0),
      updated_at = now()
  where id = p_profile_id;

  return query select true, v_result.points_awarded, v_result.balance, v_year, v_result.transaction_id;
end;
$$;

create or replace function public.claim_all_ruthie_birthday_rewards(
  p_now timestamptz default now(),
  p_limit integer default 5000
)
returns table(processed_profiles integer, awarded_points bigint, claim_year integer)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_today date := (p_now at time zone 'Europe/Istanbul')::date;
  v_year integer := extract(year from (p_now at time zone 'Europe/Istanbul'))::integer;
  v_profile record;
  v_claim record;
  v_processed integer := 0;
  v_awarded bigint := 0;
begin
  for v_profile in
    select id
    from public.profiles
    where auth_user_id is not null
      and birth_date is not null
      and extract(month from birth_date) = extract(month from v_today)
      and extract(day from birth_date) = extract(day from v_today)
      and birthday_reward_claimed_year is distinct from v_year
    order by id
    limit greatest(1, least(coalesce(p_limit, 5000), 10000))
  loop
    select * into v_claim
    from public.claim_ruthie_birthday_reward(v_profile.id, p_now);

    if coalesce(v_claim.processed, false) then
      v_processed := v_processed + 1;
      v_awarded := v_awarded + coalesce(v_claim.points_awarded, 0);
    end if;
  end loop;

  return query select v_processed, v_awarded, v_year;
end;
$$;

create or replace function public.update_loyalty_reward_settings(
  p_signup_points integer,
  p_birthday_points integer,
  p_admin_profile_id uuid,
  p_correlation_id text
)
returns table(
  signup_points integer,
  birthday_points integer,
  updated_at timestamptz,
  updated_by_profile_id uuid
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_before public.loyalty_reward_settings%rowtype;
  v_after public.loyalty_reward_settings%rowtype;
begin
  if p_signup_points is null or p_signup_points < 0 or p_signup_points > 10000000
    or p_birthday_points is null or p_birthday_points < 0 or p_birthday_points > 10000000 then
    raise exception 'Ruthie Points ödül ayarı geçersiz.';
  end if;

  select * into v_before
  from public.loyalty_reward_settings
  where id = 'default'
  for update;

  if not found then raise exception 'Ruthie Points ödül ayarı bulunamadı.'; end if;

  update public.loyalty_reward_settings
  set signup_points = p_signup_points,
      birthday_points = p_birthday_points,
      updated_at = now(),
      updated_by_profile_id = p_admin_profile_id
  where id = 'default'
  returning * into v_after;

  insert into public.commerce_audit_logs (
    action,
    entity_type,
    entity_id,
    actor_type,
    correlation_id,
    after_data,
    metadata
  ) values (
    'loyalty.reward_settings_updated',
    'loyalty_reward_settings',
    'default',
    'user',
    nullif(trim(coalesce(p_correlation_id, '')), ''),
    jsonb_build_object(
      'signupPoints', v_after.signup_points,
      'birthdayPoints', v_after.birthday_points,
      'updatedByProfileId', v_after.updated_by_profile_id
    ),
    jsonb_build_object(
      'source', 'admin.ruthie_points',
      'adminProfileId', p_admin_profile_id,
      'previousSignupPoints', v_before.signup_points,
      'previousBirthdayPoints', v_before.birthday_points,
      'futureEventsOnly', true
    )
  );

  return query
  select v_after.signup_points, v_after.birthday_points, v_after.updated_at, v_after.updated_by_profile_id;
end;
$$;

create or replace function public.award_web_registration_ruthie_points()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if new.auth_user_id is not null and new.consent_source = 'web_register' then
    perform public.award_ruthie_signup_reward(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_award_web_registration_ruthie_points on public.profiles;
create trigger profiles_award_web_registration_ruthie_points
after insert or update of auth_user_id, consent_source on public.profiles
for each row execute function public.award_web_registration_ruthie_points();

revoke all on function public.record_ruthie_reward_snapshot(uuid, integer, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.award_ruthie_signup_reward(uuid) from public, anon, authenticated;
revoke all on function public.claim_ruthie_birthday_reward(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.claim_all_ruthie_birthday_rewards(timestamptz, integer) from public, anon, authenticated;
revoke all on function public.update_loyalty_reward_settings(integer, integer, uuid, text) from public, anon, authenticated;
revoke all on function public.award_web_registration_ruthie_points() from public, anon, authenticated;

grant execute on function public.award_ruthie_signup_reward(uuid) to service_role;
grant execute on function public.claim_ruthie_birthday_reward(uuid, timestamptz) to service_role;
grant execute on function public.claim_all_ruthie_birthday_rewards(timestamptz, integer) to service_role;
grant execute on function public.update_loyalty_reward_settings(integer, integer, uuid, text) to service_role;

comment on table public.loyalty_reward_settings is
  'Singleton Loyalty Engine settings. Changes apply only when a future signup or birthday claim is recorded.';
comment on function public.record_ruthie_reward_snapshot(uuid, integer, text, text, text, text, uuid) is
  'Records the configured reward, including zero-point snapshots, exactly once for a stable event reference.';

commit;
