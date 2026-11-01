-- Apply only to the selected brand's self-hosted DB after staging verification.
-- Service-only RPC; private definer is never an exposed PostgREST function.
begin;
create schema if not exists panel_private;
revoke all on schema panel_private from public, anon, authenticated;
grant usage on schema panel_private to service_role;

create or replace function panel_private.delete_own_panel_account(p_auth_user_id uuid, p_profile_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  principal uuid;
  relation record;
  linked boolean;
  target uuid;
  personal_tables constant text[] := array[
    'customer_addresses', 'ruthie_point_transactions',
    'ruthie_memories', 'ruthie_messages', 'ruthie_conversations',
    'ruthie_voice_samples', 'ruthie_voice_profiles', 'ruthie_voice_match_events',
    'admin_push_subscriptions', 'account_deletion_requests'
  ];
begin
  if p_auth_user_id is null or p_profile_id is null then raise exception 'ACCOUNT_SUBJECT_REQUIRED'; end if;
  principal := auth.uid();
  if principal is not null and principal <> p_auth_user_id then raise exception 'ACCOUNT_SUBJECT_MISMATCH'; end if;
  -- Locks serialize deletion/profile-role changes for this identity.
  perform 1 from auth.users where id = p_auth_user_id for update;
  if not found then raise exception 'ACCOUNT_NOT_FOUND'; end if;
  perform 1 from public.profiles where id = p_profile_id and auth_user_id = p_auth_user_id and role = 'admin' for update;
  if not found then raise exception 'ACCOUNT_SUBJECT_MISMATCH'; end if;
  -- Auth identity must not share a second legacy profile.
  if exists(select 1 from public.profiles where auth_user_id = p_auth_user_id and id <> p_profile_id) then
    raise exception 'ACCOUNT_RELATIONS_REVIEW_REQUIRED';
  end if;

  -- Never silently cascade-delete an unreviewed operational table. Unknown
  -- relationships fail before deletion and the entire transaction rolls back.
  for relation in
    select n.nspname, c.relname, a.attname, fk.confrelid, fk.confdeltype, fk.conkey
    from pg_catalog.pg_constraint fk
    join pg_catalog.pg_class c on c.oid = fk.conrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attnum = fk.conkey[1]
    where fk.contype = 'f' and fk.confrelid in ('public.profiles'::regclass, 'auth.users'::regclass)
      and n.nspname <> 'auth'
  loop
    if cardinality(relation.conkey) <> 1 then raise exception 'ACCOUNT_RELATIONS_REVIEW_REQUIRED'; end if;
    target := case when relation.confrelid = 'public.profiles'::regclass then p_profile_id else p_auth_user_id end;
    execute format('select exists(select 1 from %I.%I where %I = $1)', relation.nspname, relation.relname, relation.attname)
      into linked using target;
    if linked and relation.confdeltype <> 'n' and not (
      relation.nspname = 'public' and relation.relname = any(personal_tables)
    ) and not (relation.nspname = 'public' and relation.relname = 'profiles' and relation.attname = 'auth_user_id') then
      raise exception 'ACCOUNT_RELATIONS_REVIEW_REQUIRED';
    end if;
  end loop;

  -- Storage metadata must not be deleted via SQL; object bytes require the
  -- Storage API. Current panel uploads use service ownership. If this identity
  -- owns objects, require reviewed Storage cleanup first, without touching data.
  if to_regclass('storage.objects') is not null then
    execute 'select exists(select 1 from storage.objects where coalesce(nullif(to_jsonb(objects)->>''owner_id'', ''''), to_jsonb(objects)->>''owner'') = $1)'
      into linked using p_auth_user_id::text;
    if linked then raise exception 'ACCOUNT_STORAGE_REVIEW_REQUIRED'; end if;
  end if;

  -- Remove personal records even where their FK uses SET NULL. Unknown table
  -- names are never swept by a broad ownership/name heuristic.
  for relation in
    select n.nspname, c.relname, a.attname
    from pg_catalog.pg_constraint fk
    join pg_catalog.pg_class c on c.oid = fk.conrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attnum = fk.conkey[1]
    where fk.contype = 'f' and fk.confrelid = 'public.profiles'::regclass
      and n.nspname = 'public' and c.relname = any(personal_tables)
      -- Point ledger rows belonging to other people stay, with actor SET NULL.
      and not (c.relname = 'ruthie_point_transactions' and a.attname = 'admin_profile_id')
  loop
    execute format('delete from %I.%I where %I = $1', relation.nspname, relation.relname, relation.attname) using p_profile_id;
  end loop;
  delete from public.profiles where id = p_profile_id and auth_user_id = p_auth_user_id;
  -- Also remove legacy refresh tokens with no session_id: those do not have
  -- the modern session FK cascade. Never leave renewable credentials behind.
  if to_regclass('auth.refresh_tokens') is not null then
    execute 'delete from auth.refresh_tokens where user_id::text = $1' using p_auth_user_id::text;
  end if;
  delete from auth.sessions where user_id = p_auth_user_id;
  -- Supabase Auth-owned FK cascades remove sessions, refresh tokens, MFA and
  -- identities. Existing access JWTs are rejected by the live requireAdmin.
  delete from auth.users where id = p_auth_user_id;
  if exists(select 1 from auth.users where id = p_auth_user_id)
     or exists(select 1 from public.profiles where id = p_profile_id) then raise exception 'ACCOUNT_DELETE_INCOMPLETE'; end if;
  return jsonb_build_object('deleted', true);
end;
$$;
revoke all on function panel_private.delete_own_panel_account(uuid, uuid) from public, anon, authenticated;
grant execute on function panel_private.delete_own_panel_account(uuid, uuid) to service_role;

create or replace function public.delete_own_panel_account(p_auth_user_id uuid, p_profile_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select panel_private.delete_own_panel_account(p_auth_user_id, p_profile_id);
$$;
revoke all on function public.delete_own_panel_account(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_own_panel_account(uuid, uuid) to service_role;
commit;
