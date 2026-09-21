# Ruth Commerce V2 — Bootstrap

Bu dosya, yeni bir sohbetin veya yeni bir geliştiricinin Ruth Commerce üzerinde çalışmaya başlamadan önce okuyacağı zorunlu giriş belgesidir.

## Tek resmî proje kaynağı

Ruth Commerce ile ilgili kararlar konuşma hafızasından veya eski sohbetlerden tahmin edilmez. Kaynak önceliği şöyledir:

1. `main` branch üzerindeki çalışan kod, migration ve testler.
2. Bu dosyanın zorunlu tuttuğu proje belgeleri.
3. Esas mimari kitap: `RUTH_COMMERCE_V2_REPO_TEMELLI_PREMIUM_TASARIM_VE_MIMARI_KITABI_v3_0(3).pdf` — 129 sayfa.
4. Providerların güncel resmî dokümantasyonu: PayTR, Basit Kargo, Supabase, Vercel ve Zeabur.
5. Eski sohbetler yalnız yardımcı bağlamdır; resmî doğru kaynak değildir.

Yanlışlıkla kullanılan 91 sayfalık eski PDF, bu projenin güncel anayasası değildir.

## Zorunlu okuma sırası

Her yeni çalışma oturumu şu sırayla başlamalıdır:

1. `RUTH_COMMERCE_BOOTSTRAP.md`
2. `docs/ruth-commerce/PROJECT_CONSTITUTION.md`
3. `docs/ruth-commerce/OWNERSHIP_MAP.md`
4. `docs/ruth-commerce/CURRENT_STATE.md`
5. `docs/ruth-commerce/DECISION_LOG.md`
6. `docs/ruth-commerce/SESSION_HANDOFF.md`
7. Yapılacak işle ilgili gerçek kod, migration, test ve son PR'lar

Bu belgeler okunmadan kod değişikliği yapılmaz ve kullanıcıdan proje yeniden anlatması istenmez.

## Projenin tek cümlelik hedefi

Ruth Commerce V2; storefront, admin panel, gelecekteki mobil uygulama ve diğer satış kanallarını aynı ticaret kurallarına bağlayan, Ruth'a özgü, modüler ve uzun ömürlü bir commerce işletim sistemidir.

## Değişmez çalışma kuralları

- **Tek doğru veri kaynağı:** Fiyat, stok, ödeme ve sipariş kuralları ekranlarda ayrı ayrı hesaplanmaz.
- **Tek işlev, tek davranış:** Arama, kart, modal, form, tablo, bildirim ve işlem yaşam döngüsü ortak sistemlerden gelir.
- **İş kuralı önce sahibi olan motora yazılır:** Storefront ve admin yalnız motorları, sözleşmeleri ve ortak UI sistemlerini kullanır.
- **Sayfaya özel geçici çözüm yasaktır:** DOM observer, rastgele portal, kopya hesap, kopya status sözlüğü ve geçici endpoint kalıcı çözüm olarak eklenmez.
- **Motor sınırları korunur:** Bir motor başka motorun tablosuna doğrudan yazmaz; command, query, event, repository veya güvenli transaction/RPC sınırı kullanır.
- **Her kritik işlem iz bırakır:** Audit, correlation, idempotency ve hata nedeni bulunmalıdır.
- **Bir dış servis tüm sistemi durdurmaz:** Queue, retry, outbox ve dead-letter yaklaşımı korunur.
- **Ekranın görünmesi tamamlanma değildir:** Backend, hata akışları, yetki, audit, test, staging, rollback ve ilgili site/panel bağlantısı tamamlanmadan özellik bitmiş sayılmaz.
- **Kanıtsız yüzde verilmez:** Gerçek uçtan uca doğrulama olmadan `%100 tamamlandı` denmez.
- **Önce işlev, sonra tasarım:** Kullanıcı işlevsel bütünlüğü görmek istiyor. Tasarım ve UI paketi, motorlar ve kritik akışlar tamamlandıktan sonra yeniden topluca denetlenecek.

## Mimari yüzeyler

- `apps/storefront`: Vercel üzerinde müşteri uygulaması.
- `apps/admin`: Zeabur üzerinde operasyon uygulaması.
- `packages/contracts`: Ortak veri, API, event ve durum sözleşmeleri.
- `packages/ui`: Ruth Design System ve ortak davranış sistemleri.
- `packages/commerce-core` / hedef `packages/domain`: Saf iş kuralları ve motorlar.
- `packages/integrations`: PayTR, Basit Kargo, e-posta/SMS gibi provider adaptörleri — hedef sınır.
- `packages/database` / hedef `packages/db`: Migration, repository, transaction ve RLS sınırı.
- `apps/worker`: Queue, retry, outbox, indeks ve bildirim işleri — hedef yüzey.
- `packages/observability`: Log, metric, trace, correlation ve redaction — hedef sınır.

Mevcut repo bu hedef sınırların tamamına henüz taşınmış değildir. Gerçek durum `CURRENT_STATE.md` içinde tutulur.

## Altyapı eşleşmesi

- GitHub: `ruthistanbull-netizen/RUTHISTANBUL-COMMERCE`
- Storefront root: `apps/storefront`
- Admin root: `apps/admin`
- Canlı storefront: `https://www.ruthistanbull.tr`
- Storefront deployment: Vercel projesi `ruth-istanbul-website-vercel`
- Admin deployment: `https://ruthcommerce.zeabur.app` (Zeabur)
- Production Supabase: self-hosted `https://supabase.ruthistanbul.com`
- Staging Supabase: `gpxiosbrlgkvfxdznjqp` — `RUTH COMMERCE STAGING`

Secret değerleri hiçbir belgeye, PR açıklamasına, loga veya sohbet yanıtına yazılmaz. Yalnız environment variable isimleri belgelenebilir.

## Özellik geliştirme protokolü

Her özellikte aşağıdaki sıra zorunludur:

1. Özelliğin sahibi olan motor veya ortak sistem belirlenir.
2. `packages/contracts` sözleşmesi tanımlanır veya doğrulanır.
3. Saf iş kuralı motor/domain katmanına eklenir.
4. Provider ayrıntısı integration adapter içinde tutulur.
5. Veri yazımı repository/transaction/RPC sınırından yapılır.
6. Storefront ve admin yalnız command/query ve ortak UI üzerinden bağlanır.
7. Unit, integration ve kritik akış testi eklenir.
8. Audit, idempotency, hata ve gözlemlenebilirlik kontrol edilir.
9. Staging smoke testi ve rollback yolu doğrulanır.
10. Gerekli proje hafızası belgeleri aynı PR içinde güncellenir.

## PR belge güncelleme kuralı

Önemli bir PR gerektiğinde şu belgeleri de güncellemelidir:

- `OWNERSHIP_MAP.md`: Sahiplik veya sınır değiştiyse.
- `CURRENT_STATE.md`: Gerçek çalışma durumu değiştiyse.
- `DECISION_LOG.md`: Kalıcı karar alındıysa.
- `SESSION_HANDOFF.md`: Oturumun devam noktası değiştiyse.

## Yeni sohbet başlangıç mesajı

Kullanıcının bütün projeyi yeniden anlatması yerine şu mesaj yeterlidir:

> Ruth Commerce'e devam et. Önce GitHub `main` branch'indeki `RUTH_COMMERCE_BOOTSTRAP.md` dosyasını ve zorunlu tuttuğu belgeleri oku. Güncel commit, deploy, açık işler ve gerçek kod entegrasyonunu doğruladıktan sonra `SESSION_HANDOFF.md` içindeki sıradaki işe devam et. PDF anayasası 129 sayfalık repo temelli premium v3.0 dosyasıdır. Sayfaya özel çözüm yazma; her işlevi kendi Commerce Core motoruna veya ortak UI sistemine yerleştir.
