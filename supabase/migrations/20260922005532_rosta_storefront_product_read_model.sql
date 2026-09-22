begin;

-- Customer-facing catalog reads come from this projection. Product/relation writes
-- refresh only the affected product, so storefront requests never rebuild joins.
create table if not exists public.storefront_product_read_models (
  product_id uuid primary key references public.products(id) on delete cascade,
  slug text not null,
  status text not null,
  sort_order numeric null,
  name text not null,
  payload jsonb not null,
  refreshed_at timestamptz not null default now()
);

create index if not exists storefront_product_read_models_active_slug_idx
  on public.storefront_product_read_models (status, slug);
create index if not exists storefront_product_read_models_active_order_idx
  on public.storefront_product_read_models (status, sort_order, lower(name), product_id);
create index if not exists products_storefront_active_slug_idx
  on public.products (status, slug);
create index if not exists products_storefront_active_order_idx
  on public.products (status, sort_order, lower(name), id);
create index if not exists product_images_storefront_product_idx
  on public.product_images (product_id, is_main desc, sort_order, id);
create index if not exists product_variants_storefront_product_idx
  on public.product_variants (product_id, is_active, sort_order, id);
create index if not exists product_categories_storefront_product_idx
  on public.product_categories (product_id, category_id);
create index if not exists product_collections_storefront_product_idx
  on public.product_collections (product_id, collection_id);

create or replace function public.refresh_storefront_product_read_model(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_product public.products%rowtype;
  v_images jsonb := '[]'::jsonb;
  v_main_image text;
  v_variants jsonb := '[]'::jsonb;
  v_category_ids jsonb := '[]'::jsonb;
  v_category_names jsonb := '[]'::jsonb;
  v_category_slugs jsonb := '[]'::jsonb;
  v_collection_ids jsonb := '[]'::jsonb;
  v_collection_slugs jsonb := '[]'::jsonb;
  v_primary_collection jsonb := null;
  v_has_variants boolean := false;
  v_has_stock boolean := false;
  v_payload jsonb;
begin
  select * into v_product from public.products where id = p_product_id;
  if not found then
    delete from public.storefront_product_read_models where product_id = p_product_id;
    return;
  end if;

  select
    coalesce(jsonb_agg(i.image_url order by i.is_main desc nulls last, i.sort_order asc nulls last, i.id), '[]'::jsonb),
    (array_agg(i.image_url order by i.is_main desc nulls last, i.sort_order asc nulls last, i.id))[1]
  into v_images, v_main_image
  from public.product_images i
  where i.product_id = p_product_id
    and nullif(trim(coalesce(i.image_url, '')), '') is not null;

  select
    coalesce(jsonb_agg(
      (to_jsonb(v) - 'product_id') || jsonb_build_object(
        'image_url', coalesce(v.image_url, (
          select i.image_url from public.product_images i
          where i.product_id = p_product_id and i.variant_id = v.id
            and nullif(trim(coalesce(i.image_url, '')), '') is not null
          order by i.is_main desc nulls last, i.sort_order asc nulls last, i.id limit 1
        ))
      )
      order by v.sort_order asc nulls last, v.option_summary asc nulls last, v.id
    ) filter (where v.is_active is distinct from false), '[]'::jsonb),
    coalesce(bool_or(v.is_active is distinct from false), false),
    coalesce(bool_or(
      v.is_active is distinct from false and coalesce(v.stock, 0) > 0
      and coalesce(v.stock_status, 'in_stock') <> 'out_of_stock'
    ), false)
  into v_variants, v_has_variants, v_has_stock
  from public.product_variants v where v.product_id = p_product_id;

  select
    coalesce(jsonb_agg(x.id order by x.name, x.id), '[]'::jsonb),
    coalesce(jsonb_agg(x.name order by x.name, x.id), '[]'::jsonb),
    coalesce(jsonb_agg(x.slug order by x.name, x.id), '[]'::jsonb)
  into v_category_ids, v_category_names, v_category_slugs
  from (
    select distinct c.id, c.name, c.slug
    from public.product_categories pc
    join public.categories c on c.id = pc.category_id
    where pc.product_id = p_product_id
  ) x;

  select
    coalesce(jsonb_agg(x.id order by x.priority, x.name, x.id), '[]'::jsonb),
    coalesce(jsonb_agg(x.slug order by x.priority, x.name, x.id), '[]'::jsonb)
  into v_collection_ids, v_collection_slugs
  from (
    select distinct c.id, c.name, c.slug,
      case when c.id = v_product.collection_id then 0 else 1 end as priority
    from public.collections c
    where c.id = v_product.collection_id
       or exists (
         select 1 from public.product_collections pc
         where pc.product_id = p_product_id and pc.collection_id = c.id
       )
  ) x;

  select jsonb_build_object(
    'id', c.id, 'name', c.name, 'slug', c.slug,
    'description', c.description, 'cover_image_url', c.cover_image_url
  ) into v_primary_collection
  from public.collections c
  where c.id = v_product.collection_id
     or exists (
       select 1 from public.product_collections pc
       where pc.product_id = p_product_id and pc.collection_id = c.id
     )
  order by case when c.id = v_product.collection_id then 0 else 1 end,
           c.sort_order asc nulls last, c.name asc, c.id
  limit 1;

  v_payload := to_jsonb(v_product) || jsonb_build_object(
    'main_image_url', coalesce(v_product.main_image_url, v_main_image),
    'image_urls', v_images,
    'variants', v_variants,
    'category_ids', v_category_ids,
    'category_names', v_category_names,
    'category_slugs', v_category_slugs,
    'collection_ids', v_collection_ids,
    'collection_slugs', v_collection_slugs,
    'collections', v_primary_collection,
    'stock_status', case
      when v_has_variants then case when v_has_stock then 'in_stock' else 'out_of_stock' end
      else v_product.stock_status
    end
  );

  insert into public.storefront_product_read_models
    (product_id, slug, status, sort_order, name, payload, refreshed_at)
  values
    (v_product.id, v_product.slug, v_product.status, v_product.sort_order, v_product.name, v_payload, now())
  on conflict (product_id) do update
  set slug = excluded.slug,
      status = excluded.status,
      sort_order = excluded.sort_order,
      name = excluded.name,
      payload = excluded.payload,
      refreshed_at = excluded.refreshed_at;
end;
$$;

create or replace function public.storefront_refresh_product_trigger()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  if tg_op = 'DELETE' then
    delete from public.storefront_product_read_models where product_id = old.id;
    return old;
  end if;
  perform public.refresh_storefront_product_read_model(new.id);
  return new;
end;
$$;

create or replace function public.storefront_refresh_product_relation_trigger()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_old uuid;
  v_new uuid;
begin
  if tg_op <> 'INSERT' then v_old := old.product_id; end if;
  if tg_op <> 'DELETE' then v_new := new.product_id; end if;
  if v_old is not null then perform public.refresh_storefront_product_read_model(v_old); end if;
  if v_new is not null and v_new is distinct from v_old then
    perform public.refresh_storefront_product_read_model(v_new);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.storefront_refresh_category_products_trigger()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_id uuid;
  v_product_id uuid;
begin
  if tg_op = 'DELETE' then v_id := old.id; else v_id := new.id; end if;
  for v_product_id in
    select pc.product_id from public.product_categories pc where pc.category_id = v_id
  loop
    perform public.refresh_storefront_product_read_model(v_product_id);
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.storefront_refresh_collection_products_trigger()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_id uuid;
  v_product_id uuid;
begin
  if tg_op = 'DELETE' then v_id := old.id; else v_id := new.id; end if;
  for v_product_id in
    select distinct p.id from public.products p
    where p.collection_id = v_id
       or exists (
         select 1 from public.product_collections pc
         where pc.product_id = p.id and pc.collection_id = v_id
       )
  loop
    perform public.refresh_storefront_product_read_model(v_product_id);
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists storefront_products_read_model_refresh on public.products;
create trigger storefront_products_read_model_refresh after insert or update or delete on public.products
for each row execute function public.storefront_refresh_product_trigger();

drop trigger if exists storefront_product_images_read_model_refresh on public.product_images;
create trigger storefront_product_images_read_model_refresh after insert or update or delete on public.product_images
for each row execute function public.storefront_refresh_product_relation_trigger();

drop trigger if exists storefront_product_variants_read_model_refresh on public.product_variants;
create trigger storefront_product_variants_read_model_refresh after insert or update or delete on public.product_variants
for each row execute function public.storefront_refresh_product_relation_trigger();

drop trigger if exists storefront_product_categories_read_model_refresh on public.product_categories;
create trigger storefront_product_categories_read_model_refresh after insert or update or delete on public.product_categories
for each row execute function public.storefront_refresh_product_relation_trigger();

drop trigger if exists storefront_product_collections_read_model_refresh on public.product_collections;
create trigger storefront_product_collections_read_model_refresh after insert or update or delete on public.product_collections
for each row execute function public.storefront_refresh_product_relation_trigger();

drop trigger if exists storefront_categories_read_model_refresh on public.categories;
create trigger storefront_categories_read_model_refresh after update of name, slug on public.categories
for each row execute function public.storefront_refresh_category_products_trigger();

drop trigger if exists storefront_collections_read_model_refresh on public.collections;
create trigger storefront_collections_read_model_refresh
after update of name, slug, description, cover_image_url, sort_order on public.collections
for each row execute function public.storefront_refresh_collection_products_trigger();

create or replace function public.get_storefront_catalog()
returns jsonb language sql stable security definer set search_path = public, pg_catalog as $$
  select coalesce(
    jsonb_agg(r.payload order by r.sort_order asc nulls last, lower(r.name), r.product_id),
    '[]'::jsonb
  )
  from public.storefront_product_read_models r
  where r.status = 'active';
$$;

create or replace function public.get_storefront_product_window(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare
  v_current public.storefront_product_read_models%rowtype;
  v_previous jsonb;
  v_next jsonb;
begin
  select * into v_current from public.storefront_product_read_models
  where status = 'active' and slug = p_slug
  order by sort_order asc nulls last, lower(name), product_id
  limit 1;

  if not found then
    return jsonb_build_object('previous', null, 'current', null, 'next', null, 'source', 'live');
  end if;

  select r.payload into v_previous from public.storefront_product_read_models r
  where r.status = 'active' and r.product_id <> v_current.product_id
    and row(coalesce(r.sort_order, 9223372036854775807::numeric), lower(r.name), r.product_id::text)
      < row(coalesce(v_current.sort_order, 9223372036854775807::numeric), lower(v_current.name), v_current.product_id::text)
  order by r.sort_order desc nulls first, lower(r.name) desc, r.product_id desc limit 1;

  if v_previous is null then
    select r.payload into v_previous from public.storefront_product_read_models r
    where r.status = 'active' and r.product_id <> v_current.product_id
    order by r.sort_order desc nulls first, lower(r.name) desc, r.product_id desc limit 1;
  end if;

  select r.payload into v_next from public.storefront_product_read_models r
  where r.status = 'active' and r.product_id <> v_current.product_id
    and row(coalesce(r.sort_order, 9223372036854775807::numeric), lower(r.name), r.product_id::text)
      > row(coalesce(v_current.sort_order, 9223372036854775807::numeric), lower(v_current.name), v_current.product_id::text)
  order by r.sort_order asc nulls last, lower(r.name) asc, r.product_id asc limit 1;

  if v_next is null then
    select r.payload into v_next from public.storefront_product_read_models r
    where r.status = 'active' and r.product_id <> v_current.product_id
    order by r.sort_order asc nulls last, lower(r.name) asc, r.product_id asc limit 1;
  end if;

  return jsonb_build_object('previous', v_previous, 'current', v_current.payload, 'next', v_next, 'source', 'live');
end;
$$;

revoke all on function public.refresh_storefront_product_read_model(uuid) from public, anon, authenticated;
revoke all on function public.get_storefront_catalog() from public, anon, authenticated;
revoke all on function public.get_storefront_product_window(text) from public, anon, authenticated;
grant execute on function public.refresh_storefront_product_read_model(uuid) to service_role;
grant execute on function public.get_storefront_catalog() to service_role;
grant execute on function public.get_storefront_product_window(text) to service_role;

do $$
declare v_product_id uuid;
begin
  for v_product_id in select id from public.products loop
    perform public.refresh_storefront_product_read_model(v_product_id);
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;
