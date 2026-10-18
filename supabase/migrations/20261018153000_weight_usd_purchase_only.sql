-- Ruth weight x shared USD/gram price. ROSTA retains direct/coffee-only cost.
-- Execute on each brand's own SELF-HOST database. No hosted Supabase writes.
-- Past order snapshots NEVER change. Other expenses remain separate finance entries.
begin;
alter table public.finance_costs
  add column if not exists cost_method text not null default 'manual';
alter table public.finance_costs
  drop constraint if exists finance_costs_cost_method_check;
alter table public.finance_costs
  add constraint finance_costs_cost_method_check
  check(cost_method in ('manual','weight_usd','coffee_kg'));

create table if not exists public.finance_purchase_gram_rates (
  id uuid primary key default gen_random_uuid(),
  usd_per_gram numeric(18,6) not null check(usd_per_gram > 0 and usd_per_gram < 100000),
  effective_at timestamptz not null default clock_timestamp(),
  created_by uuid
);
create index if not exists finance_gram_rates_asof_idx
  on public.finance_purchase_gram_rates(effective_at desc);
create table if not exists public.finance_fx_usd_try (
  published_on date primary key,
  rate numeric(18,6) not null check(rate > 0 and rate < 10000),
  source text not null default 'TCMB-ForexSelling',
  effective_at timestamptz not null default clock_timestamp(),
  fetched_at timestamptz not null default clock_timestamp()
);
create index if not exists finance_fx_usd_asof_idx
  on public.finance_fx_usd_try(effective_at desc);

alter table public.finance_purchase_gram_rates enable row level security;
alter table public.finance_fx_usd_try enable row level security;
revoke all on public.finance_purchase_gram_rates,public.finance_fx_usd_try
  from public,anon,authenticated;
grant select,insert,update on public.finance_purchase_gram_rates,public.finance_fx_usd_try
  to service_role;

create or replace function public.finance_save_purchase_cost(
  p_data jsonb,p_actor uuid
)
returns jsonb language plpgsql security invoker set search_path=public as $fn$
declare
  product uuid;
  variant uuid;
  method text;
  brand text;
  grams_value numeric;
  purchase_value numeric;
  usd_g numeric;
  coffee_value numeric;
  previous_g numeric;
  record public.finance_costs;
begin
  if p_actor is null then raise exception 'Kullanıcı oturumu gerekli'; end if;
  product:=nullif(p_data->>'product_id','')::uuid;
  variant:=nullif(p_data->>'variant_id','')::uuid;
  if product is null or not exists(select 1 from public.products where id=product)
    then raise exception 'Ürün bulunamadı'; end if;
  if variant is not null and not exists (
    select 1 from public.product_variants v where v.id=variant and v.product_id=product
  ) then raise exception 'Varyant bu ürüne ait değil'; end if;
  select s.brand into brand from public.finance_settings s where s.id=true;
  method:=coalesce(nullif(p_data->>'cost_method',''),
    case when brand='rosta' and nullif(p_data->>'purchase','') is null
      then 'coffee_kg' else 'manual' end);
  if method not in ('manual','weight_usd','coffee_kg') then
    raise exception 'Geçersiz alış fiyatı yöntemi'; end if;
  if method='weight_usd' and brand<>'ruth' then
    raise exception 'USD/gram yöntemi yalnız Ruth için kullanılabilir'; end if;
  if method='coffee_kg' and brand<>'rosta' then
    raise exception 'Kahve kilogram yöntemi yalnız ROSTA için kullanılabilir'; end if;

  grams_value:=nullif(p_data->>'grams','')::numeric;
  purchase_value:=nullif(p_data->>'purchase','')::numeric;
  usd_g:=nullif(p_data->>'usd_per_gram','')::numeric;
  coffee_value:=nullif(p_data->>'coffee_per_kg','')::numeric;

  if method='manual' and (purchase_value is null or purchase_value<0 or purchase_value>999999999)
    then raise exception 'TL alış fiyatını gir'; end if;
  if method='weight_usd' and (grams_value is null or grams_value<=0 or grams_value>999999999)
    then raise exception 'Ürün gramajını gir'; end if;
  if method='coffee_kg' and
    (grams_value is null or grams_value<=0 or coffee_value is null or coffee_value<0)
    then raise exception 'Kahve gramajını ve TL/kg fiyatını gir'; end if;

  if method='weight_usd' then
    if usd_g is null or usd_g<=0 or usd_g>=100000 then
      raise exception 'Gram başına USD fiyatını gir'; end if;
    select g.usd_per_gram into previous_g
      from public.finance_purchase_gram_rates g
      order by g.effective_at desc,g.id desc limit 1;
    if previous_g is distinct from usd_g then
      insert into public.finance_purchase_gram_rates(usd_per_gram,created_by)
      values(usd_g,p_actor);
    end if;
    if not exists(select 1 from public.finance_fx_usd_try)
      then raise exception 'USD/TRY kuru bulunamadı. Önce kuru güncelle'; end if;
  end if;

  insert into public.finance_costs(
    product_id,variant_id,currency,cost_method,grams,purchase,coffee_per_kg,
    packaging,label,labor,other,created_by
  ) values (
    product,variant,'TRY',method,
    case when method='manual' then grams_value else grams_value end,
    case when method='manual' then purchase_value end,
    case when method='coffee_kg' then coffee_value end,
    0,0,0,0,p_actor
  ) returning * into record;
  return to_jsonb(record);
end;
$fn$;

-- Cost MUST be only the purchase price. Packing / postage / labour are
-- recorded separately as business expenses and must not increase unit cost.
create or replace function public.finance_unit_cost(
 p_product uuid,p_variant uuid default null,p_at timestamptz default now(),
 p_seen uuid[] default '{}',p_currency text default null
)
returns numeric language plpgsql stable security invoker set search_path=public as $fn$
declare
  c public.finance_costs;
  p jsonb; b jsonb;
  component numeric;
  total numeric:=0;
  latest_gram_usd numeric;
  latest_fx numeric;
  brand text;
begin
  if p_product=any(p_seen) or cardinality(p_seen)>10 then return null;end if;
  select * into c from public.finance_costs where product_id=p_product
    and (variant_id=p_variant or variant_id is null)
    and effective_at<=p_at
    order by (variant_id is not null) desc,effective_at desc,id desc limit 1;
  select to_jsonb(prod) into p from public.products prod where prod.id=p_product;
  if p is null then return null;end if;
  -- Finance is exclusively in TRY. Never mix a USD amount into order COGS.
  if upper(coalesce(p_currency,'TRY')) not in ('TRY','TL','TRL') then return null;end if;

  select brand into brand from public.finance_settings where id=true;
  if c.id is not null and c.currency<>'TRY' then return null;end if;

  if c.id is not null and c.cost_method='weight_usd' then
    select usd_per_gram into latest_gram_usd
      from public.finance_purchase_gram_rates
      where effective_at<=p_at order by effective_at desc,id desc limit 1;
    select rate into latest_fx from public.finance_fx_usd_try
      where effective_at<=p_at order by effective_at desc limit 1;
    if latest_gram_usd is null or latest_fx is null or c.grams is null then return null;end if;
    return round(c.grams*latest_gram_usd*latest_fx,4);
  end if;
  if c.purchase is not null then return round(c.purchase,4);end if;
  if c.id is not null and brand='rosta'
    and c.coffee_per_kg is not null and c.grams is not null then
    return round(c.coffee_per_kg*c.grams/1000,4);
  end if;
  if coalesce((p->>'is_bundle')::boolean,false) or p->>'product_type'='bundle' then
    if jsonb_typeof(p->'bundle_items') is distinct from 'array'
      or jsonb_array_length(p->'bundle_items')=0 then return null;end if;
    for b in select value from jsonb_array_elements(p->'bundle_items') loop
      component:=public.finance_unit_cost(
        (b->>'product_id')::uuid,nullif(b->>'variant_id','')::uuid,
        p_at,p_seen||p_product,'TRY');
      if component is null then return null;end if;
      total:=total+component*greatest(coalesce((b->>'quantity')::integer,1),1);
    end loop;
    return round(total,4);
  end if;
  return null;
exception when invalid_text_representation or numeric_value_out_of_range then return null;
end;
$fn$;

revoke all on function public.finance_save_purchase_cost(jsonb,uuid)
 from public,anon,authenticated;
grant execute on function public.finance_save_purchase_cost(jsonb,uuid)
 to service_role;
commit;
