-- ROSTA Phase 4 order + shipping runtime, adapted from the isolated Ruth Commerce source.
-- No Ruth storefront/database dependency is retained.

create or replace function public.rosta_touch_commerce_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

alter table public.commerce_dead_letters
  drop constraint if exists commerce_dead_letters_source_check;

alter table public.commerce_dead_letters
  add constraint commerce_dead_letters_source_check
  check (source in ('outbox','job','payment_callback','event_replay','shipping_webhook'));

-- Phase 4: Order + Shipping core.
-- Adds an append-only order timeline, optimistic state versioning, transactional
-- order/shipment transitions, and a retryable shipping webhook inbox.

alter table public.orders
  add column if not exists state_version bigint not null default 0,
  add column if not exists fulfillment_status text not null default 'unfulfilled',
  add column if not exists cancelled_at timestamptz,
  add column if not exists delivered_at timestamptz;

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders
  add constraint orders_status_check check (status in (
    -- legacy values kept during the incremental migration
    'pending','preparing','completed',
    -- canonical Commerce V2 values
    'draft','awaiting_payment','paid','queued','in_production','quality_control',
    'ready_to_ship','shipped','delivered','cancelled','return_requested','returned'
  ));

alter table public.orders drop constraint if exists orders_fulfillment_status_check;
alter table public.orders
  add constraint orders_fulfillment_status_check check (fulfillment_status in (
    'unfulfilled','queued','in_production','quality_control','ready','fulfilled','cancelled'
  ));

create table if not exists public.order_timeline_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  event_key text not null unique,
  event_type text not null,
  from_status text,
  to_status text,
  payment_status text,
  fulfillment_status text,
  shipment_status text,
  source text not null default 'system',
  reason text,
  actor_type text not null default 'system' check (actor_type in ('user','customer','system','integration')),
  actor_id text,
  correlation_id text,
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(order_id, idempotency_key)
);

create index if not exists order_timeline_order_time_idx
  on public.order_timeline_events(order_id, occurred_at desc, id desc);
create index if not exists order_timeline_correlation_idx
  on public.order_timeline_events(correlation_id)
  where correlation_id is not null;

create table if not exists public.shipping_webhook_inbox (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_key text not null,
  event_type text,
  external_order_id text,
  tracking_no text,
  signature_valid boolean,
  headers jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received' check (status in ('received','processing','processed','failed','dead_letter','ignored')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 8 check (max_attempts > 0),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, event_key)
);

create index if not exists shipping_webhook_inbox_claim_idx
  on public.shipping_webhook_inbox(status, next_attempt_at, received_at)
  where status in ('received','failed');
create index if not exists shipping_webhook_inbox_external_order_idx
  on public.shipping_webhook_inbox(provider, external_order_id)
  where external_order_id is not null;

alter table public.order_timeline_events enable row level security;
alter table public.shipping_webhook_inbox enable row level security;

comment on table public.order_timeline_events is
  'Append-only Phase 4 order, fulfillment and shipment timeline. Service-role only.';
comment on table public.shipping_webhook_inbox is
  'Retryable raw shipping webhook inbox. Service-role only; payloads are never trusted before adapter verification.';

create or replace function public.normalize_order_state(p_status text, p_payment_status text default null)
returns text
language sql
immutable
set search_path = public, pg_catalog
as $$
  select case lower(coalesce(nullif(trim(p_status),''),'pending'))
    when 'created' then case when lower(coalesce(p_payment_status,'')) in ('paid','partially_refunded','refunded') then 'paid' else 'awaiting_payment' end
    when 'open' then case when lower(coalesce(p_payment_status,'')) in ('paid','partially_refunded','refunded') then 'paid' else 'awaiting_payment' end
    when 'waiting' then 'awaiting_payment'
    when 'pending' then case when lower(coalesce(p_payment_status,'')) in ('paid','partially_refunded','refunded') then 'paid' else 'awaiting_payment' end
    when 'processing' then 'in_production'
    when 'preparing' then 'ready_to_ship'
    when 'ready' then 'ready_to_ship'
    when 'completed' then 'delivered'
    when 'fulfilled' then 'delivered'
    when 'canceled' then 'cancelled'
    else lower(coalesce(nullif(trim(p_status),''),'awaiting_payment'))
  end
$$;

create or replace function public.normalize_shipment_state(p_status text)
returns text
language sql
immutable
set search_path = public, pg_catalog
as $$
  select case lower(coalesce(nullif(trim(p_status),''),'not_created'))
    when 'created' then 'label_created'
    when 'ready' then 'ready_for_handover'
    when 'shipped' then 'in_transit'
    when 'kargoda' then 'in_transit'
    when 'teslim_edildi' then 'delivered'
    when 'delivery_failed' then 'exception'
    when 'failed' then 'exception'
    when 'canceled' then 'cancelled'
    else lower(coalesce(nullif(trim(p_status),''),'not_created'))
  end
$$;

create or replace function public.order_state_transition_allowed(p_from text, p_to text)
returns boolean
language sql
immutable
set search_path = public, pg_catalog
as $$
  select case p_from
    when 'draft' then p_to in ('awaiting_payment','cancelled')
    when 'awaiting_payment' then p_to in ('paid','cancelled')
    -- ready_to_ship is allowed as an explicit legacy/admin shortcut while the
    -- detailed production workflow is adopted incrementally.
    when 'paid' then p_to in ('queued','in_production','ready_to_ship','cancelled')
    when 'queued' then p_to in ('in_production','ready_to_ship','cancelled')
    when 'in_production' then p_to in ('quality_control','ready_to_ship','cancelled')
    when 'quality_control' then p_to in ('in_production','ready_to_ship','cancelled')
    when 'ready_to_ship' then p_to in ('shipped','cancelled')
    when 'shipped' then p_to in ('delivered','return_requested')
    when 'delivered' then p_to in ('return_requested')
    when 'return_requested' then p_to in ('returned','delivered')
    else false
  end
$$;

create or replace function public.shipment_state_transition_allowed(p_from text, p_to text)
returns boolean
language sql
immutable
set search_path = public, pg_catalog
as $$
  select case p_from
    when 'not_created' then p_to in ('label_created','ready_for_handover','in_transit','cancelled')
    when 'label_created' then p_to in ('ready_for_handover','in_transit','cancelled')
    when 'ready_for_handover' then p_to in ('in_transit','cancelled')
    when 'in_transit' then p_to in ('delivered','exception','returned')
    when 'exception' then p_to in ('in_transit','returned','cancelled')
    when 'delivered' then p_to in ('returned')
    else false
  end
$$;

create or replace function public.transition_order_state(
  p_order_id uuid,
  p_next_status text,
  p_expected_version bigint default null,
  p_reason text default null,
  p_actor_type text default 'system',
  p_actor_id text default null,
  p_source text default 'system',
  p_correlation_id text default null,
  p_idempotency_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.orders
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_order public.orders;
  v_from text;
  v_to text;
  v_now timestamptz := now();
  v_event_id uuid := gen_random_uuid();
  v_correlation text;
  v_idempotency text;
begin
  if p_order_id is null then raise exception using errcode='22023', message='Order id is required.'; end if;
  if p_actor_type not in ('user','customer','system','integration') then raise exception using errcode='22023', message='Invalid actor type.'; end if;

  v_to := public.normalize_order_state(p_next_status, null);
  if v_to not in ('draft','awaiting_payment','paid','queued','in_production','quality_control','ready_to_ship','shipped','delivered','cancelled','return_requested','returned') then
    raise exception using errcode='22023', message='Unknown order status.';
  end if;

  v_idempotency := nullif(trim(coalesce(p_idempotency_key,'')),'');
  if v_idempotency is null then raise exception using errcode='22023', message='Idempotency key is required.'; end if;
  v_correlation := coalesce(nullif(trim(coalesce(p_correlation_id,'')),''), 'order:' || p_order_id::text || ':' || v_idempotency);

  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception using errcode='P0002', message='Order not found.'; end if;

  if exists(select 1 from public.order_timeline_events where order_id=p_order_id and idempotency_key=v_idempotency) then
    return v_order;
  end if;

  if p_expected_version is not null and v_order.state_version <> p_expected_version then
    raise exception using errcode='40001', message='Order changed by another operation. Reload and retry.';
  end if;

  v_from := public.normalize_order_state(v_order.status, v_order.payment_status);
  if v_from = v_to then return v_order; end if;
  if not public.order_state_transition_allowed(v_from, v_to) then
    raise exception using errcode='P0001', message=format('Order status cannot transition from %s to %s.',v_from,v_to);
  end if;
  if v_to='paid' and lower(coalesce(v_order.payment_status,'')) not in ('paid','partially_refunded','refunded') then
    raise exception using errcode='P0001', message='Order cannot become paid before payment succeeds.';
  end if;
  if v_to='shipped' and public.normalize_shipment_state(v_order.shipping_status) <> 'in_transit' then
    raise exception using errcode='P0001', message='Order cannot become shipped before shipment is in transit.';
  end if;
  if v_to='delivered' and public.normalize_shipment_state(v_order.shipping_status) <> 'delivered' then
    raise exception using errcode='P0001', message='Order cannot become delivered before shipment is delivered.';
  end if;

  update public.orders set
    status=v_to,
    fulfillment_status=case
      when v_to='queued' then 'queued'
      when v_to='in_production' then 'in_production'
      when v_to='quality_control' then 'quality_control'
      when v_to='ready_to_ship' then 'ready'
      when v_to in ('shipped','delivered','return_requested','returned') then 'fulfilled'
      when v_to='cancelled' then 'cancelled'
      else fulfillment_status
    end,
    state_version=state_version+1,
    cancelled_at=case when v_to='cancelled' then v_now else cancelled_at end,
    delivered_at=case when v_to='delivered' then v_now else delivered_at end,
    updated_at=v_now
  where id=p_order_id
  returning * into v_order;

  insert into public.order_timeline_events(
    order_id,event_key,event_type,from_status,to_status,payment_status,fulfillment_status,shipment_status,
    source,reason,actor_type,actor_id,correlation_id,idempotency_key,metadata,occurred_at
  ) values (
    p_order_id,'order-state:'||v_event_id::text,'order.status_changed',v_from,v_to,v_order.payment_status,
    v_order.fulfillment_status,public.normalize_shipment_state(v_order.shipping_status),coalesce(nullif(trim(p_source),''),'system'),
    nullif(trim(coalesce(p_reason,'')),''),p_actor_type,p_actor_id,v_correlation,v_idempotency,coalesce(p_metadata,'{}'::jsonb),v_now
  );

  insert into public.commerce_events(
    event_id,event_type,aggregate_id,aggregate_type,event_version,channel,correlation_id,actor_id,idempotency_key,payload,occurred_at
  ) values (
    v_event_id::text,'order.status_changed',p_order_id::text,'order',1,
    case when p_actor_type='user' then 'admin' else 'commerce-core' end,
    v_correlation,p_actor_id,v_idempotency,
    jsonb_build_object('orderId',p_order_id,'from',v_from,'to',v_to,'stateVersion',v_order.state_version,'reason',p_reason),v_now
  );

  insert into public.commerce_audit_logs(
    action,entity_type,entity_id,actor_type,actor_id,correlation_id,reason,before_data,after_data,metadata,occurred_at
  ) values (
    'order.status_changed','order',p_order_id::text,p_actor_type,p_actor_id,v_correlation,nullif(trim(coalesce(p_reason,'')),''),
    jsonb_build_object('status',v_from,'state_version',v_order.state_version-1),
    jsonb_build_object('status',v_to,'state_version',v_order.state_version),coalesce(p_metadata,'{}'::jsonb),v_now
  );

  return v_order;
end;
$$;

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
security invoker
set search_path = public, pg_catalog
as $$
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
begin
  if p_order_id is null then raise exception using errcode='22023', message='Order id is required.'; end if;
  if p_actor_type not in ('user','customer','system','integration') then raise exception using errcode='22023', message='Invalid actor type.'; end if;
  v_to := public.normalize_shipment_state(p_next_status);
  if v_to not in ('not_created','label_created','ready_for_handover','in_transit','delivered','exception','cancelled','returned') then
    raise exception using errcode='22023', message='Unknown shipment status.';
  end if;
  v_idempotency := nullif(trim(coalesce(p_idempotency_key,p_provider_event_key,'')),'');
  if v_idempotency is null then raise exception using errcode='22023', message='Shipment idempotency key is required.'; end if;
  v_correlation := coalesce(nullif(trim(coalesce(p_correlation_id,'')),''), 'shipment:' || p_order_id::text || ':' || v_idempotency);

  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception using errcode='P0002', message='Order not found.'; end if;
  if exists(select 1 from public.order_timeline_events where order_id=p_order_id and idempotency_key=v_idempotency) then return v_order; end if;
  if p_expected_version is not null and v_order.state_version <> p_expected_version then
    raise exception using errcode='40001', message='Order changed by another operation. Reload and retry.';
  end if;

  v_from := public.normalize_shipment_state(v_order.shipping_status);
  if v_from = v_to then return v_order; end if;
  if not public.shipment_state_transition_allowed(v_from,v_to) then
    raise exception using errcode='P0001', message=format('Shipment status cannot transition from %s to %s.',v_from,v_to);
  end if;

  v_order_from := public.normalize_order_state(v_order.status,v_order.payment_status);
  v_order_to := v_order_from;
  if v_to='in_transit' and v_order_from not in ('cancelled','delivered','returned') then v_order_to:='shipped'; end if;
  if v_to='delivered' and v_order_from not in ('cancelled','returned') then v_order_to:='delivered'; end if;
  if v_to='returned' and v_order_from in ('shipped','delivered','return_requested') then v_order_to:='returned'; end if;

  update public.orders set
    shipping_provider=coalesce(nullif(trim(p_provider),''),shipping_provider,'manual'),
    shipping_status=v_to,
    cargo_tracking_no=coalesce(nullif(trim(coalesce(p_tracking_no,'')),''),cargo_tracking_no),
    cargo_tracking_url=coalesce(nullif(trim(coalesce(p_tracking_url,'')),''),cargo_tracking_url),
    basit_kargo_order_id=case when lower(coalesce(p_provider,'')) in ('basit_kargo','basit-kargo') then coalesce(nullif(trim(coalesce(p_external_order_id,'')),''),basit_kargo_order_id) else basit_kargo_order_id end,
    status=v_order_to,
    fulfillment_status=case when v_order_to in ('shipped','delivered','return_requested','returned') then 'fulfilled' else fulfillment_status end,
    state_version=state_version+1,
    delivered_at=case when v_to='delivered' then v_now else delivered_at end,
    shipping_updated_at=v_now,
    shipping_error=case when v_to='exception' then coalesce(p_metadata->>'error',shipping_error,'Shipping exception') else null end,
    updated_at=v_now
  where id=p_order_id returning * into v_order;

  insert into public.shipping_events(order_id,provider,event_key,event_type,external_order_id,barcode,tracking_no,status,status_label,event_time,payload)
  values(
    p_order_id,coalesce(nullif(trim(p_provider),''),'manual'),coalesce(nullif(trim(coalesce(p_provider_event_key,'')),''),'shipment:'||v_event_id::text),
    'shipment.status_changed',p_external_order_id,case when lower(coalesce(p_provider,'')) in ('basit_kargo','basit-kargo') then v_order.basit_kargo_barcode else null end,
    v_order.cargo_tracking_no,v_to,v_to,v_now,coalesce(p_metadata,'{}'::jsonb)
  ) on conflict(event_key) do nothing;

  insert into public.order_timeline_events(
    order_id,event_key,event_type,from_status,to_status,payment_status,fulfillment_status,shipment_status,
    source,actor_type,actor_id,correlation_id,idempotency_key,metadata,occurred_at
  ) values (
    p_order_id,'shipment-state:'||v_event_id::text,'shipment.status_changed',v_order_from,v_order_to,v_order.payment_status,
    v_order.fulfillment_status,v_to,coalesce(nullif(trim(p_source),''),'shipping_adapter'),p_actor_type,p_actor_id,v_correlation,v_idempotency,
    coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('shipmentFrom',v_from,'shipmentTo',v_to,'provider',p_provider),v_now
  );

  v_event_type := case when v_to='label_created' then 'shipment.created' when v_to='in_transit' then 'shipment.shipped' when v_to='delivered' then 'shipment.delivered' else 'shipment.status_changed' end;
  insert into public.commerce_events(
    event_id,event_type,aggregate_id,aggregate_type,event_version,channel,correlation_id,actor_id,idempotency_key,payload,occurred_at
  ) values (
    v_event_id::text,v_event_type,p_order_id::text,'shipment',1,
    case when p_actor_type='user' then 'admin' else 'commerce-core' end,v_correlation,p_actor_id,v_idempotency,
    jsonb_build_object('orderId',p_order_id,'from',v_from,'to',v_to,'orderFrom',v_order_from,'orderTo',v_order_to,'provider',p_provider,'trackingNumber',v_order.cargo_tracking_no),v_now
  );

  insert into public.commerce_audit_logs(
    action,entity_type,entity_id,actor_type,actor_id,correlation_id,before_data,after_data,metadata,occurred_at
  ) values (
    'shipment.status_changed','order',p_order_id::text,p_actor_type,p_actor_id,v_correlation,
    jsonb_build_object('shipment_status',v_from,'order_status',v_order_from,'state_version',v_order.state_version-1),
    jsonb_build_object('shipment_status',v_to,'order_status',v_order_to,'state_version',v_order.state_version),
    coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('provider',p_provider,'provider_event_key',p_provider_event_key),v_now
  );

  return v_order;
end;
$$;

create or replace function public.claim_shipping_webhooks(p_worker text, p_limit integer default 25)
returns setof public.shipping_webhook_inbox
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
begin
  return query
  with candidates as (
    select id from public.shipping_webhook_inbox
    where status in ('received','failed') and next_attempt_at<=now()
    order by next_attempt_at,received_at
    for update skip locked limit greatest(1,least(coalesce(p_limit,25),100))
  )
  update public.shipping_webhook_inbox i
  set status='processing',attempts=i.attempts+1,locked_at=now(),locked_by=p_worker,updated_at=now()
  from candidates c where i.id=c.id returning i.*;
end;
$$;

create or replace function public.complete_shipping_webhook(
  p_id uuid,
  p_worker text,
  p_success boolean,
  p_error text default null,
  p_retry_delay_seconds integer default 60,
  p_ignored boolean default false
)
returns public.shipping_webhook_inbox
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare v_row public.shipping_webhook_inbox;
begin
  update public.shipping_webhook_inbox set
    status=case when p_ignored then 'ignored' when p_success then 'processed' when attempts>=max_attempts then 'dead_letter' else 'failed' end,
    processed_at=case when p_success or p_ignored then now() else processed_at end,
    next_attempt_at=case when p_success or p_ignored then next_attempt_at else now()+make_interval(secs=>greatest(1,p_retry_delay_seconds)) end,
    last_error=case when p_success or p_ignored then null else left(coalesce(p_error,'Unknown shipping webhook error'),4000) end,
    locked_at=null,locked_by=null,updated_at=now()
  where id=p_id and (locked_by=p_worker or locked_by is null)
  returning * into v_row;
  if v_row.id is null then raise exception 'Shipping webhook % could not be completed by %',p_id,p_worker; end if;
  if v_row.status='dead_letter' then
    insert into public.commerce_dead_letters(source,source_id,event_type,aggregate_id,payload,error,correlation_id)
    values('shipping_webhook',v_row.id::text,coalesce(v_row.event_type,'shipping.webhook'),v_row.external_order_id,v_row.payload,
      coalesce(v_row.last_error,'Shipping webhook max attempts reached'),'shipping-webhook:'||v_row.id::text)
    on conflict(source,source_id) do update set error=excluded.error,payload=excluded.payload,updated_at=now();
  end if;
  return v_row;
end;
$$;

drop trigger if exists touch_shipping_webhook_inbox on public.shipping_webhook_inbox;
create trigger touch_shipping_webhook_inbox
before update on public.shipping_webhook_inbox
for each row execute function public.rosta_touch_commerce_updated_at();

insert into public.order_timeline_events(
  order_id,event_key,event_type,from_status,to_status,payment_status,fulfillment_status,shipment_status,
  source,actor_type,correlation_id,idempotency_key,metadata,occurred_at
)
select
  o.id,'order-bootstrap:'||o.id::text,'order.bootstrap',null,public.normalize_order_state(o.status,o.payment_status),o.payment_status,
  o.fulfillment_status,public.normalize_shipment_state(o.shipping_status),'phase4_migration','system','order-bootstrap:'||o.id::text,
  'order-bootstrap:'||o.id::text,jsonb_build_object('legacyStatus',o.status,'stateVersion',o.state_version),coalesce(o.created_at,now())
from public.orders o
on conflict(order_id,idempotency_key) do nothing;


revoke all privileges on table public.order_timeline_events from anon,authenticated;
revoke all privileges on table public.shipping_webhook_inbox from anon,authenticated;
revoke all privileges on table public.order_timeline_events from public,anon,authenticated;
revoke all privileges on table public.shipping_webhook_inbox from public,anon,authenticated;
grant select,insert,update,delete on table public.order_timeline_events to service_role;
grant select,insert,update,delete on table public.shipping_webhook_inbox to service_role;
revoke execute on function public.rosta_touch_commerce_updated_at() from public,anon,authenticated;
grant execute on function public.rosta_touch_commerce_updated_at() to service_role;
revoke all privileges on function public.transition_order_state(uuid,text,bigint,text,text,text,text,text,text,jsonb) from PUBLIC,anon,authenticated;
revoke all privileges on function public.transition_order_shipment_state(uuid,text,text,text,text,text,text,bigint,text,text,text,text,text,jsonb) from PUBLIC,anon,authenticated;
revoke all privileges on function public.claim_shipping_webhooks(text,integer) from PUBLIC,anon,authenticated;
revoke all privileges on function public.complete_shipping_webhook(uuid,text,boolean,text,integer,boolean) from PUBLIC,anon,authenticated;
grant execute on function public.transition_order_state(uuid,text,bigint,text,text,text,text,text,text,jsonb) to service_role;
grant execute on function public.transition_order_shipment_state(uuid,text,text,text,text,text,text,bigint,text,text,text,text,text,jsonb) to service_role;
grant execute on function public.claim_shipping_webhooks(text,integer) to service_role;
grant execute on function public.complete_shipping_webhook(uuid,text,boolean,text,integer,boolean) to service_role;
