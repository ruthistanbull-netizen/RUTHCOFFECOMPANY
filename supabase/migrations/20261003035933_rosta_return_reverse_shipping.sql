-- Restore the reverse-shipping contract omitted from the ROSTA baseline.
-- Matches the return API and the existing Ruth Commerce database contract.
-- Return / exchange reverse-shipment read model and idempotency boundary.
-- Apply before deploying the admin return-shipping UI.

alter table public.returns_exchanges
  add column if not exists reverse_shipment_provider text,
  add column if not exists reverse_shipment_external_id text,
  add column if not exists reverse_shipment_barcode text,
  add column if not exists reverse_shipment_tracking_no text,
  add column if not exists reverse_shipment_status text,
  add column if not exists reverse_shipment_idempotency_key text,
  add column if not exists reverse_shipment_payload jsonb not null default '{}'::jsonb,
  add column if not exists reverse_shipment_created_at timestamptz,
  add column if not exists reverse_shipment_updated_at timestamptz;

create unique index if not exists returns_exchanges_reverse_shipment_idempotency_uidx
  on public.returns_exchanges (reverse_shipment_idempotency_key)
  where reverse_shipment_idempotency_key is not null;

create index if not exists returns_exchanges_active_order_idx
  on public.returns_exchanges (order_id, created_at desc)
  where status in ('open', 'approved');

alter table public.shipping_events
  add column if not exists return_case_id uuid references public.returns_exchanges(id) on delete set null,
  add column if not exists direction text not null default 'outbound';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'shipping_events_direction_check'
  ) then
    alter table public.shipping_events
      add constraint shipping_events_direction_check
      check (direction in ('outbound', 'return'));
  end if;
end $$;

create index if not exists shipping_events_return_case_time_idx
  on public.shipping_events (return_case_id, event_time desc)
  where return_case_id is not null;

comment on column public.returns_exchanges.reverse_shipment_idempotency_key is
  'Stable key preventing duplicate provider reverse-shipment creation.';
comment on column public.shipping_events.direction is
  'outbound for customer delivery, return for reverse logistics.';

notify pgrst, 'reload schema';
