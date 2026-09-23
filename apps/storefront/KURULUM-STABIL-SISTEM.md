# ROSTA Coffee Website Stabil Sistem

Bu paket website tarafında tema ve ürün/koleksiyon verisini Supabase'den canlı okumaya öncelik verir.

Gerekli env değişkenleri:

- `REVALIDATE_SECRET`: admin paneldeki `WEBSITE_REVALIDATE_SECRET` ile aynı değer
- `NEXT_PUBLIC_FORCE_LIVE_SUPABASE_READS=true` veya boş bırakılabilir. Boşken de canlı okuma aktiftir.
- `NEXT_PUBLIC_USE_SUPABASE_CATALOG=true` veya boş bırakılabilir.

Admin panel ürün, kategori, koleksiyon veya tema kaydettiğinde website `/api/revalidate` endpoint'i ile yenilenir. Ürünler ayrıca canlı okunduğu için paneldeki değişiklikler eski cache'e takılmaz.
