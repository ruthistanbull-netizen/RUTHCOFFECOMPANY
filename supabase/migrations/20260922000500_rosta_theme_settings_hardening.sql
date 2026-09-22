begin;

create table if not exists public.site_settings (
  id uuid primary key default gen_random_uuid(),
  setting_key text not null unique,
  setting_value jsonb not null default '{}'::jsonb,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.site_settings
  add column if not exists is_public boolean not null default true;
alter table public.site_settings
  add column if not exists created_at timestamptz not null default now();
alter table public.site_settings
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists site_settings_setting_key_unique_idx
  on public.site_settings(setting_key);
create index if not exists site_settings_updated_at_idx
  on public.site_settings(updated_at desc);

alter table public.site_settings enable row level security;

revoke insert, update, delete, truncate, references, trigger
  on public.site_settings from anon, authenticated;
grant select on public.site_settings to anon, authenticated;
grant all on public.site_settings to service_role;

drop policy if exists site_settings_public_read on public.site_settings;
drop policy if exists "site_settings_public_read" on public.site_settings;
create policy site_settings_public_read
  on public.site_settings
  for select
  to anon, authenticated
  using (is_public = true);

-- Editor-only section drafts are fetched server-side with the service role.
-- They must never be readable through the public storefront client.
update public.site_settings
set is_public = false,
    updated_at = now()
where setting_key like 'theme_sections_preview_%'
  and is_public is distinct from false;

-- Old preview snapshots have no value after the editor session is gone.
delete from public.site_settings
where setting_key like 'theme_sections_preview_%'
  and updated_at < now() - interval '24 hours';

commit;
