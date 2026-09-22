begin;

create table if not exists public.analytics_rate_limits (
  rate_key text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.analytics_rate_limits enable row level security;
revoke all on table public.analytics_rate_limits from public, anon, authenticated;
grant all on table public.analytics_rate_limits to service_role;

create or replace function public.collect_analytics_event(
  p_session_id text,
  p_event_name text,
  p_path text,
  p_metadata jsonb,
  p_user_agent text,
  p_ip_hash text
)
returns boolean
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare
  ip_count integer;
  session_count integer;
  normalized_session text := left(trim(coalesce(p_session_id,'')),500);
  normalized_ip text := left(trim(coalesce(p_ip_hash,'unknown')),128);
begin
  if normalized_session='' then return false; end if;

  insert into public.analytics_rate_limits(rate_key,window_started_at,request_count,updated_at)
  values ('ip:'||normalized_ip,now(),1,now())
  on conflict (rate_key) do update
  set request_count=case when analytics_rate_limits.window_started_at < now()-interval '15 minutes' then 1 else analytics_rate_limits.request_count+1 end,
      window_started_at=case when analytics_rate_limits.window_started_at < now()-interval '15 minutes' then now() else analytics_rate_limits.window_started_at end,
      updated_at=now()
  returning request_count into ip_count;

  insert into public.analytics_rate_limits(rate_key,window_started_at,request_count,updated_at)
  values ('session:'||normalized_session,now(),1,now())
  on conflict (rate_key) do update
  set request_count=case when analytics_rate_limits.window_started_at < now()-interval '15 minutes' then 1 else analytics_rate_limits.request_count+1 end,
      window_started_at=case when analytics_rate_limits.window_started_at < now()-interval '15 minutes' then now() else analytics_rate_limits.window_started_at end,
      updated_at=now()
  returning request_count into session_count;

  if ip_count>300 or session_count>160 then return false; end if;

  insert into public.analytics_events(session_id,event_name,path,metadata,user_agent,ip_hash)
  values (
    normalized_session,
    left(trim(coalesce(p_event_name,'')),100),
    nullif(left(trim(coalesce(p_path,'')),500),''),
    coalesce(p_metadata,'{}'::jsonb),
    nullif(left(coalesce(p_user_agent,''),1000),''),
    nullif(normalized_ip,'unknown')
  );
  return true;
end;
$$;

revoke all on function public.collect_analytics_event(text,text,text,jsonb,text,text) from public, anon, authenticated;
grant execute on function public.collect_analytics_event(text,text,text,jsonb,text,text) to service_role;

commit;