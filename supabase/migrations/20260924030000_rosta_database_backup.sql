begin;

create or replace function public.rosta_backup_manifest()
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $$
  with tables as (
    select
      n.nspname as schema_name,
      c.relname as table_name,
      greatest(0, c.reltuples::bigint) as estimated_rows
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'auth', 'storage')
      and c.relkind = 'r'
    order by n.nspname, c.relname
  ),
  columns as (
    select
      n.nspname as schema_name,
      c.relname as table_name,
      a.attnum as ordinal_position,
      a.attname as column_name,
      pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type,
      a.attnotnull as not_null
    from pg_catalog.pg_attribute a
    join pg_catalog.pg_class c on c.oid = a.attrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'auth', 'storage')
      and c.relkind = 'r'
      and a.attnum > 0
      and not a.attisdropped
    order by n.nspname, c.relname, a.attnum
  )
  select jsonb_build_object(
    'generated_at', now(),
    'database', current_database(),
    'schemas', jsonb_build_array('public', 'auth', 'storage'),
    'tables', coalesce((select jsonb_agg(to_jsonb(t)) from tables t), '[]'::jsonb),
    'columns', coalesce((select jsonb_agg(to_jsonb(c)) from columns c), '[]'::jsonb)
  );
$$;

create or replace function public.rosta_backup_table_chunk(
  p_schema text,
  p_table text,
  p_offset integer default 0,
  p_limit integer default 1000
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  result jsonb;
  safe_offset integer := greatest(0, coalesce(p_offset, 0));
  safe_limit integer := least(5000, greatest(1, coalesce(p_limit, 1000)));
begin
  if p_schema not in ('public', 'auth', 'storage') then
    raise exception 'Backup schema is not allowed.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = p_schema
      and c.relname = p_table
      and c.relkind = 'r'
  ) then
    raise exception 'Backup table does not exist: %.%', p_schema, p_table;
  end if;

  execute format(
    'select coalesce(jsonb_agg(to_jsonb(source_row)), ''[]''::jsonb) from (select * from %I.%I order by ctid offset %s limit %s) source_row',
    p_schema,
    p_table,
    safe_offset,
    safe_limit
  ) into result;

  return coalesce(result, '[]'::jsonb);
end;
$$;

revoke all on function public.rosta_backup_manifest() from public, anon, authenticated;
revoke all on function public.rosta_backup_table_chunk(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.rosta_backup_manifest() to service_role;
grant execute on function public.rosta_backup_table_chunk(text, text, integer, integer) to service_role;

comment on function public.rosta_backup_manifest() is
  'Admin service-role manifest for downloadable ROSTA Supabase data backups.';
comment on function public.rosta_backup_table_chunk(text, text, integer, integer) is
  'Admin service-role chunk reader for downloadable ROSTA Supabase data backups.';

commit;
