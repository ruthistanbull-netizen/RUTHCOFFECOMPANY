-- ROSTA Shipping parity hardening.
-- Consolidates the latest Commerce Core / Basit Kargo lifecycle guards after the ROSTA Phase 4 baseline.
-- No provider credentials or business data are copied by this migration.

begin;

-- Consolidated from current Commerce: 20260907160000_force_basit_kargo_order_status_sync.sql
-- Basit Kargo must always reconcile the order aggregate, including legacy orders
-- that still use the historical `preparing` status.
create or replace function public.transition_order_shipment_state(
  p_order_id uuid,
  p_next_status text,
  p_provider text default 'manual',
  p_provider_event_key text default null,
  p_tracking_no text default null,
  p_tracking_url text default null,
  p_external_order_id text default null,
  p_expected_version bigint default null,
  p_actor_type text default 'integration',
  p_actor_id text default null,
  p_source text default 'shipping_adapter',
  p_correlation_id text default null,
  p_idempotency_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.orders
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $function$
declare
  v_order public.orders;
  v_from text;
  v_to text;
  v_order_from text;
  v_order_to text;
  v_now timestamptz := now();
  v_event_id uuid := gen_random_uuid();
  v_correlation text;
  v_idempotency text;
  v_event_type text;
  v_timeline_type text;
  v_audit_action text;
  v_shipment_changed boolean;
  v_order_changed boolean;
begin
  if p_order_id is null then
    raise exception using errcode = '22023', message = 'Order id is required.';
  end if;

  if p_actor_type not in ('user', 'customer', 'system', 'integration') then
    raise exception using errcode = '22023', message = 'Invalid actor type.';
  end if;

  v_to := public.normalize_shipment_state(p_next_status);
  if v_to not in ('not_created', 'label_created', 'ready_for_handover', 'in_transit', 'delivered', 'exception', 'cancelled', 'returned') then
    raise exception using errcode = '22023', message = 'Unknown shipment status.';
  end if;

  v_idempotency := nullif(trim(coalesce(p_idempotency_key, p_provider_event_key, '')), '');
  if v_idempotency is null then
    raise exception using errcode = '22023', message = 'Shipment idempotency key is required.';
  end if;

  v_correlation := coalesce(
    nullif(trim(coalesce(p_correlation_id, '')), ''),
    'shipment:' || p_order_id::text || ':' || v_idempotency
  );

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Order not found.';
  end if;

  if exists (
    select 1 from public.order_timeline_events
    where order_id = p_order_id and idempotency_key = v_idempotency
  ) then
    return v_order;
  end if;

  if p_expected_version is not null and v_order.state_version <> p_expected_version then
    raise exception using errcode = '40001', message = 'Order changed by another operation. Reload and retry.';
  end if;

  v_from := public.normalize_shipment_state(v_order.shipping_status);
  v_order_from := public.normalize_order_state(v_order.status, v_order.payment_status);
  v_order_to := v_order_from;

  -- A generated label/barcode means the order is ready to ship, even when the
  -- legacy order status is still `preparing`.
  if v_to in ('label_created', 'ready_for_handover')
     and v_order_from in ('paid', 'queued', 'preparing', 'in_production', 'quality_control') then
    v_order_to := 'ready_to_ship';
  end if;

  if v_to = 'in_transit' and v_order_from not in ('cancelled', 'delivered', 'returned') then
    v_order_to := 'shipped';
  end if;

  if v_to = 'delivered' and v_order_from not in ('cancelled', 'returned') then
    v_order_to := 'delivered';
  end if;

  if v_to = 'returned' and v_order_from in ('shipped', 'delivered', 'return_requested') then
    v_order_to := 'returned';
  end if;

  v_shipment_changed := v_from <> v_to;
  v_order_changed := v_order_from <> v_order_to;

  if not v_shipment_changed and not v_order_changed then
    return v_order;
  end if;

  if v_shipment_changed and not public.shipment_state_transition_allowed(v_from, v_to) then
    raise exception using errcode = 'P0001', message = format('Shipment status cannot transition from %s to %s.', v_from, v_to);
  end if;

  update public.orders
  set
    shipping_provider = coalesce(nullif(trim(p_provider), ''), shipping_provider, 'manual'),
    shipping_status = v_to,
    cargo_tracking_no = coalesce(nullif(trim(coalesce(p_tracking_no, '')), ''), cargo_tracking_no),
    cargo_tracking_url = coalesce(nullif(trim(coalesce(p_tracking_url, '')), ''), cargo_tracking_url),
    basit_kargo_order_id = case
      when lower(coalesce(p_provider, '')) in ('basit_kargo', 'basit-kargo')
        then coalesce(nullif(trim(coalesce(p_external_order_id, '')), ''), basit_kargo_order_id)
      else basit_kargo_order_id
    end,
    status = v_order_to,
    fulfillment_status = case
      when v_order_to = 'ready_to_ship' then 'ready'
      when v_order_to in ('shipped', 'delivered', 'return_requested', 'returned') then 'fulfilled'
      else fulfillment_status
    end,
    state_version = state_version + 1,
    delivered_at = case when v_to = 'delivered' or v_order_to = 'delivered' then v_now else delivered_at end,
    shipping_updated_at = v_now,
    shipping_error = case when v_to = 'exception' then coalesce(p_metadata->>'error', shipping_error, 'Shipping exception') else null end,
    updated_at = v_now
  where id = p_order_id
  returning * into v_order;

  if v_shipment_changed then
    insert into public.shipping_events(
      order_id, provider, event_key, event_type, external_order_id, barcode,
      tracking_no, status, status_label, event_time, payload
    )
    values (
      p_order_id,
      coalesce(nullif(trim(p_provider), ''), 'manual'),
      coalesce(nullif(trim(coalesce(p_provider_event_key, '')), ''), 'shipment:' || v_event_id::text),
      'shipment.status_changed',
      p_external_order_id,
      case when lower(coalesce(p_provider, '')) in ('basit_kargo', 'basit-kargo') then v_order.basit_kargo_barcode else null end,
      v_order.cargo_tracking_no,
      v_to,
      v_to,
      v_now,
      coalesce(p_metadata, '{}'::jsonb)
    ) on conflict (event_key) do nothing;
  end if;

  v_timeline_type := case when v_shipment_changed then 'shipment.status_changed' else 'order.status_changed' end;

  insert into public.order_timeline_events(
    order_id, event_key, event_type, from_status, to_status, payment_status,
    fulfillment_status, shipment_status, source, reason, actor_type, actor_id,
    correlation_id, idempotency_key, metadata, occurred_at
  )
  values (
    p_order_id,
    case when v_shipment_changed then 'shipment-state:' else 'shipment-reconcile:' end || v_event_id::text,
    v_timeline_type,
    v_order_from,
    v_order_to,
    v_order.payment_status,
    v_order.fulfillment_status,
    v_to,
    coalesce(nullif(trim(p_source), ''), 'shipping_adapter'),
    case when v_shipment_changed then null else 'Sipariş durumu doğrulanmış kargo durumuyla uzlaştırıldı.' end,
    p_actor_type,
    p_actor_id,
    v_correlation,
    v_idempotency,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'shipmentFrom', v_from,
      'shipmentTo', v_to,
      'provider', p_provider,
      'orderReconciled', not v_shipment_changed and v_order_changed
    ),
    v_now
  );

  if v_shipment_changed then
    v_event_type := case
      when v_to in ('label_created', 'ready_for_handover') then 'shipment.created'
      when v_to = 'in_transit' then 'shipment.shipped'
      when v_to = 'delivered' then 'shipment.delivered'
      else 'shipment.status_changed'
    end;
  else
    v_event_type := 'order.status_changed';
  end if;

  insert into public.commerce_events(
    event_id, event_type, aggregate_id, aggregate_type, event_version, channel,
    correlation_id, actor_id, idempotency_key, payload, occurred_at
  )
  values (
    v_event_id::text,
    v_event_type,
    p_order_id::text,
    case when v_shipment_changed then 'shipment' else 'order' end,
    1,
    case when p_actor_type = 'user' then 'admin' else 'commerce-core' end,
    v_correlation,
    p_actor_id,
    v_idempotency,
    case
      when v_shipment_changed then jsonb_build_object(
        'orderId', p_order_id, 'from', v_from, 'to', v_to,
        'orderFrom', v_order_from, 'orderTo', v_order_to,
        'provider', p_provider, 'trackingNumber', v_order.cargo_tracking_no
      )
      else jsonb_build_object(
        'orderId', p_order_id, 'from', v_order_from, 'to', v_order_to,
        'stateVersion', v_order.state_version, 'reason', 'shipment_state_reconciliation',
        'shipmentStatus', v_to, 'provider', p_provider
      )
    end,
    v_now
  );

  v_audit_action := case when v_shipment_changed then 'shipment.status_changed' else 'order.status_reconciled_from_shipment' end;

  insert into public.commerce_audit_logs(
    action, entity_type, entity_id, actor_type, actor_id, correlation_id,
    reason, before_data, after_data, metadata, occurred_at
  )
  values (
    v_audit_action,
    'order',
    p_order_id::text,
    p_actor_type,
    p_actor_id,
    v_correlation,
    case when v_shipment_changed then null else 'Sipariş durumu doğrulanmış kargo durumuyla uzlaştırıldı.' end,
    jsonb_build_object('shipment_status', v_from, 'order_status', v_order_from, 'state_version', v_order.state_version - 1),
    jsonb_build_object('shipment_status', v_to, 'order_status', v_order_to, 'state_version', v_order.state_version),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'provider', p_provider,
      'provider_event_key', p_provider_event_key,
      'order_reconciled', not v_shipment_changed and v_order_changed
    ),
    v_now
  );

  return v_order;
end;
$function$;

comment on function public.transition_order_shipment_state(
  uuid, text, text, text, text, text, text, bigint, text, text, text, text, text, jsonb
) is 'Keeps order and shipment lifecycle aligned, including legacy preparing orders.';

-- Repair every existing paid/preparing order that already has a Basit Kargo
-- identifier/tracking/barcode but is still shown as preparing.
update public.orders
set
  status = 'ready_to_ship',
  fulfillment_status = 'ready',
  shipping_status = case
    when nullif(trim(coalesce(shipping_status, '')), '') in ('label_created', 'ready_for_handover', 'ready_to_ship')
      then shipping_status
    else 'ready_for_handover'
  end,
  shipping_provider = coalesce(shipping_provider, 'basit_kargo'),
  shipping_updated_at = now(),
  updated_at = now(),
  state_version = coalesce(state_version, 0) + 1
where lower(coalesce(status, '')) in ('preparing', 'processing', 'queued', 'in_production', 'quality_control', 'paid')
  and (
    nullif(trim(coalesce(cargo_tracking_no, '')), '') is not null
    or nullif(trim(coalesce(basit_kargo_barcode, '')), '') is not null
    or nullif(trim(coalesce(basit_kargo_order_id, '')), '') is not null
  );

-- Keep any future direct metadata writes consistent as well.
create or replace function public.sync_order_lifecycle_from_shipping_status()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $$
begin
  if new.shipping_status is distinct from old.shipping_status then
    if new.shipping_status in ('label_created', 'ready_for_handover')
       and lower(coalesce(new.status, '')) in ('paid', 'queued', 'preparing', 'in_production', 'quality_control') then
      new.status := 'ready_to_ship';
      new.fulfillment_status := 'ready';
    elsif new.shipping_status = 'in_transit' then
      new.status := 'shipped';
      new.fulfillment_status := 'fulfilled';
    elsif new.shipping_status = 'delivered' then
      new.status := 'delivered';
      new.fulfillment_status := 'fulfilled';
      new.delivered_at := coalesce(new.delivered_at, now());
    end if;
  end if;
  return new;
end;
$$;

DROP TRIGGER IF EXISTS trg_orders_sync_lifecycle_from_shipping_status ON public.orders;
CREATE TRIGGER trg_orders_sync_lifecycle_from_shipping_status
BEFORE UPDATE OF shipping_status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_order_lifecycle_from_shipping_status();


-- Consolidated from current Commerce: 20260909160000_harden_basit_kargo_delivery_sync.sql
-- Basit Kargo teslim edildi durumu sipariş aggregate'ini her durumda düzeltmeli.
-- Özellikle aynı provider event'i daha önce işlendiğinde transition RPC idempotency
-- nedeniyle erken dönse bile, orders üzerindeki metadata UPDATE'i sipariş durumunu
-- yeniden uzlaştırmalıdır.

create or replace function public.force_order_lifecycle_from_shipping_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if new.shipping_status = 'delivered'
     and lower(coalesce(new.status, '')) not in ('cancelled', 'returned', 'delivered') then
    new.status := 'delivered';
    new.fulfillment_status := 'fulfilled';
    new.delivered_at := coalesce(new.delivered_at, now());
  elsif new.shipping_status = 'in_transit'
     and lower(coalesce(new.status, '')) not in ('cancelled', 'delivered', 'returned') then
    new.status := 'shipped';
    new.fulfillment_status := 'fulfilled';
  elsif new.shipping_status in ('label_created', 'ready_for_handover')
     and lower(coalesce(new.status, '')) in ('paid', 'queued', 'preparing', 'in_production', 'quality_control') then
    new.status := 'ready_to_ship';
    new.fulfillment_status := 'ready';
  end if;

  return new;
end;
$$;

revoke all on function public.force_order_lifecycle_from_shipping_status() from public, anon, authenticated;
grant execute on function public.force_order_lifecycle_from_shipping_status() to service_role;

drop trigger if exists trg_orders_force_lifecycle_from_shipping_status on public.orders;

-- Deliberately fires on every orders UPDATE, not only when shipping_status itself
-- changes. This closes the idempotency gap where shipping_status is already
-- 'delivered' but a previous process left orders.status as 'shipped'.
create trigger trg_orders_force_lifecycle_from_shipping_status
before update on public.orders
for each row
execute function public.force_order_lifecycle_from_shipping_status();

-- One-time repair for orders already affected by the stale-state bug.
update public.orders
set
  status = 'delivered',
  fulfillment_status = 'fulfilled',
  delivered_at = coalesce(delivered_at, now()),
  shipping_updated_at = coalesce(shipping_updated_at, now()),
  updated_at = now(),
  state_version = coalesce(state_version, 0) + 1
where shipping_status = 'delivered'
  and lower(coalesce(status, '')) not in ('delivered', 'cancelled', 'returned');


-- Consolidated from current Commerce: 20260910024000_repair_core_shipping_order_state_drift.sql
-- Commerce Core is the single authority for order/shipment lifecycle.
-- Repair legacy rows where a trusted Basit Kargo shipment state was persisted but
-- the order aggregate was left behind at an older status.

update public.orders
set
  status = case
    when shipping_status = 'delivered' then 'delivered'
    when shipping_status = 'in_transit' then 'shipped'
    when shipping_status in ('label_created', 'ready_for_handover')
      and lower(coalesce(status, '')) not in ('cancelled', 'canceled', 'delivered', 'returned')
      then 'ready_to_ship'
    else status
  end,
  fulfillment_status = case
    when shipping_status in ('label_created', 'ready_for_handover') then 'ready'
    when shipping_status in ('in_transit', 'delivered') then 'fulfilled'
    else fulfillment_status
  end,
  delivered_at = case
    when shipping_status = 'delivered' then coalesce(delivered_at, now())
    else delivered_at
  end,
  shipping_updated_at = coalesce(shipping_updated_at, now()),
  updated_at = now(),
  state_version = coalesce(state_version, 0) + 1
where shipping_provider = 'basit_kargo'
  and (
    (shipping_status = 'delivered' and lower(coalesce(status, '')) <> 'delivered')
    or (shipping_status = 'in_transit' and lower(coalesce(status, '')) <> 'shipped')
    or (
      shipping_status in ('label_created', 'ready_for_handover')
      and lower(coalesce(status, '')) not in ('ready_to_ship', 'shipped', 'delivered', 'cancelled', 'canceled', 'returned')
    )
  );

comment on column public.orders.shipping_status is
  'Canonical shipment lifecycle state. Provider adapters must transition it through the Commerce Core shipment state machine; order status is reconciled from this state.';


-- Consolidated from current Commerce: 20260910032000_basit_kargo_core_status_guard.sql
-- Basit Kargo is an external status source only.
-- Every provider status is normalized here and delegated to the Commerce Core
-- shipment transition RPC. This protects the lifecycle from localized provider
-- labels such as "Teslim Edildi" as well as canonical codes.

create or replace function public.normalize_basit_kargo_status(input_status text)
returns text
language plpgsql
immutable
as $$
declare
  v text := lower(trim(coalesce(input_status, '')));
begin
  v := replace(v, 'ı', 'i');
  v := replace(v, 'ş', 's');
  v := replace(v, 'ğ', 'g');
  v := replace(v, 'ü', 'u');
  v := replace(v, 'ö', 'o');
  v := replace(v, 'ç', 'c');

  if v in ('new', 'created', 'label_created', 'etiket olusturuldu', 'yeni') then
    return 'label_created';
  end if;

  if v in (
    'ready_to_ship', 'ready', 'ready_for_handover', 'prepared',
    'gonderime hazir', 'kargoya teslime hazir', 'teslime hazir'
  ) then
    return 'ready_for_handover';
  end if;

  if v in (
    'shipped', 'in_transit', 'out_for_delivery', 'yolda',
    'dagitimda', 'dagitima cikti', 'kargoya verildi', 'gonderildi'
  ) then
    return 'in_transit';
  end if;

  if v in ('delivered', 'teslim', 'teslim edildi', 'teslim_edildi', 'teslim-edildi') then
    return 'delivered';
  end if;

  if v in (
    'needs_support', 'delivery_failed', 'failed', 'exception',
    'destek gerekiyor', 'teslimat basarisiz', 'kargo hatasi',
    'istisna / mudahale gerekli'
  ) then
    return 'exception';
  end if;

  if v in ('cancelled', 'canceled', 'deleted', 'iptal', 'iptal edildi') then
    return 'cancelled';
  end if;

  if v in ('returned', 'returned_to_sender', 'geri dondu') then
    return 'returned';
  end if;

  return null;
end;
$$;

comment on function public.normalize_basit_kargo_status(text) is
  'Normalizes Basit Kargo canonical and localized shipment labels before delegating to Commerce Core.';

create or replace function public.reconcile_order_from_basit_kargo_event()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $$
declare
  v_status text;
  v_key text;
begin
  if lower(coalesce(new.provider, '')) not in ('basit_kargo', 'basit-kargo') then
    return new;
  end if;

  v_status := public.normalize_basit_kargo_status(coalesce(new.status, new.status_label));
  if v_status is null then
    return new;
  end if;

  -- The transition RPC itself emits canonical shipping_events rows. Those rows
  -- must not recurse back into the same transition.
  if lower(trim(coalesce(new.status, ''))) = v_status then
    return new;
  end if;

  v_key := format('basit-kargo-event-guard:%s:%s', new.id::text, v_status);

  perform public.transition_order_shipment_state(
    p_order_id := new.order_id,
    p_next_status := v_status,
    p_provider := 'basit_kargo',
    p_provider_event_key := v_key,
    p_tracking_no := new.tracking_no,
    p_external_order_id := new.external_order_id,
    p_expected_version := null,
    p_actor_type := 'integration',
    p_actor_id := 'basit_kargo',
    p_source := 'basit_kargo_event_guard',
    p_correlation_id := format('basit-kargo-event:%s', new.id::text),
    p_idempotency_key := v_key,
    p_metadata := jsonb_build_object(
      'rawStatus', new.status,
      'statusLabel', new.status_label,
      'provider', 'basit_kargo',
      'source', 'shipping_events_trigger'
    );

  return new;
end;
$$;

DROP TRIGGER IF EXISTS trg_shipping_events_basit_kargo_core_guard ON public.shipping_events;
CREATE TRIGGER trg_shipping_events_basit_kargo_core_guard
AFTER INSERT ON public.shipping_events
FOR EACH ROW
EXECUTE FUNCTION public.reconcile_order_from_basit_kargo_event();

-- Repair existing orders from the strongest known historical Basit Kargo event.
-- Priority prevents an old SHIPPED event from winning over a later DELIVERED or RETURNED event.
DO $$
declare
  row record;
  v_status text;
  v_key text;
begin
  for row in
    with ranked as (
      select
        e.order_id,
        e.status,
        e.status_label,
        e.id as event_id,
        row_number() over (
          partition by e.order_id
          order by
            case public.normalize_basit_kargo_status(coalesce(e.status, e.status_label))
              when 'returned' then 600
              when 'delivered' then 500
              when 'in_transit' then 400
              when 'ready_for_handover' then 300
              when 'label_created' then 200
              when 'exception' then 100
              when 'cancelled' then 50
              else 0
            end desc,
            e.event_time desc nulls last,
            e.id desc
        ) as rank_no
      from public.shipping_events e
      where lower(coalesce(e.provider, '')) in ('basit_kargo', 'basit-kargo')
    )
    select r.*
    from ranked r
    where r.rank_no = 1
      and public.normalize_basit_kargo_status(coalesce(r.status, r.status_label)) is not null
  loop
    v_status := public.normalize_basit_kargo_status(coalesce(row.status, row.status_label));
    v_key := format('basit-kargo-history-repair:%s:%s', row.order_id::text, v_status);

    begin
      perform public.transition_order_shipment_state(
        p_order_id := row.order_id,
        p_next_status := v_status,
        p_provider := 'basit_kargo',
        p_provider_event_key := v_key,
        p_expected_version := null,
        p_actor_type := 'system',
        p_actor_id := 'basit_kargo_history_repair',
        p_source := 'basit_kargo_history_repair',
        p_correlation_id := format('basit-kargo-history:%s', row.order_id::text),
        p_idempotency_key := v_key,
        p_metadata := jsonb_build_object(
          'source', 'migration_20260910032000',
          'eventId', row.event_id,
          'rawStatus', row.status,
          'statusLabel', row.status_label
        );
    exception when others then
      raise notice 'Basit Kargo history repair skipped for order %: %', row.order_id, sqlerrm;
    end;
  end loop;
end;
$$;


-- Consolidated from current Commerce: 20260910043000_basit_kargo_delivery_event_authority.sql
-- Basit Kargo may keep the top-level event status as SHIPPED while its nested
-- shipmentInfo.lastState already says "Teslim Edildi". The DB must treat the
-- nested delivery evidence as authoritative so application-side normalization
-- cannot leave the order stuck at shipped.

create or replace function public.reconcile_basit_kargo_delivery_evidence()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_provider text := lower(trim(coalesce(new.provider, '')));
  v_status text := upper(trim(coalesce(new.status, '')));
  v_status_label text := lower(trim(coalesce(new.status_label, '')));
  v_last_state text := lower(trim(coalesce(new.payload #>> '{shipmentInfo,lastState}', '')));
  v_last_status text := lower(trim(coalesce(new.payload #>> '{shipmentInfo,lastStatus}', '')));
  v_delivered_time text := trim(coalesce(new.payload #>> '{shipmentInfo,deliveredTime}', ''));
  v_delivered_at text := trim(coalesce(new.payload #>> '{shipmentInfo,deliveredAt}', ''));
  v_is_delivered boolean;
begin
  if v_provider not in ('basit_kargo', 'basit-kargo') or new.order_id is null then
    return new;
  end if;

  v_is_delivered :=
    v_status in ('DELIVERED', 'COMPLETED', 'FULFILLED')
    or v_status_label in ('teslim edildi', 'teslim', 'teslimat tamamlandı', 'teslimat tamamlandi')
    or v_last_state in ('teslim edildi', 'teslim', 'teslimat tamamlandı', 'teslimat tamamlandi')
    or v_last_status in ('teslim edildi', 'teslim', 'teslimat tamamlandı', 'teslimat tamamlandi')
    or v_delivered_time <> ''
    or v_delivered_at <> '';

  if not v_is_delivered then
    return new;
  end if;

  perform public.transition_order_shipment_state(
    p_order_id := new.order_id,
    p_next_status := 'delivered',
    p_provider := 'basit_kargo',
    p_provider_event_key := 'basit-kargo-delivery-evidence:' || new.id::text,
    p_tracking_no := new.tracking_no,
    p_tracking_url := null,
    p_external_order_id := new.external_order_id,
    p_expected_version := null,
    p_actor_type := 'integration',
    p_actor_id := 'basit_kargo',
    p_source := 'basit_kargo_delivery_evidence_guard',
    p_correlation_id := 'shipping-delivery-evidence:' || new.order_id::text,
    p_idempotency_key := 'basit-kargo-delivery-evidence:' || new.id::text,
    p_metadata := jsonb_build_object(
      'shipping_event_id', new.id,
      'raw_status', new.status,
      'status_label', new.status_label,
      'last_state', nullif(new.payload #>> '{shipmentInfo,lastState}', ''),
      'last_status', nullif(new.payload #>> '{shipmentInfo,lastStatus}', ''),
      'delivered_time', nullif(new.payload #>> '{shipmentInfo,deliveredTime}', ''),
      'delivered_at', nullif(new.payload #>> '{shipmentInfo,deliveredAt}', ''),
      'delivery_evidence_source', 'shipping_events'
    )
  );

  return new;
end;
$$;

revoke all on function public.reconcile_basit_kargo_delivery_evidence() from public, anon, authenticated;
grant execute on function public.reconcile_basit_kargo_delivery_evidence() to service_role;

drop trigger if exists shipping_events_basit_kargo_delivery_evidence on public.shipping_events;
create trigger shipping_events_basit_kargo_delivery_evidence
after insert or update of status, status_label, payload on public.shipping_events
for each row
execute function public.reconcile_basit_kargo_delivery_evidence();

-- Repair already-recorded delivery evidence so historical orders are not left at shipped.
do $$
declare
  r record;
begin
  for r in
    select distinct on (e.order_id)
      e.order_id,
      e.id,
      e.event_key,
      e.tracking_no,
      e.external_order_id,
      e.status,
      e.status_label,
      e.payload
    from public.shipping_events e
    where lower(trim(coalesce(e.provider, ''))) in ('basit_kargo', 'basit-kargo')
      and (
        upper(trim(coalesce(e.status, ''))) in ('DELIVERED', 'COMPLETED', 'FULFILLED')
        or lower(trim(coalesce(e.status_label, ''))) in ('teslim edildi', 'teslim', 'teslimat tamamlandı', 'teslimat tamamlandi')
        or lower(trim(coalesce(e.payload #>> '{shipmentInfo,lastState}', ''))) in ('teslim edildi', 'teslim', 'teslimat tamamlandı', 'teslimat tamamlandi')
        or lower(trim(coalesce(e.payload #>> '{shipmentInfo,lastStatus}', ''))) in ('teslim edildi', 'teslim', 'teslimat tamamlandı', 'teslimat tamamlandi')
        or nullif(trim(coalesce(e.payload #>> '{shipmentInfo,deliveredTime}', '')), '') is not null
        or nullif(trim(coalesce(e.payload #>> '{shipmentInfo,deliveredAt}', '')), '') is not null
      )
    order by e.order_id, e.event_time desc nulls last, e.id desc
  loop
    perform public.transition_order_shipment_state(
      p_order_id := r.order_id,
      p_next_status := 'delivered',
      p_provider := 'basit_kargo',
      p_provider_event_key := 'basit-kargo-delivery-evidence-backfill:' || r.id::text,
      p_tracking_no := r.tracking_no,
      p_tracking_url := null,
      p_external_order_id := r.external_order_id,
      p_expected_version := null,
      p_actor_type := 'integration',
      p_actor_id := 'basit_kargo',
      p_source := 'basit_kargo_delivery_evidence_backfill',
      p_correlation_id := 'shipping-delivery-backfill:' || r.order_id::text,
      p_idempotency_key := 'basit-kargo-delivery-evidence-backfill:' || r.id::text,
      p_metadata := jsonb_build_object(
        'shipping_event_id', r.id,
        'event_key', r.event_key,
        'raw_status', r.status,
        'status_label', r.status_label,
        'last_state', nullif(r.payload #>> '{shipmentInfo,lastState}', ''),
        'last_status', nullif(r.payload #>> '{shipmentInfo,lastStatus}', ''),
        'delivered_time', nullif(r.payload #>> '{shipmentInfo,deliveredTime}', ''),
        'delivered_at', nullif(r.payload #>> '{shipmentInfo,deliveredAt}', ''),
        'delivery_evidence_source', 'shipping_events_backfill'
      )
    );
  end loop;
end;
$$;

commit;
