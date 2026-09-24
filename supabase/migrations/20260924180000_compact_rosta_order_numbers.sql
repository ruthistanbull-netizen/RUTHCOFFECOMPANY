-- Compact ROSTA order numbers: RST + YY + 4 random digits (RST26XXXX).
-- Keep checkout_drafts.merchant_oid synchronized with the customer-facing order number.

begin;

create or replace function public.generate_compact_rosta_order_no()
returns text
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  year_code text := to_char(current_timestamp at time zone 'Europe/Istanbul', 'YY');
  candidate text;
begin
  loop
    candidate := 'RST' || year_code || lpad((floor(random() * 10000))::int::text, 4, '0');

    if not exists (select 1 from public.orders where order_no = candidate)
       and not exists (select 1 from public.checkout_drafts where order_no = candidate)
       and not exists (select 1 from public.checkout_drafts where merchant_oid = candidate) then
      return candidate;
    end if;
  end loop;
end;
$$;

create or replace function public.compact_rosta_checkout_draft_order_no()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if new.order_no is null
     or new.order_no = ''
     or (new.order_no like 'RST%' and new.order_no !~ '^RST[0-9]{6}$') then
    new.order_no := public.generate_compact_rosta_order_no();
  end if;

  if new.order_no ~ '^RST[0-9]{6}$' then
    new.merchant_oid := new.order_no;
  elsif new.merchant_oid is null or new.merchant_oid = '' then
    new.merchant_oid := new.order_no;
  end if;

  return new;
end;
$$;

create or replace function public.compact_rosta_order_order_no()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if new.order_no is null
     or new.order_no = ''
     or (new.order_no like 'RST%' and new.order_no !~ '^RST[0-9]{6}$') then
    new.order_no := public.generate_compact_rosta_order_no();
  end if;

  return new;
end;
$$;

drop trigger if exists checkout_drafts_compact_rosta_order_no on public.checkout_drafts;
create trigger checkout_drafts_compact_rosta_order_no
before insert or update on public.checkout_drafts
for each row
execute function public.compact_rosta_checkout_draft_order_no();

drop trigger if exists orders_compact_rosta_order_no on public.orders;
create trigger orders_compact_rosta_order_no
before insert on public.orders
for each row
execute function public.compact_rosta_order_order_no();

revoke all on function public.generate_compact_rosta_order_no() from public, anon, authenticated;
revoke all on function public.compact_rosta_checkout_draft_order_no() from public, anon, authenticated;
revoke all on function public.compact_rosta_order_order_no() from public, anon, authenticated;

grant execute on function public.generate_compact_rosta_order_no() to service_role;
grant execute on function public.compact_rosta_checkout_draft_order_no() to service_role;
grant execute on function public.compact_rosta_order_order_no() to service_role;

commit;
