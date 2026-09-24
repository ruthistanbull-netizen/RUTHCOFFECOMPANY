begin;

create index if not exists analytics_events_session_created_at_idx
  on public.analytics_events (session_id, created_at, id)
  where session_id is not null and created_at is not null;

create index if not exists analytics_events_live_activity_idx
  on public.analytics_events (created_at desc, session_id)
  where event_name in (
    'session_start',
    'page_view',
    'product_view',
    'cart_created',
    'cart_add',
    'cart_open',
    'checkout_view',
    'payment_start',
    'session_ping',
    'page_leave',
    'session_end'
  );

create or replace function public.admin_analytics_summary(
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  total_sessions bigint,
  cart_sessions bigint,
  checkout_sessions bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with sessions as (
    select
      session_id,
      min(created_at) as session_started_at,
      max(created_at) as session_last_activity_at,
      bool_or(event_name in ('cart_created', 'cart_add')) as reached_cart,
      bool_or(event_name in ('checkout_view', 'payment_start')) as reached_checkout
    from public.analytics_events
    where nullif(btrim(session_id), '') is not null
      and created_at is not null
      and event_name in (
        'session_start',
        'page_view',
        'product_view',
        'cart_created',
        'cart_add',
        'cart_open',
        'checkout_view',
        'payment_start',
        'session_ping',
        'page_leave',
        'session_end'
      )
      and (p_to is null or created_at < p_to)
    group by session_id
  ),
  report_sessions as (
    select *
    from sessions
    where (p_from is null or session_started_at >= p_from)
      and (p_to is null or session_started_at < p_to)
  )
  select
    count(*)::bigint as total_sessions,
    count(*) filter (where reached_cart)::bigint as cart_sessions,
    count(*) filter (where reached_checkout)::bigint as checkout_sessions
  from report_sessions;
$$;

revoke all on function public.admin_analytics_summary(timestamptz, timestamptz) from public;
revoke all on function public.admin_analytics_summary(timestamptz, timestamptz) from anon;
revoke all on function public.admin_analytics_summary(timestamptz, timestamptz) from authenticated;
grant execute on function public.admin_analytics_summary(timestamptz, timestamptz) to service_role;

commit;
