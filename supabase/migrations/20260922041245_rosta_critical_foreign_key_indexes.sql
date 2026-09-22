-- ROSTA commerce critical foreign-key indexes
create index if not exists checkout_drafts_order_id_idx on public.checkout_drafts(order_id);
create index if not exists checkout_drafts_profile_id_idx on public.checkout_drafts(profile_id);
create index if not exists customer_addresses_profile_id_idx on public.customer_addresses(profile_id);
create index if not exists discount_redemptions_order_id_idx on public.discount_redemptions(order_id);
create index if not exists discount_redemptions_profile_id_idx on public.discount_redemptions(profile_id);

create index if not exists inventory_movements_inventory_item_id_idx on public.inventory_movements(inventory_item_id);
create index if not exists inventory_movements_order_id_idx on public.inventory_movements(order_id);
create index if not exists inventory_movements_order_item_id_idx on public.inventory_movements(order_item_id);
create index if not exists inventory_movements_product_id_idx on public.inventory_movements(product_id);
create index if not exists inventory_movements_reservation_id_idx on public.inventory_movements(reservation_id);
create index if not exists inventory_movements_return_case_id_idx on public.inventory_movements(return_case_id);
create index if not exists inventory_movements_variant_id_idx on public.inventory_movements(variant_id);

create index if not exists inventory_reservations_inventory_item_id_idx on public.inventory_reservations(inventory_item_id);
create index if not exists inventory_reservations_order_id_idx on public.inventory_reservations(order_id);
create index if not exists inventory_reservations_variant_id_idx on public.inventory_reservations(variant_id);

create index if not exists loyalty_reward_settings_updated_by_profile_id_idx on public.loyalty_reward_settings(updated_by_profile_id);

create index if not exists order_items_order_id_idx on public.order_items(order_id);
create index if not exists order_items_product_id_idx on public.order_items(product_id);
create index if not exists order_items_variant_id_idx on public.order_items(variant_id);
create index if not exists orders_profile_id_idx on public.orders(profile_id);
create index if not exists orders_shipping_address_id_idx on public.orders(shipping_address_id);

create index if not exists payment_intents_checkout_draft_id_idx on public.payment_intents(checkout_draft_id);
create index if not exists payment_intents_order_id_idx on public.payment_intents(order_id);
create index if not exists payment_refunds_payment_intent_id_idx on public.payment_refunds(payment_intent_id);
create index if not exists payment_refunds_payment_transaction_id_idx on public.payment_refunds(payment_transaction_id);
create index if not exists payment_transactions_payment_attempt_id_idx on public.payment_transactions(payment_attempt_id);
create index if not exists payment_transactions_payment_intent_id_idx on public.payment_transactions(payment_intent_id);
create index if not exists payments_order_id_idx on public.payments(order_id);

create index if not exists product_categories_category_id_idx on public.product_categories(category_id);
create index if not exists product_collections_collection_id_idx on public.product_collections(collection_id);
create index if not exists product_tags_tag_id_idx on public.product_tags(tag_id);
create index if not exists products_collection_id_idx on public.products(collection_id);

create index if not exists returns_exchanges_order_id_idx on public.returns_exchanges(order_id);
create index if not exists review_reward_coupons_review_id_idx on public.review_reward_coupons(review_id);
create index if not exists ruthie_point_transactions_admin_profile_id_idx on public.ruthie_point_transactions(admin_profile_id);
create index if not exists ruthie_point_transactions_profile_id_idx on public.ruthie_point_transactions(profile_id);
create index if not exists shipping_events_order_id_idx on public.shipping_events(order_id);
