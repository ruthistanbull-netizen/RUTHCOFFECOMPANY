-- FINANCE PAYABLES - apply independently to Ruth and ROSTA self-host DBs.
-- No historical backfill. No automatic payment; finance owner must confirm.
begin;

create or replace function public.finance_pay_expense(
  p_entry uuid, p_account uuid, p_amount numeric, p_paid_on date,
  p_key text, p_actor uuid
) returns jsonb language plpgsql security invoker
set search_path=public as $$
declare
  v_entry public.finance_entries;
  v_account public.finance_accounts;
  v_paid numeric;
  v_payment uuid;
begin
  select * into v_entry from public.finance_entries
    where id=p_entry for update;
  if v_entry.id is null or v_entry.cancelled
     or v_entry.direction<>'expense'
     or v_entry.source not in ('manual','recurring') then
    raise exception 'Ödenebilir gider bulunamadı';
  end if;
  if p_actor is null or p_key is null or length(trim(p_key))<8
     or p_paid_on is null then
    raise exception 'Ödeme yetkilisi, tarihi ve işlem anahtarı gerekli';
  end if;
  if p_amount is null or p_amount<=0 then
    raise exception 'Ödeme tutarı pozitif olmalı';
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
  select coalesce(sum(amount),0) into v_paid
    from public.finance_payments
    where entry_id=p_entry and direction='out';
  if p_amount>greatest(v_entry.gross-v_paid,0) then
    raise exception 'Ödeme tutarı kalan borcu aşıyor';
  end if;
  insert into public.finance_payments (
    entry_id,account_id,direction,amount,paid_on,method,source,source_id,created_by
  ) values (
    p_entry,p_account,'out',round(p_amount,2),p_paid_on,
    'bank','expense_payment',p_key,p_actor
  )
  returning id into v_payment;
  return jsonb_build_object('paid',true,'payment_id',v_payment,
    'remaining',greatest(v_entry.gross-v_paid-round(p_amount,2),0));
end;
$$;

-- Once-only on the due day; do not notify after the expense is already paid.
-- Existing panel PWA push worker delivers reminder jobs.
create or replace function public.finance_enqueue_due_reminders(
  p_today date default (now() at time zone 'Europe/Istanbul')::date
) returns integer language plpgsql security invoker
set search_path=public as $$
declare n integer:=0;
begin
  with eligible as (
    select e.id,e.title,e.gross,e.currency,
      coalesce(e.due_on,e.occurred_on) as due_day
    from public.finance_entries e
    where e.direction='expense' and not e.cancelled
      and e.source in ('recurring','manual')
      and coalesce(e.due_on,e.occurred_on)=p_today
      and not exists (
        select 1 from public.finance_payments p
        where p.entry_id=e.id and p.direction='out'
        group by p.entry_id having sum(p.amount)>=e.gross
      )
  ), new_jobs as (
    insert into public.admin_push_jobs (
      kind,dedupe_key,payload,target_url
    )
    select 'reminder','finance-due-'||e.id::text,
      jsonb_build_object(
        'finance_entry_id',e.id::text,
        'title',e.title,'amount',e.gross,
        'currency',e.currency,'due_on',e.due_day::text
      ),'/finance/payables'
    from eligible e
    on conflict(dedupe_key) do nothing
    returning id
  )
  select count(*) into n from new_jobs;
  return n;
end;
$$;

revoke all on function public.finance_pay_expense(uuid,uuid,numeric,date,text,uuid)
  from public,anon,authenticated;
grant execute on function public.finance_pay_expense(uuid,uuid,numeric,date,text,uuid)
  to service_role;
revoke all on function public.finance_enqueue_due_reminders(date)
  from public,anon,authenticated;
grant execute on function public.finance_enqueue_due_reminders(date)
  to service_role;
commit;
