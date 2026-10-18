-- Separate Ruth/ROSTA self-host migration. New orders only; no history import.
begin;
create or replace function public.finance_sync_order(p_order uuid)
returns void language plpgsql security invoker set search_path=public as $$
declare
  o jsonb; collected boolean; recognized boolean;
  paid_time timestamptz; delivery_time timestamptz;
  paid_day date; sale_day date; old_sale_day date;
  old_method text; old_recognized boolean;
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
  select occurred_on, metadata->>'recognition_method', not cancelled
    into old_sale_day, old_method, old_recognized
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
    -- Preserve an already-recognized delivery day, not the original order creation day.
    delivery_time := coalesce(
      case when old_method='delivered' and old_recognized then old_sale_day::timestamptz end,
      nullif(o->>'updated_at','')::timestamptz,
      old_sale_day::timestamptz
    );
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
    select 1 from public.payment_refunds pr left join public.payment_intents pi on pi.id=pr.payment_intent_id
    where coalesce(pr.order_id,pi.order_id)=p_order
      and pr.status='succeeded' and pr.completed_at is not null
  ) into has_refund_time;

  insert into public.finance_entries(
    title,direction,nature,category_id,net,tax,currency,occurred_on,channel,
    source,source_id,order_id,cancelled,estimated,metadata
  ) values(
    coalesce(o->>'order_no',p_order::text),'income','sale',
    (select id from public.finance_categories where name='Satış'),net_total-vat,vat,
    currency_code,sale_day,channel_code,'order',p_order::text,p_order,
    not recognized,paid_time is null or ((select recognition from public.finance_settings where id=true)='delivered' and nullif(o->>'delivered_at','') is null),
    jsonb_build_object('customer',o->>'customer_name',
      'gross_sales',coalesce((o->>'subtotal')::numeric,0),
      'discounts',coalesce((o->>'discount_total')::numeric,0),
      'refunds',refund_amount,
      'shipping_income',coalesce((o->>'shipping_fee')::numeric,0),
      'tax_known',o?'tax_total',
      'payment_date_known',paid_time is not null,
      'recognition_method',(select recognition from public.finance_settings where id=true),
      'delivery_date_known',nullif(o->>'delivered_at','') is not null,
      'refund_date_known',refund_amount=0 or
        (has_refund_time and refund_amount <= (select coalesce(sum(pr.amount_kurus::numeric/100),0)
            from public.payment_refunds pr left join public.payment_intents pi on pi.id=pr.payment_intent_id
            where coalesce(pr.order_id,pi.order_id)=p_order and pr.status='succeeded' and pr.completed_at is not null))
        or nullif(o->>'refunded_at','') is not null)
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
  select coalesce(sum(pr.amount_kurus::numeric/100),0) into verified_refunds
    from public.payment_refunds pr left join public.payment_intents pi on pi.id=pr.payment_intent_id
    where coalesce(pr.order_id,pi.order_id)=p_order and pr.status='succeeded' and pr.completed_at is not null;
  if verified_refunds>0 then
    delete from public.finance_payments
      where source='order_refund' and source_id=p_order::text;
    for rf in
      select pr.id,pr.amount_kurus,pr.completed_at from public.payment_refunds pr
      left join public.payment_intents pi on pi.id=pr.payment_intent_id
      where coalesce(pr.order_id,pi.order_id)=p_order
        and pr.status='succeeded' and pr.completed_at is not null
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
  else
    -- Old aggregate records with unknown dates must not remain as fake cash movements.
    delete from public.finance_payments
      where source='order_refund' and source_id=p_order::text;
  end if;

  -- Merchant fee is calculated ONCE from the original sale excluding any
  -- customer-paid installment surcharge and after confirmed refunds.
  if collected and
     (coalesce(lower(o->>'imported_source'),'') not in
       ('manual','wholesale','b2b','bulk','consulting')
       or exists(select 1 from public.payment_intents pi
          where pi.order_id=p_order and pi.succeeded_at is not null
            and pi.status in ('succeeded','partially_refunded','refunded')))
  then
    insert into public.finance_entries (
      title,direction,nature,category_id,net,tax,currency,occurred_on,
      source,source_id,order_id,cancelled,estimated,metadata
    ) values (
      'PayTR komisyonu (%4,10) · '||coalesce(o->>'order_no',p_order::text),
      'expense','operating',
      (select id from public.finance_categories where name='PayTR komisyonu'),
      round(net_total*0.041,2),0,currency_code,paid_day,
      'paytr_flat_fee',p_order::text,p_order,not recognized or net_total<=0,
      false,jsonb_build_object('rate_bps',410,'commission_base',net_total)
    )
    on conflict (source,source_id) do update
    set net=excluded.net,occurred_on=excluded.occurred_on,
      category_id=excluded.category_id,cancelled=excluded.cancelled,
      metadata=excluded.metadata,
      version=public.finance_entries.version+1,updated_at=now();

    -- Older PayTR statement imports must not double-charge this same order.
    delete from public.finance_payments
    where source='paytr_fee' and entry_id in (
      select id from public.finance_entries
      where source='paytr_fee' and order_id=p_order
    );
    update public.finance_entries set cancelled=true,updated_at=now()
    where source='paytr_fee' and order_id=p_order and not cancelled;

    select id into account from public.finance_accounts
    where name='PayTR bekleyen' and currency=currency_code limit 1;
    if account is not null and recognized and net_total>0
       and round(net_total*0.041,2)>0 then
      insert into public.finance_payments (
        entry_id,account_id,direction,amount,paid_on,method,source,source_id
      )
      select fe.id,account,'out',round(net_total*0.041,2),
        paid_day,'paytr','paytr_flat_fee',p_order::text
      from public.finance_entries fe
      where fe.source='paytr_flat_fee' and fe.source_id=p_order::text
      on conflict (source,source_id) do update
      set amount=excluded.amount,paid_on=excluded.paid_on,
        entry_id=excluded.entry_id,account_id=excluded.account_id;
    else
      delete from public.finance_payments
      where source='paytr_flat_fee' and source_id=p_order::text;
    end if;
  else
    update public.finance_entries set cancelled=true,updated_at=now()
    where source='paytr_flat_fee' and source_id=p_order::text
      and not cancelled;
    delete from public.finance_payments
    where source='paytr_flat_fee' and source_id=p_order::text;
  end if;
end $$;


-- The difference paid by the cardholder for installments passes to PayTR.
-- Informational expense-section disclosure; excludes operating-profit arithmetic.
create or replace function public.finance_paytr_installment_pass_through(
  p_from date,p_to date,p_currency text default 'TRY'
)
returns numeric language sql stable security invoker
set search_path=public as $$
select coalesce(sum(
 greatest(((pi.metadata->>'charged_amount_kurus')::numeric-
           (pi.metadata->>'order_amount_kurus')::numeric)/100,0)
),0)::numeric(18,2)
from public.payment_intents pi
where pi.succeeded_at is not null
  and pi.status in ('succeeded','partially_refunded','refunded')
  and (pi.succeeded_at at time zone 'Europe/Istanbul')::date
      between p_from and p_to
  and coalesce(pi.currency,'TRY')=p_currency
  and coalesce(pi.metadata->>'charged_amount_kurus','') ~ '^[0-9]+$'
  and coalesce(pi.metadata->>'order_amount_kurus','') ~ '^[0-9]+$'
$$;
revoke all on function public.finance_paytr_installment_pass_through(date,date,text)
 from public,anon,authenticated;
grant execute on function public.finance_paytr_installment_pass_through(date,date,text)
 to service_role;
commit;
