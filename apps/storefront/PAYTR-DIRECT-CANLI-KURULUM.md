# PayTR Direct API canlı kurulum

Zeabur servisindeki environment variables:

- `PAYTR_MERCHANT_ID`
- `PAYTR_MERCHANT_KEY`
- `PAYTR_MERCHANT_SALT`
- `NEXT_PUBLIC_SITE_URL=https://rostacoffecompany.zeabur.app`
- `PAYTR_TEST_MODE=0`
- `PAYTR_DEBUG_ON=0`
- `PAYTR_NON_3D=0`

PayTR mağaza panelindeki Bildirim URL:
`https://rostacoffecompany.zeabur.app/api/paytr/callback`

Kartın ilk 6/8 hanesiyle BIN sorgusu yapılır, PayTR'nin canlı taksit oranı alınır ve taksitli toplam sunucu tarafında tekrar doğrulanır. Kart numarası, son kullanma tarihi ve CVV uygulama sunucusuna gönderilmez; oluşturulan form doğrudan PayTR'ye POST edilir.
