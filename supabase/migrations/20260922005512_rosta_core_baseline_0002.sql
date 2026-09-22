-- Pre-Phase-2 business functions for a fresh Ruth Commerce database.

create or replace function public.adjust_ruthie_points(
  p_profile_id uuid,p_amount integer,p_reason text default null,
  p_transaction_type text default 'admin_adjustment',p_reference_type text default null,
  p_reference_id text default null,p_admin_profile_id uuid default null
)
returns table(balance integer,applied_amount integer,transaction_id uuid)
language plpgsql security definer set search_path=public,pg_catalog
as $$
declare v_current_balance integer; v_new_balance integer; v_applied_amount integer; v_transaction_id uuid; v_existing public.ruthie_point_transactions%rowtype;
begin
  if p_profile_id is null then raise exception 'Profil gerekli.'; end if;
  if p_amount=0 then raise exception 'Puan miktari sifir olamaz.'; end if;
  if p_reference_type is not null and p_reference_id is not null then
    select * into v_existing from public.ruthie_point_transactions
    where profile_id=p_profile_id and transaction_type=coalesce(nullif(trim(p_transaction_type),''),'admin_adjustment')
      and reference_type=p_reference_type and reference_id=p_reference_id limit 1;
    if found then return query select v_existing.balance_after,v_existing.amount,v_existing.id; return; end if;
  end if;
  select coalesce(reward_points_balance,0) into v_current_balance from public.profiles where id=p_profile_id for update;
  if not found then raise exception 'Musteri profili bulunamadi.'; end if;
  v_new_balance:=greatest(0,v_current_balance+p_amount); v_applied_amount:=v_new_balance-v_current_balance;
  if v_applied_amount=0 then return query select v_current_balance,0,null::uuid; return; end if;
  update public.profiles set reward_points_balance=v_new_balance where id=p_profile_id;
  insert into public.ruthie_point_transactions(profile_id,amount,balance_after,transaction_type,reason,reference_type,reference_id,admin_profile_id)
  values(p_profile_id,v_applied_amount,v_new_balance,coalesce(nullif(trim(p_transaction_type),''),'admin_adjustment'),
    nullif(trim(coalesce(p_reason,'')),''),nullif(trim(coalesce(p_reference_type,'')),''),nullif(trim(coalesce(p_reference_id,'')),''),p_admin_profile_id)
  returning id into v_transaction_id;
  return query select v_new_balance,v_applied_amount,v_transaction_id;
end;
$$;

create or replace function public.refresh_product_stock_status(p_product_id uuid)
returns void language plpgsql security definer set search_path=public,pg_catalog
as $$
begin
  update public.products p
  set stock_status=case
    when exists(select 1 from public.product_variants v where v.product_id=p_product_id and coalesce(v.is_active,true)=true and coalesce(v.stock,0)>0) then 'in_stock'
    when exists(select 1 from public.product_variants v where v.product_id=p_product_id and coalesce(v.is_active,true)=true and v.stock_status='preorder') then 'preorder'
    else 'out_of_stock' end,
    updated_at=now()
  where p.id=p_product_id;
end;
$$;

create or replace function public.replace_product_categories(p_product_id uuid,p_category_ids uuid[])
returns void language plpgsql security definer set search_path=public,pg_catalog
as $$
begin
  if not exists(select 1 from public.products where id=p_product_id) then raise exception 'Ürün bulunamadı'; end if;
  delete from public.product_categories where product_id=p_product_id;
  insert into public.product_categories(product_id,category_id)
  select p_product_id,ids.category_id from unnest(coalesce(p_category_ids,array[]::uuid[])) ids(category_id)
  join public.categories c on c.id=ids.category_id and c.status='active'
  on conflict(product_id,category_id) do nothing;
end;
$$;

create or replace function public.replace_product_collections(p_product_id uuid,p_collection_ids uuid[])
returns void language plpgsql security definer set search_path=public,pg_catalog
as $$
declare first_collection uuid;
begin
  if not exists(select 1 from public.products where id=p_product_id) then raise exception 'Ürün bulunamadı'; end if;
  delete from public.product_collections where product_id=p_product_id;
  insert into public.product_collections(product_id,collection_id)
  select p_product_id,ids.collection_id from unnest(coalesce(p_collection_ids,array[]::uuid[])) ids(collection_id)
  join public.collections c on c.id=ids.collection_id and c.status='active'
  on conflict(product_id,collection_id) do nothing;
  select collection_id into first_collection from public.product_collections where product_id=p_product_id order by collection_id limit 1;
  update public.products set collection_id=first_collection,updated_at=now() where id=p_product_id;
end;
$$;

create or replace function public.apply_order_stock(p_order_id uuid)
returns void language plpgsql security definer set search_path=public,pg_catalog
as $$
declare item record; movement_id uuid; current_stock integer; current_status text;
begin
  for item in select oi.id,oi.product_id,oi.variant_id,greatest(coalesce(oi.quantity,1),1) quantity
    from public.order_items oi where oi.order_id=p_order_id and oi.variant_id is not null order by oi.id
  loop
    movement_id:=null;
    if exists(select 1 from public.inventory_movements m where m.movement_key='sale:'||item.id::text) then continue; end if;
    select coalesce(stock,0),coalesce(stock_status,'in_stock') into current_stock,current_status
    from public.product_variants where id=item.variant_id for update;
    if not found then raise exception 'Varyant bulunamadı: %',item.variant_id; end if;
    if current_status<>'preorder' and current_stock<item.quantity then raise exception 'Yetersiz stok. Varyant: %, mevcut: %, istenen: %',item.variant_id,current_stock,item.quantity; end if;
    insert into public.inventory_movements(movement_key,movement_type,order_id,order_item_id,product_id,variant_id,quantity)
    values('sale:'||item.id::text,'sale',p_order_id,item.id,item.product_id,item.variant_id,-item.quantity)
    on conflict(movement_key) do nothing returning id into movement_id;
    if movement_id is not null then
      update public.product_variants set stock=greatest(0,coalesce(stock,0)-item.quantity),
        stock_status=case when current_status='preorder' then 'preorder' when greatest(0,coalesce(stock,0)-item.quantity)>0 then 'in_stock' else 'out_of_stock' end,
        updated_at=now() where id=item.variant_id;
      perform public.refresh_product_stock_status(item.product_id);
    end if;
  end loop;
end;
$$;

create or replace function public.restore_order_stock(p_order_id uuid,p_reason text default 'full_restore')
returns void language plpgsql security definer set search_path=public,pg_catalog
as $$
declare item record; movement_id uuid; already_restored integer; restore_quantity integer;
begin
  for item in select oi.id,oi.product_id,oi.variant_id,greatest(coalesce(oi.quantity,1),1) quantity
    from public.order_items oi where oi.order_id=p_order_id and oi.variant_id is not null order by oi.id
  loop
    if not exists(select 1 from public.inventory_movements m where m.movement_key='sale:'||item.id::text) then continue; end if;
    select coalesce(sum(greatest(m.quantity,0)),0)::integer into already_restored
    from public.inventory_movements m where m.order_item_id=item.id and m.quantity>0;
    restore_quantity:=greatest(0,item.quantity-already_restored);
    if restore_quantity<=0 then continue; end if;
    movement_id:=null;
    insert into public.inventory_movements(movement_key,movement_type,order_id,order_item_id,product_id,variant_id,quantity)
    values('order-restore:'||item.id::text,coalesce(nullif(p_reason,''),'full_restore'),p_order_id,item.id,item.product_id,item.variant_id,restore_quantity)
    on conflict(movement_key) do nothing returning id into movement_id;
    if movement_id is not null then
      update public.product_variants set stock=coalesce(stock,0)+restore_quantity,
        stock_status=case when stock_status='preorder' then 'preorder' else 'in_stock' end,updated_at=now()
      where id=item.variant_id;
      perform public.refresh_product_stock_status(item.product_id);
    end if;
  end loop;
end;
$$;

create or replace function public.replace_order_items(
  p_order_id uuid,p_items jsonb,p_shipping_fee numeric default null,
  p_tax_total numeric default null,p_discount_total numeric default null
)
returns void language plpgsql security definer set search_path=public,pg_catalog
as $$
declare
  order_row public.orders%rowtype; old_item record; json_item jsonb; new_item_id uuid;
  product_id_value uuid; variant_id_value uuid; quantity_value integer; unit_price_value numeric(12,2);
  subtotal_value numeric(12,2):=0; current_stock integer; current_status text; movement_id uuid;
  already_restored integer; restore_quantity integer;
begin
  select * into order_row from public.orders where id=p_order_id for update;
  if not found then raise exception 'Sipariş bulunamadı.'; end if;
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb))<>'array' then raise exception 'Sipariş ürünleri geçersiz.'; end if;
  if order_row.payment_status='paid' then
    for old_item in select * from public.order_items where order_id=p_order_id order by id loop
      if old_item.variant_id is null or not exists(select 1 from public.inventory_movements m where m.movement_key='sale:'||old_item.id::text) then continue; end if;
      select coalesce(sum(greatest(m.quantity,0)),0)::integer into already_restored from public.inventory_movements m where m.order_item_id=old_item.id and m.quantity>0;
      restore_quantity:=greatest(0,greatest(coalesce(old_item.quantity,1),1)-already_restored);
      if restore_quantity<=0 then continue; end if;
      movement_id:=null;
      insert into public.inventory_movements(movement_key,movement_type,order_id,order_item_id,product_id,variant_id,quantity)
      values('order-edit-restore:'||old_item.id::text,'order_edit_restore',p_order_id,old_item.id,old_item.product_id,old_item.variant_id,restore_quantity)
      on conflict(movement_key) do nothing returning id into movement_id;
      if movement_id is not null then
        update public.product_variants set stock=coalesce(stock,0)+restore_quantity,
          stock_status=case when stock_status='preorder' then 'preorder' else 'in_stock' end,updated_at=now()
        where id=old_item.variant_id;
        perform public.refresh_product_stock_status(old_item.product_id);
      end if;
    end loop;
  end if;
  delete from public.order_items where order_id=p_order_id;
  for json_item in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    product_id_value:=nullif(json_item->>'product_id','')::uuid; variant_id_value:=nullif(json_item->>'variant_id','')::uuid;
    quantity_value:=greatest(coalesce((json_item->>'quantity')::integer,1),1); unit_price_value:=greatest(coalesce((json_item->>'unit_price')::numeric,0),0);
    if variant_id_value is not null then
      select coalesce(stock,0),coalesce(stock_status,'in_stock') into current_stock,current_status
      from public.product_variants where id=variant_id_value and (product_id_value is null or product_id=product_id_value) and coalesce(is_active,true)=true for update;
      if not found then raise exception 'Sipariş varyantı bulunamadı veya pasif.'; end if;
      if order_row.payment_status='paid' and current_status<>'preorder' and current_stock<quantity_value then raise exception 'Yetersiz stok. Mevcut: %, istenen: %',current_stock,quantity_value; end if;
    end if;
    insert into public.order_items(order_id,product_id,variant_id,product_slug,product_name,variant_name,quantity,unit_price,total_price,image_url)
    values(p_order_id,product_id_value,variant_id_value,coalesce(nullif(json_item->>'product_slug',''),'manual'),coalesce(nullif(json_item->>'product_name',''),'Ürün'),
      nullif(json_item->>'variant_name',''),quantity_value,unit_price_value,quantity_value*unit_price_value,nullif(json_item->>'image_url','')) returning id into new_item_id;
    subtotal_value:=subtotal_value+quantity_value*unit_price_value;
    if order_row.payment_status='paid' and variant_id_value is not null then
      insert into public.inventory_movements(movement_key,movement_type,order_id,order_item_id,product_id,variant_id,quantity)
      values('sale:'||new_item_id::text,'order_edit_sale',p_order_id,new_item_id,product_id_value,variant_id_value,-quantity_value);
      update public.product_variants set stock=greatest(0,coalesce(stock,0)-quantity_value),
        stock_status=case when current_status='preorder' then 'preorder' when greatest(0,coalesce(stock,0)-quantity_value)>0 then 'in_stock' else 'out_of_stock' end,
        updated_at=now() where id=variant_id_value;
      perform public.refresh_product_stock_status(product_id_value);
    end if;
  end loop;
  update public.orders set subtotal=subtotal_value,shipping_fee=coalesce(p_shipping_fee,shipping_fee,0),tax_total=coalesce(p_tax_total,tax_total,0),
    discount_total=coalesce(p_discount_total,discount_total,0),
    total_amount=greatest(0,subtotal_value+coalesce(p_shipping_fee,shipping_fee,0)+coalesce(p_tax_total,tax_total,0)-coalesce(p_discount_total,discount_total,0)),updated_at=now()
  where id=p_order_id;
end;
$$;

create or replace function public.complete_return_case(p_case_id uuid,p_refund_confirmed boolean default false)
returns void language plpgsql security definer set search_path=public,pg_catalog
as $$
declare case_row public.returns_exchanges%rowtype; json_item jsonb; order_item_row record; movement_id uuid; completed_refund numeric(12,2); order_total numeric(12,2);
begin
  select * into case_row from public.returns_exchanges where id=p_case_id for update;
  if not found then raise exception 'İade kaydı bulunamadı.'; end if;
  if case_row.type<>'return' then raise exception 'Bu kayıt iade kaydı değil.'; end if;
  if case_row.status='completed' then return; end if;
  if case_row.status<>'approved' then raise exception 'İade önce onaylanmalı.'; end if;
  if not p_refund_confirmed then raise exception 'Para iadesi onayı gerekli.'; end if;
  if case_row.return_mode='items' then
    for json_item in select value from jsonb_array_elements(coalesce(case_row.refunded_items,'[]'::jsonb)) loop
      select oi.id,oi.product_id,oi.variant_id,least(greatest(coalesce((json_item->>'quantity')::integer,oi.quantity),1),oi.quantity) quantity
      into order_item_row from public.order_items oi
      where oi.order_id=case_row.order_id and oi.id=nullif(json_item->>'id','')::uuid for update;
      if found and order_item_row.variant_id is not null then
        movement_id:=null;
        insert into public.inventory_movements(movement_key,movement_type,order_id,order_item_id,return_case_id,product_id,variant_id,quantity)
        values('return:'||case_row.id::text||':'||order_item_row.id::text,'return',case_row.order_id,order_item_row.id,case_row.id,order_item_row.product_id,order_item_row.variant_id,order_item_row.quantity)
        on conflict(movement_key) do nothing returning id into movement_id;
        if movement_id is not null then
          update public.product_variants set stock=coalesce(stock,0)+order_item_row.quantity,
            stock_status=case when stock_status='preorder' then 'preorder' else 'in_stock' end,updated_at=now() where id=order_item_row.variant_id;
          perform public.refresh_product_stock_status(order_item_row.product_id);
        end if;
      end if;
    end loop;
  end if;
  update public.returns_exchanges set status='completed',refund_status='manual_confirmed',refunded_at=now(),updated_at=now() where id=p_case_id;
  select coalesce(sum(amount),0) into completed_refund from public.returns_exchanges where order_id=case_row.order_id and type='return' and status='completed';
  select coalesce(total_amount,0) into order_total from public.orders where id=case_row.order_id for update;
  update public.orders set refunded_total=least(order_total,completed_refund),payment_status=case when completed_refund>=order_total-0.01 then 'refunded' else 'paid' end,updated_at=now()
  where id=case_row.order_id;
end;
$$;

create or replace function public.complete_exchange_case(p_case_id uuid)
returns void language plpgsql security definer set search_path=public,pg_catalog
as $$
declare
  case_row public.returns_exchanges%rowtype; old_item record; json_item jsonb; new_item_id uuid;
  product_id_value uuid; variant_id_value uuid; quantity_value integer; unit_price_value numeric(12,2);
  subtotal_value numeric(12,2):=0; current_stock integer; current_status text; movement_id uuid;
begin
  select * into case_row from public.returns_exchanges where id=p_case_id for update;
  if not found then raise exception 'Değişim kaydı bulunamadı.'; end if;
  if case_row.type<>'exchange' then raise exception 'Bu kayıt değişim kaydı değil.'; end if;
  if case_row.status='completed' then return; end if;
  if case_row.status<>'approved' then raise exception 'Değişim önce onaylanmalı.'; end if;
  if jsonb_array_length(coalesce(case_row.exchange_items,'[]'::jsonb))=0 then raise exception 'Değişim ürünleri boş.'; end if;
  for old_item in select oi.* from public.order_items oi where oi.order_id=case_row.order_id order by oi.id loop
    if old_item.variant_id is not null and exists(select 1 from public.inventory_movements m where m.movement_key='sale:'||old_item.id::text) then
      movement_id:=null;
      insert into public.inventory_movements(movement_key,movement_type,order_id,order_item_id,return_case_id,product_id,variant_id,quantity)
      values('exchange-restore:'||case_row.id::text||':'||old_item.id::text,'exchange_restore',case_row.order_id,old_item.id,case_row.id,old_item.product_id,old_item.variant_id,greatest(coalesce(old_item.quantity,1),1))
      on conflict(movement_key) do nothing returning id into movement_id;
      if movement_id is not null then
        update public.product_variants set stock=coalesce(stock,0)+greatest(coalesce(old_item.quantity,1),1),
          stock_status=case when stock_status='preorder' then 'preorder' else 'in_stock' end,updated_at=now() where id=old_item.variant_id;
        perform public.refresh_product_stock_status(old_item.product_id);
      end if;
    end if;
  end loop;
  delete from public.order_items where order_id=case_row.order_id;
  for json_item in select value from jsonb_array_elements(case_row.exchange_items) loop
    product_id_value:=nullif(json_item->>'product_id','')::uuid; variant_id_value:=nullif(json_item->>'variant_id','')::uuid;
    quantity_value:=greatest(coalesce((json_item->>'quantity')::integer,1),1); unit_price_value:=greatest(coalesce((json_item->>'unit_price')::numeric,0),0);
    if product_id_value is null then raise exception 'Değişim ürün id bilgisi eksik.'; end if;
    if variant_id_value is not null then
      select coalesce(stock,0),coalesce(stock_status,'in_stock') into current_stock,current_status
      from public.product_variants where id=variant_id_value and product_id=product_id_value and coalesce(is_active,true)=true for update;
      if not found then raise exception 'Değişim varyantı bulunamadı veya pasif.'; end if;
      if current_status<>'preorder' and current_stock<quantity_value then raise exception 'Değişim ürünü için yetersiz stok. Mevcut: %, istenen: %',current_stock,quantity_value; end if;
    end if;
    insert into public.order_items(order_id,product_id,variant_id,product_slug,product_name,variant_name,quantity,unit_price,total_price,image_url)
    values(case_row.order_id,product_id_value,variant_id_value,coalesce(nullif(json_item->>'product_slug',''),'manual'),coalesce(nullif(json_item->>'product_name',''),'Ürün'),
      nullif(json_item->>'variant_name',''),quantity_value,unit_price_value,quantity_value*unit_price_value,nullif(json_item->>'image_url','')) returning id into new_item_id;
    subtotal_value:=subtotal_value+quantity_value*unit_price_value;
    if variant_id_value is not null then
      insert into public.inventory_movements(movement_key,movement_type,order_id,order_item_id,return_case_id,product_id,variant_id,quantity)
      values('sale:'||new_item_id::text,'exchange_sale',case_row.order_id,new_item_id,case_row.id,product_id_value,variant_id_value,-quantity_value);
      update public.product_variants set stock=greatest(0,coalesce(stock,0)-quantity_value),
        stock_status=case when current_status='preorder' then 'preorder' when greatest(0,coalesce(stock,0)-quantity_value)>0 then 'in_stock' else 'out_of_stock' end,
        updated_at=now() where id=variant_id_value;
      perform public.refresh_product_stock_status(product_id_value);
    end if;
  end loop;
  update public.orders set subtotal=subtotal_value,total_amount=greatest(0,subtotal_value+coalesce(shipping_fee,0)+coalesce(tax_total,0)-coalesce(discount_total,0)),updated_at=now()
  where id=case_row.order_id;
  update public.returns_exchanges set status='completed',updated_at=now() where id=p_case_id;
end;
$$;

-- New functions are operational and must never be directly callable by browser roles.
do $$
declare fn record; signature text;
begin
  for fn in select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef
  loop
    signature:=format('%I.%I(%s)',fn.nspname,fn.proname,fn.args);
    execute format('revoke all privileges on function %s from PUBLIC, anon, authenticated',signature);
    execute format('grant execute on function %s to service_role',signature);
  end loop;
end $$;
