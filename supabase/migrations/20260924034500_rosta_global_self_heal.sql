-- ROSTA-native global self-heal supervisor.
-- Uses only the consolidated ROSTA runtime tables and never depends on legacy Ruth scheduler/saga tables.

create or replace function public.run_global_self_heal_supervisor()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_now timestamptz := now();
  v_queue_stuck_seconds integer := 120;
  v_panel_stuck_seconds integer := 120;
  v_outbox_repaired integer := 0;
  v_jobs_repaired integer := 0;
  v_panel_sync_repaired integer := 0;
  v_read_models_staled integer := 0;
  v_dead_outbox integer := 0;
  v_dead_jobs integer := 0;
  v_auto_repairs integer := 0;
  v_manual_attention integer := 0;
  v_status text := 'healthy';
  v_detail text;
begin
  select coalesce(stuck_after_seconds, 120)
    into v_queue_stuck_seconds
  from public.commerce_recovery_policies
  where engine_key = 'commerce-queues'
    and enabled = true;

  if not found then
    v_queue_stuck_seconds := 120;
  end if;

  select coalesce(stuck_after_seconds, 120)
    into v_panel_stuck_seconds
  from public.commerce_recovery_policies
  where engine_key = 'panel-sync'
    and enabled = true;

  if not found then
    v_panel_stuck_seconds := 120;
  end if;

  update public.commerce_outbox
  set
    status = 'failed',
    available_at = v_now + interval '30 seconds',
    locked_at = null,
    locked_by = null,
    last_error = coalesce(last_error, 'ROSTA self-heal: expired worker lease'),
    updated_at = v_now
  where status = 'processing'
    and locked_at is not null
    and locked_at < v_now - make_interval(secs => greatest(15, v_queue_stuck_seconds));

  get diagnostics v_outbox_repaired = row_count;

  update public.commerce_jobs
  set
    status = 'failed',
    run_at = v_now + interval '30 seconds',
    locked_at = null,
    locked_by = null,
    last_error = coalesce(last_error, 'ROSTA self-heal: expired worker lease'),
    updated_at = v_now
  where status = 'running'
    and locked_at is not null
    and locked_at < v_now - make_interval(secs => greatest(15, v_queue_stuck_seconds));

  get diagnostics v_jobs_repaired = row_count;

  update public.panel_sync_requests
  set
    status = case when attempts + 1 >= 8 then 'failed' else 'pending' end,
    attempts = attempts + 1,
    started_at = null,
    completed_at = case when attempts + 1 >= 8 then v_now else null end,
    last_error = coalesce(last_error, 'ROSTA self-heal: expired panel sync lease')
  where status = 'running'
    and started_at is not null
    and started_at < v_now - make_interval(secs => greatest(15, v_panel_stuck_seconds));

  get diagnostics v_panel_sync_repaired = row_count;

  update public.panel_read_models
  set
    status = 'stale',
    last_error = coalesce(last_error, 'ROSTA self-heal: read model expired'),
    updated_at = v_now
  where status = 'healthy'
    and expires_at is not null
    and expires_at < v_now;

  get diagnostics v_read_models_staled = row_count;

  select count(*)::integer
    into v_dead_outbox
  from public.commerce_outbox
  where status = 'dead_letter';

  select count(*)::integer
    into v_dead_jobs
  from public.commerce_jobs
  where status = 'dead_letter';

  v_auto_repairs :=
    v_outbox_repaired
    + v_jobs_repaired
    + v_panel_sync_repaired
    + v_read_models_staled;

  v_manual_attention := v_dead_outbox + v_dead_jobs;
  v_status := case when v_manual_attention > 0 then 'degraded' else 'healthy' end;

  v_detail := format(
    'ROSTA self-heal: %s otomatik onarım · %s manuel inceleme · outbox=%s jobs=%s panel-sync=%s read-model=%s',
    v_auto_repairs,
    v_manual_attention,
    v_outbox_repaired,
    v_jobs_repaired,
    v_panel_sync_repaired,
    v_read_models_staled
  );

  if v_outbox_repaired > 0 or v_jobs_repaired > 0 then
    insert into public.commerce_recovery_events(
      engine_key,
      action,
      status,
      item_count,
      detail,
      metadata,
      occurred_at
    ) values (
      'commerce-queues',
      'expired_leases_released',
      'recovered',
      v_outbox_repaired + v_jobs_repaired,
      'Stuck commerce worker leases released for retry.',
      jsonb_build_object(
        'outbox', v_outbox_repaired,
        'jobs', v_jobs_repaired
      ),
      v_now
    );
  end if;

  if v_panel_sync_repaired > 0 then
    insert into public.commerce_recovery_events(
      engine_key,
      action,
      status,
      item_count,
      detail,
      metadata,
      occurred_at
    ) values (
      'panel-sync',
      'expired_sync_leases_released',
      'recovered',
      v_panel_sync_repaired,
      'Stuck panel sync requests returned to a retryable state.',
      '{}'::jsonb,
      v_now
    );
  end if;

  if v_read_models_staled > 0 then
    insert into public.commerce_recovery_events(
      engine_key,
      action,
      status,
      item_count,
      detail,
      metadata,
      occurred_at
    ) values (
      'read-model',
      'expired_read_models_marked_stale',
      'recovered',
      v_read_models_staled,
      'Expired panel read models were marked stale so live reads can replace them.',
      '{}'::jsonb,
      v_now
    );
  end if;

  if v_auto_repairs = 0 and v_manual_attention = 0 then
    insert into public.commerce_recovery_events(
      engine_key,
      action,
      status,
      item_count,
      detail,
      metadata,
      occurred_at
    ) values (
      'global-supervisor',
      'health_check',
      'noop',
      0,
      'ROSTA self-heal found no repairable runtime drift.',
      '{}'::jsonb,
      v_now
    );
  end if;

  insert into public.panel_service_health_state(
    service_key,
    status,
    detail,
    first_seen_at,
    last_seen_at,
    recovered_at,
    metadata,
    updated_at
  ) values (
    'global-self-heal',
    v_status,
    v_detail,
    v_now,
    v_now,
    case when v_status = 'healthy' then v_now else null end,
    jsonb_build_object(
      'autoRepairs', v_auto_repairs,
      'manualAttention', v_manual_attention,
      'outboxRepaired', v_outbox_repaired,
      'jobsRepaired', v_jobs_repaired,
      'panelSyncRepaired', v_panel_sync_repaired,
      'readModelsStaled', v_read_models_staled,
      'deadOutbox', v_dead_outbox,
      'deadJobs', v_dead_jobs
    ),
    v_now
  )
  on conflict (service_key) do update set
    status = excluded.status,
    detail = excluded.detail,
    last_seen_at = excluded.last_seen_at,
    recovered_at = case
      when public.panel_service_health_state.status <> 'healthy'
       and excluded.status = 'healthy'
      then excluded.last_seen_at
      else public.panel_service_health_state.recovered_at
    end,
    metadata = excluded.metadata,
    updated_at = excluded.updated_at;

  return jsonb_build_object(
    'ok', true,
    'status', v_status,
    'autoRepairs', v_auto_repairs,
    'manualAttention', v_manual_attention,
    'outboxRepaired', v_outbox_repaired,
    'jobsRepaired', v_jobs_repaired,
    'panelSyncRepaired', v_panel_sync_repaired,
    'readModelsStaled', v_read_models_staled,
    'deadOutbox', v_dead_outbox,
    'deadJobs', v_dead_jobs,
    'checkedAt', v_now
  );
end;
$$;

revoke all privileges on function public.run_global_self_heal_supervisor()
  from public, anon, authenticated;

grant execute on function public.run_global_self_heal_supervisor()
  to service_role;

comment on function public.run_global_self_heal_supervisor() is
  'ROSTA-native runtime self-heal supervisor for commerce queues, panel sync leases and read-model freshness.';
