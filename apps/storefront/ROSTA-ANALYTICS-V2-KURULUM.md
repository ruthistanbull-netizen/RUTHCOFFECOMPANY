# ROSTA Analytics V2 Kurulum

ROSTA storefront ve panel aynı ROSTA Supabase projesindeki analytics altyapısını kullanır.

## Environment

Kullanılan entegrasyona göre ilgili servislerde şu değişkenler tanımlanabilir:

- `NEXT_PUBLIC_META_PIXEL_ID`
- `META_PIXEL_ID`
- `META_CAPI_ACCESS_TOKEN`
- `NEXT_PUBLIC_GA_MEASUREMENT_ID`
- `GA4_API_SECRET`
- `NEXT_PUBLIC_SITE_URL`

## Deployment

- Storefront: `https://rostacoffecompany.zeabur.app`
- Admin: `https://rostapanel.zeabur.app`
- Deployment Zeabur üzerinden yapılır.
- ROSTA dışındaki Supabase/API projeleri runtime kaynağı olarak kullanılmaz.

## Veri kapsamı

Analytics; mevcut ROSTA ziyaretleri ve olaylarından ilk/son temas, oturum, sayfa/ürün görüntüleme, sepete ekleme, checkout ve sipariş yolculuğu gibi metrikleri üretir. Eski sistemdeki sipariş veya müşteri geçmişi ROSTA analytics verisine aktarılmaz.
