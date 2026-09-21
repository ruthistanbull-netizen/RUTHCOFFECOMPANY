# Ruth Istanbul â€” Order Engine / Payment Engine

## Order Engine
`src/lib/commerce/orderEngine.ts`

- Checkout taslaÄŸÄ±nÄ± ve yÃ¶netici Ã¶deme linkini tek akÄ±ÅŸta Ã§Ã¶zer.
- ÃœrÃ¼n, varyant, kupon, Ruthie Points, kargo ve indirim fiyatlarÄ±nÄ± veritabanÄ± Ã¼zerinden yeniden hesaplatÄ±r.
- PayTR sepet satÄ±rlarÄ±nÄ± sunucuda Ã¼retir.
- TarayÄ±cÄ±dan gÃ¶nderilen Ã¼rÃ¼n fiyatÄ±nÄ± veya toplamÄ± kaynak kabul etmez.

## Payment Engine
`src/lib/commerce/paymentEngine.ts`

- PayTR BIN doÄŸrulamasÄ±
- Kart ailesi doÄŸrulamasÄ±
- GÃ¼ncel taksit oranÄ± sorgusu
- KuruÅŸ/basis-point Ã¼zerinden vade farkÄ± hesabÄ±
- PayTR token ve gÃ¶nderim alanlarÄ±nÄ±n oluÅŸturulmasÄ±
- 10 dakikalÄ±k Ã¶deme teklifi
- Ä°mzalÄ± callback ve fiyat/taksit eÅŸleÅŸmesi

## Ä°nce API katmanlarÄ±

- `src/app/api/paytr/direct/prepare/route.ts`
- `src/app/api/paytr/callback/route.ts`

API route'larÄ± artÄ±k fiyat veya PayTR mantÄ±ÄŸÄ± taÅŸÄ±mak yerine merkezi motorlarÄ± Ã§aÄŸÄ±rÄ±r.

## CanlÄ± ayarlar

```env
PAYTR_MERCHANT_ID=...
PAYTR_MERCHANT_KEY=...
PAYTR_MERCHANT_SALT=...
PAYTR_TEST_MODE=0
PAYTR_DEBUG_ON=0
PAYTR_NON_3D=0
NEXT_PUBLIC_SITE_URL=
```

Bildirim URL:

`https://ruthistanbull.tr/api/paytr/callback`
