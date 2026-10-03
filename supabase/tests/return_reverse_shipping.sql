-- Run after the migration against an isolated database; all fixture writes roll back.
begin;
do $$
declare
  case_id uuid := gen_random_uuid();
  second_id uuid := gen_random_uuid();
  event_id uuid := gen_random_uuid();
  order_id uuid := gen_random_uuid();
  protected boolean;
begin
  select relrowsecurity into protected from pg_class where oid = 'public.returns_exchanges'::regclass;
  if not protected then raise exception 'Return RLS must remain enabled'; end if;

  insert into public.orders(id, order_no, customer_name, customer_email, customer_phone)
    values(order_id, 'schema-' || order_id::text, 'Schema verification', 'schema@example.invalid', '+905000000000');
  insert into public.returns_exchanges(id, order_id, reason, reverse_shipment_idempotency_key)
    values(case_id, order_id, 'Schema verification', 'return-schema-verification');
  if (select reverse_shipment_payload from public.returns_exchanges where id = case_id) <> '{}'::jsonb then
    raise exception 'Reverse payload must default to an empty object';
  end if;
  begin
    insert into public.returns_exchanges(id, reverse_shipment_idempotency_key)
      values(second_id, 'return-schema-verification');
    raise exception 'Duplicate reverse-shipment claim was accepted';
  exception when unique_violation then null;
  end;

  update public.returns_exchanges set
    reverse_shipment_provider = 'basit_kargo', reverse_shipment_external_id = 'fixture',
    reverse_shipment_barcode = '123', reverse_shipment_tracking_no = '456',
    reverse_shipment_status = 'RETURNING', reverse_shipment_payload = '{"fixture":true}'::jsonb,
    reverse_shipment_created_at = now(), reverse_shipment_updated_at = now()
    where id = case_id;
  perform id, reverse_shipment_provider, reverse_shipment_external_id,
    reverse_shipment_barcode, reverse_shipment_tracking_no, reverse_shipment_status,
    reverse_shipment_created_at, reverse_shipment_updated_at
    from public.returns_exchanges where id = case_id;

  insert into public.shipping_events(id, order_id, provider, event_key, event_type, direction, return_case_id)
    values(event_id, order_id, 'basit_kargo', 'return-schema-verification', 'return_created', 'return', case_id);
  begin
    update public.shipping_events set direction = 'invalid' where id = event_id;
    raise exception 'Invalid shipment direction was accepted';
  exception when check_violation then null;
  end;
  delete from public.returns_exchanges where id = case_id;
  if (select return_case_id from public.shipping_events where id = event_id) is not null then
    raise exception 'Shipment event did not preserve ON DELETE SET NULL';
  end if;
end;
$$;
rollback;
