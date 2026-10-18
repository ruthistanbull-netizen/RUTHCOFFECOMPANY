-- One database per brand. Run independently against each self-hosted database.
begin;
create table public.finance_settings (
 id boolean primary key default true check(id), brand text not null check(brand in ('ruth','rosta')),
 recognition text not null default 'paid' check(recognition in ('paid','delivered')),
 currency text not null default 'TRY', tax_complete boolean not null default false,
 depreciation_complete boolean not null default false, created_at timestamptz not null default now()
);
-- Set the brand explicitly in the brand-specific migration.
insert into public.finance_settings(id,brand) values(true,'rosta');
create table public.finance_permissions (
 user_id uuid not null, permission text not null check(permission in ('view','expense_create','expense_edit','income_create','pay','settings','export','void')),
 primary key(user_id,permission)
);
create table public.finance_categories (
 id uuid primary key default gen_random_uuid(), name text not null unique,
 parent_id uuid references public.finance_categories(id), active boolean not null default true
);
insert into public.finance_categories(name) select unnest(array['Ürün alış maliyeti','Kahve maliyeti','Hammadde','Üretim malzemesi','Üretim işçiliği','Dış üretim','Kargo','İade kargo','Kutu','Poşet','Etiket','Paketleme','PayTR komisyonu','Banka işlem ücreti','Diğer komisyon','Meta Ads','Google Ads','Influencer','Fotoğraf / video','Ajans','Diğer reklam','Zeabur','OVHCloud','Domain','E-posta','Yazılım abonelikleri','Sunucu','Kira','Elektrik','Su','İnternet','Telefon','Ofis','Bakım / onarım','Maaş','SGK işveren','Prim','Yan haklar','Muhasebe','Hukuk','Tasarım','Danışmanlık','Diğer dış hizmet','Kredi faizi','Finansman','Vergi','Ceza','Diğer','Satış','Kargo geliri','Toptan kahve']);
create table public.finance_accounts (
 id uuid primary key default gen_random_uuid(), name text not null unique,
 kind text not null check(kind in ('cash','bank','processor')), currency text not null default 'TRY',
 opening numeric(18,2) not null default 0, opening_date date not null default current_date
);
insert into public.finance_accounts(name,kind) values('Kasa','cash'),('Banka','bank'),('PayTR bekleyen','processor'),('Manuel tahsilatlar (hesap belirtilmedi)','processor');
create table public.finance_entries (
 id uuid primary key default gen_random_uuid(), title text not null check(length(title) between 1 and 240),
 direction text not null check(direction in ('income','expense')),
 nature text not null default 'operating' check(nature in ('sale','operating','inventory','asset','loan','owner','tax','financing','transfer')),
 category_id uuid references public.finance_categories(id), currency text not null default 'TRY' check(currency ~ '^[A-Z]{3}$'),
 net numeric(18,2) not null check(net>=0), tax numeric(18,2) not null default 0 check(tax>=0),
 gross numeric(18,2) generated always as (net+tax) stored,
 occurred_on date not null, due_on date, supplier text, description text, channel text not null default 'other',
 source text not null default 'manual', source_id text, order_id uuid references public.orders(id) on delete set null,
 product_id uuid references public.products(id) on delete set null, cancelled boolean not null default false,
 estimated boolean not null default false, version integer not null default 1,
 metadata jsonb not null default '{}', created_by uuid, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), unique(source,source_id)
);
create index finance_entries_period on public.finance_entries(occurred_on desc,id) where not cancelled;
create index finance_entries_category on public.finance_entries(category_id,occurred_on);
create index finance_entries_order on public.finance_entries(order_id);
create table public.finance_payments (
 id uuid primary key default gen_random_uuid(), entry_id uuid references public.finance_entries(id),
 account_id uuid not null references public.finance_accounts(id), to_account_id uuid references public.finance_accounts(id),
 direction text not null check(direction in ('in','out','transfer')),
 amount numeric(18,2) not null check(amount>0), paid_on date not null,
 method text not null default 'bank', source text not null default 'manual', source_id text not null,
 created_by uuid, created_at timestamptz not null default now(), unique(source,source_id),
 check((direction='transfer' and to_account_id is not null and to_account_id<>account_id and entry_id is null) or (direction<>'transfer' and to_account_id is null))
);
create index finance_payments_period on public.finance_payments(paid_on,entry_id);
create table public.finance_costs (
 id uuid primary key default gen_random_uuid(), product_id uuid not null,
 variant_id uuid, currency text not null default 'TRY',
 -- Coffee is purchased ready-roasted. No green bean, roasting or roast loss inputs.
 coffee_per_kg numeric(18,4), grams numeric(12,3), purchase numeric(18,4),
 packaging numeric(18,4) not null default 0, label numeric(18,4) not null default 0,
 labor numeric(18,4) not null default 0, other numeric(18,4) not null default 0,
 effective_at timestamptz not null default now(), created_by uuid,
 check(coffee_per_kg is null or coffee_per_kg>=0), check(grams is null or grams>0),
 check(purchase is null or purchase>=0), check(least(packaging,label,labor,other)>=0)
);
create index finance_cost_lookup on public.finance_costs(product_id,variant_id,effective_at desc);
create table public.finance_item_snapshots (
 id uuid primary key default gen_random_uuid(), item_id uuid unique references public.order_items(id) on delete set null, order_id uuid not null,
 unit_cost numeric(18,4), quantity integer not null, returned_quantity integer not null default 0,
 currency text not null, basis text not null check(basis in ('at_sale','historical_missing','reviewed')),
 captured_at timestamptz not null default now(), check(returned_quantity between 0 and quantity)
);
create index finance_snapshot_order on public.finance_item_snapshots(order_id);
create table public.finance_recurring (
 id uuid primary key default gen_random_uuid(), template jsonb not null, start_on date not null,
 next_on date not null, end_on date, frequency text not null check(frequency in ('weekly','monthly','quarterly','yearly','custom')),
 interval_days integer check(interval_days>0), active boolean not null default true, created_by uuid,
 check(end_on is null or end_on>=start_on), check(frequency<>'custom' or interval_days is not null)
);
create table public.finance_documents (
 id uuid primary key default gen_random_uuid(), entry_id uuid not null references public.finance_entries(id),
 path text not null unique, name text not null, mime text not null, size integer not null check(size between 1 and 10485760),
 created_by uuid, created_at timestamptz not null default now(), archived boolean not null default false
);
create table public.finance_budgets (
 id uuid primary key default gen_random_uuid(), month date not null check(extract(day from month)=1),
 category_id uuid not null references public.finance_categories(id), currency text not null default 'TRY',
 amount numeric(18,2) not null check(amount>0), unique(month,category_id,currency)
);
create table public.finance_reconciliations (
 id uuid primary key default gen_random_uuid(), payment_id uuid not null references public.finance_payments(id),
 reference text not null unique, note text, created_by uuid, created_at timestamptz not null default now()
);
create table public.finance_audit (
 id bigint generated always as identity primary key, entity text not null, entity_id text,
 action text not null, before_data jsonb, after_data jsonb, actor uuid,
 created_at timestamptz not null default now()
);
create index finance_audit_entity on public.finance_audit(entity,entity_id,created_at desc);

create function public.finance_audit_change() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 insert into finance_audit(entity,entity_id,action,before_data,after_data,actor)
 values(tg_table_name,coalesce(to_jsonb(new)->>'id',to_jsonb(old)->>'id',to_jsonb(new)->>'user_id',to_jsonb(old)->>'user_id'),tg_op,
 case when tg_op<>'INSERT' then to_jsonb(old) end,case when tg_op<>'DELETE' then to_jsonb(new) end,
 nullif(current_setting('finance.actor',true),'')::uuid);
 return coalesce(new,old);
end $$;
do $$ declare t text; begin
 foreach t in array array['finance_settings','finance_permissions','finance_categories','finance_accounts','finance_entries','finance_payments','finance_costs','finance_item_snapshots','finance_recurring','finance_documents','finance_budgets','finance_reconciliations'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select,insert,update,delete on public.%I to service_role',t);
 execute format('create trigger finance_audit after insert or update or delete on public.%I for each row execute function public.finance_audit_change()',t);
 end loop;
end $$;
alter table public.finance_audit enable row level security;
revoke all on public.finance_audit from public,anon,authenticated;
grant select,insert on public.finance_audit to service_role;
grant usage,select on sequence public.finance_audit_id_seq to service_role;

create function public.finance_unit_cost(p_product uuid,p_variant uuid default null,p_at timestamptz default now(),p_seen uuid[] default '{}',p_currency text default null)
returns numeric language plpgsql stable security invoker set search_path=public as $$
declare c finance_costs; p jsonb; b jsonb; component numeric; total numeric:=0; base numeric; begin
 if p_product=any(p_seen) or cardinality(p_seen)>10 then return null; end if;
 select * into c from finance_costs where product_id=p_product and (variant_id=p_variant or variant_id is null) and effective_at<=p_at
 order by (variant_id is not null) desc,effective_at desc,id desc limit 1;
 select to_jsonb(products) into p from products where id=p_product;
 if p_currency is null then p_currency:=coalesce(p->>'currency','TRY'); end if;
 if c.id is not null and c.currency<>p_currency then return null; end if;
 if coalesce((p->>'is_bundle')::boolean,false) or p->>'product_type'='bundle' then
   if jsonb_typeof(p->'bundle_items') is distinct from 'array' or jsonb_array_length(p->'bundle_items')=0 then return null; end if;
   for b in select value from jsonb_array_elements(p->'bundle_items') loop
    component:=finance_unit_cost((b->>'product_id')::uuid,nullif(b->>'variant_id','')::uuid,p_at,p_seen||p_product,p_currency);
    if component is null then return null; end if;
    total:=total+component*greatest(coalesce((b->>'quantity')::integer,1),1);
   end loop;
   return total+coalesce(c.packaging,0)+coalesce(c.label,0)+coalesce(c.labor,0)+coalesce(c.other,0);
 end if;
 if c.id is null then return null; end if;
 if (select brand from finance_settings where id)='rosta' then
  if c.coffee_per_kg is null or c.grams is null then return null; end if;
  base:=c.coffee_per_kg*c.grams/1000;
 else base:=c.purchase; end if;
 return base+c.packaging+c.label+c.labor+c.other;
exception when invalid_text_representation or numeric_value_out_of_range then return null;
end $$;

-- Trigger runs as definer only because customer order writes cannot access private finance data.
-- Not callable through the public Data API; execute grants are revoked below.
create function public.finance_capture_item() returns trigger language plpgsql security definer set search_path=public as $$
declare o orders; begin
 select * into o from orders where id=new.order_id;
 insert into finance_item_snapshots(item_id,order_id,unit_cost,quantity,currency,basis)
 values(new.id,new.order_id,finance_unit_cost(new.product_id,new.variant_id,o.created_at,'{}',o.currency),new.quantity,o.currency,'at_sale') on conflict(item_id) do nothing;
 return new;
end $$;
create trigger finance_capture_item after insert on public.order_items for each row execute function public.finance_capture_item();

create function public.finance_sync_order(p_order uuid) returns void language plpgsql security invoker set search_path=public as $$
declare o jsonb; recognized boolean; collected boolean; c text; ref numeric; net_total numeric; vat numeric; account uuid; e uuid; dt date; begin
 select to_jsonb(orders) into o from orders where id=p_order;
 if o is null then return; end if;
 dt:=(coalesce((o->>'created_at')::timestamptz,now()) at time zone 'Europe/Istanbul')::date;
 collected:=o->>'payment_status' in ('paid','succeeded','partially_refunded','refunded');
 recognized:=collected and o->>'status' not in ('cancelled','failed') and
 ((select recognition from finance_settings where id)='paid' or nullif(o->>'delivered_at','') is not null or o->>'status' in ('delivered','completed'));
 c:=coalesce(case when o->>'traffic_source' in ('ios_app','mobile_app','app','native_app','application') then 'ios' end,nullif(o->'attribution_data'->>'platform',''),nullif(o->>'sales_channel',''),case when o->>'imported_source' in ('wholesale','b2b','bulk') then 'wholesale' when o->>'imported_source'='manual' then 'manual' else 'website' end);
 if c in ('ios','ios_app','app') then c:='ios'; elsif c in ('web','web_storefront','storefront') then c:='website'; elsif c not in ('website','manual','wholesale','consulting') then c:='other'; end if;
 ref:=least(coalesce((o->>'refunded_total')::numeric,0),coalesce((o->>'total_amount')::numeric,0));
 if o->>'payment_status'='refunded' then ref:=coalesce((o->>'total_amount')::numeric,0); end if;
 net_total:=greatest(coalesce((o->>'total_amount')::numeric,0)-ref,0);
 vat:=case when coalesce((o->>'total_amount')::numeric,0)>0 then least(net_total,greatest(0,round(coalesce((o->>'tax_total')::numeric,0)*net_total/(o->>'total_amount')::numeric,2))) else 0 end;
 insert into finance_entries(title,direction,nature,category_id,net,tax,currency,occurred_on,channel,source,source_id,order_id,cancelled,metadata)
 values(coalesce(o->>'order_no',p_order::text),'income','sale',(select id from finance_categories where name='Satış'),net_total-vat,vat,case when upper(coalesce(o->>'currency','TRY')) in ('TL','TRL') then 'TRY' else upper(coalesce(o->>'currency','TRY')) end,dt,c,'order',p_order::text,p_order,not recognized,
 jsonb_build_object('customer',o->>'customer_name','gross_sales',coalesce((o->>'subtotal')::numeric,0),'discounts',coalesce((o->>'discount_total')::numeric,0),'refunds',ref,'shipping_income',coalesce((o->>'shipping_fee')::numeric,0),'tax_known',o?'tax_total','refund_date_known',nullif(o->>'refunded_at','') is not null))
 on conflict(source,source_id) do update set net=excluded.net,tax=excluded.tax,cancelled=excluded.cancelled,metadata=excluded.metadata,channel=excluded.channel,version=finance_entries.version+1,updated_at=now()
 returning id into e;
 select id into account from finance_accounts where name=case when c='manual' then 'Manuel tahsilatlar (hesap belirtilmedi)' else 'PayTR bekleyen' end;
 if collected then
 insert into finance_payments(entry_id,account_id,direction,amount,paid_on,method,source,source_id)
 select e,account,'in',(o->>'total_amount')::numeric,dt,'paytr','order_collection',p_order::text where (o->>'total_amount')::numeric>0
 on conflict(source,source_id) do nothing;
 end if;
 -- A cumulative refund is one adjustment event; repeated callbacks update rather than append.
 if ref>0 then
 insert into finance_payments(entry_id,account_id,direction,amount,paid_on,method,source,source_id)
 values(e,account,'out',ref,(coalesce(nullif(o->>'refunded_at','')::timestamptz,now()) at time zone 'Europe/Istanbul')::date,'paytr','order_refund',p_order::text)
 on conflict(source,source_id) do update set amount=excluded.amount;
 end if;
end $$;
create function public.finance_order_changed() returns trigger language plpgsql security definer set search_path=public as $$
begin perform finance_sync_order(new.id); return new; end $$;
create trigger finance_order_changed after insert or update on public.orders for each row execute function public.finance_order_changed();

-- Bounded, repeatable history import. Never infer historic costs from today's costs.
create function public.finance_backfill(p_after uuid default null,p_limit integer default 200) returns jsonb language plpgsql security invoker set search_path=public as $$
declare o orders; last_id uuid; n integer:=0; begin
 for o in select * from orders where p_after is null or id>p_after order by id limit least(greatest(p_limit,1),500) loop
  perform finance_sync_order(o.id);
  insert into finance_item_snapshots(item_id,order_id,unit_cost,quantity,currency,basis)
  select i.id,i.order_id,null,i.quantity,o.currency,'historical_missing' from order_items i where i.order_id=o.id on conflict(item_id) do nothing;
  n:=n+1; last_id:=o.id;
 end loop;
 return jsonb_build_object('count',n,'cursor',last_id);
end $$;

create function public.finance_save(p_action text,p_data jsonb,p_actor uuid) returns jsonb language plpgsql security invoker set search_path=public as $$
declare e finance_entries; v_id uuid; v_amount numeric; net numeric; tax numeric; r numeric; existing finance_entries; account finance_accounts; rule finance_recurring; snap finance_item_snapshots; begin
 perform set_config('finance.actor',p_actor::text,true);
 if p_action='entry' then
  v_id:=coalesce(nullif(p_data->>'id','')::uuid,gen_random_uuid());
  select * into existing from finance_entries where finance_entries.id=v_id for update;
  if existing.id is not null and existing.created_by=p_actor and existing.metadata->>'request_hash'=md5((p_data-'version')::text) then return to_jsonb(existing); end if;
  if existing.id is not null and (existing.source<>'manual' or existing.cancelled) then raise exception 'Otomatik veya iptal edilmiş kayıt düzenlenemez'; end if;
  if existing.id is not null and existing.version<>coalesce((p_data->>'version')::integer,0) then raise exception 'Kayıt değişti. Yenileyip tekrar deneyin'; end if;
  if existing.id is not null and exists(select 1 from finance_payments where entry_id=existing.id) and (existing.direction is distinct from p_data->>'direction' or existing.currency is distinct from coalesce(p_data->>'currency','TRY')) then raise exception 'Ödenmiş kaydın yönü veya para birimi değiştirilemez'; end if;
  v_amount:=(p_data->>'amount')::numeric; r:=coalesce((p_data->>'tax_rate')::numeric,0);
  if v_amount is null or v_amount<0 or v_amount>999999999999.99 or r<0 or r>100 then raise exception 'Tutar veya KDV geçersiz'; end if;
  if coalesce((p_data->>'tax_included')::boolean,true) then net:=round(v_amount/(1+r/100),2); tax:=round(v_amount-net,2); else net:=round(v_amount,2); tax:=round(v_amount*r/100,2); end if;
  if existing.id is not null and net+tax<(select coalesce(sum(case when direction='in' then amount else amount end),0) from finance_payments where entry_id=v_id) then raise exception 'Tutar yapılan ödemeden küçük olamaz'; end if;
  insert into finance_entries(id,title,direction,nature,category_id,net,tax,currency,occurred_on,due_on,supplier,description,channel,product_id,order_id,metadata,created_by)
  values(v_id,p_data->>'title',p_data->>'direction',coalesce(p_data->>'nature','operating'),nullif(p_data->>'category_id','')::uuid,net,tax,coalesce(p_data->>'currency','TRY'),(p_data->>'occurred_on')::date,nullif(p_data->>'due_on','')::date,p_data->>'supplier',p_data->>'description',coalesce(p_data->>'channel','other'),nullif(p_data->>'product_id','')::uuid,nullif(p_data->>'order_id','')::uuid,jsonb_build_object('tax_rate',r,'request_hash',md5((p_data-'version')::text)),p_actor)
  on conflict on constraint finance_entries_pkey do update set title=excluded.title,direction=excluded.direction,nature=excluded.nature,category_id=excluded.category_id,net=excluded.net,tax=excluded.tax,currency=excluded.currency,occurred_on=excluded.occurred_on,due_on=excluded.due_on,supplier=excluded.supplier,description=excluded.description,channel=excluded.channel,metadata=excluded.metadata,version=finance_entries.version+1,updated_at=now() returning * into e;
  if p_data ? 'recurrence' and p_data->'recurrence' is not null then
   insert into finance_recurring(template,start_on,next_on,end_on,frequency,interval_days,created_by)
   values(p_data-'id'-'version'-'recurrence',e.occurred_on,e.occurred_on,nullif(p_data->'recurrence'->>'end_on','')::date,p_data->'recurrence'->>'frequency',nullif(p_data->'recurrence'->>'interval_days','')::integer,p_actor) returning * into rule;
   update finance_entries set source='recurring',source_id=rule.id::text||':'||e.occurred_on::text where finance_entries.id=e.id returning * into e;
  end if;
  return to_jsonb(e);
 elsif p_action='void' then
  select * into e from finance_entries where finance_entries.id=(p_data->>'id')::uuid for update;
  if e.id is null or e.source<>'manual' then raise exception 'Kaynak sistemden yönetilen kayıt iptal edilemez'; end if;
  if exists(select 1 from finance_payments where entry_id=e.id) then raise exception 'Ödenmiş kayıt iptal edilemez; önce ters ödeme kaydı gerekir'; end if;
  update finance_entries set cancelled=true,version=version+1,updated_at=now() where finance_entries.id=e.id returning * into e;
  return to_jsonb(e);
 elsif p_action='payment' then
  v_id:=(p_data->>'entry_id')::uuid;
  select * into e from finance_entries where finance_entries.id=v_id for update;
  v_amount:=(p_data->>'amount')::numeric;
  if e.id is null or e.cancelled or e.source<>'manual' or v_amount is null or v_amount<=0 then raise exception 'Ödeme kaydı geçersiz'; end if;
  select * into account from finance_accounts where finance_accounts.id=(p_data->>'account_id')::uuid;
  if account.id is null or account.currency<>e.currency then raise exception 'Hesap para birimi uyuşmuyor'; end if;
  if exists(select 1 from finance_payments where source='manual' and source_id=p_data->>'key') then return jsonb_build_object('duplicate',true); end if;
  if v_amount+(select coalesce(sum(amount),0) from finance_payments where entry_id=v_id)>e.gross then raise exception 'Ödeme kalan borcu aşıyor'; end if;
  insert into finance_payments(entry_id,account_id,direction,amount,paid_on,method,source_id,created_by)
  values(v_id,account.id,case when e.direction='income' then 'in' else 'out' end,v_amount,(p_data->>'paid_on')::date,coalesce(p_data->>'method','bank'),p_data->>'key',p_actor);
 elsif p_action='category' then
  insert into finance_categories(name,parent_id) values(p_data->>'name',nullif(p_data->>'parent_id','')::uuid);
 elsif p_action='cost' then
  insert into finance_costs(product_id,variant_id,currency,coffee_per_kg,grams,purchase,packaging,label,labor,other,created_by)
  values((p_data->>'product_id')::uuid,nullif(p_data->>'variant_id','')::uuid,coalesce(p_data->>'currency','TRY'),nullif(p_data->>'coffee_per_kg','')::numeric,nullif(p_data->>'grams','')::numeric,nullif(p_data->>'purchase','')::numeric,coalesce((p_data->>'packaging')::numeric,0),coalesce((p_data->>'label')::numeric,0),coalesce((p_data->>'labor')::numeric,0),coalesce((p_data->>'other')::numeric,0),p_actor);
 elsif p_action='account' then
  insert into finance_accounts(name,kind,currency,opening,opening_date) values(p_data->>'name',p_data->>'kind',coalesce(p_data->>'currency','TRY'),coalesce((p_data->>'opening')::numeric,0),coalesce((p_data->>'opening_date')::date,current_date));
 elsif p_action='transfer' then
  select * into account from finance_accounts where finance_accounts.id=(p_data->>'account_id')::uuid;
  if account.currency<>(select currency from finance_accounts where finance_accounts.id=(p_data->>'to_account_id')::uuid) then raise exception 'Transfer para birimleri uyuşmuyor'; end if;
  insert into finance_payments(account_id,to_account_id,direction,amount,paid_on,source_id,created_by)
  values(account.id,(p_data->>'to_account_id')::uuid,'transfer',(p_data->>'amount')::numeric,(p_data->>'paid_on')::date,p_data->>'key',p_actor) on conflict(source,source_id) do nothing;
 elsif p_action='budget' then
  insert into finance_budgets(month,category_id,currency,amount) values((p_data->>'month')::date,(p_data->>'category_id')::uuid,coalesce(p_data->>'currency','TRY'),(p_data->>'amount')::numeric)
  on conflict(month,category_id,currency) do update set amount=excluded.amount;
 elsif p_action='recurring' then
  v_id:=coalesce(nullif(p_data->>'id','')::uuid,gen_random_uuid());
  insert into finance_recurring(id,template,start_on,next_on,end_on,frequency,interval_days,active,created_by)
  values(v_id,p_data->'template',(p_data->>'start_on')::date,(p_data->>'start_on')::date,nullif(p_data->>'end_on','')::date,p_data->>'frequency',nullif(p_data->>'interval_days','')::integer,coalesce((p_data->>'active')::boolean,true),p_actor)
  on conflict on constraint finance_recurring_pkey do update set template=excluded.template,end_on=excluded.end_on,frequency=excluded.frequency,interval_days=excluded.interval_days,active=excluded.active;
 elsif p_action='settings' then
  update finance_settings set recognition=p_data->>'recognition',tax_complete=coalesce((p_data->>'tax_complete')::boolean,false),depreciation_complete=coalesce((p_data->>'depreciation_complete')::boolean,false) where finance_settings.id;
 elsif p_action='returned' then
  select * into snap from finance_item_snapshots where item_id=(p_data->>'item_id')::uuid for update;
  if snap.item_id is null then raise exception 'Sipariş maliyet kaydı bulunamadı'; end if;
  update finance_item_snapshots set returned_quantity=(p_data->>'quantity')::integer,basis='reviewed' where item_id=snap.item_id;
 elsif p_action='permission' then
  if coalesce((p_data->>'granted')::boolean,true) then
   insert into finance_permissions(user_id,permission) values((p_data->>'user_id')::uuid,p_data->>'permission') on conflict do nothing;
  else delete from finance_permissions where user_id=(p_data->>'user_id')::uuid and permission=p_data->>'permission'; end if;
 elsif p_action='document_create' then
  insert into finance_documents(entry_id,path,name,mime,size,created_by)
  values((p_data->>'entry_id')::uuid,p_data->>'path',p_data->>'name',p_data->>'mime',(p_data->>'size')::integer,p_actor);
 elsif p_action='document_archive' then
  update finance_documents set archived=true where finance_documents.id=(p_data->>'id')::uuid;
 elsif p_action='reconcile' then
  insert into finance_reconciliations(payment_id,reference,note,created_by) values((p_data->>'payment_id')::uuid,p_data->>'reference',p_data->>'note',p_actor);
 else raise exception 'Bilinmeyen finans işlemi'; end if;
 return jsonb_build_object('saved',true);
end $$;

create function public.finance_run_recurring(p_today date default (now() at time zone 'Europe/Istanbul')::date) returns integer language plpgsql security invoker set search_path=public as $$
declare r finance_recurring; d date; next_d date; e jsonb; n integer:=0; begin
 for r in select * from finance_recurring where active and next_on<=p_today for update skip locked loop
  d:=r.next_on;
  while d<=p_today and (r.end_on is null or d<=r.end_on) and n<500 loop
   if not exists(select 1 from finance_entries where source='recurring' and source_id=r.id::text||':'||d::text) then
    e:=finance_save('entry',r.template||jsonb_build_object('occurred_on',d,'due_on',d),r.created_by);
    update finance_entries set source='recurring',source_id=r.id::text||':'||d::text where id=(e->>'id')::uuid;
   end if;
   next_d:=case r.frequency when 'weekly' then d+7 when 'custom' then d+r.interval_days else
    -- Anchor monthly dates to original day, so Jan 31 -> Feb 28 -> Mar 31.
    (date_trunc('month',d)+(case r.frequency when 'monthly' then 1 when 'quarterly' then 3 else 12 end)*interval '1 month')::date
    +least(extract(day from r.start_on)::integer,extract(day from date_trunc('month',d)+(case r.frequency when 'monthly' then 2 when 'quarterly' then 4 else 13 end)*interval '1 month'-interval '1 day')::integer)-1 end;
   d:=next_d; n:=n+1;
  end loop;
  update finance_recurring set next_on=d,active=case when end_on is not null and d>end_on then false else active end where id=r.id;
 end loop;
 return n;
end $$;

create function public.finance_totals(p_from date,p_to date,p_currency text)
returns jsonb language sql stable security invoker set search_path=public as $$
with e as (select * from finance_entries where occurred_on between p_from and p_to and currency=p_currency and not cancelled),
cost as (select coalesce(sum(s.unit_cost*(s.quantity-s.returned_quantity)),0) c,
 count(*) filter(where s.unit_cost is null) missing from finance_item_snapshots s join e on e.order_id=s.order_id and e.nature='sale' where s.item_id is not null),
a as (select coalesce(sum(net) filter(where nature='sale'),0) sales,
 coalesce(sum(net) filter(where direction='income' and nature='operating'),0) other_income,
 coalesce(sum(net) filter(where direction='expense' and nature='operating'),0) expenses,
 coalesce(sum(net) filter(where direction='expense' and nature='tax'),0) taxes,
 coalesce(sum(case when direction='income' then net else -net end) filter(where nature='financing'),0) financing,
 coalesce(sum(tax) filter(where direction='income'),0) output_tax,
 coalesce(sum(tax) filter(where direction='expense'),0) input_tax,
 coalesce(sum((metadata->>'gross_sales')::numeric) filter(where nature='sale'),0) gross_sales,
 coalesce(sum((metadata->>'discounts')::numeric) filter(where nature='sale'),0) discounts,
 coalesce(sum((metadata->>'refunds')::numeric) filter(where nature='sale'),0) refunds,
 coalesce(sum((metadata->>'shipping_income')::numeric) filter(where nature='sale'),0) shipping_income from e),
p as (select coalesce(sum(amount) filter(where direction='in'),0) cash_in,coalesce(sum(amount) filter(where direction='out'),0) cash_out from finance_payments p join finance_accounts ac on ac.id=p.account_id where p.paid_on between p_from and p_to and ac.currency=p_currency),
u as (select coalesce(sum(greatest(e.gross-coalesce(p.paid,0),0)) filter(where e.direction='expense'),0) unpaid,
 coalesce(sum(greatest(e.gross-coalesce(p.paid,0),0)) filter(where e.direction='income'),0) receivables
 from e left join lateral(select sum(amount) paid from finance_payments where entry_id=e.id and paid_on<=p_to) p on true),
v as (select a.*,p.*,u.*,cost.c,cost.missing,
 (select count(*) from e where nature='sale' and not exists(select 1 from finance_item_snapshots s where s.order_id=e.order_id and s.item_id is not null)) missing_orders,
 (select count(*) from e where nature='sale' and coalesce((metadata->>'refunds')::numeric,0)>0 and not exists(select 1 from finance_item_snapshots s where s.order_id=e.order_id and s.item_id is not null and (s.returned_quantity>0 or s.basis='reviewed'))) refund_review
 from a,p,u,cost)
select jsonb_build_object('net_sales',sales::text,'cogs',case when missing+missing_orders+refund_review=0 then c::text end,
'gross_profit',case when missing+missing_orders+refund_review=0 then (sales-c)::text end,
'operating_expenses',expenses::text,'operating_profit',case when missing+missing_orders+refund_review=0 then (sales-c+other_income-expenses)::text end,
'period_result',case when missing+missing_orders+refund_review=0 then (sales-c+other_income-expenses+financing-taxes)::text end,
'margin',case when sales>0 and missing+missing_orders+refund_review=0 then round((sales-c+other_income-expenses)/sales*100,2)::text end,
'cash_in',cash_in::text,'cash_out',cash_out::text,'net_cash',(cash_in-cash_out)::text,'unpaid',unpaid::text,'receivables',receivables::text,
'missing_costs',missing+missing_orders,'refund_review',refund_review,'gross_sales',gross_sales::text,'discounts',discounts::text,'refunds',refunds::text,'shipping_income',shipping_income::text,'input_tax',input_tax::text,'output_tax',output_tax::text,'taxes',taxes::text,'financing',financing::text,
'result_label','Kayıtlı giderlere göre tahmini kâr') from v;
$$;

create function public.finance_report(p_from date,p_to date,p_currency text default 'TRY',p_group text default 'day')
returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare result jsonb; series jsonb; categories jsonb; channels jsonb; products_report jsonb; monthly jsonb; budgets jsonb; accounts jsonb; product_groups jsonb; begin
 if p_from>p_to or p_to-p_from>3660 or p_group not in ('day','week','month','year') then raise exception 'Tarih aralığı veya gruplama geçersiz'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('date',d,'values',finance_totals(greatest(d,p_from),least((d+step-interval '1 day')::date,p_to),p_currency)) order by d),'[]') into series
 from (select generate_series(date_trunc(p_group,p_from::timestamp),p_to::timestamp,case p_group when 'day' then interval '1 day' when 'week' then interval '1 week' when 'month' then interval '1 month' else interval '1 year' end)::date d,
 case p_group when 'day' then interval '1 day' when 'week' then interval '1 week' when 'month' then interval '1 month' else interval '1 year' end step) s;
 select coalesce(jsonb_agg(x),'[]') into categories from (select coalesce(c.name,'Diğer') name,e.category_id,sum(e.net)::text amount from finance_entries e left join finance_categories c on c.id=e.category_id where e.occurred_on between p_from and p_to and e.currency=p_currency and not e.cancelled and e.direction='expense' and e.nature='operating' group by c.name,e.category_id order by sum(e.net) desc) x;
 select coalesce(jsonb_agg(x),'[]') into channels from (select channel name,sum(net)::text amount from finance_entries where occurred_on between p_from and p_to and currency=p_currency and not cancelled and direction='income' and nature in ('sale','operating') group by channel) x;
 with weighted as (
 select i.id,i.product_id,i.product_name,i.quantity,i.total_price,e.net,e.order_id,e.metadata,s.unit_cost,s.returned_quantity,
 sum(i.total_price) over(partition by e.order_id) weight,
 row_number() over(partition by e.order_id order by i.id) rn,
 count(*) over(partition by e.order_id) cnt
 from order_items i join finance_entries e on e.order_id=i.order_id and e.nature='sale' and not e.cancelled
 left join finance_item_snapshots s on s.item_id=i.id where e.occurred_on between p_from and p_to and e.currency=p_currency
 ), rounded as (select *,round(case when weight>0 then net*total_price/weight else net/cnt end,2) allocated from weighted),
 allocated as (select *,case when rn=cnt then net-coalesce(sum(allocated) over(partition by order_id order by id rows between unbounded preceding and 1 preceding),0) else allocated end revenue from rounded),
 product_summary as (
 select product_id,product_name name,sum(quantity) quantity,sum(revenue) revenue,
 case when count(*) filter(where unit_cost is null or (coalesce((metadata->>'refunds')::numeric,0)>0 and coalesce(returned_quantity,0)=0))=0 then sum(unit_cost*(quantity-returned_quantity)) end cost,
 count(*) filter(where unit_cost is null) missing
 from allocated group by product_id,product_name)
 select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('revenue',x.revenue::text,'cost',x.cost::text,'profit',(x.revenue-x.cost)::text,'margin',case when x.revenue>0 then round((x.revenue-x.cost)/x.revenue*100,2)::text end)),'[]') into products_report
 from (select * from product_summary order by revenue desc) x;
 select coalesce(jsonb_agg(jsonb_build_object('date',d,'values',finance_totals(greatest(d,p_from),least((d+interval '1 month'-interval '1 day')::date,p_to),p_currency)) order by d),'[]') into monthly from (select generate_series(date_trunc('month',p_from::timestamp),p_to::timestamp,interval '1 month')::date d) s;
 select coalesce(jsonb_agg(x),'[]') into budgets from (select b.id,b.month,c.name,b.category_id,b.amount::text budget,coalesce(sum(e.net),0)::text spent from finance_budgets b join finance_categories c on c.id=b.category_id left join finance_entries e on e.category_id=b.category_id and not e.cancelled and e.direction='expense' and e.nature='operating' and e.currency=b.currency and date_trunc('month',e.occurred_on)=b.month where b.currency=p_currency and b.month between date_trunc('month',p_from)::date and p_to group by b.id,c.name) x;
 select coalesce(jsonb_agg(x),'[]') into accounts from (select a.id,a.name,a.kind,a.currency,(a.opening+coalesce(sum(case when p.to_account_id=a.id or (p.account_id=a.id and p.direction='in') then p.amount else -p.amount end),0))::text balance from finance_accounts a left join finance_payments p on (p.account_id=a.id or p.to_account_id=a.id) and p.paid_on between a.opening_date and p_to where a.currency=p_currency group by a.id) x;
 with p as (select * from jsonb_to_recordset(products_report) as x(product_id uuid,revenue numeric,cost numeric)), groups as (
 select 'category' kind,c.id,c.name,sum(p.revenue) revenue,case when count(*) filter(where p.cost is null)=0 then sum(p.cost) end cost
 from p join product_categories l on l.product_id=p.product_id join categories c on c.id=l.category_id group by c.id,c.name
 union all
 select 'collection',c.id,c.name,sum(p.revenue),case when count(*) filter(where p.cost is null)=0 then sum(p.cost) end
 from p join product_collections l on l.product_id=p.product_id join collections c on c.id=l.collection_id group by c.id,c.name)
 select coalesce(jsonb_agg(jsonb_build_object('kind',kind,'id',id,'name',name,'revenue',revenue::text,'cost',cost::text,'profit',(revenue-cost)::text)),'[]') into product_groups from groups;
 result:=jsonb_build_object('from',p_from,'to',p_to,'currency',p_currency,'current',finance_totals(p_from,p_to,p_currency),'previous',finance_totals(p_from-(p_to-p_from+1),p_from-1,p_currency),'series',series,'categories',categories,'channels',channels,'products',products_report,'product_groups',product_groups,'monthly',monthly,'budgets',budgets,'accounts',accounts);
 return result;
end $$;

create function public.finance_list(p_filter jsonb) returns jsonb language sql stable security invoker set search_path=public as $$
with records as (
select e.*,coalesce(c.name,'Diğer') category,
 coalesce(p.paid,0)::text paid,greatest(e.gross-coalesce(p.paid,0),0)::text remaining,
 case when e.cancelled then 'cancelled' when coalesce(p.paid,0)>=e.gross then 'paid' when e.due_on<(now() at time zone 'Europe/Istanbul')::date then 'overdue' when coalesce(p.paid,0)>0 then 'partial' else 'unpaid' end status,
 (select count(*) from finance_documents d where d.entry_id=e.id and not archived) documents
from finance_entries e left join finance_categories c on c.id=e.category_id
left join lateral(select sum(case when e.source='order' and direction='out' then -amount else amount end) paid from finance_payments where entry_id=e.id) p on true
where e.occurred_on between (p_filter->>'from')::date and (p_filter->>'to')::date
and e.currency=coalesce(p_filter->>'currency','TRY')
and (coalesce(p_filter->>'direction','all')='all' or e.direction=p_filter->>'direction')
and (nullif(p_filter->>'category_id','') is null or e.category_id=(p_filter->>'category_id')::uuid)
and (nullif(p_filter->>'source','') is null or e.source=p_filter->>'source')
and (nullif(p_filter->>'nature','') is null or e.nature=p_filter->>'nature')
and (nullif(p_filter->>'supplier','') is null or e.supplier ilike '%'||(p_filter->>'supplier')||'%')
and (nullif(p_filter->>'min','') is null or e.gross>=(p_filter->>'min')::numeric)
and (nullif(p_filter->>'max','') is null or e.gross<=(p_filter->>'max')::numeric)
and (nullif(p_filter->>'q','') is null or e.title ilike '%'||(p_filter->>'q')||'%' or e.supplier ilike '%'||(p_filter->>'q')||'%')
), filtered as(select * from records where coalesce(p_filter->>'status','all')='all' or status=p_filter->>'status'),
paged as(select * from filtered order by occurred_on desc,id limit least(coalesce((p_filter->>'limit')::int,50),500) offset greatest(coalesce((p_filter->>'offset')::int,0),0))
select jsonb_build_object('count',(select count(*) from filtered),'records',coalesce((select jsonb_agg(to_jsonb(paged)||jsonb_build_object('net',net::text,'tax',tax::text,'gross',gross::text)) from paged),'[]'));
$$;

create function public.finance_provider_fee(p_data jsonb,p_actor uuid) returns uuid language plpgsql security invoker set search_path=public as $$
declare e uuid; amount numeric; account uuid; begin
 perform set_config('finance.actor',p_actor::text,true);
 amount:=(p_data->>'amount')::numeric;
 if amount is null or amount=0 or p_data->>'type' not in ('S','I') then raise exception 'Geçersiz PayTR gideri'; end if;
 select id into account from finance_accounts where kind='processor' and currency=coalesce(p_data->>'currency','TRY') limit 1;
 if account is null then raise exception 'PayTR hesabı para birimi tanımlanmalı'; end if;
 insert into finance_entries(title,direction,nature,category_id,currency,net,tax,occurred_on,source,source_id,order_id,estimated,metadata,created_by)
 values('PayTR kesintisi · '||(p_data->>'reference'),case when amount>0 then 'expense' else 'income' end,'operating',(select id from finance_categories where name='PayTR komisyonu'),coalesce(p_data->>'currency','TRY'),abs(amount),0,(p_data->>'date')::date,'paytr_fee',p_data->>'key',nullif(p_data->>'order_id','')::uuid,false,jsonb_build_object('tax_breakdown','unavailable','provider_transaction_type',p_data->>'type'),p_actor)
 on conflict(source,source_id) do update set net=excluded.net returning id into e;
 insert into finance_payments(entry_id,account_id,direction,amount,paid_on,method,source,source_id,created_by)
 values(e,account,case when amount>0 then 'out' else 'in' end,abs(amount),(p_data->>'date')::date,'paytr','paytr_fee',p_data->>'key',p_actor)
 on conflict(source,source_id) do update set amount=excluded.amount;
 return e;
end $$;

create table public.finance_bank_rows (
 id uuid primary key default gen_random_uuid(), account_id uuid not null references public.finance_accounts(id),
 occurred_on date not null, amount numeric(18,2) not null check(amount<>0), reference text not null,
 description text, payment_id uuid unique references public.finance_payments(id), created_by uuid,
 created_at timestamptz not null default now(), unique(account_id,occurred_on,amount,reference)
);
alter table public.finance_bank_rows enable row level security;
revoke all on public.finance_bank_rows from public,anon,authenticated;
grant select,insert,update on public.finance_bank_rows to service_role;
create trigger finance_audit after insert or update on public.finance_bank_rows for each row execute function public.finance_audit_change();
create function public.finance_bank_import(p_account uuid,p_rows jsonb,p_actor uuid) returns integer language plpgsql security invoker set search_path=public as $$
declare row jsonb; n integer:=0; begin
 perform set_config('finance.actor',p_actor::text,true);
 if jsonb_array_length(p_rows)>500 then raise exception 'Tek seferde en fazla 500 banka hareketi'; end if;
 for row in select value from jsonb_array_elements(p_rows) loop
  if nullif(row->>'reference','') is null then raise exception 'Banka referansı gerekli'; end if;
  insert into finance_bank_rows(account_id,occurred_on,amount,reference,description,created_by)
  values(p_account,(row->>'date')::date,(row->>'amount')::numeric,row->>'reference',row->>'description',p_actor)
  on conflict(account_id,occurred_on,amount,reference) do nothing;
  if found then n:=n+1; end if;
 end loop;
 return n;
end $$;
create function public.finance_bank_match(p_row uuid,p_payment uuid,p_actor uuid) returns void language plpgsql security invoker set search_path=public as $$
declare b finance_bank_rows; p finance_payments; signed numeric; begin
 perform set_config('finance.actor',p_actor::text,true);
 select * into b from finance_bank_rows where id=p_row for update;
 select * into p from finance_payments where id=p_payment;
 signed:=case when p.to_account_id=b.account_id or (p.account_id=b.account_id and p.direction='in') then p.amount else -p.amount end;
 if b.id is null or p.id is null or (p.account_id<>b.account_id and coalesce(p.to_account_id,'00000000-0000-0000-0000-000000000000')<>b.account_id) or b.amount<>signed or abs(b.occurred_on-p.paid_on)>3 then raise exception 'Hesap, tutar veya tarih eşleşmiyor'; end if;
 update finance_bank_rows set payment_id=p_payment where id=p_row;
end $$;

-- Private receipts, never public URLs or customer-facing bucket policies.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('finance-documents','finance-documents',false,10485760,array['application/pdf','image/jpeg','image/png','image/heic']) on conflict(id) do nothing;
create policy finance_documents_private_access on storage.objects as restrictive for all to anon,authenticated
using (bucket_id <> 'finance-documents') with check (bucket_id <> 'finance-documents');
-- Restrict all finance functions, including security-definer trigger entry points.
do $$ declare f record; begin for f in select oid::regprocedure sig from pg_proc where pronamespace='public'::regnamespace and proname like 'finance_%' loop
 execute format('revoke all on function %s from public,anon,authenticated',f.sig);
 execute format('grant execute on function %s to service_role',f.sig);
 end loop; end $$;
commit;
