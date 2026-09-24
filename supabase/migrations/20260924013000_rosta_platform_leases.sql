-- ROSTA distributed platform leases.
-- Additive and service-role only. Used by watchdog and server maintenance owners.

create table if not exists public.platform_leases (
  name text primary key,
  holder text not null,
  leased_until timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.platform_leases enable row level security;
revoke all privileges on table public.platform_leases from public, anon, authenticated;
grant select, insert, update, delete on table public.platform_leases to service_role;

create or replace function public.try_platform_lease(
  p_name text,
  p_holder text,
  p_ttl_seconds integer default 55
)
returns boolean
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare
  v_acquired boolean := false;
begin
  insert into public.platform_leases(name, holder, leased_until, updated_at)
  values(
    p_name,
    p_holder,
    now() + make_interval(secs => greatest(5, least(coalesce(p_ttl_seconds, 55), 3600))),
    now()
  )
  on conflict(name) do update set
    holder = excluded.holder,
    leased_until = excluded.leased_until,
    updated_at = now()
  where public.platform_leases.leased_until <= now()
     or public.platform_leases.holder = excluded.holder
  returning true into v_acquired;

  return coalesce(v_acquired, false);
end;
$$;

revoke all on function public.try_platform_lease(text,text,integer) from public, anon, authenticated;
grant execute on function public.try_platform_lease(text,text,integer) to service_role;
