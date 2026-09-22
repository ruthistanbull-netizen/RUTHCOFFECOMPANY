begin;

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  auth_user_id uuid,
  email text,
  status text not null default 'requested' check (status in ('requested','reviewing','completed','rejected')),
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  admin_note text,
  unique(profile_id,status)
);
create index if not exists account_deletion_requests_status_idx
  on public.account_deletion_requests(status,requested_at desc);
alter table public.account_deletion_requests enable row level security;
revoke all on table public.account_deletion_requests from public, anon, authenticated;
grant all on table public.account_deletion_requests to service_role;

commit;