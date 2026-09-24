-- ROSTA canonical minute scheduler for the admin platform orchestrator.
-- Reads the admin URL and internal secret from service-role-only runtime config.

do $scheduler$
declare
  v_job_id bigint;
begin
  if to_regnamespace('cron') is null or to_regnamespace('net') is null then
    raise notice 'ROSTA platform scheduler skipped: pg_cron or pg_net is not installed.';
    return;
  end if;

  if to_regclass('public.automation_cron_config') is null
     or to_regclass('public.commerce_worker_config') is null then
    raise notice 'ROSTA platform scheduler skipped: runtime config tables are missing.';
    return;
  end if;

  if not exists(select 1 from public.automation_cron_config where id = true)
     or not exists(select 1 from public.commerce_worker_config where id = true) then
    raise notice 'ROSTA platform scheduler skipped: runtime config rows are missing.';
    return;
  end if;

  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'rosta-platform-orchestrator'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'rosta-platform-orchestrator',
    '* * * * *',
    $cmd$
      select net.http_post(
        url := (
          select trim(trailing '/' from coalesce(
            nullif(trim(admin_internal_url), ''),
            'https://rostapanel.zeabur.app'
          )) || '/api/internal/platform-tick'
          from public.commerce_worker_config
          where id = true
        ),
        headers := jsonb_build_object(
          'content-type', 'application/json',
          'x-rosta-internal-secret', (
            select secret
            from public.automation_cron_config
            where id = true
          ),
          'user-agent', 'rosta-platform-orchestrator/canonical'
        ),
        body := jsonb_build_object('source', 'database_scheduler')
      );
    $cmd$
  );
end;
$scheduler$;
