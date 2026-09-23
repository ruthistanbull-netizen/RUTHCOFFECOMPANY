-- ROSTA admin PWA push runtime.
-- Isolated to the ROSTA database; no Ruth storefront or external data dependency.

alter table public.orders
  add column if not exists reminder_push_sent_at timestamptz;

create table if not exists public.admin_push_config (
  id boolean primary key default true check (id),
  vapid_public_key text not null,
  vapid_private_key text not null,
  worker_secret text not null,
  subject text not null default 'https://rostacoffecompany.zeabur.app',
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  admin_profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_error text
);

create table if not exists public.admin_push_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('order','reminder','contact','health','test')),
  dedupe_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  target_url text not null default '/',
  order_id uuid references public.orders(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_push_subscriptions_active_idx
  on public.admin_push_subscriptions(active, updated_at desc);

create index if not exists admin_push_jobs_pending_idx
  on public.admin_push_jobs(status, available_at, created_at);

create index if not exists orders_due_reminder_push_idx
  on public.orders(reminder_at)
  where reminder_at is not null and reminder_push_sent_at is null;

alter table public.admin_push_config enable row level security;
alter table public.admin_push_subscriptions enable row level security;
alter table public.admin_push_jobs enable row level security;

revoke all privileges on table public.admin_push_config from public,anon,authenticated;
revoke all privileges on table public.admin_push_subscriptions from public,anon,authenticated;
revoke all privileges on table public.admin_push_jobs from public,anon,authenticated;
grant select,insert,update,delete on table public.admin_push_config to service_role;
grant select,insert,update,delete on table public.admin_push_subscriptions to service_role;
grant select,insert,update,delete on table public.admin_push_jobs to service_role;

create or replace function public.reset_order_reminder_push_state()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
begin
  if old.reminder_at is distinct from new.reminder_at
     or old.reminder_note is distinct from new.reminder_note then
    new.reminder_push_sent_at := null;
  end if;
  return new;
end;
$$;

create or replace function public.enqueue_admin_order_paid_push()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  should_enqueue boolean := false;
begin
  if new.payment_status = 'paid' then
    if tg_op = 'INSERT' then
      should_enqueue := true;
    elsif tg_op = 'UPDATE' and old.payment_status is distinct from new.payment_status then
      should_enqueue := true;
    end if;
  end if;

  if should_enqueue then
    insert into public.admin_push_jobs(kind,dedupe_key,payload,target_url,order_id)
    values(
      'order',
      'order-paid:' || new.id::text,
      jsonb_build_object(
        'customer_name', coalesce(nullif(trim(new.customer_name), ''), 'Müşteri'),
        'total_amount', coalesce(new.total_amount, 0),
        'currency', coalesce(nullif(trim(new.currency), ''), 'TRY'),
        'order_no', new.order_no
      ),
      '/orders',
      new.id
    )
    on conflict (dedupe_key) do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.enqueue_due_admin_reminders()
returns integer
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  inserted_count integer := 0;
begin
  insert into public.admin_push_jobs(kind,dedupe_key,payload,target_url,order_id)
  select
    'reminder',
    'order-reminder:' || o.id::text || ':' || floor(extract(epoch from o.reminder_at))::bigint::text,
    jsonb_build_object(
      'order_no', o.order_no,
      'customer_name', coalesce(nullif(trim(o.customer_name), ''), 'Müşteri'),
      'reminder_note', nullif(trim(o.reminder_note), ''),
      'admin_note', nullif(trim(o.admin_note), ''),
      'reminder_at', o.reminder_at
    ),
    '/crm',
    o.id
  from public.orders o
  where o.reminder_at is not null
    and o.reminder_push_sent_at is null
    and o.reminder_at <= now()
    and o.reminder_at >= now() - interval '7 days'
  on conflict (dedupe_key) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function public.claim_admin_push_jobs(p_limit integer default 25)
returns setof public.admin_push_jobs
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
begin
  return query
  with candidates as (
    select j.id
    from public.admin_push_jobs j
    where j.status = 'pending'
      and j.available_at <= now()
    order by j.created_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit,25),100))
  )
  update public.admin_push_jobs j
  set status='sending', attempts=j.attempts+1, updated_at=now(), error_message=null
  from candidates c
  where j.id=c.id
  returning j.*;
end;
$$;

drop trigger if exists orders_reset_reminder_push_state on public.orders;
create trigger orders_reset_reminder_push_state
before update of reminder_at, reminder_note on public.orders
for each row execute function public.reset_order_reminder_push_state();

drop trigger if exists orders_enqueue_paid_admin_push on public.orders;
create trigger orders_enqueue_paid_admin_push
after insert or update of payment_status on public.orders
for each row execute function public.enqueue_admin_order_paid_push();

revoke all privileges on function public.reset_order_reminder_push_state() from public,anon,authenticated;
revoke all privileges on function public.enqueue_admin_order_paid_push() from public,anon,authenticated;
revoke all privileges on function public.enqueue_due_admin_reminders() from public,anon,authenticated;
revoke all privileges on function public.claim_admin_push_jobs(integer) from public,anon,authenticated;
grant execute on function public.reset_order_reminder_push_state() to service_role;
grant execute on function public.enqueue_admin_order_paid_push() to service_role;
grant execute on function public.enqueue_due_admin_reminders() to service_role;
grant execute on function public.claim_admin_push_jobs(integer) to service_role;

update public.orders
set reminder_push_sent_at = now()
where reminder_at is not null
  and reminder_at <= now()
  and reminder_push_sent_at is null;
