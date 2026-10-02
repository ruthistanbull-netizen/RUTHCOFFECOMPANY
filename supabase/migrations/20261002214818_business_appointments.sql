begin;

create table public.business_appointments (
  id uuid primary key default gen_random_uuid(),
  request_key uuid not null unique,
  source text not null default 'storefront' check (source in ('storefront','manual')),
  inquiry jsonb not null check (jsonb_typeof(inquiry) = 'object' and octet_length(inquiry::text) <= 20000),
  context text generated always as (inquiry->>'context') stored not null check (context in ('studio','wholesale')),
  business_name text generated always as (inquiry->>'businessName') stored not null check (length(business_name) between 2 and 120),
  contact_name text generated always as (inquiry->>'contactName') stored not null check (length(contact_name) between 2 and 120),
  scheduled_date date not null,
  scheduled_time text not null check (scheduled_time in ('09:00 - 10:00','11:00 - 12:00','13:00 - 14:00','15:00 - 16:00','17:00 - 18:00')),
  meeting text not null check (meeting in ('phone','online','in_person')),
  address text not null default '',
  status text not null default 'pending' check (status in ('pending','confirmed','completed','cancelled')),
  admin_notes text not null default '' check (length(admin_notes) <= 4000),
  revision integer not null default 1,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_appointments_address_check check (meeting <> 'in_person' or length(trim(address)) between 10 and 600)
);
create index business_appointments_created_idx on public.business_appointments(created_at desc, id desc);
create index business_appointments_status_date_idx on public.business_appointments(status, scheduled_date, scheduled_time);
create index business_appointments_created_by_idx on public.business_appointments(created_by) where created_by is not null;
-- Studio and wholesale use the same meeting calendar. Preferences may overlap;
-- two appointments cannot be confirmed for the same time.
create unique index business_appointments_confirmed_slot_idx on public.business_appointments(scheduled_date, scheduled_time) where status = 'confirmed';
alter table public.business_appointments enable row level security;
revoke all on public.business_appointments from public, anon, authenticated;
grant select, insert, update, delete on public.business_appointments to service_role;

create function public.touch_business_appointment()
returns trigger language plpgsql security invoker set search_path = public, pg_catalog as $$
begin
  new.revision := old.revision + 1;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
create trigger business_appointments_touch before update on public.business_appointments
for each row execute function public.touch_business_appointment();

create function public.enqueue_business_appointment_push()
returns trigger language plpgsql security invoker set search_path = public, pg_catalog as $$
declare config record;
begin
  if new.source <> 'storefront' then return new; end if;
  -- Contact is the existing queue transport; appointment_id selects the richer
  -- appointment notification without breaking workers during a rolling deploy.
  insert into public.admin_push_jobs(kind, dedupe_key, payload, target_url)
  values ('contact', 'appointment:' || new.id::text,
    jsonb_build_object('appointment_id',new.id,'context',new.context,'business_name',new.business_name,
      'name',new.contact_name,'date',new.scheduled_date,'time',new.scheduled_time),
    '/appointments?appointment=' || new.id::text)
  on conflict (dedupe_key) do nothing;
  -- pg_net sends after commit. The existing minute worker remains a durable
  -- fallback, so an unavailable wake-up never loses an appointment or its job.
  begin
    select admin_base_url, secret into config from public.automation_cron_config where id = true;
    if config.admin_base_url is not null and config.secret is not null then
      perform net.http_post(
        url := trim(trailing '/' from config.admin_base_url) || '/api/internal/push-worker',
        headers := jsonb_build_object('content-type','application/json','x-rosta-internal-secret',config.secret),
        body := jsonb_build_object('source','business_appointment'), timeout_milliseconds := 15000
      );
    end if;
  exception when others then
    null;
  end;
  return new;
end;
$$;
create trigger business_appointments_enqueue_push after insert on public.business_appointments
for each row execute function public.enqueue_business_appointment_push();

create function public.submit_business_appointment(
  p_request_key uuid, p_inquiry jsonb, p_ip_hash text default null,
  p_source text default 'storefront', p_created_by uuid default null,
  p_status text default 'pending', p_admin_notes text default ''
)
returns uuid language plpgsql security invoker set search_path = public, pg_catalog as $$
declare existing public.business_appointments; result_id uuid; next_count integer;
begin
  if p_request_key is null or p_source not in ('storefront','manual')
    or p_status not in ('pending','confirmed') or (p_source = 'storefront' and (p_status <> 'pending' or p_created_by is not null)) then
    raise exception 'invalid_appointment';
  end if;
  -- Serialize concurrent retries before counting the request or enqueueing push.
  perform pg_advisory_xact_lock(hashtextextended(p_request_key::text, 0));
  select * into existing from public.business_appointments where request_key = p_request_key;
  if found then
    if existing.inquiry <> p_inquiry or existing.source <> p_source then raise exception 'appointment_request_mismatch'; end if;
    return existing.id;
  end if;
  if (p_inquiry->>'date')::date::text <> p_inquiry->>'date'
     or ((p_inquiry->>'date') || ' ' || left(p_inquiry->>'time',5))::timestamp at time zone 'Europe/Istanbul' <= now() then
    raise exception 'invalid_appointment_date';
  end if;
  if p_source = 'storefront' then
    if p_ip_hash is null or length(p_ip_hash) <> 64 then raise exception 'invalid_appointment_client'; end if;
    insert into public.contact_rate_limits(ip_hash, window_started_at, request_count, updated_at)
    values (p_ip_hash, now(), 1, now())
    on conflict (ip_hash) do update set
      request_count = case when contact_rate_limits.window_started_at < now()-interval '15 minutes' then 1 else contact_rate_limits.request_count+1 end,
      window_started_at = case when contact_rate_limits.window_started_at < now()-interval '15 minutes' then now() else contact_rate_limits.window_started_at end,
      updated_at = now()
    returning request_count into next_count;
    if next_count > 5 then raise exception 'appointment_rate_limited'; end if;
  end if;
  insert into public.business_appointments(request_key,source,inquiry,scheduled_date,scheduled_time,meeting,address,status,created_by,admin_notes)
  values (p_request_key,p_source,p_inquiry,(p_inquiry->>'date')::date,p_inquiry->>'time',p_inquiry->>'meeting',
    case when p_inquiry->>'meeting' = 'in_person' then p_inquiry->>'address' else '' end,p_status,p_created_by,p_admin_notes)
  returning id into result_id;
  return result_id;
end;
$$;
revoke all on function public.touch_business_appointment() from public, anon, authenticated;
revoke all on function public.enqueue_business_appointment_push() from public, anon, authenticated;
revoke all on function public.submit_business_appointment(uuid,jsonb,text,text,uuid,text,text) from public, anon, authenticated;
grant execute on function public.touch_business_appointment() to service_role;
grant execute on function public.enqueue_business_appointment_push() to service_role;
grant execute on function public.submit_business_appointment(uuid,jsonb,text,text,uuid,text,text) to service_role;
create function public.business_appointment_counts()
returns jsonb language sql stable security invoker set search_path = public, pg_catalog as $$
  select jsonb_build_object('total',count(*),'pending',count(*) filter (where status = 'pending'),
    'confirmed',count(*) filter (where status = 'confirmed'),
    'today',count(*) filter (where status = 'confirmed' and scheduled_date = (now() at time zone 'Europe/Istanbul')::date))
  from public.business_appointments;
$$;
revoke all on function public.business_appointment_counts() from public, anon, authenticated;
grant execute on function public.business_appointment_counts() to service_role;
commit;
