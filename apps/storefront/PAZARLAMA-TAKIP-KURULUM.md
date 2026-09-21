# Ruth Istanbul Otomatik Pazarlama Takibi

Bu surumde su entegrasyonlar hazirdir:

- Meta Pixel (tarayici)
- Meta Conversions API / CAPI (sunucu)
- Google Analytics 4 (tarayici)
- GA4 Measurement Protocol (sunucu)
- UTM, fbclid, gclid, wbraid, gbraid ve ttclid kaynak tespiti
- Siparis ile oturum ve trafik kaynagi eslestirmesi

## Vercel Environment Variables

Vercel > Project > Settings > Environment Variables bolumune `.env.marketing.example` dosyasindaki degerleri ekle.

### Meta

1. Meta Events Manager'dan Pixel ID'yi al.
2. `NEXT_PUBLIC_META_PIXEL_ID` ve `META_PIXEL_ID` alanlarina ayni ID'yi yaz.
3. Events Manager > Settings > Conversions API > Generate access token bolumunden token olustur.
4. Tokeni yalnizca `META_CAPI_ACCESS_TOKEN` alanina yaz. `NEXT_PUBLIC_` ile baslayan bir degiskene koyma.

### Google Analytics 4

1. GA4 Web Data Stream icindeki Measurement ID'yi `NEXT_PUBLIC_GA_MEASUREMENT_ID` alanina yaz.
2. Admin > Data Streams > Measurement Protocol API secrets bolumunden secret olustur.
3. Secret'i `GA4_API_SECRET` alanina yaz.

## Otomatik gonderilen eventler

- PageView / page_view
- AddToCart / add_to_cart
- InitiateCheckout / begin_checkout
- AddPaymentInfo / add_payment_info
- Purchase / purchase

Meta tarayici ve CAPI eventleri ayni `event_id` ile gonderildigi icin Meta tarafinda tek event olarak tekillestirilir.

## Kaynak tespiti

UTM bulunmasa bile sistem referrer ve reklam click ID'lerinden kaynak tahmini yapar. Ancak Instagram uygulamasi referrer bilgisini bazen gizledigi icin reklam linklerinde UTM kullanmak en guvenilir yontemdir.
