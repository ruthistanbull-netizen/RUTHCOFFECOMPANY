begin;

create extension if not exists pgcrypto;

create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  status text not null default 'subscribed' check (status in ('subscribed', 'unsubscribed')),
  consent_granted boolean not null default true check (consent_granted = true),
  consent_copy text not null,
  consent_at timestamptz not null default now(),
  source text not null default 'store-design-newsletter',
  source_section_id text,
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists newsletter_subscribers_status_idx
  on public.newsletter_subscribers(status, updated_at desc);

create table if not exists public.storefront_form_submissions (
  id uuid primary key default gen_random_uuid(),
  section_id text not null,
  action text not null default 'store' check (action = 'store'),
  payload jsonb not null default '{}'::jsonb,
  schema_snapshot jsonb not null default '[]'::jsonb,
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists storefront_form_submissions_section_created_idx
  on public.storefront_form_submissions(section_id, created_at desc);

create table if not exists public.storefront_public_submission_attempts (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('newsletter', 'custom-form')),
  ip_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists storefront_public_submission_attempts_rate_idx
  on public.storefront_public_submission_attempts(kind, ip_hash, created_at desc);

alter table public.newsletter_subscribers enable row level security;
alter table public.storefront_form_submissions enable row level security;
alter table public.storefront_public_submission_attempts enable row level security;

revoke all on public.newsletter_subscribers from anon, authenticated;
revoke all on public.storefront_form_submissions from anon, authenticated;
revoke all on public.storefront_public_submission_attempts from anon, authenticated;

grant all on public.newsletter_subscribers to service_role;
grant all on public.storefront_form_submissions to service_role;
grant all on public.storefront_public_submission_attempts to service_role;
grant usage, select on sequence public.storefront_public_submission_attempts_id_seq to service_role;

notify pgrst, 'reload schema';

commit;
