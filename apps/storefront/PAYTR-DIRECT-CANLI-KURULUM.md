# PayTR Direct API canlÄ± kurulum

Vercel ortam deÄŸiÅŸkenleri:

- `PAYTR_MERCHANT_ID`
- `PAYTR_MERCHANT_KEY`
- `PAYTR_MERCHANT_SALT`
- `NEXT_PUBLIC_SITE_URL=`
- `PAYTR_TEST_MODE=0`
- `PAYTR_DEBUG_ON=0`
- `PAYTR_NON_3D=0`

PayTR maÄŸaza panelindeki Bildirim URL:

`https://ruthistanbull.tr/api/paytr/callback`

Bu sÃ¼rÃ¼mde kartÄ±n ilk 6/8 hanesiyle BIN sorgusu yapÄ±lÄ±r, PayTR'nin canlÄ± taksit oranÄ± alÄ±nÄ±r ve taksitli toplam sunucu tarafÄ±nda tekrar doÄŸrulanarak hesaplanÄ±r. Kart numarasÄ±, son kullanma tarihi ve CVV uygulama sunucusuna gÃ¶nderilmez; oluÅŸturulan form doÄŸrudan PayTR'ye POST edilir.
