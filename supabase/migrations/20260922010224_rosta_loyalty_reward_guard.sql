begin;

-- Rollout compatibility: the currently deployed storefront explicitly writes
-- 2000 points during registration. Until the new storefront build is live,
-- only profiles that start at zero may receive the database-driven reward.
create or replace function public.award_web_registration_ruthie_points()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if new.auth_user_id is not null
    and new.consent_source = 'web_register'
    and coalesce(new.reward_points_balance, 0) = 0 then
    perform public.award_ruthie_signup_reward(new.id);
  end if;
  return new;
end;
$$;

revoke all on function public.award_web_registration_ruthie_points() from public, anon, authenticated;

comment on function public.award_web_registration_ruthie_points() is
  'Awards configured signup points only to zero-balance web registrations, preventing duplicate rewards during rolling deployment.';

commit;
