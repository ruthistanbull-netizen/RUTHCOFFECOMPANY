# PayTR Direct API â€“ Token ve 3D Secure DÃ¼zeltmesi

- PayTR POST iÅŸlemi React checkout formundan ayrÄ±ldÄ±.
- PayTR iÃ§in yalnÄ±zca gerekli alanlarÄ± iÃ§eren baÄŸÄ±msÄ±z bir form oluÅŸturuluyor.
- `paytr_token` alanÄ±nÄ±n React yeniden render sÄ±rasÄ±nda kaybolma/Ã§akÄ±ÅŸma riski kaldÄ±rÄ±ldÄ±.
- Kart bilgileri yalnÄ±zca doÄŸrudan `https://www.paytr.com/odeme` adresine POST edilir.
- `non_3d` kod iÃ§inde zorunlu olarak `0` deÄŸerine sabitlendi. Ortam deÄŸiÅŸkeni ile aÃ§Ä±lamaz.
- `non3d_test_failed` her zaman `0` gÃ¶nderilir.
- PayTR'ye gÃ¶nderilmeden Ã¶nce zorunlu alanlarÄ±n tamamÄ± tarayÄ±cÄ±da kontrol edilir.
- Ortam deÄŸiÅŸkenlerinde yanlÄ±ÅŸlÄ±kla eklenmiÅŸ dÄ±ÅŸ tÄ±rnaklar temizlenir.
- Production build baÅŸarÄ±yla tamamlandÄ±.

## Vercel deÄŸiÅŸkenleri

```env
PAYTR_MERCHANT_ID=...
PAYTR_MERCHANT_KEY=...
PAYTR_MERCHANT_SALT=...
PAYTR_TEST_MODE=1
PAYTR_DEBUG_ON=1
NEXT_PUBLIC_SITE_URL=
```

`PAYTR_NON_3D` deÄŸiÅŸkenine gerek yoktur.
