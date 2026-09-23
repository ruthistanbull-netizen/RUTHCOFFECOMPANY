# ROSTA Coffee Company Otomatik Pazarlama Takibi

Hazır entegrasyonlar:

- Meta Pixel (tarayıcı)
- Meta Conversions API / CAPI (sunucu)
- Google Analytics 4 (tarayıcı)
- GA4 Measurement Protocol (sunucu)
- UTM, fbclid, gclid, wbraid, gbraid ve ttclid kaynak tespiti
- Sipariş ile oturum ve trafik kaynağı eşleştirmesi

## Zeabur Environment Variables

ROSTA storefront servisinde Zeabur environment variables bölümüne `.env.marketing.example` dosyasındaki değerleri ekle.

### Meta

1. Meta Events Manager'dan Pixel ID'yi al.
2. `NEXT_PUBLIC_META_PIXEL_ID` ve `META_PIXEL_ID` alanlarına aynı ID'yi yaz.
3. Conversions API access token oluştur.
4. Tokeni yalnızca `META_CAPI_ACCESS_TOKEN` alanına yaz; `NEXT_PUBLIC_` ile başlayan bir değişkene koyma.

### Google Analytics 4

1. GA4 Web Data Stream içindeki Measurement ID'yi `NEXT_PUBLIC_GA_MEASUREMENT_ID` alanına yaz.
2. Measurement Protocol API secret oluştur.
3. Secret'i `GA4_API_SECRET` alanına yaz.

## Otomatik eventler

- PageView / page_view
- AddToCart / add_to_cart
- InitiateCheckout / begin_checkout
- AddPaymentInfo / add_payment_info
- Purchase / purchase

Meta tarayıcı ve CAPI eventleri aynı `event_id` ile gönderildiği için Meta tarafında tekilleştirilebilir.
