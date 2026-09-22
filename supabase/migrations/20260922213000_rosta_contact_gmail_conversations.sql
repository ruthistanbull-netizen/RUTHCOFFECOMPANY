begin;

alter table public.contact_messages
  add column if not exists gmail_thread_id text,
  add column if not exists gmail_last_message_id text,
  add column if not exists gmail_synced_at timestamptz;

create index if not exists contact_messages_gmail_thread_idx
  on public.contact_messages(gmail_thread_id)
  where gmail_thread_id is not null;

create table if not exists public.contact_message_replies (
  id uuid primary key default gen_random_uuid(),
  contact_message_id uuid not null references public.contact_messages(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  provider text not null default 'gmail',
  provider_message_id text not null,
  provider_thread_id text,
  from_email text,
  to_email text,
  body text not null,
  sent_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique(provider, provider_message_id)
);

create index if not exists contact_message_replies_contact_sent_idx
  on public.contact_message_replies(contact_message_id, sent_at asc);

alter table public.contact_message_replies enable row level security;
revoke all on public.contact_message_replies from anon, authenticated;
grant all on public.contact_message_replies to service_role;
grant all on public.contact_messages to service_role;

notify pgrst, 'reload schema';
commit;
