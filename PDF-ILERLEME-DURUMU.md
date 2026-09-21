# Ruth Commerce V2 PDF İlerleme Durumu

Son güncelleme: 2026-07-19

## Aktif durum

- Tamamlanan faz: **Faz 1 — Design System**
- Aktif faz: **Faz 2 — Commerce Core**
- Faz 0 kapanış kaydı: `docs/architecture/phase-0-closeout.md`
- Faz 1 kalite kapısı: `npm run verify:phase1`
- Faz 2 kalite kapısı: `npm run verify:phase2`

## Faz 0 kapsamında tamamlananlar

- Storefront ve admin kaynakları mevcut uygulama kökleri korunarak tek monorepoda `apps/storefront` ve `apps/admin` altında toplandı.
- Root npm workspace yapısı ve ayrı storefront/admin build hedefleri doğrulandı.
- Storefront ve admin sayfa/API route envanteri çıkarıldı.
- PayTR, sipariş, stok, Basit Kargo, Ruthie Points, iade/refund, e-posta ve cron giriş noktaları belgelendi.
- Environment variable adları sahiplerine göre belgelendi; hiçbir secret değeri repoya yazılmadı.
- Canlı Supabase yapısı salt okunur incelendi; production şemasında değişiklik yapılmadı.
- Baseline migration, staging schema diff, backup/restore ve rollback yaklaşımı hazırlandı.
- Storefront production deployunun Vercel üzerinde, admin production deployunun Render üzerinde build alabildiği doğrulandı.

## Faz 1 kapsamında tamamlananlar

### Ortak UI paketi

- `packages/ui` ortak paket olarak storefront ve admin tarafından kullanılmaktadır.
- Ortak design token sistemi oluşturuldu.
- Button, Input, Select, Textarea, Checkbox, Radio ve Switch bileşenleri eklendi.
- StatusBadge ve CommerceStatusBadge ile ortak durum dili oluşturuldu.
- Card, ProductCard ve EditorialCard bileşenleri eklendi.
- Modal, Drawer ve Toast katman bileşenleri eklendi.
- Tabs, DataTable, EmptyState ve Skeleton veri gösterim bileşenleri eklendi.
- UnifiedOrderCard sipariş görünümü eklendi.
- SearchShell birleşik arama kabuğu eklendi.

### Uygulama entegrasyonu

- Storefront `@ruth-commerce/ui` paketine bağlandı.
- Admin `@ruth-commerce/ui` paketine bağlandı.
- Her iki uygulama aynı `0.1.0` workspace paketini kullanmaktadır.
- Storefront doğrulama sayfası: `/internal/design-system`.
- Admin doğrulama sayfası: `/internal/design-system`.
- Storefront doğrulama sayfasında etkileşimli modal, drawer, toast, ürün kartı, editorial kart ve motion örnekleri bulunmaktadır.
- Admin doğrulama sayfasında formlar, tabs, DataTable, SearchShell, UnifiedOrderCard, boş/yüklenme durumları ve ticaret durumları bulunmaktadır.

### Kalite ve deploy doğrulaması

- Storefront production buildi geçmektedir.
- Admin production buildi geçmektedir.
- Admin Render deployu başarıyla tamamlanmıştır.
- Server/Client Component sınırı kaynaklı prerender hatası giderilmiştir.
- UnifiedOrderCard demo verileri güncel sözleşmeyle eşleştirilmiştir.
- Kök kalite komutları eklendi:

```bash
npm run lint
npm run build
npm run verify:phase1
```

`verify:phase1`, storefront ve admin lint/build kontrollerini ardışık çalıştırır.

## Faz 1 kapanış kararı

Faz 1 tamamlanmıştır. Bundan sonra ortak UI paketinde yapılacak değişiklikler yeni özelliklerin ihtiyacına göre geriye uyumlu ve kontrollü biçimde ele alınacaktır. Ana geliştirme hattı Faz 2 Commerce Core'a geçmiştir.

## Faz 2 kapsamında tamamlananlar

### Ortak commerce sözleşmeleri

- `packages/contracts` paketi gerçek commerce modelleriyle genişletildi.
- Product, Variant, Cart, Customer, Address, Order, OrderItem, PaymentAttempt, InventoryItem, InventoryReservation, InventoryMovement, Shipment, Campaign, Coupon ve Ruthie Points ledger sözleşmeleri eklendi.
- Para tutarları `Money` ve `MoneyBreakdown` üzerinden kuruş bazlı ve TRY para birimiyle tanımlandı.
- Sipariş, ödeme, fulfillment, kargo, iade, stok hareketi ve puan hareketi durumları ortaklaştırıldı.
- Commerce event zarfı ve temel event isimleri tanımlandı.

### Commerce Core

- `packages/commerce-core` ortak contract paketine bağlandı.
- Sipariş, ödeme ve kargo için izin verilen durum geçişleri tanımlandı.
- Geçersiz durum geçişlerini engelleyen doğrulayıcılar eklendi.
- Satılabilir stok hesabı ve stok rezervasyon doğrulaması eklendi.
- Money doğrulama ve toplama yardımcıları eklendi.
- Domain ihlalleri için `CommerceInvariantError` eklendi.

### Storefront ürün deneyimi

- Mevcut ürün veri, varyant, sepet ve satın alma akışları korunarak ürün detay sayfası yeniden düzenlendi.
- Görsel alan büyütüldü ve mobil görsel önceliği güçlendirildi.
- Satın alma paneli masaüstünde yapışkan hale getirildi.
- Ürün adı, fiyat, koleksiyon, materyal ve renk hiyerarşisi sadeleştirildi.
- Güvenli ödeme, ücretsiz kargo ve iade bilgileri daha sade bir güven şeridine taşındı.
- Ürün detay akordeonları ve ilgili ürünler bölümü editoryal tasarım diline yaklaştırıldı.

### Faz 2 kalite kapısı

Aşağıdaki komut eklendi:

```bash
npm run verify:phase2
```

Bu komut sırasıyla:

1. `packages/contracts` TypeScript kontrolünü,
2. `packages/commerce-core` TypeScript kontrolünü,
3. storefront ve admin lint kontrollerini,
4. storefront ve admin production buildlerini çalıştırır.

`.github/workflows/phase-2-commerce-core.yml` workflow'u push, pull request ve manuel çalıştırma için eklenmiştir.

## Faz 2 sıradaki görevler

1. Stok rezervasyonu için komut ve event üreten servisleri oluştur.
2. Ruthie Points kazanma, harcama, iade ve admin düzeltme servislerini oluştur.
3. Sipariş oluşturma ve ödeme doğrulama akışlarını ortak command katmanına taşımaya başla.
4. Storefront ve admin uygulamalarını ortak order contract'ına kademeli olarak bağla.
5. Her değişiklikte Faz 2 kalite workflow'unu doğrula.
