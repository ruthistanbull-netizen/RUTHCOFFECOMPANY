-- ROSTA Insight durable agent memory + voice personalization runtime.
-- Internal table names are retained for code compatibility only.
-- No Ruth production data or hardcoded administrator identities are copied.

create extension if not exists pgcrypto;

create table if not exists public.ruthie_conversations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'Yeni sohbet',
  last_surface text not null default 'chat' check (last_surface in ('chat','voice')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ruthie_conversations_title_length check (char_length(title) between 1 and 160)
);
create index if not exists ruthie_conversations_profile_updated_idx
  on public.ruthie_conversations(profile_id, updated_at desc);

create table if not exists public.ruthie_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ruthie_conversations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  surface text not null check (surface in ('chat','voice')),
  content text not null,
  client_message_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint ruthie_messages_content_length check (char_length(content) between 1 and 24000),
  constraint ruthie_messages_client_id_length check (char_length(client_message_id) between 1 and 180),
  unique (conversation_id, client_message_id)
);
create index if not exists ruthie_messages_conversation_created_idx
  on public.ruthie_messages(conversation_id, created_at asc);
create index if not exists ruthie_messages_profile_created_idx
  on public.ruthie_messages(profile_id, created_at desc);

create table if not exists public.ruthie_memories (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  content_hash text not null,
  source_conversation_id uuid references public.ruthie_conversations(id) on delete set null,
  source_message_id uuid references public.ruthie_messages(id) on delete set null,
  source_surface text not null check (source_surface in ('chat','voice')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ruthie_memories_content_length check (char_length(content) between 1 and 2000),
  unique (profile_id, content_hash)
);
create index if not exists ruthie_memories_profile_active_idx
  on public.ruthie_memories(profile_id, is_active, updated_at desc);
create index if not exists ruthie_memories_source_conversation_id_idx
  on public.ruthie_memories(source_conversation_id)
  where source_conversation_id is not null;
create index if not exists ruthie_memories_source_message_id_idx
  on public.ruthie_memories(source_message_id)
  where source_message_id is not null;

create table if not exists public.ruthie_voice_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  analysis_enabled boolean not null default true,
  learning_enabled boolean not null default true,
  completion_percent smallint not null default 0 check (completion_percent between 0 and 100),
  status text not null default 'collecting' check (status in ('collecting','ready','paused','reset_required')),
  sample_count integer not null default 0 check (sample_count >= 0),
  total_duration_seconds numeric(12,2) not null default 0 check (total_duration_seconds >= 0),
  device_count integer not null default 0 check (device_count >= 0),
  clean_duration_seconds numeric(12,2) not null default 0 check (clean_duration_seconds >= 0),
  speech_rate_average numeric(8,2),
  pitch_average_hz numeric(8,2),
  accent_summary jsonb not null default '{}'::jsonb,
  consent_at timestamptz,
  last_analyzed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  voiceprint jsonb not null default '{}'::jsonb,
  voiceprint_version text not null default 'acoustic-v1',
  last_match_confidence numeric(5,2),
  last_matched_profile_id uuid references public.profiles(id) on delete set null,
  last_device_hash text,
  last_quality_score numeric(5,2),
  last_speech_rate numeric(8,2),
  last_pitch_hz numeric(8,2)
);
create index if not exists ruthie_voice_profiles_last_match_idx
  on public.ruthie_voice_profiles(last_matched_profile_id, updated_at desc);

create table if not exists public.ruthie_voice_samples (
  id uuid primary key default gen_random_uuid(),
  voice_profile_id uuid not null references public.ruthie_voice_profiles(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  surface text not null default 'voice' check (surface in ('voice','chat_voice','enrollment')),
  duration_seconds numeric(10,2) not null default 0 check (duration_seconds >= 0),
  quality_score numeric(5,2) check (quality_score between 0 and 100),
  speech_rate numeric(8,2),
  pitch_mean_hz numeric(8,2),
  pitch_std_hz numeric(8,2),
  energy_mean numeric(10,6),
  noise_score numeric(5,2) check (noise_score between 0 and 100),
  device_hash text,
  feature_payload jsonb not null default '{}'::jsonb,
  embedding_ciphertext bytea,
  accepted_for_learning boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists ruthie_voice_samples_profile_created_idx
  on public.ruthie_voice_samples(voice_profile_id, created_at desc);
create index if not exists ruthie_voice_samples_owner_created_idx
  on public.ruthie_voice_samples(profile_id, created_at desc);

create table if not exists public.ruthie_voice_match_events (
  id uuid primary key default gen_random_uuid(),
  expected_profile_id uuid references public.profiles(id) on delete set null,
  matched_profile_id uuid references public.profiles(id) on delete set null,
  confidence numeric(5,2) check (confidence between 0 and 100),
  decision text not null check (decision in ('matched','uncertain','rejected','disabled')),
  device_hash text,
  created_at timestamptz not null default now()
);
create index if not exists ruthie_voice_match_events_created_idx
  on public.ruthie_voice_match_events(created_at desc);
create index if not exists ruthie_voice_match_events_expected_idx
  on public.ruthie_voice_match_events(expected_profile_id, created_at desc)
  where expected_profile_id is not null;
create index if not exists ruthie_voice_match_events_matched_idx
  on public.ruthie_voice_match_events(matched_profile_id, created_at desc)
  where matched_profile_id is not null;

alter table public.ruthie_conversations enable row level security;
alter table public.ruthie_messages enable row level security;
alter table public.ruthie_memories enable row level security;
alter table public.ruthie_voice_profiles enable row level security;
alter table public.ruthie_voice_samples enable row level security;
alter table public.ruthie_voice_match_events enable row level security;

revoke all privileges on table public.ruthie_conversations from public, anon, authenticated;
revoke all privileges on table public.ruthie_messages from public, anon, authenticated;
revoke all privileges on table public.ruthie_memories from public, anon, authenticated;
revoke all privileges on table public.ruthie_voice_profiles from public, anon, authenticated;
revoke all privileges on table public.ruthie_voice_samples from public, anon, authenticated;
revoke all privileges on table public.ruthie_voice_match_events from public, anon, authenticated;

grant select,insert,update,delete on table public.ruthie_conversations to service_role;
grant select,insert,update,delete on table public.ruthie_messages to service_role;
grant select,insert,update,delete on table public.ruthie_memories to service_role;
grant select,insert,update,delete on table public.ruthie_voice_profiles to service_role;
grant select,insert,update,delete on table public.ruthie_voice_samples to service_role;
grant select,insert,update,delete on table public.ruthie_voice_match_events to service_role;

comment on table public.ruthie_conversations is 'ROSTA Insight durable conversations shared by chat and voice.';
comment on table public.ruthie_messages is 'ROSTA Insight durable cross-surface transcript.';
comment on table public.ruthie_memories is 'ROSTA Insight explicit per-admin memories and instructions.';
comment on column public.ruthie_voice_profiles.voiceprint is 'Derived acoustic features for ROSTA Insight personalization; raw audio is not stored here.';
comment on column public.ruthie_voice_profiles.last_match_confidence is 'Personalization confidence only; never grants authentication or authorization.';
