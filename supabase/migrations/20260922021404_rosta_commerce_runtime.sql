begin;

create table if not exists public.commerce_audit_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  actor_type text not null check (actor_type in ('user','customer','system','integration')),
  actor_id text,
  actor_name text,
  correlation_id text,
  causation_id text,
  reason text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  ip_address inet,
  user_agent text,
  occurred_at timestamptz not null default now()
);

create table if not exists public.commerce_outbox (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique,
  event_type text not null,
  event_version integer not null default 1 check (event_version>0),
  aggregate_type text not null,
  aggregate_id text not null,
  payload jsonb not null,
  headers jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','processing','published','failed','dead_letter')),
  attempts integer not null default 0 check (attempts>=0),
  max_attempts integer not null default 8 check (max_attempts>0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  published_at timestamptz,
  last_error text,
  correlation_id text,
  causation_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.commerce_jobs (
  id uuid primary key default gen_random_uuid(),
  queue text not null default 'commerce',
  job_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','dead_letter','cancelled')),
  priority integer not null default 100,
  attempts integer not null default 0 check (attempts>=0),
  max_attempts integer not null default 8 check (max_attempts>0),
  run_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  completed_at timestamptz,
  last_error text,
  correlation_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.commerce_dead_letters (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('outbox','job','payment_callback','event_replay')),
  source_id text not null,
  event_type text,
  aggregate_id text,
  payload jsonb,
  status text not null default 'open' check (status in ('open','retrying','resolved','discarded')),
  attempts integer not null default 0 check (attempts>=0),
  error text not null,
  root_cause text,
  correlation_id text,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  discarded_at timestamptz,
  unique(source,source_id)
);

create table if not exists public.commerce_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('healthy','degraded','unhealthy')),
  checks jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null default now()
);

create index if not exists commerce_audit_entity_idx on public.commerce_audit_logs(entity_type,entity_id,occurred_at desc);
create index if not exists commerce_outbox_claim_idx on public.commerce_outbox(status,available_at,created_at) where status in ('pending','failed');
create index if not exists commerce_jobs_claim_idx on public.commerce_jobs(queue,status,priority,run_at,created_at) where status in ('queued','failed');
create index if not exists commerce_dead_letters_open_idx on public.commerce_dead_letters(created_at) where status='open';
create index if not exists commerce_health_snapshots_generated_idx on public.commerce_health_snapshots(generated_at desc);

alter table public.commerce_audit_logs enable row level security;
alter table public.commerce_outbox enable row level security;
alter table public.commerce_jobs enable row level security;
alter table public.commerce_dead_letters enable row level security;
alter table public.commerce_health_snapshots enable row level security;

revoke all on table public.commerce_audit_logs from public, anon, authenticated;
revoke all on table public.commerce_outbox from public, anon, authenticated;
revoke all on table public.commerce_jobs from public, anon, authenticated;
revoke all on table public.commerce_dead_letters from public, anon, authenticated;
revoke all on table public.commerce_health_snapshots from public, anon, authenticated;
grant all on table public.commerce_audit_logs to service_role;
grant all on table public.commerce_outbox to service_role;
grant all on table public.commerce_jobs to service_role;
grant all on table public.commerce_dead_letters to service_role;
grant all on table public.commerce_health_snapshots to service_role;

create or replace function public.claim_commerce_outbox(p_worker text,p_limit integer default 25)
returns setof public.commerce_outbox
language plpgsql security definer set search_path=public,pg_catalog
as $$
begin
  return query
  with candidates as (
    select id from public.commerce_outbox
    where status in ('pending','failed') and available_at<=now()
    order by available_at,created_at
    for update skip locked
    limit greatest(1,least(p_limit,100))
  )
  update public.commerce_outbox o
  set status='processing',attempts=o.attempts+1,locked_at=now(),locked_by=p_worker,updated_at=now()
  from candidates c where o.id=c.id
  returning o.*;
end;
$$;

create or replace function public.claim_commerce_jobs(p_worker text,p_queue text default 'commerce',p_limit integer default 25)
returns setof public.commerce_jobs
language plpgsql security definer set search_path=public,pg_catalog
as $$
begin
  return query
  with candidates as (
    select id from public.commerce_jobs
    where queue=p_queue and status in ('queued','failed') and run_at<=now()
    order by priority,run_at,created_at
    for update skip locked
    limit greatest(1,least(p_limit,100))
  )
  update public.commerce_jobs j
  set status='running',attempts=j.attempts+1,locked_at=now(),locked_by=p_worker,updated_at=now()
  from candidates c where j.id=c.id
  returning j.*;
end;
$$;

create or replace function public.complete_commerce_outbox(
  p_id uuid,p_worker text,p_success boolean,p_error text default null,p_retry_delay_seconds integer default 60
)
returns public.commerce_outbox
language plpgsql security definer set search_path=public,pg_catalog
as $$
declare result public.commerce_outbox;
begin
  update public.commerce_outbox
  set status=case when p_success then 'published' when attempts>=max_attempts then 'dead_letter' else 'failed' end,
      published_at=case when p_success then now() else published_at end,
      available_at=case when p_success then available_at else now()+make_interval(secs=>greatest(1,p_retry_delay_seconds)) end,
      last_error=case when p_success then null else left(coalesce(p_error,'Unknown outbox error'),4000) end,
      locked_at=null,locked_by=null,updated_at=now()
  where id=p_id and (locked_by=p_worker or locked_by is null)
  returning * into result;

  if result.id is null then raise exception 'commerce_outbox row % could not be completed by %',p_id,p_worker; end if;

  if result.status='dead_letter' then
    insert into public.commerce_dead_letters(source,source_id,event_type,aggregate_id,payload,error,correlation_id)
    values ('outbox',result.id::text,result.event_type,result.aggregate_id,result.payload,coalesce(result.last_error,'Outbox max attempts reached'),result.correlation_id)
    on conflict (source,source_id) do update set error=excluded.error,payload=excluded.payload,updated_at=now();
  end if;
  return result;
end;
$$;

create or replace function public.complete_commerce_job(
  p_id uuid,p_worker text,p_success boolean,p_error text default null,p_retry_delay_seconds integer default 60
)
returns public.commerce_jobs
language plpgsql security definer set search_path=public,pg_catalog
as $$
declare result public.commerce_jobs;
begin
  update public.commerce_jobs
  set status=case when p_success then 'succeeded' when attempts>=max_attempts then 'dead_letter' else 'failed' end,
      completed_at=case when p_success then now() else completed_at end,
      run_at=case when p_success then run_at else now()+make_interval(secs=>greatest(1,p_retry_delay_seconds)) end,
      last_error=case when p_success then null else left(coalesce(p_error,'Unknown job error'),4000) end,
      locked_at=null,locked_by=null,updated_at=now()
  where id=p_id and (locked_by=p_worker or locked_by is null)
  returning * into result;

  if result.id is null then raise exception 'commerce_jobs row % could not be completed by %',p_id,p_worker; end if;

  if result.status='dead_letter' then
    insert into public.commerce_dead_letters(source,source_id,event_type,aggregate_id,payload,error,correlation_id)
    values ('job',result.id::text,result.job_type,null,result.payload,coalesce(result.last_error,'Job max attempts reached'),result.correlation_id)
    on conflict (source,source_id) do update set error=excluded.error,payload=excluded.payload,updated_at=now();
  end if;
  return result;
end;
$$;

create or replace function public.enqueue_commerce_event_outbox()
returns trigger
language plpgsql security definer set search_path=public,pg_catalog
as $$
declare normalized_event_id uuid;
begin
  begin normalized_event_id:=new.event_id::uuid;
  exception when invalid_text_representation then normalized_event_id:=gen_random_uuid();
  end;

  insert into public.commerce_outbox(
    event_id,event_type,event_version,aggregate_type,aggregate_id,payload,headers,correlation_id,causation_id,created_at
  ) values (
    normalized_event_id,new.event_type,new.event_version,new.aggregate_type,new.aggregate_id,new.payload,
    jsonb_build_object('channel',new.channel,'actor_id',new.actor_id,'idempotency_key',new.idempotency_key,'source_event_id',new.event_id),
    new.correlation_id,new.causation_id,new.created_at
  )
  on conflict(event_id) do nothing;
  return new;
end;
$$;

drop trigger if exists enqueue_commerce_event_outbox on public.commerce_events;
create trigger enqueue_commerce_event_outbox
after insert on public.commerce_events
for each row execute function public.enqueue_commerce_event_outbox();

revoke all on function public.claim_commerce_outbox(text,integer) from public, anon, authenticated;
revoke all on function public.claim_commerce_jobs(text,text,integer) from public, anon, authenticated;
revoke all on function public.complete_commerce_outbox(uuid,text,boolean,text,integer) from public, anon, authenticated;
revoke all on function public.complete_commerce_job(uuid,text,boolean,text,integer) from public, anon, authenticated;
revoke all on function public.enqueue_commerce_event_outbox() from public, anon, authenticated;

grant execute on function public.claim_commerce_outbox(text,integer) to service_role;
grant execute on function public.claim_commerce_jobs(text,text,integer) to service_role;
grant execute on function public.complete_commerce_outbox(uuid,text,boolean,text,integer) to service_role;
grant execute on function public.complete_commerce_job(uuid,text,boolean,text,integer) to service_role;
grant execute on function public.enqueue_commerce_event_outbox() to service_role;

commit;