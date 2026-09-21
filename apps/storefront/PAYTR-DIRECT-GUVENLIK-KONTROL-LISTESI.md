# PayTR Direct API güvenlik kontrol listesi

Bu sürümde fiyat tarayıcıdan kabul edilmez. Ürün fiyatları, indirim, Ruthie Points, kargo ve PayTR taksit oranı sunucuda yeniden hesaplanır.

## Canlıya almadan önce

- `PAYTR_TEST_MODE=0`
- `PAYTR_NON_3D=0` (yalnızca 3D Secure)
- `PAYTR_DEBUG_ON=0`
- Bildirim URL: `https://ruthistanbull.tr/api/paytr/callback`
- PayTR anahtarları yalnızca Vercel server environment içinde bulunmalı; `NEXT_PUBLIC_` ile başlamamalı.
- Vercel production domain HTTPS olmalı.

## Güvenlik akışı

1. Tarayıcı yalnızca kartın ilk 6/8 hanesini ve seçilen taksit sayısını gönderir.
2. BIN ve taksit oranı PayTR'den sunucu tarafından tekrar doğrulanır.
3. Fiyat hesabı integer kuruş ve basis-point ile yapılır; vade farkı yukarı yuvarlanır.
4. Teklif 10 dakika geçerlidir (`request_exp_date`).
5. Kart numarası, CVV ve son kullanma tarihi Ruth sunucusuna POST edilmez; form doğrudan PayTR'ye gider.
6. Callback HMAC değeri timing-safe karşılaştırılır.
7. Başarılı callback yalnızca ödeme tutarı, tahsil edilen toplam, taksit, para birimi, ödeme tipi ve test modu sunucu teklifine birebir uyuyorsa siparişi onaylar.
8. Tekrarlanan callback idempotent olarak `OK` alır ve ikinci sipariş oluşturmaz.

## İlk canlı test

Önce düşük tutarlı gerçek bir ürünle tek çekim 3D Secure test edin. Ardından PayTR'nin izin verdiği bir kredi kartıyla taksitli test yapın. PayTR panelindeki tahsilat tutarı ile sipariş detayındaki tahsil edilen tutarı karşılaştırın.
