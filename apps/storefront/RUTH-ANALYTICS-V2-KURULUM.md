# Ruth Analytics V2 Kurulum

1. `supabase/RUTH-SIPARIS-OTURUM-KAYNAK-TAKIP-SQL.sql` dosyasını Supabase SQL Editor'da çalıştırın. Dosya tekrar çalıştırılabilir.
2. Vercel Environment Variables değerlerinin tanımlı olduğundan emin olun:
   - NEXT_PUBLIC_META_PIXEL_ID
   - META_PIXEL_ID
   - META_CAPI_ACCESS_TOKEN
   - NEXT_PUBLIC_GA_MEASUREMENT_ID
   - GA4_API_SECRET
   - NEXT_PUBLIC_SITE_URL
3. Website ve paneli yeniden deploy edin.
4. Yeni sistem yalnızca deployment sonrası oluşan ziyaretleri ayrıntılı ölçer. Eski siparişlerin geçmiş yolculuğu geriye dönük oluşturulamaz.

Toplanan veriler: ilk/son temas, oturum sayısı ve süreleri, sayfa/ürün görüntülemeleri, sepete ekleme, checkout, cihaz-tarayıcı-işletim sistemi, Vercel'in sağladığı yaklaşık şehir/ülke ve siparişe kadar olan yolculuk.
