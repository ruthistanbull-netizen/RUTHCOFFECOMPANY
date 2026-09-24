-- Keep ROSTA customer-facing email automations alive on the canonical admin endpoint.
-- Cadence:
--   abandoned cart: every 15 minutes
--   review request: every 15 minutes
-- Secrets are sent only as headers; never in URLs or query strings.

begin;

update public.site_settings
set setting_value = jsonb_set(
      coalesce(setting_value, '{}'::jsonb),
      '{delayDaysAfterDelivered}',
      '1'::jsonb,
      true
    ),
    updated_at = now()
where setting_key = 'review_request_email_settings';

create or replace function public.ensure_rosta_customer_email_automation_crons()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  configured boolean := false;
  abandoned_exists boolean := false;
  review_exists boolean := false;
  abandoned_created boolean := false;
  review_created boolean := false;
begin
  if to_regnamespace('cron') is null or to_regnamespace('net') is null then
    return jsonb_build_object('ok', false, 'reason', 'pg_cron_or_pg_net_missing');
  end if;

  if to_regclass('public.automation_cron_config') is null
     or to_regclass('public.commerce_worker_config') is null then
    return jsonb_build_object('ok', false, 'reason', 'runtime_config_missing');
  end if;

  select exists(
    select 1
    from public.automation_cron_config a
    cross join public.commerce_worker_config w
    where a.id = true
      and w.id = true
      and coalesce(nullif(trim(a.secret), ''), '') <> ''
      and coalesce(nullif(trim(w.admin_internal_url), ''), '') <> ''
  ) into configured;

  if not configured then
    return jsonb_build_object('ok', false, 'reason', 'runtime_config_incomplete');
  end if;

  select exists(
    select 1 from cron.job where jobname = 'rosta-abandoned-cart-email'
  ) into abandoned_exists;

  if not abandoned_exists then
    perform cron.schedule(
      'rosta-abandoned-cart-email',
      '*/15 * * * *',
      $cmd$
        select net.http_get(
          url := (
            select trim(trailing '/' from w.admin_internal_url) || '/api/automation-cron?kind=abandoned'
            from public.commerce_worker_config w
            where w.id = true
          ),
          headers := jsonb_build_object(
            'x-automation-cron-secret', (
              select a.secret from public.automation_cron_config a where a.id = true
            ),
            'user-agent', 'rosta-supabase-cron/customer-email-v1'
          ),
          timeout_milliseconds := 120000
        );
      $cmd$
    );
    abandoned_created := true;
  end if;

  select exists(
    select 1 from cron.job where jobname = 'rosta-review-request-email'
  ) into review_exists;

  if not review_exists then
    perform cron.schedule(
      'rosta-review-request-email',
      '*/15 * * * *',
      $cmd$
        select net.http_get(
          url := (
            select trim(trailing '/' from w.admin_internal_url) || '/api/automation-cron?kind=review'
            from public.commerce_worker_config w
            where w.id = true
          ),
          headers := jsonb_build_object(
            'x-automation-cron-secret', (
              select a.secret from public.automation_cron_config a where a.id = true
            ),
            'user-agent', 'rosta-supabase-cron/customer-email-v1'
          ),
          timeout_milliseconds := 120000
        );
      $cmd$
    );
    review_created := true;
  end if;

  return jsonb_build_object(
    'ok', true,
    'abandonedCart', jsonb_build_object(
      'enabled', true,
      'cadence', '*/15 * * * *',
      'created', abandoned_created
    ),
    'reviewRequest', jsonb_build_object(
      'enabled', true,
      'cadence', '*/15 * * * *',
      'created', review_created
    )
  );
end;
$$;

revoke all on function public.ensure_rosta_customer_email_automation_crons() from public, anon, authenticated;
grant execute on function public.ensure_rosta_customer_email_automation_crons() to service_role;

do $$
declare
  j record;
begin
  if to_regnamespace('cron') is null then
    raise notice 'ROSTA customer email scheduler skipped: pg_cron is not installed.';
    return;
  end if;

  for j in
    select jobid
    from cron.job
    where jobname in (
      'rosta-abandoned-cart-email',
      'rosta-review-request-email',
      'rosta-email-automation-supervisor',
      'ruth-abandoned-cart-email',
      'ruth-review-request-email',
      'ruth-email-automation-supervisor'
    )
  loop
    perform cron.unschedule(j.jobid);
  end loop;

  perform public.ensure_rosta_customer_email_automation_crons();

  perform cron.schedule(
    'rosta-email-automation-supervisor',
    '*/5 * * * *',
    $cmd$select public.ensure_rosta_customer_email_automation_crons();$cmd$
  );
end $$;

commit;
