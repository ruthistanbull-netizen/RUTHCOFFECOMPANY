# ROSTA Coffee Co. Commerce

ROSTA Coffee Co. için bağımsız storefront + admin commerce monoreposu.

## Uygulamalar

- Storefront: `apps/storefront`
- Admin panel: `apps/admin`
- Shared contracts/runtime: `packages/contracts`, `packages/commerce-core`, `packages/ui`
- Supabase migrations: `supabase/migrations`

## Production

- Storefront: https://rostacoffecompany.zeabur.app
- Admin: https://rostapanel.zeabur.app
- Supabase project ref: `fposvxuryzidmeuwytbg`

## Isolation contract

ROSTA runtime, legacy commerce servislerinden bağımsızdır.

- Admin ve storefront yalnızca ROSTA Supabase project ref'ine bağlanabilir.
- Service-role anahtarı yalnızca server runtime'da kullanılır.
- Admin storefront revalidation yalnızca ROSTA storefront URL'sine gider.
- Commerce worker, order confirmation queue ve analytics ROSTA Supabase içinde çalışır.
- Legacy statik ürün kataloğu runtime fallback olarak kullanılmaz.
- Sosyal hesaplar yalnızca `NEXT_PUBLIC_ROSTA_*` env değişkenleri üzerinden etkinleşir.

## Zeabur build

Storefront için kök `Dockerfile`, admin panel için `Dockerfile.admin` kullanılır.

Gerekli production env değerleri için:

- `apps/storefront/.env.example`
- `apps/admin/.env.example`
