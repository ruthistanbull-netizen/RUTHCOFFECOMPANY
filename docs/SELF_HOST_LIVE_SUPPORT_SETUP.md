# ROSTA — Self-hosted canlı destek kurulumu

**Bu proje hosted Supabase kullanmaz.** SQL komutlarını yalnızca OVH üzerinde çalışan **ROSTA veritabanına** uygula. Ruth ve ROSTA servis role anahtarlarını, URL'lerini veya tablolarını ASLA karıştırma.

## 1. SQL — operatörün yapacağı tek seferlik işlem

`supabase/migrations/20261015020000_rosta_live_support.sql` dosyasını **ROSTA self-hosted veritabanında**, migration/superuser yetkili SQL oturumunda çalıştır.

Bu migration:
- `public.rosta_live_support_threads` ve `public.rosta_live_support_messages` tablolarını;
- index, yabancı anahtar, `pending/active/rejected/closed` durum kısıtlarını;
- anon ve authenticated rolleri için kilitli RLS'yi;
- fotoğraflar için private `rosta-live-support-private` Storage bucket'ını;
- `NOTIFY pgrst, 'reload schema';` ile PostgREST şema yenilemeyi kurar.

**Uyarı:** SQL'i farklı marka veritabanında çalıştırma. Self-hosted Supabase Storage servisi ve `storage.buckets` şeması çalışıyor olmalı.

Veritabanında doğrulama:
```sql
select to_regclass('public.rosta_live_support_threads') as threads,
       to_regclass('public.rosta_live_support_messages') as messages;
select id, public, file_size_limit from storage.buckets
where id = 'rosta-live-support-private';
```

## 2. Zeabur ENV — ADMIN ve STOREFRONT servislerinin her ikisi

- `SUPABASE_URL`: yalnızca bu markanın **self-hosted Supabase API (Kong/PostgREST)** URL'si. Düz PostgreSQL bağlantısı değildir.
- `SUPABASE_SERVICE_ROLE_KEY`: aynı self-hosted kurulumun gerçek **service_role** JWT'si. Sadece sunucuda tutulur, `NEXT_PUBLIC_*` yapılmaz.
- `NEXT_PUBLIC_SUPABASE_URL`: mevcut web kullanıcısı için markanın public self-hosted API URL'si.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: aynı markanın anon key'i; mevcut storefront/login uygulamalarında kullanılır.

Yeni `LIVE_SUPPORT_*` ENV değişkeni GEREKMİYOR. Sohbet erişim anahtarları sunucuda kriptografik rastgele üretilip hash olarak saklanıyor.

Var olan `SUPABASE_*` değerleri gerçekten bu markanın self-hosted instance'ını gösteriyorsa bunları değiştirmene gerek yok; yalnızca SQL'i uygula.

## 3. Kod + dağıtım

Bu repodaki hem `apps/storefront` hem `apps/admin` servislerinin **canlı destek API'sini içeren commit'ten** Zeabur'a dağıtıldığından emin ol. Panelin native iOS uygulaması `/api/live-support` admin API'sine, ziyaretçiler storefront `/api/live-support` endpoint'ine gider.

Kurulumdan sonra:
1. Storefront `GET /api/live-support`, erişim anahtarı olmadan **403** yanıtı verebilir — bu güvenli ve normaldir.
2. Web müşteri formuyla **ad soyad + e-posta** girip yeni sohbet oluştur; `POST /api/live-support` için **201** beklenir.
3. Yönetici panelinden `/live-support` aç; listede pending kayıt ve `GET /api/live-support` için **200** beklenir.
4. Yönetici `Kabul Et` seçmeden müşteri mesaj gönderemez; kabul edince native/web müşteri chat ekranı açılır.
5. `Reddet` müşteri tarafında yazılı talep bırakma ve e-posta ile dönüş seçeneğini açar.
6. Hâlâ 503 varsa Zeabur storefront/admin loglarında **PGRST205 / relation does not exist** (migration/schema cache), **permission denied** (service role) veya timeout bağlantısını kontrol et.

Kimseye JWT, parola, servis rolü anahtarı veya gizli ENV değerini sohbet üzerinden göndermene gerek yok.
