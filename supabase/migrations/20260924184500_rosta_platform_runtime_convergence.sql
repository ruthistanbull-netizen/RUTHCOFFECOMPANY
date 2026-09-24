-- Converge ROSTA's database-owned panel runtime onto the canonical Zeabur panel.
-- This intentionally preserves existing worker/cron secrets and external account credentials.
-- Canonical admin/panel: https://rostapanel.zeabur.app
--
-- Runtime ownership after this migration:
--   * one HTTP orchestrator (platform-tick) every minute
--   * platform-tick runs service-health-monitor-v4 every minute
--   * platform-tick runs panel-maintenance on its five-minute cadence
--   * one DB supervisor checks the V4 heartbeat every minute
--   * panel read models remain event-driven; periodic panel-sync is not restored

begin;

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.automation_cron_config (
  id boolean primary key default true check (id = true),
  secret text not null default encode(gen_random_bytes(32), 'hex'),
  admin_base_url text not null default 'https://rostapanel.zeabur.app',
  updated_at timestamptz not null default now()
);

alter table public.automation_cron_config
  add column if not exists secret text,
  add column if not exists admin_base_url text,
  add column if not exists updated_at timestamptz not null default now();

update public.automation_cron_config
set secret = case
      when coalesce(trim(secret), '') = '' then encode(gen_random_bytes(32), 'hex')
      else secret
    end,
    admin_base_url = 'https://rostapanel.zeabur.app',
    updated_at = now()
where id = true;

insert into public.automation_cron_config (id, secret, admin_base_url, updated_at)
values (true, encode(gen_random_bytes(32), 'hex'), 'https://rostapanel.zeabur.app', now())
on conflict (id) do update
set admin_base_url = excluded.admin_base_url,
    updated_at = now();

alter table public.automation_cron_config
  alter column secret set not null,
  alter column secret set default encode(gen_random_bytes(32), 'hex'),
  alter column admin_base_url set not null,
  alter column admin_base_url set default 'https://rostapanel.zeabur.app';

alter table public.automation_cron_config enable row level security;
revoke all on public.automation_cron_config from anon, authenticated;
grant all on public.automation_cron_config to service_role;

create table if not exists public.commerce_worker_config (
  id boolean primary key default true check (id = true),
  worker_secret text not null default encode(gen_random_bytes(32), 'hex'),
  function_url text,
  admin_internal_url text not null default 'https://rostapanel.zeabur.app',
  updated_at timestamptz not null default now()
);

alter table public.commerce_worker_config
  add column if not exists worker_secret text not null default encode(gen_random_bytes(32), 'hex'),
  add column if not exists function_url text,
  add column if not exists admin_internal_url text not null default 'https://rostapanel.zeabur.app',
  add column if not exists updated_at timestamptz not null default now();

insert into public.commerce_worker_config(id)
values (true)
on conflict (id) do nothing;

update public.commerce_worker_config
set admin_internal_url = 'https://rostapanel.zeabur.app',
    updated_at = now()
where id = true;

alter table public.commerce_worker_config
  alter column admin_internal_url set default 'https://rostapanel.zeabur.app';

alter table public.commerce_worker_config enable row level security;
revoke all on public.commerce_worker_config from anon, authenticated;
grant all on public.commerce_worker_config to service_role;

create or replace function public.watch_service_health_monitor_v4()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  heartbeat timestamptz;
  monitor_detail text;
  monitor_metadata jsonb;
  previous_status text;
  previous_first_seen timestamptz;
  previous_recovered timestamptz;
  previous_metadata jsonb;
  armed boolean := false;
  v4_seen boolean := false;
  missed integer := 0;
  next_status text;
  incident_started timestamptz;
  should_alert boolean := false;
begin
  select last_seen_at, detail, metadata
    into heartbeat, monitor_detail, monitor_metadata
  from public.panel_service_health_state
  where service_key = 'service-health-monitor';

  select status, first_seen_at, recovered_at, metadata
    into previous_status, previous_first_seen, previous_recovered, previous_metadata
  from public.panel_service_health_state
  where service_key = 'service-health-supervisor';

  armed := coalesce((previous_metadata->>'armed')::boolean, false);
  v4_seen := heartbeat is not null
    and heartbeat >= now() - interval '3 minutes'
    and coalesce(monitor_metadata->>'monitorVersion', '') like '4%'
    and coalesce(monitor_detail, '') not ilike 'v4 24/7 monitor heartbeat bekleniyor%';

  if not armed then
    if v4_seen then
      armed := true;
    else
      insert into public.panel_service_health_state(
        service_key,status,detail,first_seen_at,last_seen_at,last_alerted_at,recovered_at,metadata,updated_at
      ) values (
        'service-health-supervisor','degraded',
        '24/7 supervisor rollout bekliyor; ilk başarılı v4 heartbeat gelmeden alarm üretmez.',
        coalesce(previous_first_seen,now()),now(),null,previous_recovered,
        jsonb_build_object(
          'armed',false,'missed_checks',0,'heartbeat',heartbeat,
          'supervisor_version','4.2','verifiedFailure',false,
          'verified_monitoring_only',true,'individual_services_marked_failed',false
        ),now()
      )
      on conflict(service_key) do update set
        status=excluded.status,
        detail=excluded.detail,
        last_seen_at=excluded.last_seen_at,
        last_alerted_at=null,
        metadata=excluded.metadata,
        updated_at=excluded.updated_at;
      return;
    end if;
  end if;

  if heartbeat is not null and heartbeat >= now() - interval '3 minutes' then
    insert into public.panel_service_health_state(
      service_key,status,detail,first_seen_at,last_seen_at,last_alerted_at,recovered_at,metadata,updated_at
    ) values (
      'service-health-supervisor','healthy','24/7 supervisor: v4 servis izleyici heartbeat güncel.',
      now(),now(),null,
      case when previous_status is not null and previous_status <> 'healthy' then now() else previous_recovered end,
      jsonb_build_object(
        'armed',true,'missed_checks',0,'heartbeat',heartbeat,
        'supervisor_version','4.2','verifiedFailure',false,
        'verified_monitoring_only',true,'individual_services_marked_failed',false
      ),now()
    )
    on conflict(service_key) do update set
      status=excluded.status,
      detail=excluded.detail,
      first_seen_at=excluded.first_seen_at,
      last_seen_at=excluded.last_seen_at,
      recovered_at=excluded.recovered_at,
      metadata=excluded.metadata,
      updated_at=excluded.updated_at;
    return;
  end if;

  missed := coalesce((previous_metadata->>'missed_checks')::integer, 0) + 1;
  next_status := case when missed >= 2 then 'unhealthy' else 'degraded' end;
  incident_started := case
    when previous_status in ('degraded','unhealthy') and previous_first_seen is not null then previous_first_seen
    else now()
  end;
  should_alert := next_status = 'unhealthy' and coalesce(previous_status,'healthy') <> 'unhealthy';

  insert into public.panel_service_health_state(
    service_key,status,detail,first_seen_at,last_seen_at,last_alerted_at,recovered_at,metadata,updated_at
  ) values (
    'service-health-supervisor',next_status,
    case when next_status='unhealthy'
      then '24/7 supervisor: servis izleyici heartbeat iki ardışık kontrolde gelmedi; monitor kesintisi doğrulandı. Alt servisler arızalı sayılmadı.'
      else '24/7 supervisor: servis izleyici heartbeat gecikmiş; ikinci kontrol bekleniyor. Alt servisler arızalı sayılmadı.' end,
    incident_started,now(),case when should_alert then now() else null end,previous_recovered,
    jsonb_build_object(
      'armed',true,'missed_checks',missed,'heartbeat',heartbeat,
      'supervisor_version','4.2','verifiedFailure',(next_status='unhealthy'),
      'evidence','two_consecutive_missing_heartbeats','verified_monitoring_only',true,
      'individual_services_marked_failed',false
    ),now()
  )
  on conflict(service_key) do update set
    status=excluded.status,
    detail=excluded.detail,
    first_seen_at=excluded.first_seen_at,
    last_seen_at=excluded.last_seen_at,
    last_alerted_at=case when should_alert then now() else public.panel_service_health_state.last_alerted_at end,
    recovered_at=excluded.recovered_at,
    metadata=excluded.metadata,
    updated_at=excluded.updated_at;

  if should_alert then
    insert into public.admin_push_jobs(kind,dedupe_key,payload,target_url)
    values(
      'health',
      'service-health-supervisor:v4.2:' || to_char(incident_started at time zone 'UTC','YYYYMMDDHH24MISS'),
      jsonb_build_object(
        'service_key','service-health-supervisor',
        'status','unhealthy',
        'verified',true,
        'evidence','two_consecutive_missing_heartbeats',
        'title','ROSTA servis izleyici heartbeat kesintisi',
        'body','24/7 supervisor, daha önce çalışan servis izleyiciden iki ardışık kontrolde heartbeat alamadı. Alt servisler arızalı olarak işaretlenmedi.'
      ),
      '/system'
    )
    on conflict(dedupe_key) do nothing;
  end if;
end;
$$;

revoke all on function public.watch_service_health_monitor_v4() from public, anon, authenticated;
grant execute on function public.watch_service_health_monitor_v4() to service_role;

-- Retire historical Ruth/ROSTA owners before creating the canonical pair.
do $$
declare
  j record;
begin
  for j in
    select jobid
    from cron.job
    where jobname in (
      'ruth-platform-orchestrator',
      'ruth-full-service-health-monitor',
      'ruth-service-health-supervisor-v4',
      'ruth-panel-instant-sync',
      'ruth-panel-sync-recovery-watchdog',
      'rosta-platform-orchestrator',
      'rosta-full-service-health-monitor',
      'rosta-service-health-supervisor-v4',
      'rosta-panel-instant-sync',
      'rosta-panel-sync-recovery-watchdog'
    )
  loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;

select cron.schedule(
  'rosta-platform-orchestrator',
  '* * * * *',
  $cmd$
    select net.http_post(
      url := (
        select trim(trailing '/' from admin_base_url) || '/api/internal/platform-tick'
        from public.automation_cron_config
        where id = true
      ),
      headers := jsonb_build_object(
        'content-type','application/json',
        'x-rosta-internal-secret',(select secret from public.automation_cron_config where id = true),
        'user-agent','rosta-platform-orchestrator/health-v4'
      ),
      body := jsonb_build_object('source','supabase_health_v4_runtime'),
      timeout_milliseconds := 55000
    );
  $cmd$
);

select cron.schedule(
  'rosta-service-health-supervisor-v4',
  '* * * * *',
  $cmd$select public.watch_service_health_monitor_v4();$cmd$
);

-- Anti-regression contract: one ROSTA HTTP owner + one heartbeat supervisor.
do $$
declare
  orchestrators integer;
  supervisors integer;
  direct_health integer;
  polling_sync integer;
begin
  select count(*) into orchestrators
  from cron.job where jobname = 'rosta-platform-orchestrator';

  select count(*) into supervisors
  from cron.job where jobname = 'rosta-service-health-supervisor-v4';

  select count(*) into direct_health
  from cron.job where jobname in ('ruth-full-service-health-monitor','rosta-full-service-health-monitor');

  select count(*) into polling_sync
  from cron.job where jobname in (
    'ruth-panel-instant-sync','ruth-panel-sync-recovery-watchdog',
    'rosta-panel-instant-sync','rosta-panel-sync-recovery-watchdog'
  );

  if orchestrators <> 1 then
    raise exception 'Expected one ROSTA platform orchestrator, found %', orchestrators;
  end if;
  if supervisors <> 1 then
    raise exception 'Expected one ROSTA service health supervisor, found %', supervisors;
  end if;
  if direct_health <> 0 then
    raise exception 'Legacy direct health cron still exists';
  end if;
  if polling_sync <> 0 then
    raise exception 'Panel polling cron was accidentally restored';
  end if;

  if exists (
    select 1 from public.automation_cron_config
    where id = true
      and trim(trailing '/' from coalesce(admin_base_url, '')) <> 'https://rostapanel.zeabur.app'
  ) then
    raise exception 'automation_cron_config is not bound to the canonical ROSTA panel';
  end if;

  if exists (
    select 1 from public.commerce_worker_config
    where id = true
      and trim(trailing '/' from coalesce(admin_internal_url, '')) <> 'https://rostapanel.zeabur.app'
  ) then
    raise exception 'commerce_worker_config is not bound to the canonical ROSTA panel';
  end if;
end $$;

commit;
