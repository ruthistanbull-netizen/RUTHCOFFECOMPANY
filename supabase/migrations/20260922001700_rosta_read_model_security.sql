begin;

alter table public.storefront_product_read_models enable row level security;
revoke all on table public.storefront_product_read_models from public, anon, authenticated;
grant all on table public.storefront_product_read_models to service_role;

drop index if exists public.site_settings_setting_key_unique_idx;

notify pgrst, 'reload schema';
commit;
