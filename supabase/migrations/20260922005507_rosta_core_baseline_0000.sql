-- ROSTA Commerce V2 pre-Phase-2 baseline schema.
-- Run only against a new, empty database. Never run this bootstrap against the
-- existing production project. After this file, run 0001_baseline_runtime.sql,
-- 0002_baseline_business.sql and then the timestamped supabase/migrations files.

create extension if not exists pgcrypto;

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  cover_image_url text,
  sort_order integer default 0,
  status text not null default 'active' check (status = any (array['active'::text,'inactive'::text])),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  sort_order integer default 0,
  status text default 'active' check (status = any (array['active'::text,'inactive'::text])),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  cover_image_url text
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'active' check (status = any (array['draft'::text,'active'::text,'archived'::text])),
  created_at timestamptz default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid references public.collections(id) on delete set null,
  name text not null,
  slug text not null unique,
  sku text,
  short_description text,
  description text,
  price numeric(10,2),
  compare_at_price numeric(10,2),
  currency text default 'TRY',
  material text,
  material_note text,
  finish_color text,
  is_adjustable boolean default false,
  ikas_url text,
  main_image_url text,
  stock_status text not null default 'in_stock' check (stock_status = any (array['in_stock'::text,'out_of_stock'::text,'preorder'::text])),
  status text not null default 'active' check (status = any (array['draft'::text,'active'::text,'archived'::text])),
  is_featured boolean default false,
  is_new boolean default false,
  sort_order integer default 0,
  seo_title text,
  seo_description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  collection_slugs text[],
  category_slugs text[],
  category_names text[],
  product_type text default 'single',
  is_bundle boolean default false,
  bundle_items jsonb default '[]'::jsonb,
  size_usage text,
  care_advice text
);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  sku text,
  price numeric(10,2),
  ikas_url text,
  status text not null default 'active' check (status = any (array['draft'::text,'active'::text,'archived'::text])),
  sort_order integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  barcode text,
  compare_at_price numeric(12,2),
  stock integer default 0,
  stock_status text default 'in_stock',
  is_active boolean default true,
  options jsonb default '{}'::jsonb,
  option_summary text,
  image_url text,
  variant_display_type text default 'list',
  color_value text
);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  image_url text not null,
  alt_text text,
  is_primary boolean default false,
  sort_order integer default 0,
  created_at timestamptz default now(),
  is_main boolean default false,
  variant_id uuid
);

create table public.product_tags (
  product_id uuid not null references public.products(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (product_id, tag_id)
);

create table public.product_categories (
  product_id uuid not null references public.products(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  primary key (product_id, category_id)
);

create table public.product_collections (
  product_id uuid not null references public.products(id) on delete cascade,
  collection_id uuid not null references public.collections(id) on delete cascade,
  primary key (product_id, collection_id)
);

create table public.homepage_sections (
  id uuid primary key default gen_random_uuid(),
  section_key text not null unique,
  eyebrow text,
  title text not null,
  subtitle text,
  body text,
  image_url text,
  video_url text,
  cta_label text,
  cta_url text,
  sort_order integer default 0,
  status text not null default 'active' check (status = any (array['draft'::text,'active'::text,'archived'::text])),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.site_settings (
  id uuid primary key default gen_random_uuid(),
  setting_key text not null unique,
  setting_value jsonb not null default '{}'::jsonb,
  is_public boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  email text unique,
  full_name text,
  phone text,
  role text not null default 'customer' check (role = any (array['customer'::text,'admin'::text])),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  phone_normalized text,
  birth_date date,
  terms_accepted boolean not null default false,
  terms_accepted_at timestamptz,
  terms_version text,
  marketing_email_consent boolean not null default false,
  marketing_email_consent_at timestamptz,
  marketing_consent_version text,
  consent_source text,
  consent_ip text,
  reward_points_balance integer not null default 2000,
  birthday_reward_points integer not null default 0,
  birthday_reward_claimed_year integer,
  birthday_reward_claimed_at timestamptz,
  is_legacy_member boolean not null default false,
  ikas_customer_id text,
  ikas_account_status text,
  ikas_account_created_at timestamptz,
  membership_matched_at timestamptz
);

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  full_name text not null,
  phone text not null,
  email text,
  city text not null,
  district text not null,
  neighborhood text,
  address_line text not null,
  postal_code text,
  is_default boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique,
  profile_id uuid references public.profiles(id) on delete set null,
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  shipping_address_id uuid references public.customer_addresses(id) on delete set null,
  subtotal numeric(10,2) not null default 0,
  shipping_fee numeric(10,2) not null default 0,
  discount_total numeric(10,2) not null default 0,
  total_amount numeric(10,2) not null default 0,
  currency text not null default 'TRY',
  status text not null default 'pending' check (status = any (array['pending'::text,'paid'::text,'preparing'::text,'shipped'::text,'completed'::text,'cancelled'::text])),
  payment_status text not null default 'waiting' check (payment_status = any (array['waiting'::text,'paid'::text,'failed'::text,'refunded'::text])),
  cargo_company text,
  cargo_tracking_no text,
  cargo_tracking_url text,
  customer_note text,
  admin_note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  reminder_note text,
  shipping_address_text text,
  tax_total numeric(12,2) default 0,
  reminder_at timestamptz,
  imported_source text,
  traffic_source text,
  traffic_medium text,
  traffic_campaign text,
  traffic_referrer text,
  visitor_id text,
  purchase_session_id text,
  session_count_before_purchase integer not null default 1,
  purchase_session_number integer not null default 1,
  total_session_duration_seconds integer not null default 0,
  purchase_session_duration_seconds integer not null default 0,
  attribution_data jsonb,
  automatic_discount_total numeric(12,2) not null default 0,
  reward_discount_total numeric(12,2) not null default 0,
  coupon_code text,
  coupon_discount_total numeric(12,2) not null default 0,
  applied_discounts jsonb not null default '[]'::jsonb,
  refunded_total numeric(12,2) not null default 0,
  shipping_city text,
  shipping_town text,
  shipping_neighborhood text,
  shipping_address_line text,
  shipping_postal_code text,
  shipping_provider text,
  shipping_status text,
  shipping_price numeric(12,2),
  shipping_package jsonb not null default '[]'::jsonb,
  shipping_recipient jsonb,
  shipping_updated_at timestamptz,
  shipping_error text,
  basit_kargo_order_id text,
  basit_kargo_barcode text,
  basit_kargo_handler_code text,
  basit_kargo_return_barcode text,
  reward_points_used integer not null default 0
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  variant_id uuid references public.product_variants(id) on delete set null,
  product_slug text,
  product_name text not null,
  variant_name text,
  quantity integer not null default 1 check (quantity > 0),
  unit_price numeric(10,2) not null default 0,
  total_price numeric(10,2) not null default 0,
  image_url text,
  created_at timestamptz default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null default 'paytr',
  merchant_oid text not null unique,
  amount numeric(10,2) not null,
  currency text not null default 'TRY',
  status text not null default 'waiting' check (status = any (array['waiting'::text,'paid'::text,'failed'::text,'cancelled'::text,'refunded'::text])),
  paytr_token text,
  paytr_response jsonb,
  callback_payload jsonb,
  paid_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.checkout_drafts (
  id uuid primary key default gen_random_uuid(),
  merchant_oid text not null unique,
  order_no text not null,
  profile_id uuid references public.profiles(id) on delete set null,
  customer jsonb not null,
  items jsonb not null,
  subtotal numeric(12,2) not null default 0,
  shipping_fee numeric(12,2) not null default 0,
  discount_total numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  currency text not null default 'TRY',
  status text not null default 'waiting' check (status = any (array['payment_reached'::text,'waiting'::text,'paid'::text,'failed'::text,'expired'::text,'superseded'::text,'converted'::text])),
  paytr_token text,
  paytr_request jsonb,
  callback_payload jsonb,
  order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  paid_at timestamptz,
  failed_at timestamptz,
  abandoned_email_count integer not null default 0,
  abandoned_email_status text not null default 'not_sent',
  abandoned_email_last_sent_at timestamptz,
  abandoned_email_error text,
  resume_token text,
  coupon_code text,
  coupon_discount_total numeric default 0,
  attribution jsonb,
  automatic_discount_total numeric(12,2) not null default 0,
  reward_discount_total numeric(12,2) not null default 0,
  applied_discounts jsonb not null default '[]'::jsonb,
  reward_points_used integer not null default 0
);

create table public.returns_exchanges (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  order_no text,
  customer_name text,
  customer_email text,
  customer_phone text,
  type text not null default 'return' check (type = any (array['return'::text,'exchange'::text])),
  status text not null default 'open' check (status = any (array['open'::text,'approved'::text,'rejected'::text,'completed'::text])),
  reason text,
  amount numeric(12,2) default 0,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  return_mode text default 'amount',
  refunded_items jsonb default '[]'::jsonb,
  exchange_items jsonb default '[]'::jsonb,
  original_items jsonb not null default '[]'::jsonb,
  refund_status text default 'pending',
  refund_provider text,
  refund_reference text,
  refunded_at timestamptz
);

create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  event_name text not null,
  path text,
  user_id uuid,
  metadata jsonb default '{}'::jsonb,
  user_agent text,
  ip_hash text,
  created_at timestamptz default now()
);

create table public.email_integrations (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'gmail',
  profile_id uuid not null,
  email text,
  sender_name text default 'ROSTA Coffee Co.',
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, profile_id)
);

create table public.email_oauth_states (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'gmail',
  profile_id uuid not null,
  state text not null unique,
  redirect_uri text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.email_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,
  name text not null,
  subject text not null,
  html text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.email_logs (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'gmail',
  profile_id uuid,
  order_id uuid,
  to_email text not null,
  subject text not null,
  template_key text,
  status text not null default 'pending',
  gmail_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  campaign_group text,
  campaign_name text
);

create table public.integration_events (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'admin-panel',
  event_type text not null default 'sync',
  status text not null default 'success',
  scope text,
  message text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id text not null,
  product_slug text,
  product_name text,
  profile_id uuid,
  order_id uuid,
  order_item_id uuid,
  rating integer not null check (rating >= 1 and rating <= 5),
  title text,
  comment text,
  status text not null default 'pending' check (status = any (array['pending'::text,'approved'::text,'rejected'::text])),
  reviewer_name text,
  reviewer_email text,
  coupon_code text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.review_reward_coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  profile_id uuid,
  review_id uuid references public.product_reviews(id) on delete set null,
  discount_percent integer not null default 10,
  status text not null default 'active' check (status = any (array['active'::text,'used'::text,'expired'::text,'cancelled'::text])),
  usage_limit integer not null default 1,
  used_count integer not null default 0,
  used_order_id uuid,
  used_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.review_request_emails (
  id uuid primary key default gen_random_uuid(),
  order_id uuid,
  profile_id uuid,
  email text,
  status text not null default 'sent' check (status = any (array['sent'::text,'failed'::text,'skipped'::text])),
  error_message text,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.discount_redemptions (
  id uuid primary key default gen_random_uuid(),
  rule_id text not null,
  code text,
  source_type text not null default 'coupon',
  order_id uuid references public.orders(id) on delete set null,
  order_no text,
  profile_id uuid references public.profiles(id) on delete set null,
  customer_email text,
  discount_amount numeric(12,2) not null default 0,
  free_shipping boolean not null default false,
  status text not null default 'used',
  used_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  movement_key text not null unique,
  movement_type text not null,
  order_id uuid references public.orders(id) on delete set null,
  order_item_id uuid references public.order_items(id) on delete set null,
  return_case_id uuid references public.returns_exchanges(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  variant_id uuid references public.product_variants(id) on delete set null,
  quantity integer not null,
  created_at timestamptz not null default now(),
  inventory_item_id uuid,
  reservation_id uuid,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create table public.shipping_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null default 'basit_kargo',
  event_key text not null unique,
  event_type text not null,
  external_order_id text,
  barcode text,
  tracking_no text,
  status text,
  status_label text,
  event_time timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.ruthie_point_transactions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  amount integer not null,
  balance_after integer not null,
  transaction_type text not null default 'admin_adjustment',
  reason text,
  reference_type text,
  reference_id text,
  admin_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.commerce_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  event_type text not null,
  aggregate_id text not null,
  aggregate_type text not null,
  event_version integer not null default 1,
  channel text not null,
  correlation_id text not null,
  causation_id text,
  actor_id text,
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null unique references public.product_variants(id) on delete cascade,
  sku text,
  on_hand integer not null default 0 check (on_hand >= 0),
  reserved integer not null default 0 check (reserved >= 0),
  allocated integer not null default 0 check (allocated >= 0),
  incoming integer not null default 0 check (incoming >= 0),
  safety_stock integer not null default 0 check (safety_stock >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_balances_valid check ((reserved + allocated) <= on_hand)
);

create table public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  checkout_id text,
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  quantity integer not null check (quantity > 0),
  status text not null default 'active' check (status = any (array['active'::text,'allocated'::text,'released'::text,'expired'::text])),
  idempotency_key text not null unique,
  expires_at timestamptz not null,
  allocated_at timestamptz,
  released_at timestamptz,
  expired_at timestamptz,
  release_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.inventory_movements
  add constraint inventory_movements_inventory_item_id_fkey foreign key (inventory_item_id) references public.inventory_items(id) on delete set null,
  add constraint inventory_movements_reservation_id_fkey foreign key (reservation_id) references public.inventory_reservations(id) on delete set null;

create table public.payment_intents (
  id uuid primary key default gen_random_uuid(),
  checkout_draft_id uuid references public.checkout_drafts(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  merchant_oid text not null,
  provider text not null default 'paytr',
  status text not null default 'requires_payment_method' check (status = any (array['requires_payment_method'::text,'requires_action'::text,'processing'::text,'succeeded'::text,'failed'::text,'cancelled'::text,'refunded'::text,'partially_refunded'::text])),
  amount_kurus integer not null check (amount_kurus > 0),
  currency text not null default 'TL',
  installment_count integer not null default 0 check (installment_count >= 0 and installment_count <= 12),
  card_type text,
  idempotency_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  succeeded_at timestamptz,
  failed_at timestamptz,
  unique (provider, merchant_oid)
);

create table public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  payment_intent_id uuid not null references public.payment_intents(id) on delete cascade,
  attempt_no integer not null check (attempt_no > 0),
  provider text not null default 'paytr',
  status text not null default 'prepared' check (status = any (array['prepared'::text,'redirected'::text,'requires_action'::text,'processing'::text,'succeeded'::text,'failed'::text,'cancelled'::text])),
  amount_kurus integer not null check (amount_kurus > 0),
  installment_count integer not null default 0 check (installment_count >= 0 and installment_count <= 12),
  card_type text,
  bin_prefix text,
  provider_reference text,
  request_fingerprint text,
  error_code text,
  error_message text,
  provider_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (payment_intent_id, attempt_no)
);

create table public.payment_callback_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'paytr',
  merchant_oid text not null,
  callback_hash text not null,
  status text not null,
  total_amount_kurus integer,
  payment_amount_kurus integer,
  installment_count integer,
  verified boolean not null default false,
  verification_error text,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, merchant_oid, callback_hash)
);

create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  payment_intent_id uuid not null references public.payment_intents(id) on delete cascade,
  payment_attempt_id uuid references public.payment_attempts(id) on delete set null,
  provider text not null default 'paytr',
  provider_reference text,
  transaction_type text not null check (transaction_type = any (array['authorization'::text,'capture'::text,'sale'::text,'refund'::text,'partial_refund'::text,'void'::text])),
  status text not null check (status = any (array['pending'::text,'succeeded'::text,'failed'::text])),
  amount_kurus integer not null check (amount_kurus >= 0),
  currency text not null default 'TL',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.payment_refunds (
  id uuid primary key default gen_random_uuid(),
  payment_intent_id uuid not null references public.payment_intents(id) on delete restrict,
  payment_transaction_id uuid references public.payment_transactions(id) on delete restrict,
  order_id uuid,
  provider text not null default 'paytr',
  provider_reference text,
  refund_type text not null check (refund_type = any (array['full'::text,'partial'::text])),
  status text not null default 'requested' check (status = any (array['requested'::text,'processing'::text,'succeeded'::text,'failed'::text,'cancelled'::text])),
  amount_kurus integer not null check (amount_kurus > 0),
  currency text not null default 'TL',
  reason text,
  requested_by uuid,
  idempotency_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  failed_at timestamptz
);

create table public.payment_refund_attempts (
  id uuid primary key default gen_random_uuid(),
  refund_id uuid not null references public.payment_refunds(id) on delete cascade,
  attempt_no integer not null check (attempt_no > 0),
  provider text not null default 'paytr',
  status text not null default 'prepared' check (status = any (array['prepared'::text,'submitted'::text,'succeeded'::text,'failed'::text])),
  provider_reference text,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (refund_id, attempt_no)
);

-- Every table starts with RLS enabled. Browser access is explicitly allow-listed.
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname='public' loop
    execute format('alter table public.%I enable row level security',r.tablename);
  end loop;
end $$;

create policy products_public_read_active on public.products for select to anon, authenticated using (coalesce(status,'active')='active');
create policy product_variants_public_read_active on public.product_variants for select to anon, authenticated using (coalesce(is_active,true)=true);
create policy product_images_public_read on public.product_images for select to anon, authenticated using (exists(select 1 from public.products p where p.id=product_images.product_id and p.status='active'));
create policy categories_public_read_active on public.categories for select to anon, authenticated using (coalesce(status,'active')='active');
create policy collections_public_read_active on public.collections for select to anon, authenticated using (coalesce(status,'active')='active');
create policy tags_public_read_active on public.tags for select to anon, authenticated using (status='active');
create policy product_categories_public_read on public.product_categories for select to anon, authenticated using (true);
create policy product_collections_public_read on public.product_collections for select to anon, authenticated using (true);
create policy product_tags_public_read on public.product_tags for select to anon, authenticated using (true);
create policy homepage_sections_public_read_active on public.homepage_sections for select to anon, authenticated using (status='active');
create policy site_settings_public_read on public.site_settings for select to anon, authenticated using (coalesce(is_public,false)=true);
create policy profiles_read_own on public.profiles for select to authenticated using ((select auth.uid())=auth_user_id);
create policy profiles_update_own on public.profiles for update to authenticated using ((select auth.uid())=auth_user_id) with check ((select auth.uid())=auth_user_id);
create policy addresses_read_own on public.customer_addresses for select to authenticated using (exists(select 1 from public.profiles p where p.id=customer_addresses.profile_id and p.auth_user_id=(select auth.uid())));
create policy orders_read_own on public.orders for select to authenticated using (exists(select 1 from public.profiles p where p.id=orders.profile_id and p.auth_user_id=(select auth.uid())));
create policy order_items_read_own on public.order_items for select to authenticated using (exists(select 1 from public.orders o join public.profiles p on p.id=o.profile_id where o.id=order_items.order_id and p.auth_user_id=(select auth.uid())));
create policy payments_read_own on public.payments for select to authenticated using (exists(select 1 from public.orders o join public.profiles p on p.id=o.profile_id where o.id=payments.order_id and p.auth_user_id=(select auth.uid())));
