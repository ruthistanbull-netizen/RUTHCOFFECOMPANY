begin;

-- Internal trigger/helper functions are not public API endpoints. Keep them
-- available to the database owner and service role, but remove direct anon/user
-- RPC execution from PostgREST.
revoke all on function public.assign_order_customer() from public, anon, authenticated;
revoke all on function public.enqueue_customer_domain_event(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.sync_profile_to_customer() from public, anon, authenticated;
revoke all on function public.storefront_refresh_product_trigger() from public, anon, authenticated;
revoke all on function public.storefront_refresh_product_relation_trigger() from public, anon, authenticated;
revoke all on function public.storefront_refresh_category_products_trigger() from public, anon, authenticated;
revoke all on function public.storefront_refresh_collection_products_trigger() from public, anon, authenticated;

grant execute on function public.assign_order_customer() to service_role;
grant execute on function public.enqueue_customer_domain_event(uuid, text, text, jsonb) to service_role;
grant execute on function public.sync_profile_to_customer() to service_role;
grant execute on function public.storefront_refresh_product_trigger() to service_role;
grant execute on function public.storefront_refresh_product_relation_trigger() to service_role;
grant execute on function public.storefront_refresh_category_products_trigger() to service_role;
grant execute on function public.storefront_refresh_collection_products_trigger() to service_role;

notify pgrst, 'reload schema';
commit;
