create index if not exists admin_push_jobs_order_id_idx
  on public.admin_push_jobs(order_id);

create index if not exists admin_push_subscriptions_admin_profile_id_idx
  on public.admin_push_subscriptions(admin_profile_id);
