-- PayTR iFrame V2 callback finalization.
-- PayTR payment_amount is the server-authoritative order amount.
-- total_amount may be higher when the customer selects an installment option inside the PayTR iframe.
-- This migration is committed for staging review and is not applied automatically.

create or replace function public.finalize_verified_paytr_callback(
  p_callback_event_id uuid,
  p_payment_intent_id uuid default null,
  p_payment_attempt_id uuid default null,
  p_order_id uuid default null,
  p_expected_amount_kurus integer default null,
  p_currency text default 'TL',
  p_provider_reference text default null,
  p_provider_payload jsonb default '{}'::jsonb,
  p_completed_at timestamptz default now()
)
returns public.payment_callback_events
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare
  v_callback public.payment_callback_events;
  v_intent public.payment_intents;
  v_attempt public.payment_attempts;
  v_payment_status text;
  v_transaction_status text;
  v_reference text;
  v_completed_at timestamptz:=coalesce(p_completed_at,now());
  v_order_amount integer;
  v_charged_amount integer;
begin
  if p_callback_event_id is null then
    raise exception using errcode='22023',message='Callback event id is required.';
  end if;

  select * into v_callback
  from public.payment_callback_events
  where id=p_callback_event_id
  for update;

  if not found then
    raise exception using errcode='P0002',message='Payment callback event not found.';
  end if;
  if not v_callback.verified then
    raise exception using errcode='P0001',message='Unverified payment callback cannot be finalized.';
  end if;
  if v_callback.status not in ('success','failed') then
    raise exception using errcode='P0001',message='Unsupported payment callback status.';
  end if;

  if v_callback.processed_at is not null then
    return v_callback;
  end if;

  v_reference:=coalesce(nullif(trim(coalesce(p_provider_reference,'')),''),v_callback.merchant_oid);
  if v_reference<>v_callback.merchant_oid then
    raise exception using errcode='P0001',message='Provider reference does not match callback merchant_oid.';
  end if;

  v_order_amount:=coalesce(p_expected_amount_kurus,v_callback.payment_amount_kurus);
  if v_order_amount is null or v_order_amount<=0 then
    raise exception using errcode='22023',message='Verified callback order amount is required.';
  end if;
  if v_callback.payment_amount_kurus is not null and v_callback.payment_amount_kurus<>v_order_amount then
    raise exception using errcode='P0001',message='Callback payment_amount does not match the server order amount.';
  end if;

  v_charged_amount:=coalesce(v_callback.total_amount_kurus,v_callback.payment_amount_kurus,v_order_amount);
  if v_charged_amount is null or v_charged_amount<=0 then
    raise exception using errcode='22023',message='Verified callback charged amount is required.';
  end if;
  if v_callback.status='success' and v_charged_amount<v_order_amount then
    raise exception using errcode='P0001',message='Callback total_amount cannot be below the server order amount.';
  end if;

  v_payment_status:=case when v_callback.status='success' then 'succeeded' else 'failed' end;
  v_transaction_status:=v_payment_status;

  if p_payment_intent_id is not null then
    select * into v_intent
    from public.payment_intents
    where id=p_payment_intent_id
    for update;

    if not found then
      raise exception using errcode='P0002',message='Payment intent not found for callback.';
    end if;
    if v_intent.merchant_oid<>v_callback.merchant_oid then
      raise exception using errcode='P0001',message='Payment intent merchant_oid does not match callback.';
    end if;
    if v_intent.amount_kurus<>v_order_amount then
      raise exception using errcode='P0001',message='Payment intent amount does not match callback payment_amount.';
    end if;

    update public.payment_intents
    set status=v_payment_status,
        order_id=coalesce(p_order_id,order_id),
        installment_count=coalesce(v_callback.installment_count,installment_count,0),
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'order_amount_kurus',v_order_amount,
          'charged_amount_kurus',v_charged_amount,
          'installment_count',coalesce(v_callback.installment_count,0)
        ),
        succeeded_at=case when v_callback.status='success' then v_completed_at else succeeded_at end,
        failed_at=case when v_callback.status='failed' then v_completed_at else failed_at end,
        updated_at=now()
    where id=v_intent.id;

    if p_payment_attempt_id is not null then
      select * into v_attempt
      from public.payment_attempts
      where id=p_payment_attempt_id
      for update;

      if not found then
        raise exception using errcode='P0002',message='Payment attempt not found for callback.';
      end if;
      if v_attempt.payment_intent_id<>v_intent.id then
        raise exception using errcode='P0001',message='Payment attempt does not belong to payment intent.';
      end if;

      update public.payment_attempts
      set status=v_payment_status,
          amount_kurus=v_charged_amount,
          installment_count=coalesce(v_callback.installment_count,installment_count,0),
          provider_reference=v_reference,
          error_code=case when v_callback.status='failed' then nullif(coalesce(p_provider_payload->>'failed_reason_code',''),'') else null end,
          error_message=case when v_callback.status='failed' then nullif(coalesce(p_provider_payload->>'failed_reason_msg',''),'') else null end,
          provider_payload=coalesce(p_provider_payload,'{}'::jsonb)||jsonb_build_object(
            'order_amount_kurus',v_order_amount,
            'charged_amount_kurus',v_charged_amount
          ),
          completed_at=v_completed_at,
          updated_at=now()
      where id=v_attempt.id;
    end if;

    insert into public.payment_transactions(
      payment_intent_id,
      payment_attempt_id,
      provider,
      provider_reference,
      transaction_type,
      status,
      amount_kurus,
      currency,
      metadata,
      completed_at
    ) values (
      v_intent.id,
      p_payment_attempt_id,
      'paytr',
      v_reference,
      'sale',
      v_transaction_status,
      v_charged_amount,
      coalesce(nullif(trim(coalesce(p_currency,'')),''),v_intent.currency,'TL'),
      jsonb_build_object(
        'callback_event_id',v_callback.id,
        'callback_hash',v_callback.callback_hash,
        'order_amount_kurus',v_order_amount,
        'charged_amount_kurus',v_charged_amount,
        'installment_count',coalesce(v_callback.installment_count,0),
        'provider_payload',coalesce(p_provider_payload,'{}'::jsonb)
      ),
      v_completed_at
    )
    on conflict(provider,provider_reference,transaction_type,status)
      where provider_reference is not null and transaction_type='sale'
    do update set
      payment_intent_id=excluded.payment_intent_id,
      payment_attempt_id=coalesce(excluded.payment_attempt_id,public.payment_transactions.payment_attempt_id),
      amount_kurus=excluded.amount_kurus,
      currency=excluded.currency,
      metadata=public.payment_transactions.metadata||excluded.metadata,
      completed_at=coalesce(public.payment_transactions.completed_at,excluded.completed_at);
  end if;

  update public.payment_callback_events
  set processed_at=v_completed_at
  where id=v_callback.id
  returning * into v_callback;

  return v_callback;
end;
$$;

comment on function public.finalize_verified_paytr_callback(uuid,uuid,uuid,uuid,integer,text,text,jsonb,timestamptz) is
  'Atomically finalizes a verified PayTR callback. payment_amount is the order amount; total_amount is the charged amount including a possible iframe installment fee.';

revoke all privileges on function public.finalize_verified_paytr_callback(uuid,uuid,uuid,uuid,integer,text,text,jsonb,timestamptz)
  from PUBLIC,anon,authenticated;

grant execute on function public.finalize_verified_paytr_callback(uuid,uuid,uuid,uuid,integer,text,text,jsonb,timestamptz)
  to service_role;
