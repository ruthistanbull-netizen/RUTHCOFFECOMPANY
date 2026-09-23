# ROSTA Coffee Company — Order Engine / Payment Engine

## Order Engine
`src/lib/commerce/orderEngine.ts`

- Checkout taslağını ve yönetici ödeme linkini tek akışta çözer.
- Ürün, varyant, kupon, ROSTA Points, kargo ve indirim fiyatlarını veritabanı üzerinden yeniden hesaplar.
- PayTR sepet satırlarını sunucuda üretir.
- Tarayıcıdan gönderilen ürün fiyatını veya toplamı kaynak kabul etmez.

## Payment Engine
`src/lib/commerce/paymentEngine.ts`

- PayTR BIN doğrulaması
- Kart ailesi doğrulaması
- Güncel taksit oranı sorgusu
- Kuruş/basis-point üzerinden vade farkı hesabı
- PayTR token ve gönderim alanlarının oluşturulması
- 10 dakikalık ödeme teklifi
- İmzalı callback ve fiyat/taksit eşleşmesi

## API katmanları
- `src/app/api/paytr/direct/prepare/route.ts`
- `src/app/api/paytr/callback/route.ts`

## Canlı ayarlar
```env
PAYTR_MERCHANT_ID=...
PAYTR_MERCHANT_KEY=...
PAYTR_MERCHANT_SALT=...
PAYTR_TEST_MODE=0
PAYTR_DEBUG_ON=0
PAYTR_NON_3D=0
NEXT_PUBLIC_SITE_URL=https://rostacoffecompany.zeabur.app
```

PayTR Bildirim URL:
`https://rostacoffecompany.zeabur.app/api/paytr/callback`
