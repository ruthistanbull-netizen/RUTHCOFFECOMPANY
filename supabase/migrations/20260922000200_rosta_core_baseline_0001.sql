-- Runtime functions, triggers and payment timeline for an empty baseline database.

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path=public,pg_catalog
as $$ begin new.updated_at=now(); return new; end; $$;

create or replace function public.touch_payment_updated_at()
returns trigger language plpgsql set search_path=public,pg_catalog
as $$ begin new.updated_at=now(); return new; end; $$;

create or replace function public.reserve_inventory(
  p_variant_id uuid,p_quantity integer,p_idempotency_key text,
  p_checkout_id text default null,p_order_id uuid default null,
  p_expires_at timestamptz default (now()+interval '15 minutes')
)
returns public.inventory_reservations
language plpgsql security definer set search_path=public,pg_catalog
as $$
declare v_item public.inventory_items; v_existing public.inventory_reservations; v_reservation public.inventory_reservations;
begin
  if p_quantity is null or p_quantity<=0 then raise exception using errcode='22023',message='Reservation quantity must be positive'; end if;
  if p_idempotency_key is null or btrim(p_idempotency_key)='' then raise exception using errcode='22023',message='Idempotency key is required'; end if;
  if p_expires_at<=now() then raise exception using errcode='22023',message='Reservation expiry must be in the future'; end if;
  select * into v_existing from public.inventory_reservations where idempotency_key=p_idempotency_key;
  if found then return v_existing; end if;
  insert into public.inventory_items(variant_id,sku,on_hand)
  select pv.id,pv.sku,greatest(coalesce(pv.stock,0),0) from public.product_variants pv where pv.id=p_variant_id
  on conflict(variant_id) do nothing;
  select * into v_item from public.inventory_items where variant_id=p_variant_id for update;
  if not found then raise exception using errcode='P0002',message='Inventory item not found'; end if;
  if (v_item.on_hand-v_item.reserved-v_item.allocated-v_item.safety_stock)<p_quantity then
    raise exception using errcode='P0001',message='Insufficient available inventory';
  end if;
  update public.inventory_items set reserved=reserved+p_quantity,updated_at=now() where id=v_item.id;
  insert into public.inventory_reservations(order_id,checkout_id,variant_id,inventory_item_id,quantity,status,idempotency_key,expires_at)
  values(p_order_id,p_checkout_id,p_variant_id,v_item.id,p_quantity,'active',p_idempotency_key,p_expires_at)
  returning * into v_reservation;
  insert into public.inventory_movements(movement_key,movement_type,order_id,variant_id,quantity,inventory_item_id,reservation_id,reason,occurred_at)
  values('reservation-created:'||v_reservation.id::text,'reservation_created',p_order_id,p_variant_id,p_quantity,v_item.id,v_reservation.id,'checkout_reservation',now())
  on conflict(movement_key) do nothing;
  return v_reservation;
end;
$$;

create or replace function public.release_inventory_reservation(p_reservation_id uuid,p_reason text default 'released')
returns public.inventory_reservations
language plpgsql security definer set search_path=public,pg_catalog
as $$
declare v_reservation public.inventory_reservations;
begin
  select * into v_reservation from public.inventory_reservations where id=p_reservation_id for update;
  if not found then raise exception using errcode='P0002',message='Reservation not found'; end if;
  if v_reservation.status='released' then return v_reservation; end if;
  if v_reservation.status<>'active' then raise exception using errcode='P0001',message='Reservation is not active'; end if;
  perform 1 from public.inventory_items where id=v_reservation.inventory_item_id for update;
  update public.inventory_items set reserved=reserved-v_reservation.quantity,updated_at=now()
  where id=v_reservation.inventory_item_id and reserved>=v_reservation.quantity;
  if not found then raise exception using errcode='P0001',message='Reserved inventory underflow'; end if;
  update public.inventory_reservations set status='released',released_at=now(),release_reason=p_reason,updated_at=now()
  where id=p_reservation_id returning * into v_reservation;
  insert into public.inventory_movements(movement_key,movement_type,order_id,variant_id,quantity,inventory_item_id,reservation_id,reason,occurred_at)
  values('reservation-released:'||v_reservation.id::text,'reservation_released',v_reservation.order_id,v_reservation.variant_id,v_reservation.quantity,v_reservation.inventory_item_id,v_reservation.id,p_reason,now())
  on conflict(movement_key) do nothing;
  return v_reservation;
end;
$$;

create or replace function public.allocate_inventory_reservation(p_reservation_id uuid,p_order_id uuid default null)
returns public.inventory_reservations
language plpgsql security definer set search_path=public,pg_catalog
as $$
declare v_reservation public.inventory_reservations;
begin
  select * into v_reservation from public.inventory_reservations where id=p_reservation_id for update;
  if not found then raise exception using errcode='P0002',message='Reservation not found'; end if;
  if v_reservation.status='allocated' then return v_reservation; end if;
  if v_reservation.status<>'active' then raise exception using errcode='P0001',message='Reservation is not active'; end if;
  if v_reservation.expires_at<=now() then raise exception using errcode='P0001',message='Reservation has expired'; end if;
  perform 1 from public.inventory_items where id=v_reservation.inventory_item_id for update;
  update public.inventory_items set reserved=reserved-v_reservation.quantity,allocated=allocated+v_reservation.quantity,updated_at=now()
  where id=v_reservation.inventory_item_id and reserved>=v_reservation.quantity;
  if not found then raise exception using errcode='P0001',message='Reserved inventory underflow'; end if;
  update public.inventory_reservations set status='allocated',order_id=coalesce(p_order_id,order_id),allocated_at=now(),updated_at=now()
  where id=p_reservation_id returning * into v_reservation;
  insert into public.inventory_movements(movement_key,movement_type,order_id,variant_id,quantity,inventory_item_id,reservation_id,reason,occurred_at)
  values('reservation-allocated:'||v_reservation.id::text,'allocation',v_reservation.order_id,v_reservation.variant_id,v_reservation.quantity,v_reservation.inventory_item_id,v_reservation.id,'payment_success',now())
  on conflict(movement_key) do nothing;
  return v_reservation;
end;
$$;

create or replace function public.reserve_checkout_inventory(
  p_checkout_id text,p_items jsonb,p_order_id uuid default null,
  p_expires_at timestamptz default (now()+interval '15 minutes')
)
returns setof public.inventory_reservations
language plpgsql security definer set search_path=public,pg_catalog
as $$
declare v_old record; v_item record; v_reservation public.inventory_reservations;
begin
  if p_checkout_id is null or btrim(p_checkout_id)='' then raise exception using errcode='22023',message='Checkout id is required'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception using errcode='22023',message='At least one inventory item is required'; end if;
  for v_old in select id from public.inventory_reservations where checkout_id=p_checkout_id and status='active' order by id for update loop
    perform public.release_inventory_reservation(v_old.id,'checkout_replaced');
  end loop;
  for v_item in
    select (entry->>'variant_id')::uuid variant_id,sum(greatest(1,(entry->>'quantity')::integer))::integer quantity
    from jsonb_array_elements(p_items) entry group by (entry->>'variant_id')::uuid order by (entry->>'variant_id')::uuid
  loop
    v_reservation:=public.reserve_inventory(v_item.variant_id,v_item.quantity,
      'checkout:'||p_checkout_id||':variant:'||v_item.variant_id::text||':'||extract(epoch from clock_timestamp())::bigint::text,
      p_checkout_id,p_order_id,p_expires_at);
    return next v_reservation;
  end loop;
  return;
end;
$$;

create or replace function public.expire_inventory_reservations(p_limit integer default 100)
returns integer
language plpgsql security definer set search_path=public,pg_catalog
as $$
declare v_row record; v_count integer:=0;
begin
  for v_row in
    select id from public.inventory_reservations where status='active' and expires_at<=now()
    order by expires_at for update skip locked limit greatest(1,least(coalesce(p_limit,100),1000))
  loop
    perform public.release_inventory_reservation(v_row.id,'expired');
    update public.inventory_reservations set status='expired',expired_at=now(),released_at=null,updated_at=now() where id=v_row.id;
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.sync_checkout_draft_inventory()
returns trigger
language plpgsql security definer set search_path=public,pg_catalog
as $$
declare v_items jsonb; v_row record;
begin
  if new.status='waiting' and (tg_op='INSERT' or new.items is distinct from old.items) then
    select coalesce(jsonb_agg(jsonb_build_object('variant_id',item->>'variantId','quantity',greatest(1,coalesce((item->>'quantity')::integer,1)))),'[]'::jsonb)
    into v_items from jsonb_array_elements(coalesce(new.items,'[]'::jsonb)) item where nullif(item->>'variantId','') is not null;
    if jsonb_array_length(v_items)>0 then perform public.reserve_checkout_inventory(new.id::text,v_items,new.order_id,now()+interval '15 minutes'); end if;
  end if;
  if new.status='paid' and (tg_op='INSERT' or old.status is distinct from new.status or old.order_id is distinct from new.order_id) then
    for v_row in select id from public.inventory_reservations where checkout_id=new.id::text and status='active' order by id loop
      perform public.allocate_inventory_reservation(v_row.id,new.order_id);
    end loop;
  elsif new.status in ('failed','cancelled') and (tg_op='INSERT' or old.status is distinct from new.status) then
    for v_row in select id from public.inventory_reservations where checkout_id=new.id::text and status='active' order by id loop
      perform public.release_inventory_reservation(v_row.id,'checkout_'||new.status);
    end loop;
  end if;
  return new;
end;
$$;

create or replace function public.validate_payment_refund_amount()
returns trigger language plpgsql set search_path=public,pg_catalog
as $$
declare captured integer; already_refunded integer;
begin
  select coalesce(sum(amount_kurus),0) into captured from public.payment_transactions
  where payment_intent_id=new.payment_intent_id and transaction_type in ('sale','capture') and status='succeeded';
  if captured<=0 then
    select amount_kurus into captured from public.payment_intents
    where id=new.payment_intent_id and status in ('succeeded','partially_refunded','refunded');
  end if;
  captured:=coalesce(captured,0);
  select coalesce(sum(amount_kurus),0) into already_refunded from public.payment_refunds
  where payment_intent_id=new.payment_intent_id and status in ('requested','processing','succeeded') and id<>coalesce(new.id,gen_random_uuid());
  if captured<=0 then raise exception 'Başarılı tahsilat bulunmadan iade oluşturulamaz.'; end if;
  if already_refunded+new.amount_kurus>captured then raise exception 'İade toplamı tahsil edilen tutarı aşamaz.'; end if;
  if new.amount_kurus=captured-already_refunded then new.refund_type:='full'; else new.refund_type:='partial'; end if;
  new.updated_at:=now();
  return new;
end;
$$;

create or replace view public.payment_timeline_entries with (security_invoker=true) as
select pi.merchant_oid,pi.id payment_intent_id,pi.created_at event_time,'intent_created'::text event_type,pi.status,pi.amount_kurus,pi.currency,
  jsonb_build_object('provider',pi.provider,'installment_count',pi.installment_count,'card_type',pi.card_type,'order_id',pi.order_id,'checkout_draft_id',pi.checkout_draft_id) details
from public.payment_intents pi
union all
select pi.merchant_oid,pa.payment_intent_id,pa.created_at,'attempt_'::text||pa.status,pa.status,pa.amount_kurus,pi.currency,
  jsonb_build_object('attempt_id',pa.id,'attempt_no',pa.attempt_no,'provider',pa.provider,'installment_count',pa.installment_count,'card_type',pa.card_type,'bin_prefix',pa.bin_prefix,'error_code',pa.error_code,'error_message',pa.error_message)
from public.payment_attempts pa join public.payment_intents pi on pi.id=pa.payment_intent_id
union all
select pce.merchant_oid,pi.id,pce.received_at,case when pce.verified then 'callback_verified' else 'callback_rejected' end,pce.status,coalesce(pce.payment_amount_kurus,pce.total_amount_kurus),coalesce(pi.currency,'TL'),
  jsonb_build_object('callback_id',pce.id,'verified',pce.verified,'verification_error',pce.verification_error,'installment_count',pce.installment_count,'processed_at',pce.processed_at)
from public.payment_callback_events pce left join public.payment_intents pi on pi.merchant_oid=pce.merchant_oid
union all
select pi.merchant_oid,pt.payment_intent_id,pt.created_at,'transaction_'::text||pt.transaction_type,pt.status,pt.amount_kurus,pt.currency,
  jsonb_build_object('transaction_id',pt.id,'attempt_id',pt.payment_attempt_id,'provider',pt.provider,'provider_reference',pt.provider_reference,'transaction_type',pt.transaction_type,'completed_at',pt.completed_at)
from public.payment_transactions pt join public.payment_intents pi on pi.id=pt.payment_intent_id;

drop trigger if exists checkout_drafts_inventory_sync on public.checkout_drafts;
create trigger checkout_drafts_inventory_sync after insert or update of items,status,order_id on public.checkout_drafts for each row execute function public.sync_checkout_draft_inventory();
drop trigger if exists touch_payment_attempts_updated_at on public.payment_attempts;
create trigger touch_payment_attempts_updated_at before update on public.payment_attempts for each row execute function public.touch_payment_updated_at();
drop trigger if exists touch_payment_intents_updated_at on public.payment_intents;
create trigger touch_payment_intents_updated_at before update on public.payment_intents for each row execute function public.touch_payment_updated_at();
drop trigger if exists payment_refunds_validate_amount on public.payment_refunds;
create trigger payment_refunds_validate_amount before insert or update of amount_kurus,status on public.payment_refunds for each row execute function public.validate_payment_refund_amount();

create trigger set_collections_updated_at before update on public.collections for each row execute function public.set_updated_at();
create trigger set_customer_addresses_updated_at before update on public.customer_addresses for each row execute function public.set_updated_at();
create trigger set_homepage_sections_updated_at before update on public.homepage_sections for each row execute function public.set_updated_at();
create trigger set_orders_updated_at before update on public.orders for each row execute function public.set_updated_at();
create trigger set_payments_updated_at before update on public.payments for each row execute function public.set_updated_at();
create trigger set_product_variants_updated_at before update on public.product_variants for each row execute function public.set_updated_at();
create trigger set_products_updated_at before update on public.products for each row execute function public.set_updated_at();
create trigger set_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger set_site_settings_updated_at before update on public.site_settings for each row execute function public.set_updated_at();

-- Operational SECURITY DEFINER functions are server-only.
do $$
declare fn record; signature text;
begin
  for fn in select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef
  loop
    signature:=format('%I.%I(%s)',fn.nspname,fn.proname,fn.args);
    execute format('revoke all privileges on function %s from PUBLIC, anon, authenticated',signature);
    execute format('grant execute on function %s to service_role',signature);
  end loop;
end $$;
