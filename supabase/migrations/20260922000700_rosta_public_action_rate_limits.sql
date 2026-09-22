begin;

create table if not exists public.public_action_rate_limits (
  rate_key text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.public_action_rate_limits enable row level security;
revoke all on public.public_action_rate_limits from anon, authenticated;
grant all on public.public_action_rate_limits to service_role;

create or replace function public.claim_public_action_rate(
  p_action text,
  p_identifier_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  next_count integer;
  normalized_key text := left(trim(coalesce(p_action, 'action')), 80) || ':' || left(trim(coalesce(p_identifier_hash, 'unknown')), 160);
  safe_limit integer := greatest(1, least(coalesce(p_limit, 10), 1000));
  safe_window integer := greatest(60, least(coalesce(p_window_seconds, 900), 86400));
begin
  insert into public.public_action_rate_limits(rate_key, window_started_at, request_count, updated_at)
  values (normalized_key, now(), 1, now())
  on conflict (rate_key) do update
  set request_count = case
        when public_action_rate_limits.window_started_at < now() - make_interval(secs => safe_window) then 1
        else public_action_rate_limits.request_count + 1
      end,
      window_started_at = case
        when public_action_rate_limits.window_started_at < now() - make_interval(secs => safe_window) then now()
        else public_action_rate_limits.window_started_at
      end,
      updated_at = now()
  returning request_count into next_count;

  return next_count <= safe_limit;
end;
$$;

revoke all on function public.claim_public_action_rate(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_public_action_rate(text, text, integer, integer) to service_role;

commit;
