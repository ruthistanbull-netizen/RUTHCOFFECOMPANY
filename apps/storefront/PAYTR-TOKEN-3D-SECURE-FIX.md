# PayTR Direct API — Token ve 3D Secure

- PayTR POST işlemi React checkout formundan ayrıdır.
- PayTR için yalnızca gerekli alanları içeren bağımsız bir form oluşturulur.
- `paytr_token` yeniden render sırasında korunur.
- Kart bilgileri yalnızca doğrudan `https://www.paytr.com/odeme` adresine POST edilir.
- `non_3d` kod içinde `0` değerine sabitlenir.
- `non3d_test_failed` her zaman `0` gönderilir.
- PayTR'ye gönderilmeden önce zorunlu alanlar tarayıcıda kontrol edilir.
- Ortam değişkenlerindeki dış tırnaklar temizlenir.

## Zeabur environment variables

```env
PAYTR_MERCHANT_ID=...
PAYTR_MERCHANT_KEY=...
PAYTR_MERCHANT_SALT=...
PAYTR_TEST_MODE=1
PAYTR_DEBUG_ON=1
NEXT_PUBLIC_SITE_URL=https://rostacoffecompany.zeabur.app
```

`PAYTR_NON_3D` değişkenine gerek yoktur.
