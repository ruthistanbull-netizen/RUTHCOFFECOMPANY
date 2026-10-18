-- Finance settlement corrections. Run independently in each brand's SELF-HOSTED database.
-- The previously applied 20261018002431 migration is intentionally left untouched.
-- No history backfill is performed. Only already-tracked finance order entries may be re-evaluated
-- if an administrator switches the recognition rule.
begin;

create or replace function public.finance_sync_order(p_order uuid)
returns void language plpgsql security invoker set search_path=public as $$
declare
  o jsonb; collected boolean; recognized boolean;
  paid_time timestamptz; delivery_time timestamptz;
  paid_day date; sale_day date; old_sale_day date;
  currency_code text; channel_code text;
  refund_amount numeric; net_total numeric; vat numeric;
  account uuid; entry_id uuid; verified_refunds numeric;
  rf record; has_refund_time boolean;
begin
  select to_jsonb(orders) into o from public.orders where id=p_order;
  if o is null then return; end if;
  collected := o->>'payment_status' in ('paid','succeeded','partially_refunded','refunded');
  recognized := collected and o->>'status' not in ('cancelled','failed') and (
    (select recognition from public.finance_settings where id=true)='paid'
    or nullif(o->>'delivered_at','') is not null
    or o->>'status' in ('delivered','completed')
  );
  -- Provider timestamps are preferred over order creation and later edits.
  select coalesce(
    (select min(succeeded_at) from public.payment_intents where order_id=p_order and succeeded_at is not null),
    (select min(paid_at) from public.payments where order_id=p_order and paid_at is not null and status in ('paid','succeeded')),
    (select min(paid_at) from public.checkout_drafts where order_id=p_order and paid_at is not null),
    nullif(o->>'paid_at','')::timestamptz
  ) into paid_time;
  select occurred_on into old_sale_day
    from public.finance_entries where source='order' and source_id=p_order::text;
  -- For old/manual paid orders without a payment timestamp, use the previously
  -- recorded date if present, otherwise order update time. Mark the estimate.
  paid_day := (coalesce(paid_time,
    (select paid_on::timestamptz from public.finance_payments
      where source='order_collection' and source_id=p_order::text limit 1),
    nullif(o->>'updated_at','')::timestamptz,
    nullif(o->>'created_at','')::timestamptz,
    now()) at time zone 'Europe/Istanbul')::date;
  delivery_time := nullif(o->>'delivered_at','')::timestamptz;
  if delivery_time is null and o->>'status' in ('delivered','completed') then
    delivery_time := coalesce(old_sale_day::timestamptz,nullif(o->>'updated_at','')::timestamptz);
  end if;
  sale_day := case
    when (select recognition from public.finance_settings where id=true)='delivered'
      then (coalesce(delivery_time,paid_time,old_sale_day::timestamptz) at time zone 'Europe/Istanbul')::date
    else paid_day
  end;
  sale_day := coalesce(sale_day,paid_day);

  currency_code := upper(coalesce(nullif(o->>'currency',''),'TRY'));
  if currency_code in ('TL','TRL') then currency_code := 'TRY'; end if;
  channel_code := coalesce(
    case when o->>'traffic_source' in ('ios_app','mobile_app','app','native_app','application') then 'ios' end,
    nullif(o->'attribution_data'->>'platform',''),
    nullif(o->>'sales_channel',''),
    case when o->>'imported_source' in ('wholesale','b2b','bulk') then 'wholesale'
         when o->>'imported_source'='manual' then 'manual' else 'website' end
  );
  if channel_code in ('ios','ios_app','app') then channel_code:='ios';
  elsif channel_code in ('web','web_storefront','storefront') then channel_code:='website';
  elsif channel_code not in ('website','manual','wholesale','consulting') then channel_code:='other'; end if;

  refund_amount := least(greatest(coalesce((o->>'refunded_total')::numeric,0),0),
                         greatest(coalesce((o->>'total_amount')::numeric,0),0));
  if o->>'payment_status'='refunded' then
    refund_amount:=greatest(coalesce((o->>'total_amount')::numeric,0),0);
  end if;
  net_total := greatest(coalesce((o->>'total_amount')::numeric,0)-refund_amount,0);
  vat := case when coalesce((o->>'total_amount')::numeric,0)>0
    then least(net_total,greatest(0,round(coalesce((o->>'tax_total')::numeric,0)
      *net_total/(o->>'total_amount')::numeric,2)))
    else 0 end;
  select exists(
    select 1 from public.payment_refunds
    where order_id=p_order and status='succeeded' and completed_at is not null
  ) into has_refund_time;

  insert into public.finance_entries(
    title,direction,nature,category_id,net,tax,currency,occurred_on,channel,
    source,source_id,order_id,cancelled,estimated,metadata
  ) values(
    coalesce(o->>'order_no',p_order::text),'income','sale',
    (select id from public.finance_categories where name='Satış'),net_total-vat,vat,
    currency_code,sale_day,channel_code,'order',p_order::text,p_order,
    not recognized,paid_time is null or ((select recognition from public.finance_settings where id=true)='delivered' and delivery_time is null),
    jsonb_build_object('customer',o->>'customer_name',
      'gross_sales',coalesce((o->>'subtotal')::numeric,0),
      'discounts',coalesce((o->>'discount_total')::numeric,0),
      'refunds',refund_amount,
      'shipping_income',coalesce((o->>'shipping_fee')::numeric,0),
      'tax_known',o?'tax_total',
      'payment_date_known',paid_time is not null,
      'refund_date_known',refund_amount=0 or has_refund_time or nullif(o->>'refunded_at','') is not null)
  )
  on conflict(source,source_id) do update set
    net=excluded.net,tax=excluded.tax,cancelled=excluded.cancelled,
    occurred_on=excluded.occurred_on,estimated=excluded.estimated,
    metadata=excluded.metadata,channel=excluded.channel,
    version=public.finance_entries.version+1,updated_at=now()
  returning id into entry_id;

  select id into account from public.finance_accounts
    where name=case when channel_code='manual' then 'Manuel tahsilatlar (hesap belirtilmedi)'
        else 'PayTR bekleyen' end;
  if collected and coalesce((o->>'total_amount')::numeric,0)>0 and account is not null then
    insert into public.finance_payments(entry_id,account_id,direction,amount,paid_on,method,source,source_id)
    values(entry_id,account,'in',(o->>'total_amount')::numeric,paid_day,
           case when channel_code='manual' then 'manual' else 'paytr' end,
           'order_collection',p_order::text)
    on conflict(source,source_id) do update
      set amount=excluded.amount,
          paid_on=case when paid_time is not null then excluded.paid_on
                       else public.finance_payments.paid_on end,
          entry_id=excluded.entry_id;
  end if;

  -- Each settled partial refund is recorded on its OWN actual completion day.
  select coalesce(sum(amount_kurus::numeric/100),0) into verified_refunds
    from public.payment_refunds
    where order_id=p_order and status='succeeded' and completed_at is not null;
  if verified_refunds>0 then
    delete from public.finance_payments
      where source='order_refund' and source_id=p_order::text;
    for rf in
      select id,amount_kurus,completed_at from public.payment_refunds
      where order_id=p_order and status='succeeded' and completed_at is not null
    loop
      insert into public.finance_payments(entry_id,account_id,direction,amount,paid_on,method,source,source_id)
      values(entry_id,account,'out',rf.amount_kurus::numeric/100,
        (rf.completed_at at time zone 'Europe/Istanbul')::date,'paytr','order_refund',rf.id::text)
      on conflict(source,source_id) do update
        set amount=excluded.amount,paid_on=excluded.paid_on,entry_id=excluded.entry_id;
    end loop;
  elsif refund_amount>0 and nullif(o->>'refunded_at','') is not null then
    -- Legacy refund only when the source provides a factual timestamp.
    insert into public.finance_payments(entry_id,account_id,direction,amount,paid_on,method,source,source_id)
    values(entry_id,account,'out',refund_amount,
      (nullif(o->>'refunded_at','')::timestamptz at time zone 'Europe/Istanbul')::date,
      'paytr','order_refund',p_order::text)
    on conflict(source,source_id) do update
      set amount=excluded.amount,paid_on=excluded.paid_on;
  end if;
  -- Never invent a refund payment date using now().
end $$;

-- Change the recognition rule only for orders already in finance_entries.
-- This is NOT historical backfill and never scans all prior orders.
create or replace function public.finance_recognition_changed()
returns trigger language plpgsql security definer set search_path=public as $$
declare tracked record;
begin
  if old.recognition is distinct from new.recognition then
    for tracked in select distinct order_id from public.finance_entries
      where source='order' and order_id is not null
    loop
      perform public.finance_sync_order(tracked.order_id);
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists finance_recognition_changed on public.finance_settings;
create trigger finance_recognition_changed after update of recognition
on public.finance_settings for each row execute function public.finance_recognition_changed();

revoke all on function public.finance_sync_order(uuid) from public,anon,authenticated;
revoke all on function public.finance_recognition_changed() from public,anon,authenticated;
grant execute on function public.finance_sync_order(uuid) to service_role;
grant execute on function public.finance_recognition_changed() to service_role;
commit;
