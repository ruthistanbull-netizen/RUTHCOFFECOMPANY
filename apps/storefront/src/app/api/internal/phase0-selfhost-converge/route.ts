import { NextResponse } from "next/server";
import { normalizeSupabaseUrl } from "@/lib/supabaseRuntime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ACCESS_KEY = "IWAJk6ntnZVF3csMkAgMIl3EYatpCXVvNqiN0UQljsg";

const SQL = String.raw`
begin;
select pg_advisory_xact_lock(hashtextextended('ruth-commerce:phase0:selfhost-schema-contract', 0));

do $$
begin
  if to_regprocedure('public.merge_customer_records(uuid,uuid,text)') is null then
    raise exception 'Phase 0 reconciliation requires public.merge_customer_records(uuid,uuid,text).';
  end if;
end $$;

do $$
declare
  v_identity_type text;
  v_normalized_value text;
  v_keep_customer_id uuid;
  v_merge_customer_id uuid;
begin
  loop
    v_identity_type := null;
    v_normalized_value := null;
    v_keep_customer_id := null;
    v_merge_customer_id := null;

    select ci.identity_type, ci.normalized_value
      into v_identity_type, v_normalized_value
    from public.customer_identities ci
    where ci.identity_type in ('email', 'phone')
    group by ci.identity_type, ci.normalized_value
    having count(distinct ci.customer_id) > 1
    order by ci.identity_type, ci.normalized_value
    limit 1;

    exit when v_identity_type is null;

    select c.id into v_keep_customer_id
    from public.customer_identities ci
    join public.customers c on c.id = ci.customer_id
    where ci.identity_type = v_identity_type
      and ci.normalized_value = v_normalized_value
    order by c.created_at asc, c.id asc
    limit 1;

    select c.id into v_merge_customer_id
    from public.customer_identities ci
    join public.customers c on c.id = ci.customer_id
    where ci.identity_type = v_identity_type
      and ci.normalized_value = v_normalized_value
      and c.id <> v_keep_customer_id
    order by c.created_at asc, c.id asc
    limit 1;

    perform public.merge_customer_records(
      v_keep_customer_id,
      v_merge_customer_id,
      'phase0_schema_contract_' || v_identity_type || '_union'
    );
  end loop;
end $$;

do $$
declare
  v_collision text;
begin
  select ci.identity_type || ':' || ci.normalized_value
    into v_collision
  from public.customer_identities ci
  where ci.identity_type in ('profile', 'email', 'phone')
  group by ci.identity_type, ci.normalized_value
  having count(*) > 1 or count(distinct ci.customer_id) > 1
  order by ci.identity_type, ci.normalized_value
  limit 1;

  if v_collision is not null then
    raise exception 'Customer identity collision remains after canonical merge: %', v_collision;
  end if;
end $$;

drop index if exists public.customer_identities_phone_lookup_idx;
create unique index if not exists customer_identities_profile_unique_idx
  on public.customer_identities (normalized_value)
  where identity_type = 'profile';
create unique index if not exists customer_identities_email_unique_idx
  on public.customer_identities (normalized_value)
  where identity_type = 'email';
create unique index if not exists customer_identities_phone_unique_idx
  on public.customer_identities (normalized_value)
  where identity_type = 'phone';

do $$
begin
  if exists (
    select 1 from public.profiles
    where auth_user_id is not null
    group by auth_user_id having count(*) > 1
  ) then
    raise exception 'Duplicate profiles.auth_user_id values block canonical unique contract.';
  end if;

  if exists (
    select 1 from public.orders
    where order_no is not null
    group by order_no having count(*) > 1
  ) then
    raise exception 'Duplicate orders.order_no values block canonical unique contract.';
  end if;

  if exists (
    select 1 from public.checkout_drafts
    where merchant_oid is not null
    group by merchant_oid having count(*) > 1
  ) then
    raise exception 'Duplicate checkout_drafts.merchant_oid values block canonical unique contract.';
  end if;

  if exists (
    select 1 from public.inventory_items
    group by variant_id having count(*) > 1
  ) then
    raise exception 'Duplicate inventory_items.variant_id values block canonical unique contract.';
  end if;
end $$;

create unique index if not exists profiles_auth_user_id_key
  on public.profiles (auth_user_id);
create unique index if not exists orders_order_no_key
  on public.orders (order_no);
create unique index if not exists checkout_drafts_merchant_oid_key
  on public.checkout_drafts (merchant_oid);
create unique index if not exists inventory_items_variant_id_key
  on public.inventory_items (variant_id);

insert into public.inventory_items (variant_id, sku, on_hand)
select pv.id, pv.sku, greatest(coalesce(pv.stock, 0), 0)
from public.product_variants pv
left join public.inventory_items ii on ii.variant_id = pv.id
where ii.id is null
on conflict (variant_id) do nothing;

insert into storage.buckets (id, name, public, allowed_mime_types)
values (
  'ruth-commerce-product-photos',
  'ruth-commerce-product-photos',
  true,
  array['image/webp','image/jpeg','image/png','image/avif']::text[]
)
on conflict (id) do update
set public = excluded.public,
    allowed_mime_types = excluded.allowed_mime_types;

notify pgrst, 'reload schema';
commit;

select jsonb_build_object(
  'duplicate_identity_groups', (
    select count(*) from (
      select identity_type, normalized_value
      from public.customer_identities
      where identity_type in ('profile','email','phone')
      group by identity_type, normalized_value
      having count(*) > 1 or count(distinct customer_id) > 1
    ) d
  ),
  'variants_missing_inventory', (
    select count(*)
    from public.product_variants pv
    left join public.inventory_items ii on ii.variant_id = pv.id
    where ii.id is null
  ),
  'products', (select count(*) from public.products),
  'customers', (select count(*) from public.customers),
  'orders', (select count(*) from public.orders),
  'phone_unique_index', to_regclass('public.customer_identities_phone_unique_idx') is not null,
  'email_unique_index', to_regclass('public.customer_identities_email_unique_idx') is not null,
  'profile_unique_index', to_regclass('public.customer_identities_profile_unique_idx') is not null,
  'inventory_variant_unique_index', to_regclass('public.inventory_items_variant_id_key') is not null
) as phase0_result;
`;

function baseSupabaseUrl() {
  return normalizeSupabaseUrl(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  if (process.env.VERCEL_ENV !== "production" || searchParams.get("key") !== ACCESS_KEY) {
    return new NextResponse(null, { status: 404 });
  }

  const baseUrl = baseSupabaseUrl();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  if (!serviceKey) {
    return NextResponse.json({ ok: false, error: "missing_supabase_server_key" }, { status: 500 });
  }

  try {
    const response = await fetch(`${baseUrl}/pg/query?statementTimeoutSecs=45&queryTimeoutSecs=50`, {
      method: "POST",
      cache: "no-store",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        "x-pg-application-name": "ruth-phase0-selfhost-convergence",
      },
      body: JSON.stringify({ query: SQL }),
    });

    const raw = await response.text();
    let payload: unknown = raw;
    try { payload = raw ? JSON.parse(raw) : null; } catch {}

    return NextResponse.json(
      { ok: response.ok, status: response.status, result: payload },
      {
        status: response.ok ? 200 : 502,
        headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow, noarchive" },
      },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message.slice(0, 300) : "selfhost_convergence_failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
