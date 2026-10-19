begin;
create table public.watch_rooms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  title text not null check (char_length(title) between 1 and 80),
  invite_hash text not null check (char_length(invite_hash) = 64),
  source_url text not null check (char_length(source_url) <= 3000),
  source_kind text not null check (source_kind in ('youtube','video','website')),
  playing boolean not null default false,
  position double precision not null default 0 check (position >= 0 and position <= 604800),
  playback_at timestamptz not null default now(),
  revision integer not null default 0 check (revision >= 0),
  sharing_member uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  closed_at timestamptz
);
create index watch_rooms_owner on public.watch_rooms(owner_id,created_at desc);
create index watch_rooms_expiry on public.watch_rooms(expires_at);
create table public.watch_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.watch_rooms(id) on delete cascade,
  token_hash text not null unique check (char_length(token_hash) = 64),
  name text not null check (char_length(name) between 1 and 40),
  role text not null check (role in ('host','guest')),
  last_seen timestamptz not null default now(),
  joined_at timestamptz not null default now(),
  unique (room_id,id)
);
create index watch_members_presence on public.watch_members(room_id,last_seen);
create table public.watch_events (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.watch_rooms(id) on delete cascade,
  sender_id uuid not null,
  recipient_id uuid,
  kind text not null check (kind in ('chat','offer','answer','ice','ready')),
  body jsonb not null check (octet_length(body::text) <= 65000),
  created_at timestamptz not null default now(),
  foreign key (room_id,sender_id) references public.watch_members(room_id,id) on delete cascade,
  foreign key (room_id,recipient_id) references public.watch_members(room_id,id) on delete cascade,
  check ((kind = 'chat' and recipient_id is null) or (kind <> 'chat' and recipient_id is not null))
);
create index watch_events_room_cursor on public.watch_events(room_id,id);
create index watch_events_sender_rate on public.watch_events(sender_id,created_at);
alter table public.watch_rooms enable row level security;
alter table public.watch_members enable row level security;
alter table public.watch_events enable row level security;
revoke all on public.watch_rooms, public.watch_members, public.watch_events from public, anon, authenticated;
revoke all on sequence public.watch_events_id_seq from public, anon, authenticated;
grant select,insert,update,delete on public.watch_rooms, public.watch_members, public.watch_events to service_role;
grant usage,select on sequence public.watch_events_id_seq to service_role;
-- No client policies: only the server's room-token API can read/write these tables.
-- Serialize joins for each room so concurrent requests cannot exceed capacity.
create function public.watch_member_capacity() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.watch_rooms where id = new.room_id for update;
  if new.last_seen > now() - interval '45 seconds'
    and (select count(*) from public.watch_members where room_id = new.room_id and id <> new.id and last_seen > now() - interval '45 seconds') >= 8 then
    raise exception 'watch_room_full';
  end if;
  return new;
end;
$$;
revoke all on function public.watch_member_capacity() from public, anon, authenticated;
grant execute on function public.watch_member_capacity() to service_role;
create trigger watch_members_capacity before insert or update of last_seen on public.watch_members for each row execute function public.watch_member_capacity();
notify pgrst, 'reload schema';
commit;
