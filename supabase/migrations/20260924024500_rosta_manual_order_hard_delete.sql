-- Service-role-only hard delete for explicit manual admin orders.
-- Keeps normal order lifecycle/timeline behavior unchanged.

create or replace function public.delete_manual_order_hard(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_order public.orders%rowtype;
begin
  if p_order_id is null then
    raise exception using errcode='22023', message='Sipariş seçilmedi.';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception using errcode='P0002', message='Sipariş bulunamadı.';
  end if;

  if lower(coalesce(v_order.imported_source, '')) <> 'manual'
     and upper(coalesce(v_order.order_no, '')) not like 'MAN%' then
    raise exception using
      errcode='P0001',
      message='Bu işlem yalnızca manuel siparişlerde kullanılabilir.';
  end if;

  if lower(coalesce(v_order.payment_status, '')) in ('paid', 'partially_refunded') then
    perform public.restore_order_stock(v_order.id, 'manual_order_deleted');
  end if;

  delete from public.checkout_drafts
  where order_id = v_order.id or merchant_oid = v_order.order_no;

  delete from public.orders
  where id = v_order.id;

  return jsonb_build_object(
    'orderId', v_order.id,
    'orderNo', v_order.order_no
  );
end;
$$;

revoke all privileges on function public.delete_manual_order_hard(uuid)
  from public, anon, authenticated;

grant execute on function public.delete_manual_order_hard(uuid)
  to service_role;

comment on function public.delete_manual_order_hard(uuid) is
  'ROSTA service-role-only transactional hard delete for manual admin orders. Restores paid-order stock before deletion.';
