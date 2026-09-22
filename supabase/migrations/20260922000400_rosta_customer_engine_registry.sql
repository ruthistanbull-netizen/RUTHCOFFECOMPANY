begin;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  full_name text,
  email text,
  phone text,
  membership_status text not null default 'guest'
    check (membership_status in ('member', 'guest')),
  source text not null default 'order'
    check (source in ('profile', 'order', 'admin', 'import')),
  service_email_allowed boolean not null default true,
  marketing_email_status text not null default 'unknown'
    check (marketing_email_status in ('granted', 'denied', 'unknown')),
  marketing_email_consent_at timestamptz,
  marketing_email_consent_source text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_identities (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  identity_type text not null check (identity_type in ('email', 'phone', 'profile')),
  normalized_value text not null,
  is_primary boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (customer_id, identity_type, normalized_value)
);

create unique index if not exists customer_identities_profile_unique_idx
  on public.customer_identities (normalized_value)
  where identity_type = 'profile';
create unique index if not exists customer_identities_email_unique_idx
  on public.customer_identities (normalized_value)
  where identity_type = 'email';
create index if not exists customer_identities_phone_lookup_idx
  on public.customer_identities (normalized_value, customer_id)
  where identity_type = 'phone';

create table if not exists public.customer_consents (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  purpose text not null check (purpose in ('terms', 'privacy', 'marketing_email', 'marketing_sms', 'marketing_whatsapp')),
  consent_state text not null check (consent_state in ('granted', 'denied')),
  text_version text,
  source text not null,
  channel text not null default 'commerce-core',
  captured_at timestamptz not null default now(),
  revoked_at timestamptz,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.orders
  add column if not exists customer_id uuid references public.customers(id) on delete set null;

alter table public.customer_addresses
  add column if not exists customer_id uuid references public.customers(id) on delete cascade;

create index if not exists customers_membership_status_idx
  on public.customers (membership_status, last_seen_at desc);
create index if not exists customers_email_lower_idx
  on public.customers (lower(email)) where email is not null;
create index if not exists customers_phone_idx
  on public.customers (phone) where phone is not null;
create index if not exists customer_identities_customer_idx
  on public.customer_identities (customer_id, identity_type);
create index if not exists customer_consents_customer_purpose_idx
  on public.customer_consents (customer_id, purpose, captured_at desc);
create index if not exists orders_customer_id_created_at_idx
  on public.orders (customer_id, created_at desc) where customer_id is not null;
create index if not exists customer_addresses_customer_id_idx
  on public.customer_addresses (customer_id) where customer_id is not null;

alter table public.customers enable row level security;
alter table public.customer_identities enable row level security;
alter table public.customer_consents enable row level security;

revoke all on public.customers from anon, authenticated;
revoke all on public.customer_identities from anon, authenticated;
revoke all on public.customer_consents from anon, authenticated;

grant all on public.customers to service_role;
grant all on public.customer_identities to service_role;
grant all on public.customer_consents to service_role;

create or replace function public.normalize_customer_email(p_email text)
returns text
language sql
immutable
set search_path = public, pg_catalog
as $$
  select nullif(lower(btrim(coalesce(p_email, ''))), '');
$$;

create or replace function public.normalize_customer_phone(p_phone text)
returns text
language sql
immutable
set search_path = public, pg_catalog
as $$
  with normalized as (
    select regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') as digits
  )
  select case
    when digits = '' then null
    when length(digits) > 10 then right(digits, 10)
    else digits
  end
  from normalized;
$$;

create or replace function public.enqueue_customer_domain_event(
  p_customer_id uuid,
  p_event_type text,
  p_source text,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  insert into public.commerce_outbox (
    event_id,
    event_type,
    event_version,
    aggregate_type,
    aggregate_id,
    payload,
    headers,
    correlation_id
  ) values (
    gen_random_uuid(),
    p_event_type,
    1,
    'customer',
    p_customer_id::text,
    coalesce(p_payload, '{}'::jsonb),
    jsonb_build_object('channel', 'commerce-core', 'source', coalesce(p_source, 'unknown')),
    gen_random_uuid()::text
  );
end;
$$;

create or replace function public.resolve_or_create_customer(
  p_profile_id uuid,
  p_full_name text,
  p_email text,
  p_phone text,
  p_source text,
  p_seen_at timestamptz,
  p_marketing_email_consent boolean,
  p_marketing_consent_at timestamptz,
  p_consent_source text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_profile_id uuid := p_profile_id;
  v_customer_id uuid;
  v_existing_profile_id uuid;
  v_email text := public.normalize_customer_email(p_email);
  v_phone text := public.normalize_customer_phone(p_phone);
  v_source text := case
    when p_source in ('profile', 'order', 'admin', 'import') then p_source
    else 'order'
  end;
  v_seen_at timestamptz := coalesce(p_seen_at, now());
  v_created boolean := false;
  v_was_member boolean := false;
  v_old_consent text;
  v_new_consent text;
begin
  if v_profile_id is null and v_email is not null then
    select p.id
    into v_profile_id
    from public.profiles p
    where public.normalize_customer_email(p.email) = v_email
      and (p.auth_user_id is not null or coalesce(p.is_legacy_member, false))
    order by
      (p.auth_user_id is not null) desc,
      coalesce(p.is_legacy_member, false) desc,
      p.created_at asc nulls last,
      p.id
    limit 1;
  end if;

  if v_profile_id is null and v_email is null and v_phone is not null then
    with matches as (
      select p.id
      from public.profiles p
      where public.normalize_customer_phone(coalesce(p.phone_normalized, p.phone)) = v_phone
        and (p.auth_user_id is not null or coalesce(p.is_legacy_member, false))
      order by p.created_at asc nulls last, p.id
      limit 2
    )
    select case when count(*) = 1 then (array_agg(id))[1] else null end
    into v_profile_id
    from matches;
  end if;

  if v_profile_id is not null then
    select c.id
    into v_customer_id
    from public.customers c
    where c.profile_id = v_profile_id
    order by c.created_at asc, c.id
    limit 1
    for update;
  end if;

  if v_customer_id is null and v_email is not null then
    select c.id
    into v_customer_id
    from public.customer_identities ci
    join public.customers c on c.id = ci.customer_id
    where ci.identity_type = 'email'
      and ci.normalized_value = v_email
      and (
        v_profile_id is null
        or c.profile_id is null
        or c.profile_id = v_profile_id
      )
    order by
      (c.profile_id = v_profile_id) desc nulls last,
      (c.profile_id is null) desc,
      c.created_at asc,
      c.id
    limit 1
    for update of c;
  end if;

  if v_customer_id is null and v_email is null and v_phone is not null then
    with candidates as (
      select distinct c.id, c.created_at
      from public.customer_identities ci
      join public.customers c on c.id = ci.customer_id
      where ci.identity_type = 'phone'
        and ci.normalized_value = v_phone
        and (
          v_profile_id is null
          or c.profile_id is null
          or c.profile_id = v_profile_id
        )
      order by c.created_at asc, c.id
      limit 2
    )
    select case when count(*) = 1 then (array_agg(id order by created_at, id))[1] else null end
    into v_customer_id
    from candidates;
  end if;

  if v_customer_id is null then
    insert into public.customers (
      profile_id,
      full_name,
      email,
      phone,
      membership_status,
      source,
      first_seen_at,
      last_seen_at
    ) values (
      v_profile_id,
      nullif(btrim(coalesce(p_full_name, '')), ''),
      v_email,
      v_phone,
      case when v_profile_id is not null then 'member' else 'guest' end,
      case when v_profile_id is not null then 'profile' else v_source end,
      v_seen_at,
      v_seen_at
    )
    returning id into v_customer_id;
    v_created := true;
  else
    select c.profile_id, c.membership_status = 'member', c.marketing_email_status
    into v_existing_profile_id, v_was_member, v_old_consent
    from public.customers c
    where c.id = v_customer_id
    for update;

    if v_existing_profile_id is not null
      and v_profile_id is not null
      and v_existing_profile_id <> v_profile_id then
      raise exception 'customer_member_identity_conflict: % <> %', v_existing_profile_id, v_profile_id;
    end if;
  end if;

  update public.customers c
  set
    profile_id = coalesce(c.profile_id, v_profile_id),
    full_name = coalesce(nullif(btrim(coalesce(p_full_name, '')), ''), c.full_name),
    email = coalesce(v_email, c.email),
    phone = coalesce(v_phone, c.phone),
    membership_status = case when coalesce(c.profile_id, v_profile_id) is not null then 'member' else 'guest' end,
    source = case when coalesce(c.profile_id, v_profile_id) is not null then 'profile' else c.source end,
    first_seen_at = least(c.first_seen_at, v_seen_at),
    last_seen_at = greatest(c.last_seen_at, v_seen_at),
    updated_at = now()
  where c.id = v_customer_id;

  if v_profile_id is not null then
    insert into public.customer_identities (
      customer_id,
      identity_type,
      normalized_value,
      is_primary,
      verified_at
    ) values (
      v_customer_id,
      'profile',
      v_profile_id::text,
      true,
      now()
    )
    on conflict (normalized_value) where identity_type = 'profile'
    do update set
      customer_id = excluded.customer_id,
      is_primary = true,
      verified_at = coalesce(public.customer_identities.verified_at, excluded.verified_at);
  end if;

  if v_email is not null then
    insert into public.customer_identities (
      customer_id,
      identity_type,
      normalized_value,
      is_primary
    ) values (
      v_customer_id,
      'email',
      v_email,
      true
    )
    on conflict (normalized_value) where identity_type = 'email'
    do update set
      customer_id = excluded.customer_id,
      is_primary = true;
  end if;

  if v_phone is not null then
    insert into public.customer_identities (
      customer_id,
      identity_type,
      normalized_value,
      is_primary
    ) values (
      v_customer_id,
      'phone',
      v_phone,
      v_email is null
    )
    on conflict (customer_id, identity_type, normalized_value) do nothing;
  end if;

  if p_marketing_email_consent is true then
    v_new_consent := 'granted';
  elsif p_marketing_email_consent is false and p_marketing_consent_at is not null then
    v_new_consent := 'denied';
  else
    v_new_consent := null;
  end if;

  select c.marketing_email_status
  into v_old_consent
  from public.customers c
  where c.id = v_customer_id;

  if v_new_consent is not null and v_new_consent is distinct from v_old_consent then
    update public.customers
    set
      marketing_email_status = v_new_consent,
      marketing_email_consent_at = coalesce(p_marketing_consent_at, v_seen_at),
      marketing_email_consent_source = coalesce(nullif(btrim(coalesce(p_consent_source, '')), ''), v_source),
      updated_at = now()
    where id = v_customer_id;

    insert into public.customer_consents (
      customer_id,
      purpose,
      consent_state,
      source,
      channel,
      captured_at,
      evidence
    ) values (
      v_customer_id,
      'marketing_email',
      v_new_consent,
      coalesce(nullif(btrim(coalesce(p_consent_source, '')), ''), v_source),
      'commerce-core',
      coalesce(p_marketing_consent_at, v_seen_at),
      jsonb_build_object('profile_id', v_profile_id)
    );

    perform public.enqueue_customer_domain_event(
      v_customer_id,
      'customer.consent_changed',
      v_source,
      jsonb_build_object('purpose', 'marketing_email', 'state', v_new_consent)
    );
  end if;

  if v_created then
    perform public.enqueue_customer_domain_event(
      v_customer_id,
      'customer.created',
      v_source,
      jsonb_build_object('membership_status', case when v_profile_id is null then 'guest' else 'member' end)
    );

    insert into public.commerce_audit_logs (
      action,
      entity_type,
      entity_id,
      actor_type,
      correlation_id,
      reason,
      after_data,
      metadata
    ) values (
      'customer.created',
      'customer',
      v_customer_id::text,
      'system',
      gen_random_uuid()::text,
      'Canonical customer identity created by Customer Engine',
      jsonb_build_object('membership_status', case when v_profile_id is null then 'guest' else 'member' end),
      jsonb_build_object('source', v_source)
    );
  elsif not v_was_member and v_profile_id is not null then
    perform public.enqueue_customer_domain_event(
      v_customer_id,
      'customer.member_linked',
      v_source,
      jsonb_build_object('profile_id', v_profile_id)
    );

    insert into public.commerce_audit_logs (
      action,
      entity_type,
      entity_id,
      actor_type,
      correlation_id,
      reason,
      after_data,
      metadata
    ) values (
      'customer.member_linked',
      'customer',
      v_customer_id::text,
      'system',
      gen_random_uuid()::text,
      'Guest customer matched to membership profile',
      jsonb_build_object('profile_id', v_profile_id),
      jsonb_build_object('source', v_source)
    );
  end if;

  return v_customer_id;
end;
$$;

revoke all on function public.resolve_or_create_customer(uuid, text, text, text, text, timestamptz, boolean, timestamptz, text) from public, anon, authenticated;
grant execute on function public.resolve_or_create_customer(uuid, text, text, text, text, timestamptz, boolean, timestamptz, text) to service_role;

select public.resolve_or_create_customer(
  p.id,
  p.full_name,
  p.email,
  coalesce(p.phone_normalized, p.phone),
  'profile',
  coalesce(p.created_at, now()),
  case when p.marketing_email_consent then true else null end,
  p.marketing_email_consent_at,
  p.consent_source
)
from public.profiles p;

with resolved as (
  select
    o.id,
    public.resolve_or_create_customer(
      o.profile_id,
      o.customer_name,
      o.customer_email,
      o.customer_phone,
      case when o.imported_source is null then 'order' else 'import' end,
      coalesce(o.created_at, now()),
      null,
      null,
      null
    ) as customer_id
  from public.orders o
)
update public.orders o
set
  customer_id = r.customer_id,
  profile_id = coalesce(o.profile_id, c.profile_id)
from resolved r
join public.customers c on c.id = r.customer_id
where o.id = r.id;

update public.customer_addresses a
set customer_id = c.id
from public.customers c
where a.profile_id is not null
  and c.profile_id = a.profile_id
  and a.customer_id is distinct from c.id;

create or replace function public.sync_profile_to_customer()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  perform public.resolve_or_create_customer(
    new.id,
    new.full_name,
    new.email,
    coalesce(new.phone_normalized, new.phone),
    'profile',
    coalesce(new.updated_at, new.created_at, now()),
    case
      when new.marketing_email_consent then true
      when new.marketing_email_consent_at is not null then false
      else null
    end,
    new.marketing_email_consent_at,
    new.consent_source
  );
  return new;
end;
$$;

create or replace function public.assign_order_customer()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  new.customer_id := public.resolve_or_create_customer(
    new.profile_id,
    new.customer_name,
    new.customer_email,
    new.customer_phone,
    case when new.imported_source is null then 'order' else 'import' end,
    coalesce(new.created_at, now()),
    null,
    null,
    null
  );

  if new.profile_id is null then
    select c.profile_id into new.profile_id
    from public.customers c
    where c.id = new.customer_id;
  end if;

  return new;
end;
$$;

drop trigger if exists orders_assign_member_profile on public.orders;
drop trigger if exists orders_assign_customer on public.orders;
create trigger orders_assign_customer
before insert or update of profile_id, customer_name, customer_email, customer_phone on public.orders
for each row
execute function public.assign_order_customer();

drop trigger if exists profiles_sync_customer on public.profiles;
create trigger profiles_sync_customer
after insert or update of auth_user_id, is_legacy_member, email, phone, phone_normalized, full_name, marketing_email_consent, marketing_email_consent_at, consent_source on public.profiles
for each row
execute function public.sync_profile_to_customer();

drop trigger if exists set_customers_updated_at on public.customers;
create trigger set_customers_updated_at
before update on public.customers
for each row
execute function public.set_updated_at();

create or replace view public.customer_read_model
with (security_invoker = true)
as
with order_stats as (
  select
    o.customer_id,
    count(*)::integer as order_count,
    count(*) filter (where o.payment_status = 'paid')::integer as paid_order_count,
    coalesce(sum(o.total_amount) filter (where o.payment_status = 'paid'), 0)::numeric as total_spent
  from public.orders o
  where o.customer_id is not null
  group by o.customer_id
),
last_orders as (
  select distinct on (o.customer_id)
    o.customer_id,
    o.id as last_order_id,
    o.order_no as last_order_no,
    o.created_at as last_order_at,
    o.payment_status as last_payment_status,
    o.shipping_city as city,
    o.shipping_town as district
  from public.orders o
  where o.customer_id is not null
  order by o.customer_id, o.created_at desc nulls last, o.id desc
)
select
  c.id,
  c.profile_id,
  coalesce(c.full_name, p.full_name) as full_name,
  coalesce(c.email, p.email) as email,
  coalesce(c.phone, p.phone_normalized, p.phone) as phone,
  (c.membership_status = 'member') as is_member,
  case
    when p.auth_user_id is not null then 'new_site'
    when coalesce(p.is_legacy_member, false) then 'ikas'
    else null
  end as membership_source,
  p.ikas_account_status,
  coalesce(p.reward_points_balance, 0)::integer as reward_points_balance,
  coalesce(p.birthday_reward_points, 0)::integer as birthday_reward_points,
  coalesce(p.terms_accepted, false) as terms_accepted,
  (c.marketing_email_status = 'granted') as marketing_email_consent,
  c.marketing_email_status,
  c.marketing_email_consent_at,
  c.marketing_email_consent_source as consent_source,
  c.service_email_allowed,
  c.source,
  c.first_seen_at,
  c.last_seen_at,
  c.created_at,
  coalesce(os.order_count, 0)::integer as order_count,
  coalesce(os.paid_order_count, 0)::integer as paid_order_count,
  coalesce(os.total_spent, 0)::numeric as total_spent,
  lo.last_order_id,
  lo.last_order_no,
  lo.last_order_at,
  lo.last_payment_status,
  lo.city,
  lo.district
from public.customers c
left join public.profiles p on p.id = c.profile_id
left join order_stats os on os.customer_id = c.id
left join last_orders lo on lo.customer_id = c.id;

create or replace view public.customer_summary_read_model
with (security_invoker = true)
as
select
  count(*)::integer as customer_count,
  count(*) filter (where is_member)::integer as member_count,
  count(*) filter (where not is_member)::integer as non_member_count,
  count(*) filter (where order_count > 0)::integer as customers_with_orders,
  coalesce(sum(total_spent), 0)::numeric as total_paid_revenue
from public.customer_read_model;

revoke all on public.customer_read_model from anon, authenticated;
revoke all on public.customer_summary_read_model from anon, authenticated;
grant select on public.customer_read_model to service_role;
grant select on public.customer_summary_read_model to service_role;

comment on table public.customers is
  'Customer Engine canonical registry. Every member and guest purchaser has one durable customer record.';
comment on column public.customers.service_email_allowed is
  'Operational/order/service e-mail eligibility. This is not marketing consent.';
comment on column public.customers.marketing_email_status is
  'Marketing e-mail requires explicit consent; guest checkout alone leaves this unknown.';
comment on function public.resolve_or_create_customer(uuid, text, text, text, text, timestamptz, boolean, timestamptz, text) is
  'Idempotently resolves or creates canonical customers without merging distinct membership profiles.';

commit;
