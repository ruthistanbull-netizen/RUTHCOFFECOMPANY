# RUTH Commerce V2 — Agent Bootstrap

Bu dosya yeni bir sohbet, Codex oturumu veya geliştirici repoyu açtığında ilk okunacak çalışma sözleşmesidir. Buradaki kurallar storefront, admin paneli ve gelecekte eklenecek bütün yüzeyler için bağlayıcıdır.

## 0. Ana mimari kural — zero-patch / canonical owner

**RUTH Commerce'te hiçbir sorun mevcut sistemin üstüne yeni bir yama katmanı eklenerek çözülmez.** Bu kural UI, API, Commerce Core, veritabanı, scheduler, worker, cache, realtime, entegrasyon, ödeme, kargo, e-posta ve gelecekte eklenecek bütün sistemler için geçerlidir.

Bir sorun bulunduğunda zorunlu sıra şudur:

1. Davranışın/verinin mevcut bütün owner ve caller'larını envanterle.
2. Gerçek canonical owner'ı belirle; yoksa ortak ve kalıcı owner'ı tasarla.
3. Düzeltmeyi canonical owner'ın içinde yap.
4. Eski, çakışan, duplicate veya superseded owner/caller'ları aynı çalışma kapsamında kaldır ya da canonical owner'a migrate et.
5. Tek owner kaldığını test, arama, DB assertion veya runtime kanıtıyla doğrula.

Aşağıdakiler bir problemi çözme yöntemi olarak yasaktır:

- Yeni `Fix`, `Hotfix`, `Patch`, `Hardener`, `Enhancer`, `Recovery`, `Blocker`, `Guard` katmanı ekleyip eski owner'ı bırakmak.
- Canonical dosyayı düzeltmek yerine `V2`, `V3`, `V4` gibi yeni paralel nesil oluşturmak.
- Aynı davranış için ikinci global listener, `MutationObserver`, DOM scanner, synthetic event bridge, cron, worker, cache owner, realtime owner veya RLS policy owner eklemek.
- Eski sistem + yeni sistemin aynı işi paralel yapmasına izin vermek.
- `IF NOT EXISTS`, fallback, retry veya compatibility kodunu mimari sahiplik sorununu gizlemek için kullanmak.

Forward-only database migration production değişikliğini taşıma yöntemidir; **mimari yama katmanı değildir**. Migration sonunda runtime contract tek canonical şema/fonksiyon/policy/scheduler owner'ına ulaşmalıdır. Geçiş uyumluluğu gerekiyorsa süresi ve kaldırılacağı owner açıkça kayıt altına alınır; kalıcı paralel sistem bırakılamaz.

Bir görevde kök neden ve canonical owner düzeltilmediyse iş `tamamlandı` sayılamaz.

## 1. Ürün vizyonu

RUTH Commerce V2 yalnız bir web sitesi değildir. Storefront ve admin paneli aynı Commerce Core üzerine bağlı iki ayrı yüzeydir.

- `apps/storefront`: müşteri deneyimi, Vercel
- `apps/admin`: operasyon deneyimi, Render
- `packages/ui`: ortak görünüm, davranış, ölçü ve erişilebilirlik sistemi
- `packages/contracts`: ortak veri sözleşmeleri
- `packages/commerce-core`: fiyat, sipariş, ödeme, stok, kargo, iade ve diğer iş kuralları
- `packages/database`: şema ve migrationlar

UI iş kuralı üretmez. Fiyat, stok, ödeme, sipariş, kargo, iade, puan ve kampanya kararı Commerce Core/API katmanından gelir; ekran yalnız sonucu gösterir ve komut çağırır.

## 2. Tasarım kalite hedefi

Hedef; PDF'de örneklenen markaların ve aynı ölçekteki güçlü dünya markalarının kalite seviyesidir. Birebir sayfa, logo, artwork veya marka kimliği kopyalanmaz. Çalışan prensipler Ruth kimliğine çevrilir.

- Dior / Hermès: sessiz lüks, geniş boşluk, ürün odağı
- Zara: mobil hız, görsel öncelik, sade karar akışı
- Apple: durum sürekliliği ve anlamlı hareket
- Louis Vuitton / Cartier: ürün bilgisi, bakım, teslimat ve hizmet güveni
- Beymen / SSENSE / Farfetch: arama, filtre ve katalog netliği
- Stripe / Linear: panelde hızlı geri bildirim, skeleton, hata ve operasyon disiplini

Storefront moda evi seviyesinde sakin ve editoryal görünür. Admin paneli vitrin değildir; hızlı karar, düşük hata ve güvenli operasyon aracıdır.

## 3. Değişmez tasarım kuralı

**Aynı işlev = aynı ortak bileşen = aynı ölçü = aynı görünüm = aynı davranış.**

Bir sayfada yeni buton, kart, modal, drawer, input, arama, badge, toast, tablo, skeleton veya empty state yazmadan önce `@ruth-commerce/ui` kontrol edilir. Mevcut ortak bileşen genişletilebiliyorsa sayfaya özel kopya oluşturulmaz.

Örnekler:

- Bütün modal ve drawer kapatma düğmeleri aynı `IconButton`/close varyantını kullanır.
- Bütün primary, secondary, ghost ve danger butonları aynı yükseklik, radius, focus ve loading davranışına sahiptir.
- Bütün aramalar `SearchShell` kullanır; yalnız provider ve result renderer değişir.
- Sipariş bilgisi her yerde `UnifiedOrderCard` ve ortak status sözlüğü üzerinden gösterilir.
- Aynı durum başka ekranda başka renk veya başka adla gösterilemez.
- Yeni sayfa mevcut sayfalardan stil kopyalamaz; ortak paket bileşenlerinden kompoze edilir.

## 4. Ortak ölçü ve token sistemi

Ölçüler ve renkler sayfalarda rastgele yazılmaz. `packages/ui` tokenları ve density varyantları kullanılır.

### Kontroller

- Small: 34–36 px
- Medium: 42–44 px
- Large: 48–52 px
- Icon button: 34 px standart, 40 px geniş dokunma alanı gereken mobil yüzey
- Input: 44–46 px

### Kart ailesi

Kart genişliği bulunduğu grid veya liste kolonunu tamamen kullanır; aynı listedeki kartların eni aynıdır. Yükseklik içerik tarafından belirlenir fakat padding, gap, thumbnail, başlık ve aksiyon ölçüleri density tokenlarına bağlıdır.

- `compact`: operasyon listeleri, siparişler, müşteriler, ödemeler, iadeler; ince ve hızlı taranabilir
- `standard`: genel entity ve ayar kartları
- `detailed`: detay/özet yüzeyleri
- `editorial`: yalnız storefront kampanya ve koleksiyon anlatısı

Operasyon listelerinde varsayılan `compact` kullanılır. Sipariş kartının eni korunur; gereksiz dikey boşluk kaldırılır. Kart yalnız gerçek içerik büyüdüğünde uzar. Aynı liste içinde rastgele farklı padding, radius veya thumbnail ölçüsü kullanılamaz.

### Token ritmi

- Space: 4, 8, 12, 16, 24, 32, 48, 64 px
- Radius: 6, 10, 16, 24 px ve pill
- Motion: fast 120 ms, normal 220 ms, slow 380 ms
- Hareket: öncelikle `transform` ve `opacity`
- `prefers-reduced-motion` zorunludur

### Semantik token sözleşmesi

Yeni kod yalnız göreve dayalı canonical değişkenleri kullanır:

- `--ruth-color-canvas`, `surface`, `surface-muted`
- `--ruth-color-text-primary`, `text-muted`, `text-inverse`
- `--ruth-color-accent`, `accent-soft`, `accent-strong`, `accent-wash`
- `--ruth-color-border-subtle`, `border-strong`, `focus`, `overlay`
- `--ruth-color-success`, `warning`, `danger`, `info`

`--ivory`, `--cream`, `--ink`, `--gold`, `--muted` ve benzeri eski isimler yalnız mevcut sayfaları kırmayan geçici aliaslardır. Yeni bileşen veya sayfa bu aliasları kullanamaz. Admin ve storefront kendi `theme.css` dosyalarında aynı semantik sözleşmeye değer verir; yeni paralel token sistemi kurulmaz.

## 5. Kart standardı kabul kriterleri

Yeni veya değişen her kart için:

1. Uygun ortak kart ailesi ve density seçilmiş olmalı.
2. Aynı listedeki kartlar aynı genişlik, padding, radius ve iç hizaya sahip olmalı.
3. Başlık, meta, status, tutar ve aksiyon hiyerarşisi aynı sırayı izlemeli.
4. Kart içinde sayfaya özel rastgele buton ölçüsü bulunmamalı.
5. Uzun metin responsive yapıyı bozmamalı; gerektiğinde ellipsis/wrap kuralı ortak olmalı.
6. Mobil ve masaüstü davranışı ayrı özel kartlarla değil, aynı bileşenin responsive varyantıyla çözülmeli.
7. Hover yalnız işaret edilebilir yüzeylerde; dokunmatik ve reduced-motion durumları güvenli olmalı.

## 6. Storefront ilkeleri

- Görsel önce, fakat ürün adı, fiyat, varyant, materyal, stok ve teslimat kararı saklanmaz.
- Bir karar yüzeyinde tek primary CTA bulunur.
- Kategori ve koleksiyonlarda aynı `ProductCard`, filtre ve sort sistemi kullanılır.
- Scroll, filtre, sepet ve form durumu geri dönüşte korunur.
- Checkout adımlı, misafir kullanıma açık, hata alan yanında ve sunucu kontrollüdür.
- Ağır intro, gereksiz 3D, scroll kilidi ve ödeme sırasında dekoratif animasyon yoktur.

## 7. Admin ilkeleri

- Operasyon aksiyonları dekoratif animasyondan önce gelir.
- Dashboard, sipariş, ürün, stok, ödeme, iade, müşteri ve kargo ekranları aynı page shell, card density, toolbar, filter ve feedback sistemini kullanır.
- Liste kartları ince ve taranabilir olmalıdır; aynı veri detay popup'ında tekrar gösteriliyorsa aynı sözlük ve format kullanılmalıdır.
- Kritik eylemler loading, success, error, retry ve idempotency durumlarını görünür gösterir.
- İşlem gerçekten bitmeden başarı animasyonu veya başarı mesajı gösterilmez.

### Status katmanları

- Ortak display tipleri: `@ruth-commerce/contracts/status-display`
- Ham/provider/eski veri normalizasyonu: `@ruth-commerce/commerce-core/status-normalization`
- Etiket, renk ve tone sunumu: `@ruth-commerce/ui/status-presentation`
- React badge: `CommerceStatusBadge`

UI provider aliası veya tarihî IKAS istisnası hesaplayamaz. Commerce Core Türkçe etiket, renk veya CSS class üretemez. Admin/storefront içinde ikinci status sözlüğü kurulamaz. Server route ve server yardımcıları status değerlerini `@ruth-commerce/ui` ana client barrel'ından değil server-safe `status-presentation` alt yolundan okur.

## 8. Motion sistemi

Animasyon gösteri değil, ilişki ve durum açıklamasıdır.

- Hover/ikon/renk: 120 ms
- Dropdown, küçük kart, buton state: 220 ms
- Modal, drawer, büyük geçiş: 380 ms
- Sayfa: kısa fade + küçük translate
- Skeleton içerik ölçüsünü mümkün olduğunca korur
- Modal aynı fade/scale; drawer aynı slide davranışını kullanır
- Uzun intro, ağır parallax, her öğeye farklı süre ve işlemi geciktiren animasyon yasaktır

## 9. Yeni sayfa oluşturma prosedürü

Yeni sayfa kodlanmadan önce şu bileşim belirlenir:

1. `PageShell` / mevcut uygulama shell'i
2. `PageHeader` ve toolbar standardı
3. Kullanılacak ortak card density
4. SearchShell/filter/sort kalıbı
5. Loading, empty, error ve retry durumları
6. Commerce Core/API sözleşmesi
7. Mobil düzen ve reduced-motion davranışı

Yeni sayfa tamamlandığında ortak bileşen importları dosya seviyesinde doğrulanır. Sayfanın yalnız güzel görünmesi tamamlanma sayılmaz.

## 10. Tamamlandı kelimesinin anlamı

Bir iş yalnız şu kapıların hepsi doğrulandığında tamamlandı denir:

- Kapsamdaki bütün ekran ve giriş noktaları envanterlendi
- Kod ortak sisteme bağlandı
- Typecheck/lint/test/build geçti
- Gerekli migration staging'de doğrulandı
- PR durumu açıkça belirtildi
- Merge durumu doğrulandı
- Deploy durumu doğrulandı
- Canlı veya preview smoke yapıldı

`Kodlandı`, `PR açıldı`, `merge edildi`, `deploy edildi` ve `canlı doğrulandı` birbirinden farklı durumlar olarak raporlanır. Kanıt olmadan “hepsi bağlı”, “bitti” veya “canlıda” denmez.

## 11. Production güvenliği

- Production migration, secret/env değişikliği, ödeme/kargo webhook değişikliği ve production deploy için açık kullanıcı onayı gerekir.
- Aktif başka bir feature PR'ı varken onun migrationını veya kapsamını tasarım PR'ına gizlice dahil etme.
- Ara geliştirmeler ayrı branch ve PR'da yapılır.
- Geri dönüş planı olmayan production değişikliği yapılmaz.

## 12. Her görevde zorunlu doğrulama

- Önce gerçek dosyaları ve mevcut importları oku.
- Ekran envanteri çıkarmadan “bütün” ifadesi kullanma.
- Ortak bileşen varken duplicate component ekleme.
- UI içine Commerce Core kuralı taşımama.
- Storefront ve admin buildlerini birlikte kontrol et.
- Görsel değişiklikte responsive, keyboard focus ve reduced-motion kontrol et.
- PR açıklamasında değişen ortak standartları, etkilenen yüzeyleri ve kalan göçleri açıkça yaz.

## 13. Faz 1E UI kalite kapısı

Görsel veya etkileşim değişikliği yalnız build geçtiği için kabul edilmez. `Phase 1E UI Quality` workflow'u zorunlu kalite kanıtıdır.

- Playwright testleri storefront ve admin production buildlerini ayrı sunucularda çalıştırır.
- Her kapsanan yüzey 390 px, 768 px ve 1440 px genişlikte görsel baseline ve yatay taşma kontrolünden geçer.
- Screenshot baseline yalnız bilinçli ve açıklanmış tasarım değişikliğinde güncellenir; testi geçirmek için rastgele yenilenmez.
- Axe taramasında WCAG 2 A/AA ciddi veya kritik ihlal kalamaz.
- Modal, drawer ve kritik onaylarda ilk focus, focus trap, Escape davranışı ve açan öğeye focus dönüşü test edilir.
- Scroll edilebilir tablo klavye ile odaklanabilir olmalıdır.
- SearchShell boş/loading/error durumunu `status`, gerçek sonuçları `listbox/option` semantiğiyle sunar.
- `prefers-reduced-motion` altında hareket `none` veya en fazla 1 ms etkin süreye indirilir.
- Tarayıcının gerçek scroll kökünde yatay taşma kabul edilmez.
- `scripts/verify-ui-diff-guard.mjs`, yeni özel `.btn/.card/.input/modal-backdrop`, `window.confirm`, app seviyesinde custom overlay/portal, rastgele hex, özel motion süresi ve SearchShell dışı genel arama davranışını reddeder.
- Faz 1C ve 1D ile taşınan her gerçek sayfa ilgili kalite testine ve baseline kapsamına aynı PR içinde eklenir.
- Phase 1E kırmızıysa görsel iş `test edildi` veya `tamamlandı` sayılmaz.

## 14. Global change-control, zero-regression ve no-overlap invariantları

Bu bölüm storefront, admin paneli, shared UI ve gelecekte eklenecek bütün kullanıcı yüzeyleri için bağlayıcıdır. Faz planı, PR veya görev kapsamı bu kuralları geçersiz kılamaz.

### 14.1 Önemli tasarım değişikliği için kullanıcı onayı zorunlu

Bir faz veya görev görünür tasarımı anlamlı biçimde değiştirecekse **kodlamadan önce kullanıcıya açıkça söylenir ve onay alınır**.

Önemli tasarım değişikliğine örnekler:

- font boyutu, genel density veya görsel hiyerarşi değişikliği,
- layout/grid/kolon yapısı,
- popup/modal/drawer boyutu veya konumu,
- spacing/padding/radius sisteminde fark edilir değişiklik,
- renk/kontrast/ikon/CTA ağırlığı,
- mobil veya masaüstü presentation biçimini değiştiren karar,
- yeni motion/transition davranışı,
- mevcut ekranın görünüşünü kullanıcı tarafından fark edilecek şekilde değiştiren başka herhangi bir karar.

Faz başlamadan önce agent:

1. tasarım etkisi olan maddeleri listeler,
2. hangi ekranları etkilediğini belirtir,
3. mobil ve masaüstü etkisini ayrı açıklar,
4. mevcut tasarımla neyin değişeceğini söyler,
5. kullanıcıdan açık onay alır.

Onaylanmış tasarımın birebir uygulanması veya **görünümü değiştirmeyen** altyapı/refactor işi için tekrar tekrar onay istenmez. Ancak uygulama sırasında beklenmeyen görünür değişiklik ortaya çıkarsa çalışma durdurulur, değişiklik kullanıcıya gösterilir ve onay alınmadan yeni tasarım yönü merge edilmez.

### 14.2 Zero-regression: çalışan hiçbir şey sessizce bozulamaz

Yeni özellik, refactor, faz migrasyonu veya tasarım altyapısı **mevcut çalışan davranışı bozma hakkı vermez**. Bir buton, link, checkbox, select, input, popup, drawer, menu, gesture, keyboard shortcut, save akışı veya tek bir loading state bile bu kurala dahildir.

Değişiklikten önce ve merge/deploy öncesinde etkilenen yüzeylerde mevcut çalışan davranış envanteri çıkarılır. En az şu alanlar kontrol edilir:

- bütün görünür button/link/CTA ve inline actionlar,
- form alanları, select/picker/filter/search,
- popup/modal/drawer/lightbox/menu açma-kapama davranışı,
- mouse/touch/keyboard ve Browser Back davranışı,
- save/discard/loading/error/success lifecycle,
- route/query state ve liste-detail dönüş bağlamı,
- API mutationların gerçekten doğru owner'a ulaşıp ulaşmadığı,
- mobil ve masaüstü presentation parity.

Bir regression tespit edilirse **kullanıcıya hemen söylenir**: ne bozuldu, hangi ekran/cihaz etkileniyor, kök neden ne, rollback/fix durumu ne. Bilinen regression sessizce bırakılmaz ve kullanıcı açıkça kabul etmedikçe regression taşıyan iş `tamamlandı` veya `canlı doğrulandı` sayılamaz.

Yeni özellik mevcut çalışan bir işlevi kaldıracak veya davranışını değiştirecekse ayrıca açık kullanıcı onayı gerekir. “Başka yer çalışıyor gibi görünüyor” regression kanıtı değildir; etkilenen owner ve giriş noktaları kontrol edilir.

### 14.3 Global no-overlap invariantı

**RUTH Commerce'te hiçbir kullanıcı arayüzü yüzeyi istemeden başka bir yüzeyin üstüne binemez, altında kalamaz, kritik içeriği örtemez veya tıklanabilir alanını bloke edemez.** Bu kural her ekran, her breakpoint ve her state için geçerlidir.

Kapsam:

- header/sidebar/nav/quarter-menu,
- sticky/fixed bar ve CTA,
- popup/modal/drawer/bottom-sheet/fullscreen/lightbox/popover,
- toast/banner/save bar,
- dropdown/select/date picker,
- table toolbar/filter bar,
- keyboard açılmış mobil viewport,
- iOS safe-area/home indicator,
- loading/error/empty state,
- nested overlay ve editor yüzeyleri.

İzin verilen intentional overlay (ör. modal backdrop) dışında hiçbir surface diğerini rastgele kapatamaz. Overlay stack sırası deterministic ve shared owner tarafından yönetilir.

Zorunlu çözüm ilkeleri:

- z-index ve layering shared token/overlay contractından gelir; sayfa bazlı “daha yüksek z-index ver” yarışı yasaktır,
- fixed/sticky yüzeyler içerik için gerçek exclusion/safe-area bırakır,
- mobil quarter-menu alanı shell-level exclusion zone olarak kabul edilir,
- popup/drawer footer/header/action alanları viewport, keyboard veya başka fixed UI tarafından örtülmez,
- içerik uzarsa overlap yerine wrap/reflow/scroll uygulanır,
- OS keyboard kritik form actionlarını örterse surface resize/reflow/scroll ile erişilebilir kalır,
- aynı tasarım dili korunurken mobil ve masaüstü **ayrı presentation ölçüleri** kullanır; biri diğerinin scale edilmiş hali değildir.

Her görsel/overlay değişiklik en az 390, 768 ve 1440 genişliklerinde; ilgili mobil safe-area/keyboard state'inde ve desktop pointer/keyboard kullanımında overlap açısından kontrol edilir. Bir overlap görülürse bu yalnız kozmetik bug değil, release-blocking UI regression kabul edilir.

## 15. Kullanıcıya anlatım ve deploy bütçesi kuralları

Bu bölüm faz planlama, uygulama checkpoint'i, kısmi ilerleme, hata raporu ve faz kapanışı dahil bütün kullanıcı iletişimi ve deployment doğrulaması için bağlayıcıdır.

### 15.1 Fazlar her zaman kod bilmeyen birinin anlayacağı dille anlatılır

Her faz veya implementation batch'i kullanıcıya raporlanırken **önce teknik olmayan açıklama verilir**. Faz henüz bitmemiş olsa bile bu zorunludur.

Her kullanıcı-facing güncelleme en az şu dört şeyi sade dille açıklar:

1. Bu iş kullanıcıya/operasyona ne kazandıracak?
2. Kullanıcı ekranda veya davranışta ne fark edecek?
3. Şu ana kadar ne tamamlandı, ne hâlâ tamamlanmadı?
4. Sıradaki somut adım nedir?

Teknik terim kullanmak gerekiyorsa ilk geçtiği yerde kısa Türkçe karşılığı açıklanır. Commit SHA, PR, verifier, owner, typecheck, build veya deploy kanıtı verilebilir; ancak bu teknik kanıt **sade açıklamanın yerine geçemez**. Kullanıcı yalnız teknik log veya kod terimleriyle baş başa bırakılamaz.

Bir faz anlatılırken “canonical owner”, “state machine”, “hydration”, “RLS”, “idempotency” gibi kavramlar varsa, kullanıcı bunları bilmek zorundaymış gibi yazılmaz. Önce günlük dilde sonuç anlatılır, ardından gerekirse teknik ayrıntı eklenir.

### 15.2 Vercel Preview deployment bütçe kuralı

Kullanıcı aksini açıkça söylemedikçe **Vercel Preview deployment bilerek tetiklenmez**.

- `vercel-validation-*` branch'i oluşturulmaz ve eski validation-preview yaklaşımı kullanılmaz.
- Feature branch yalnız kaynak/PR çalışma alanıdır; storefront preview deployment amacıyla branch push/retrigger yapılmaz.
- Vercel doğrulaması gerektiğinde kullanıcı onayıyla merge sonrası `main` production deployment kullanılır.
- Build quota tüketmek için noop/dummy commit, retrigger commit veya yalnız deployment başlatma amaçlı source değişikliği yapılmaz.
- Mevcut `apps/storefront/vercel.json` feature branch deploylarını kapalı tutmalıdır; yalnız `main` production yolu açık kalır.
- Kullanıcı bir gün yeniden preview isterse bu kural ancak açık yeni talimatla değiştirilebilir.
