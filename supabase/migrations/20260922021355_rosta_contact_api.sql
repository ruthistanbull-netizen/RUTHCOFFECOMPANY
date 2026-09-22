begin;

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  message text not null,
  status text not null default 'new' check (status in ('new','read','resolved','spam')),
  source text not null default 'storefront',
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists contact_messages_status_created_idx
  on public.contact_messages(status,created_at desc);
alter table public.contact_messages enable row level security;
revoke all on table public.contact_messages from public, anon, authenticated;
grant all on table public.contact_messages to service_role;

create table if not exists public.contact_rate_limits (
  ip_hash text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.contact_rate_limits enable row level security;
revoke all on table public.contact_rate_limits from public, anon, authenticated;
grant all on table public.contact_rate_limits to service_role;

create or replace function public.submit_contact_message(
  p_name text,
  p_email text,
  p_phone text,
  p_message text,
  p_ip_hash text,
  p_user_agent text
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare
  next_count integer;
  message_id uuid;
begin
  if length(trim(coalesce(p_name,''))) < 2
     or length(trim(coalesce(p_email,''))) < 5
     or length(trim(coalesce(p_message,''))) < 10 then
    raise exception 'invalid_contact_message';
  end if;

  insert into public.contact_rate_limits(ip_hash,window_started_at,request_count,updated_at)
  values (coalesce(nullif(p_ip_hash,''),'unknown'),now(),1,now())
  on conflict (ip_hash) do update
  set request_count=case
        when contact_rate_limits.window_started_at < now()-interval '15 minutes' then 1
        else contact_rate_limits.request_count+1
      end,
      window_started_at=case
        when contact_rate_limits.window_started_at < now()-interval '15 minutes' then now()
        else contact_rate_limits.window_started_at
      end,
      updated_at=now()
  returning request_count into next_count;

  if next_count > 5 then
    raise exception 'contact_rate_limited';
  end if;

  insert into public.contact_messages(name,email,phone,message,ip_hash,user_agent)
  values (
    left(trim(p_name),120),
    left(lower(trim(p_email)),180),
    nullif(left(trim(coalesce(p_phone,'')),40),''),
    left(trim(p_message),4000),
    nullif(left(coalesce(p_ip_hash,''),128),''),
    nullif(left(coalesce(p_user_agent,''),500),'')
  )
  returning id into message_id;

  return message_id;
end;
$$;

revoke all on function public.submit_contact_message(text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.submit_contact_message(text,text,text,text,text,text) to service_role;

commit;