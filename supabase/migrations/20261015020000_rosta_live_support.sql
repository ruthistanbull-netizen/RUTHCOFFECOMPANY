-- ROSTA Coffee Co. live customer support, 2026-10-15.
-- Apply this migration to the ROSTA database only, never the RUTH database.
create extension if not exists pgcrypto;

create table if not exists public.rosta_live_support_threads (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  email text not null check (char_length(email) between 5 and 200),
  access_hash text not null unique,
  status text not null default 'pending'
    check (status in ('pending','active','rejected','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rosta_live_support_threads_status_created_idx
  on public.rosta_live_support_threads (status, created_at desc);
create index if not exists rosta_live_support_threads_email_created_idx
  on public.rosta_live_support_threads (email, created_at desc);

create table if not exists public.rosta_live_support_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.rosta_live_support_threads(id) on delete cascade,
  sender text not null check (sender in ('customer','admin','system')),
  body text not null check (char_length(body) between 1 and 3000),
  image_path text null check (char_length(image_path) between 1 and 260),
  created_at timestamptz not null default now()
);
create index if not exists rosta_live_support_messages_thread_time_idx
  on public.rosta_live_support_messages (thread_id, created_at);

alter table public.rosta_live_support_threads enable row level security;
alter table public.rosta_live_support_messages enable row level security;
revoke all on public.rosta_live_support_threads from public, anon, authenticated;
revoke all on public.rosta_live_support_messages from public, anon, authenticated;
grant all on public.rosta_live_support_threads to service_role;
grant all on public.rosta_live_support_messages to service_role;
-- Only server-side getSupabaseAdmin/requireAdmin may access these tables.


-- Private customer chat attachments. Only the Ruth server's service-role may
-- create signed read links after checking customer token or admin auth.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rosta-live-support-private', 'rosta-live-support-private', false, 1572864,
        array['image/jpeg'])
on conflict (id) do update set
  public = false,
  file_size_limit = 1572864,
  allowed_mime_types = array['image/jpeg'];

-- Never add anonymous select/storage policies for support images.
