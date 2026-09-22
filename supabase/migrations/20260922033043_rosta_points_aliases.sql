-- ROSTA Points public runtime aliases.
-- Legacy ruthie_* objects remain private compatibility internals so existing data,
-- triggers and historical migrations are never destructively renamed.

create or replace function public.adjust_rosta_points(
  p_profile_id uuid,
  p_amount integer,
  p_reason text,
  p_transaction_type text,
  p_reference_type text,
  p_reference_id text,
  p_admin_profile_id uuid
)
returns table(balance integer, applied_amount integer, transaction_id uuid)
language sql
security definer
set search_path = public
as $$
  select *
  from public.adjust_ruthie_points(
    p_profile_id,
    p_amount,
    p_reason,
    p_transaction_type,
    p_reference_type,
    p_reference_id,
    p_admin_profile_id
  );
$$;

create or replace function public.record_rosta_points_snapshot(
  p_profile_id uuid,
  p_points integer,
  p_reason text,
  p_transaction_type text,
  p_reference_type text,
  p_reference_id text,
  p_admin_profile_id uuid
)
returns table(points_awarded integer, balance integer, transaction_id uuid)
language sql
security definer
set search_path = public
as $$
  select *
  from public.record_ruthie_reward_snapshot(
    p_profile_id,
    p_points,
    p_reason,
    p_transaction_type,
    p_reference_type,
    p_reference_id,
    p_admin_profile_id
  );
$$;

create or replace function public.award_rosta_signup_reward(p_profile_id uuid)
returns table(points_awarded integer, balance integer, transaction_id uuid)
language sql
security definer
set search_path = public
as $$
  select * from public.award_ruthie_signup_reward(p_profile_id);
$$;

create or replace function public.claim_rosta_birthday_reward(
  p_profile_id uuid,
  p_now timestamptz
)
returns table(
  processed boolean,
  points_awarded integer,
  balance integer,
  claim_year integer,
  transaction_id uuid
)
language sql
security definer
set search_path = public
as $$
  select * from public.claim_ruthie_birthday_reward(p_profile_id, p_now);
$$;

create or replace function public.claim_all_rosta_birthday_rewards(
  p_now timestamptz,
  p_limit integer
)
returns table(processed_profiles integer, awarded_points bigint, claim_year integer)
language sql
security definer
set search_path = public
as $$
  select * from public.claim_all_ruthie_birthday_rewards(p_now, p_limit);
$$;

create or replace view public.rosta_point_transactions
with (security_invoker = true)
as
select
  id,
  profile_id,
  amount,
  balance_after,
  transaction_type,
  reason,
  reference_type,
  reference_id,
  admin_profile_id,
  created_at
from public.ruthie_point_transactions;

revoke all on function public.adjust_rosta_points(uuid, integer, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.record_rosta_points_snapshot(uuid, integer, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.award_rosta_signup_reward(uuid) from public, anon, authenticated;
revoke all on function public.claim_rosta_birthday_reward(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.claim_all_rosta_birthday_rewards(timestamptz, integer) from public, anon, authenticated;
revoke all on table public.rosta_point_transactions from public, anon, authenticated;

grant execute on function public.adjust_rosta_points(uuid, integer, text, text, text, text, uuid) to service_role;
grant execute on function public.record_rosta_points_snapshot(uuid, integer, text, text, text, text, uuid) to service_role;
grant execute on function public.award_rosta_signup_reward(uuid) to service_role;
grant execute on function public.claim_rosta_birthday_reward(uuid, timestamptz) to service_role;
grant execute on function public.claim_all_rosta_birthday_rewards(timestamptz, integer) to service_role;
grant select on table public.rosta_point_transactions to service_role;

comment on view public.rosta_point_transactions is
  'ROSTA Points transaction read model. Backed by the legacy compatibility ledger without exposing legacy branding to application code.';
