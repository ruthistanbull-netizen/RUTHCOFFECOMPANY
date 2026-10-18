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
-- Expose unresolved cash-refund timing instead of silently presenting an exact cash flow.
create or replace function public.finance_totals(p_from date,p_to date,p_currency text)
returns jsonb language sql stable security invoker set search_path=public as $$
with e as (select * from finance_entries where occurred_on between p_from and p_to and currency=p_currency and not cancelled),
cost as (select coalesce(sum(s.unit_cost*(s.quantity-s.returned_quantity)),0) c,
 count(*) filter(where s.unit_cost is null) missing from finance_item_snapshots s join e on e.order_id=s.order_id and e.nature='sale' where s.item_id is not null),
a as (select coalesce(sum(net) filter(where nature='sale'),0) sales,
 coalesce(sum(net) filter(where direction='income' and nature='operating'),0) other_income,
 coalesce(sum(net) filter(where direction='expense' and nature='operating'),0) expenses,
 coalesce(sum(net) filter(where direction='expense' and nature='tax'),0) taxes,
 coalesce(sum(case when direction='income' then net else -net end) filter(where nature='financing'),0) financing,
 coalesce(sum(tax) filter(where direction='income'),0) output_tax,
 coalesce(sum(tax) filter(where direction='expense'),0) input_tax,
 coalesce(sum((metadata->>'gross_sales')::numeric) filter(where nature='sale'),0) gross_sales,
 coalesce(sum((metadata->>'discounts')::numeric) filter(where nature='sale'),0) discounts,
 coalesce(sum((metadata->>'refunds')::numeric) filter(where nature='sale'),0) refunds,
 coalesce(sum((metadata->>'shipping_income')::numeric) filter(where nature='sale'),0) shipping_income from e),
p as (select coalesce(sum(amount) filter(where direction='in'),0) cash_in,coalesce(sum(amount) filter(where direction='out'),0) cash_out from finance_payments p join finance_accounts ac on ac.id=p.account_id where p.paid_on between p_from and p_to and ac.currency=p_currency),
u as (select coalesce(sum(greatest(e.gross-coalesce(p.paid,0),0)) filter(where e.direction='expense'),0) unpaid,
 coalesce(sum(greatest(e.gross-coalesce(p.paid,0),0)) filter(where e.direction='income'),0) receivables
 from e left join lateral(select sum(amount) paid from finance_payments where entry_id=e.id and paid_on<=p_to) p on true),
v as (select a.*,p.*,u.*,cost.c,cost.missing,
 (select count(*) from e where nature='sale' and not exists(select 1 from finance_item_snapshots s where s.order_id=e.order_id and s.item_id is not null)) missing_orders,
 (select count(*) from e where nature='sale' and coalesce((metadata->>'refunds')::numeric,0)>0 and not exists(select 1 from finance_item_snapshots s where s.order_id=e.order_id and s.item_id is not null and (s.returned_quantity>0 or s.basis='reviewed'))) refund_review
 from a,p,u,cost)
select jsonb_build_object('net_sales',sales::text,'cogs',case when missing+missing_orders+refund_review=0 then c::text end,
'gross_profit',case when missing+missing_orders+refund_review=0 then (sales-c)::text end,
'operating_expenses',expenses::text,'operating_profit',case when missing+missing_orders+refund_review=0 then (sales-c+other_income-expenses)::text end,
'period_result',case when missing+missing_orders+refund_review=0 then (sales-c+other_income-expenses+financing-taxes)::text end,
'margin',case when sales>0 and missing+missing_orders+refund_review=0 then round((sales-c+other_income-expenses)/sales*100,2)::text end,
'cash_in',cash_in::text,'cash_out',cash_out::text,'net_cash',(cash_in-cash_out)::text,'unpaid',unpaid::text,'receivables',receivables::text,
'missing_costs',missing+missing_orders,'refund_review',refund_review,'gross_sales',gross_sales::text,'discounts',discounts::text,'refunds',refunds::text,'shipping_income',shipping_income::text,'input_tax',input_tax::text,'output_tax',output_tax::text,'taxes',taxes::text,'financing',financing::text,
'cash_refund_unknown',(select count(*) from e where nature='sale' and metadata->>'refund_date_known'='false'),
 'result_label','Kayıtlı giderlere göre tahmini kâr') from v;
$$;

revoke all on function public.finance_totals(date,date,text) from public,anon,authenticated;
grant execute on function public.finance_totals(date,date,text) to service_role;
commit;
