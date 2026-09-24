-- ROSTA durable panel -> storefront delivery queue. Keeps API contracts unchanged while
-- guaranteeing retries/DLQ for cache/revalidation delivery.
create table if not exists public.platform_delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  dedupe_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check(status in ('pending','processing','succeeded','failed','dead_letter')),
  attempts integer not null default 0,
  max_attempts integer not null default 8 check(max_attempts between 1 and 50),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists platform_delivery_claim_idx
  on public.platform_delivery_jobs(status,available_at,created_at)
  where status in ('pending','failed','processing');
alter table public.platform_delivery_jobs enable row level security;

create table if not exists public.platform_delivery_dead_letters (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.platform_delivery_jobs(id) on delete cascade,
  kind text not null,
  payload jsonb not null,
  error text not null,
  attempts integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.platform_delivery_dead_letters enable row level security;

revoke all privileges on table public.platform_delivery_jobs from public, anon, authenticated;
revoke all privileges on table public.platform_delivery_dead_letters from public, anon, authenticated;
grant select, insert, update, delete on table public.platform_delivery_jobs to service_role;
grant select, insert, update, delete on table public.platform_delivery_dead_letters to service_role;

create or replace function public.claim_platform_delivery_jobs(p_worker text,p_limit integer default 10)
returns setof public.platform_delivery_jobs
language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  -- Reclaim crashed leases before selecting new work.
  update public.platform_delivery_jobs
  set status=case when attempts>=max_attempts then 'dead_letter' else 'failed' end,
      available_at=case when attempts>=max_attempts then available_at else now()+interval '30 seconds' end,
      last_error=coalesce(last_error,'Worker lease expired before completion'),
      locked_at=null,locked_by=null,updated_at=now()
  where status='processing' and locked_at<now()-interval '2 minutes';

  insert into public.platform_delivery_dead_letters(job_id,kind,payload,error,attempts)
  select id,kind,payload,coalesce(last_error,'Delivery max attempts reached'),attempts
  from public.platform_delivery_jobs
  where status='dead_letter'
  on conflict(job_id) do update set error=excluded.error,payload=excluded.payload,attempts=excluded.attempts,updated_at=now();

  return query
  with picked as (
    select id from public.platform_delivery_jobs
    where status in ('pending','failed') and available_at<=now()
    order by available_at,created_at
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,10),50))
  )
  update public.platform_delivery_jobs j
  set status='processing',attempts=j.attempts+1,locked_at=now(),locked_by=p_worker,updated_at=now()
  from picked p
  where j.id=p.id
  returning j.*;
end;
$$;
revoke all on function public.claim_platform_delivery_jobs(text,integer) from public,anon,authenticated;
grant execute on function public.claim_platform_delivery_jobs(text,integer) to service_role;

create or replace function public.complete_platform_delivery_job(
  p_id uuid,p_worker text,p_success boolean,p_error text default null,p_retry_seconds integer default 30
)
returns public.platform_delivery_jobs
language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_job public.platform_delivery_jobs;
begin
  update public.platform_delivery_jobs
  set status=case when p_success then 'succeeded' when attempts>=max_attempts then 'dead_letter' else 'failed' end,
      completed_at=case when p_success then now() else completed_at end,
      available_at=case when p_success or attempts>=max_attempts then available_at else now()+make_interval(secs=>greatest(5,least(coalesce(p_retry_seconds,30),3600))) end,
      last_error=case when p_success then null else left(coalesce(p_error,'Unknown delivery error'),4000) end,
      locked_at=null,locked_by=null,updated_at=now()
  where id=p_id and locked_by=p_worker
  returning * into v_job;
  if v_job.id is null then raise exception 'platform delivery job % could not be completed by %',p_id,p_worker; end if;

  if v_job.status='dead_letter' then
    insert into public.platform_delivery_dead_letters(job_id,kind,payload,error,attempts)
    values(v_job.id,v_job.kind,v_job.payload,coalesce(v_job.last_error,'Delivery max attempts reached'),v_job.attempts)
    on conflict(job_id) do update set error=excluded.error,payload=excluded.payload,attempts=excluded.attempts,updated_at=now();
  end if;
  return v_job;
end;
$$;
revoke all on function public.complete_platform_delivery_job(uuid,text,boolean,text,integer) from public,anon,authenticated;
grant execute on function public.complete_platform_delivery_job(uuid,text,boolean,text,integer) to service_role;
