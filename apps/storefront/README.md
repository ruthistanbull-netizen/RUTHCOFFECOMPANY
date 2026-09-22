# ROSTA Coffee Co. Storefront

ROSTA Coffee Co. storefront, Next.js tabanlı kahve perakende/toptan satış ve marka deneyimidir.

## Production

- Storefront: `https://rostacoffecompany.zeabur.app`
- Admin: `https://rostapanel.zeabur.app`
- Supabase project ref: `fposvxuryzidmeuwytbg`
- Deploy platform: Zeabur

## Ana sayfalar

- `/`
- `/products`
- `/products/[slug]`
- `/collections`
- `/collections/[slug]`
- `/category/[slug]`
- `/about`
- `/contact`
- `/shipping-returns`
- `/privacy-policy`
- `/terms`
- `/kvkk`

## Environment

Güncel örnek değerler için `.env.example` dosyasını kullan.

Temel Supabase değişkenleri:

```env
NEXT_PUBLIC_SUPABASE_URL=https://fposvxuryzidmeuwytbg.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ROSTA anon/publishable key>
SUPABASE_SERVICE_ROLE_KEY=<ROSTA service-role key; server-only>
NEXT_PUBLIC_SITE_URL=https://rostacoffecompany.zeabur.app
```

`SUPABASE_SERVICE_ROLE_KEY` hiçbir zaman browser bundle içine taşınmaz.

## İzolasyon

Storefront yalnız ROSTA Supabase ve ROSTA servislerini kullanır. Eski marka ürün, müşteri, sipariş veya katalog kayıtları fallback olarak kullanılmaz.
