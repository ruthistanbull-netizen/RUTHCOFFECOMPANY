-- ROSTA internal worker/automation authentication.
-- Service-role only; no public policies and no Ruth project dependency.

create table if not exists public.automation_cron_config (
  id boolean primary key default true check (id),
  secret text not null default (
    replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','')
  ),
  updated_at timestamptz not null default now()
);

insert into public.automation_cron_config(id)
values(true)
on conflict(id) do nothing;

alter table public.automation_cron_config enable row level security;
revoke all privileges on table public.automation_cron_config from public, anon, authenticated;
grant select,insert,update,delete on table public.automation_cron_config to service_role;

alter table public.commerce_worker_config
  add column if not exists admin_internal_url text;

update public.commerce_worker_config
set admin_internal_url = 'https://rostapanel.zeabur.app',
    updated_at = now()
where id = true
  and coalesce(nullif(trim(admin_internal_url),''),'') = '';

alter table public.commerce_worker_config
  alter column admin_internal_url set default 'https://rostapanel.zeabur.app';
