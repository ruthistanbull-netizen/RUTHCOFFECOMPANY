-- Finance purchase-cost payables: Ruth & ROSTA self-host independently.
-- Apply AFTER 20261018120000_finance_payables_notifications.sql.
-- No historical backfill; only future sale recognition/item snapshot events.
begin;

create or replace function public.finance_sync_product_payable(p_order uuid)
returns void language plpgsql security definer set search_path=public as $fn$
declare
  sale public.finance_entries;
  total_cost numeric(18,2);
  missing_count bigint;
  item_count bigint;
  paid_sum numeric(18,2);
  current_entry uuid;
begin
  select * into sale from public.finance_entries
  where source='order' and order_id=p_order and nature='sale'
  order by created_at desc limit 1;
  if sale.id is null then return; end if;

  select count(*),count(*) filter(where s.id is null or s.unit_cost is null),
         round(coalesce(sum(
           s.unit_cost * greatest(s.quantity-s.returned_quantity,0)
         ),0),2)
  into item_count,missing_count,total_cost
  from public.order_items i
  left join public.finance_item_snapshots s on s.item_id=i.id
  where i.order_id=p_order;

  select id into current_entry from public.finance_entries
  where source='purchase_payable' and source_id=p_order::text
  for update;
  select coalesce(sum(amount),0) into paid_sum from public.finance_payments
  where entry_id=current_entry and direction='out';

  -- Never pretend unknown purchase prices are zero or a complete payable.
  -- An incomplete order is not silently converted to a paid zero-value bill.
  if sale.cancelled or item_count=0 or missing_count>0 then
    if current_entry is not null and paid_sum=0 then
      update public.finance_entries
        set cancelled=true,updated_at=now()
      where id=current_entry and not cancelled;
    end if;
    return;
  end if;

  if total_cost<=0 and paid_sum=0 then
    if current_entry is not null then
      update public.finance_entries
        set cancelled=true,updated_at=now() where id=current_entry;
    end if;
    return;
  end if;

  -- This is a purchase payable (inventory), NOT an operating expense.
  -- Profit already includes snapshots as COGS, so no double expense.
  insert into public.finance_entries (
    title,direction,nature,category_id,net,tax,currency,occurred_on,due_on,
    channel,source,source_id,order_id,cancelled,metadata
  ) values (
    'Ürün alış bedeli · '||sale.title,
    'expense','inventory',
    (select id from public.finance_categories
     where name='Ürün alış maliyeti' limit 1),
    greatest(total_cost,paid_sum),0,sale.currency,sale.occurred_on,
    sale.occurred_on,'other','purchase_payable',p_order::text,p_order,
    false,jsonb_build_object('source','finance_item_snapshots',
      'calculated_cost',total_cost,'items',item_count,
      'already_paid',paid_sum)
  )
  on conflict (source,source_id) do update
   set net=excluded.net,tax=excluded.tax,category_id=excluded.category_id,
       occurred_on=excluded.occurred_on,due_on=excluded.due_on,
       cancelled=false,metadata=excluded.metadata,
       version=public.finance_entries.version+1,
       updated_at=now();
end;
$fn$;

create or replace function public.finance_purchase_payable_on_order()
returns trigger language plpgsql security definer set search_path=public as $fn$
begin
  if new.source='order' and new.nature='sale' and new.order_id is not null then
    perform public.finance_sync_product_payable(new.order_id);
  end if;
  return new;
end;
$fn$;
drop trigger if exists finance_purchase_payable_on_order on public.finance_entries;
create trigger finance_purchase_payable_on_order
  after insert or update of net,cancelled on public.finance_entries
  for each row execute function public.finance_purchase_payable_on_order();

create or replace function public.finance_purchase_payable_on_snapshot()
returns trigger language plpgsql security definer set search_path=public as $fn$
begin
  perform public.finance_sync_product_payable(new.order_id);
  return new;
end;
$fn$;
drop trigger if exists finance_purchase_payable_on_snapshot on public.finance_item_snapshots;
create trigger finance_purchase_payable_on_snapshot
  after insert or update of unit_cost,quantity,returned_quantity
  on public.finance_item_snapshots
  for each row execute function public.finance_purchase_payable_on_snapshot();

-- Extend the already-installed partial payment RPC to product purchase debts.
create or replace function public.finance_pay_expense(
  p_entry uuid, p_account uuid, p_amount numeric, p_paid_on date,
  p_key text, p_actor uuid
) returns jsonb language plpgsql security invoker
set search_path=public as $fn$
declare
  v_entry public.finance_entries;
  v_account public.finance_accounts;
  v_paid numeric;
  v_payment uuid;
begin
  select * into v_entry from public.finance_entries where id=p_entry for update;
  if v_entry.id is null or v_entry.cancelled
     or v_entry.direction<>'expense'
     or v_entry.source not in ('manual','recurring','purchase_payable') then
    raise exception 'Ödenebilir gider bulunamadı';
  end if;
  if p_actor is null or p_key is null or length(trim(p_key))<8
     or p_paid_on is null then
    raise exception 'Ödeme yetkilisi, tarihi ve işlem anahtarı gerekli';
  end if;
  if p_amount is null or p_amount<=0
     or round(p_amount,2)<>p_amount then
    raise exception 'Pozitif ve kuruş hassasiyetinde bir tutar gir';
  end if;
  select * into v_account from public.finance_accounts where id=p_account;
  if v_account.id is null or v_account.currency<>v_entry.currency
     or v_account.kind not in ('bank','cash') then
    raise exception 'Uygun banka veya kasa hesabı seç';
  end if;
  select id into v_payment from public.finance_payments
    where source='expense_payment' and source_id=p_key;
  if v_payment is not null then
    return jsonb_build_object('paid',true,'payment_id',v_payment,'duplicate',true);
  end if;
  select coalesce(sum(amount),0) into v_paid from public.finance_payments
    where entry_id=p_entry and direction='out';
  if p_amount>greatest(v_entry.gross-v_paid,0) then
    raise exception 'Ödeme tutarı kalan borcu aşıyor';
  end if;
  insert into public.finance_payments (
    entry_id,account_id,direction,amount,paid_on,method,source,source_id,created_by
  ) values (
    p_entry,p_account,'out',p_amount,p_paid_on,
    'bank','expense_payment',p_key,p_actor
  ) returning id into v_payment;
  return jsonb_build_object('paid',true,'payment_id',v_payment,
    'remaining',greatest(v_entry.gross-v_paid-p_amount,0));
end;
$fn$;

-- Reminder for every newly due purchase cost, recurring or manual expense.
create or replace function public.finance_enqueue_due_reminders(
  p_today date default (now() at time zone 'Europe/Istanbul')::date
) returns integer language plpgsql security invoker
set search_path=public as $fn$
declare n integer:=0;
begin
  with eligible as (
    select e.id,e.title,e.gross,e.currency,
           coalesce(e.due_on,e.occurred_on) as due_day
    from public.finance_entries e
    where e.direction='expense' and not e.cancelled
      and e.source in ('recurring','manual','purchase_payable')
      and coalesce(e.due_on,e.occurred_on)=p_today
      and coalesce((select sum(p.amount) from public.finance_payments p
         where p.entry_id=e.id and p.direction='out'),0)<e.gross
  ), new_jobs as (
    insert into public.admin_push_jobs(kind,dedupe_key,payload,target_url)
    select 'reminder','finance-due-'||e.id::text,
      jsonb_build_object('finance_entry_id',e.id::text,'title',e.title,
        'amount',e.gross,'currency',e.currency,'due_on',e.due_day::text),
      '/finance/payables' from eligible e
    on conflict(dedupe_key) do nothing returning id
  )
  select count(*) into n from new_jobs;
  return n;
end;
$fn$;

revoke all on function public.finance_sync_product_payable(uuid)
  from public,anon,authenticated;
grant execute on function public.finance_sync_product_payable(uuid) to service_role;
revoke all on function public.finance_pay_expense(uuid,uuid,numeric,date,text,uuid)
  from public,anon,authenticated;
grant execute on function public.finance_pay_expense(uuid,uuid,numeric,date,text,uuid)
  to service_role;
revoke all on function public.finance_enqueue_due_reminders(date)
  from public,anon,authenticated;
grant execute on function public.finance_enqueue_due_reminders(date)
  to service_role;

-- Correct an existing recorded installment without creating another expense.
create or replace function public.finance_update_expense_payment(
  p_payment uuid,p_account uuid,p_amount numeric,p_paid_on date,p_actor uuid
) returns jsonb language plpgsql security invoker
set search_path=public as $fn$
declare
  old_pay public.finance_payments;
  entry public.finance_entries;
  acct public.finance_accounts;
  others numeric;
begin
  select * into old_pay from public.finance_payments where id=p_payment;
  if old_pay.id is null or old_pay.source not in ('expense_payment','manual') then
    raise exception 'Düzenlenebilir ödeme bulunamadı';
  end if;
  select * into entry from public.finance_entries
   where id=old_pay.entry_id for update;
  select * into old_pay from public.finance_payments
   where id=p_payment for update;
  if entry.id is null or entry.cancelled
     or entry.source not in ('manual','recurring','purchase_payable')
     or p_actor is null or p_paid_on is null then
    raise exception 'Bu ödeme değiştirilemez';
  end if;
  select * into acct from public.finance_accounts where id=p_account;
  if acct.id is null or acct.currency<>entry.currency
     or acct.kind not in ('bank','cash') then
    raise exception 'Geçerli bir kasa veya banka seç';
  end if;
  if p_amount is null or p_amount<=0 or round(p_amount,2)<>p_amount then
    raise exception 'Pozitif kuruş hassasiyetinde tutar gerekli';
  end if;
  select coalesce(sum(amount),0) into others
   from public.finance_payments
   where entry_id=entry.id and direction='out' and id<>p_payment;
  if others+p_amount>entry.gross then
    raise exception 'Düzenlenen ödeme kalan borcu aşıyor';
  end if;
  update public.finance_payments
   set amount=p_amount,paid_on=p_paid_on,account_id=p_account
   where id=p_payment;
  return jsonb_build_object('updated',true,
    'remaining',greatest(entry.gross-others-p_amount,0));
end;
$fn$;
revoke all on function public.finance_update_expense_payment(uuid,uuid,numeric,date,uuid)
 from public,anon,authenticated;
grant execute on function public.finance_update_expense_payment(uuid,uuid,numeric,date,uuid)
 to service_role;

commit;
