# PayTR Direct API güvenlik kontrol listesi

Bu sürümde fiyat tarayıcıdan kabul edilmez. Ürün fiyatları, indirim, ROSTA Points, kargo ve PayTR taksit oranı sunucuda yeniden hesaplanır.

## Canlıya almadan önce

- `PAYTR_TEST_MODE=0`
- `PAYTR_NON_3D=0` (yalnızca 3D Secure)
- `PAYTR_DEBUG_ON=0`
- Bildirim URL: `https://rostacoffecompany.zeabur.app/api/paytr/callback`
- PayTR anahtarları yalnızca Zeabur server environment içinde bulunmalı; `NEXT_PUBLIC_` ile başlamamalı.
- Production domain HTTPS olmalı.

## Güvenlik akışı

1. Tarayıcı yalnızca kartın ilk 6/8 hanesini ve seçilen taksit sayısını gönderir.
2. BIN ve taksit oranı PayTR'den sunucu tarafından tekrar doğrulanır.
3. Fiyat hesabı integer kuruş ve basis-point ile yapılır; vade farkı yukarı yuvarlanır.
4. Teklif 10 dakika geçerlidir (`request_exp_date`).
5. Kart numarası, CVV ve son kullanma tarihi ROSTA sunucusuna POST edilmez; form doğrudan PayTR'ye gider.
6. Callback HMAC değeri timing-safe karşılaştırılır.
7. Başarılı callback yalnızca ödeme tutarı, tahsil edilen toplam, taksit, para birimi, ödeme tipi ve test modu sunucu teklifine birebir uyuyorsa siparişi onaylar.
8. Tekrarlanan callback idempotent olarak `OK` alır ve ikinci sipariş oluşturmaz.
