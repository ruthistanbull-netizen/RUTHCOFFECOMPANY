alter table public.products add column if not exists product_code text;

create unique index if not exists products_product_code_unique
  on public.products (product_code)
  where product_code is not null and product_code <> '';

notify pgrst, 'reload schema';
