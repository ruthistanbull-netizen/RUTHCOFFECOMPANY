-- RR HUB native APNs devices. Apply independently to Ruth and ROSTA databases.
-- Never reuse a tenant's tokens, admin profile IDs, or credentials in another tenant.
create table if not exists public.admin_mobile_push_devices (
  id uuid primary key default gen_random_uuid(),
  admin_profile_id uuid not null,
  token_sha256 text not null unique,
  device_token text not null,
  bundle_id text not null,
  apns_environment text not null check (apns_environment in ('sandbox','production')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_error text
);
create index if not exists admin_mobile_push_devices_active_idx
  on public.admin_mobile_push_devices (active, admin_profile_id);
alter table public.admin_mobile_push_devices enable row level security;
revoke all on public.admin_mobile_push_devices from public, anon, authenticated;
grant all on public.admin_mobile_push_devices to service_role;
comment on table public.admin_mobile_push_devices is
  'Separate tenant-scoped APNs device registration for RR HUB. No client-side direct database access.';
