# Finans uygulama durumu · 18 Ekim 2026

Webde `/finance` ve `/finance/records`; RR HUB'da Finans Genel Bakış ve Finans Kayıtları oluşturuldu. ROSTA maliyeti hazır kahvenin kilogram fiyatı × gramaj / 1000 olarak hesaplanır. Yeşil çekirdek, kavurma ve kavurma firesi girdisi bulunmaz. Paketleme, etiket, işçilik ve diğer maliyetler ayrı kaydedilir.

## Kodlanan kapsam

| Modül | Durum |
|---|---|
| Web genel bakış | Dönem filtreleri, 12 özet kartı, dönem karşılaştırması, çizgi/sütun grafik, kategori/kanal analizi, aylık kâr-zarar ve nakit tablosu |
| Web kayıtlar | Sayfalama, arama, kategori/kaynak/durum/tutar/tedarikçi filtreleri, detay, manuel gelir/gider, düzenleme, iptal |
| Gider işlemleri | KDV dahil/hariç, dönem ve ödeme tarihi, kısmi ödeme, kalan borç, özel kategori ve alt kategori |
| Gelir otomasyonu | Sipariş tetikleyicisi; başarısız ve iptal edilmiş siparişler hariç; kaynak kimliğiyle mükerrer kayıt önleme |
| Geçmiş siparişler | Tekrar çalıştırılabilir, 200 kayıtlık sayfalarla aktarım; bilinmeyen tarihî maliyetler sıfır kabul edilmez |
| Ürün maliyetleri | Ürün/varyant maliyet geçmişi, set içeriğinden maliyet türetme, satış anı snapshot, ROSTA gramaj dönüşümü |
| İadeler | Tam/kısmi parasal iade; gerçek stoka dönen adedin ayrıca incelenmesi; belirsiz maliyette kârı gizleme |
| PayTR | Resmî işlem dökümündeki gerçek kesintileri üç günlük aralıklarla aktarma; sabit komisyon varsayımı yok; tekrar aktarımda aynı kaynak güncellenir |
| Kargo | Müşteri kargo geliri ayrı; kesin kargo gideri siparişle ilişkili manuel gider olarak girilebilir; fiyat teklifleri kesin gider sayılmaz |
| Kârlılık | PostgreSQL numeric ile ortak backend; eksik maliyet veya incelenmemiş iadede kâr/marj gösterilmez |
| Nakit | Ödemeler gider tahakkukundan ayrı; hesaplar arası transfer şirket nakit giriş/çıkışına ikinci kez eklenmez |
| Tekrarlayan giderler | Haftalık/aylık/üç aylık/yıllık/özel aralık, ay sonu çapası, duraklatma, bitiş tarihi, dönem bazlı tek kayıt |
| Bütçeler | Kategori/ay/para birimi bazında tanım, gerçekleşen tutar ve eşik uyarıları |
| Belgeler | Özel self-host Storage kovası, 10 MB PDF/fotoğraf, yetkili yükleme, kısa süreli imzalı görüntüleme, arşivleme |
| Banka | Manuel hesaplar, transferler, CSV içe aktarma ve mevcut ödeme ile eşleştirme; otomatik banka bağlantısı varmış gibi gösterilmez |
| Raporlar | Aynı backend toplamlarından CSV, Excel ve Türkçe fontlu PDF |
| Yetki ve audit | Sunucuda işlem bazlı kontrol; tutar/ödeme/ayar/iptal/belge geçmişi; finans tablolarında RLS ve istemci rollerine erişim yasağı |
| Native RR HUB | SwiftUI listeler, kartlar, Swift Charts, filtreler, kayıt/ödeme/belge işlemleri, dosya/fotoğraf/kamera, ayarlar, maliyet ekranı ve rapor paylaşımı; web panel yönlendirmesi yok |

## Doğrulama

- Ruth ve ROSTA finans birim testleri, izole PostgreSQL (PGlite) entegrasyon testleri ve Excel/PDF testleri geçti.
- Test edilen kritik konular: ondalık doğruluk, İstanbul tarihleri, sipariş/komisyon tekrarları, normal/başarısız/iade siparişleri, web/iOS kaynak ayrımı, maliyet snapshot'ı, ürün/varyant/set maliyeti, eksik ve farklı para birimli maliyetler, kısmi ödeme/fazla ödeme, transfer, banka CSV tekrarları, ay sonu gider tekrarları, audit ve RLS.
- Ruth ve ROSTA admin ile storefront production build'leri ve ilgili TypeScript kontrolleri geçti. ROSTA production yapısında izole API/oturum fixture verileriyle 390/768/1440 px genel bakış, kayıtlar, drawer, kirli form koruması, taşma ve tarayıcı hata kontrolleri geçti. Bu kontrol canlı entegrasyon testi değildir. Tekrar çalıştırılabilir test: `node tests/finance-browser.cjs`.
- Finans kodunda lint hata sayısı 0; mevcut kurallarla dört uyarı bulunuyor (dinamik JSON tipi ve React veri senkronizasyonu).
- Swift dosyalarının sözdizimi ve Xcode proje kaynak kayıtları doğrulandı. **macOS/Xcode bu ortamda olmadığı için iOS derlemesi/IPA doğrulanmadı.**
- Testler üretim veritabanlarında çalıştırılmadı. Bağlı hosted Supabase hesabında veya self-host veritabanlarında değişiklik yapılmadı.

## Kurulum

1. Bu repodaki `supabase/migrations/20261018002431_finance_management.sql` dosyasını yalnız bu markanın self-host veritabanında uygula. Ruth dosyası `brand='ruth'`, ROSTA dosyası `brand='rosta'` içerir. Aynı sunucudaki iki veritabanı birbirinin yerine kullanılmamalı.
2. Panelde **Finans → Genel Bakış → Ayarlar → Geçmiş siparişler** bölümünden geçmiş siparişleri aktar.
3. Ürün düzenleme ekranında bilinen maliyetleri gir. Bugünkü maliyetler eski siparişlere otomatik uygulanmaz.
4. Tekrarlayan giderlerin otomatik çalışması için mevcut commerce worker'ın güncel kaynakla çalıştığını doğrula. Yeni, paralel cron oluşturulmadı. Mevcut Next worker ve Edge worker kaynaklarına finans adımı eklendi; Edge worker ayrı dağıtılıyorsa onun da güncellenmesi gerekir. Gerektiğinde aynı işlem Ayarlar'dan elle çalıştırılabilir.
5. Yeni zorunlu ENV adı eklenmedi. Mevcut self-host Supabase URL/service-role, PayTR ve worker yetkilendirme ayarları kullanılmaya devam eder.
6. RR HUB değişiklikleri `feat/native-panel-operations-20261011` branch'ine aittir. Mevcut Bitrise akışıyla iOS build alınmalı.

## Açık doğrulama ve sınırlar

- Self-host migration, canlı sipariş, gerçek PayTR raporu, Storage yükleme ve mevcut worker zamanlaması canlı ortamda doğrulanmadı.
- Basit Kargo'nun kesin fatura/mutabakat akışından otomatik gider aktarımı henüz yok; kesinleşen kargo giderleri siparişe bağlı manuel kayıtlarla yönetilir. Teklif bedeli gider olarak alınmaz.
- PayTR kesintisinin KDV ayrıştırması raporda bulunmadığında ayrıca fatura ile doğrulanmalıdır. Kesinti aktarımı kullanıcı komutuyla yapılır; otomatik günlük PayTR rapor taraması eklenmedi.
- Resmî muhasebe/net dönem kârı iddiası yapılmaz. Vergi, amortisman, komisyon ve gider kapsamına bağlı olarak sonuç **kayıtlı giderlere göre tahmini kâr** olarak sunulur.
- Sipariş iadesi satış kaydının net tutarını günceller. Tarihî iade zamanı bulunmadığında nakit iade tarihi kesinleştirilemez; geçmiş dönem iade mutabakatı ayrıca gereklidir.
- Üretim SQL kurulumu ve canlı doğrulama yapılmadan sistemin canlıda eksiksiz çalıştığı söylenemez.

## Kontrol komutları

`npm run test:finance`

`npm run typecheck:admin-app`

`npm run build:admin`

`npm run build:storefront`

## Yayın durumu

Web kodu ayrı finans PR’larında tutulur. Self-host staging migration ve canlı entegrasyon doğrulanmadığı için main merge/deploy yapılmadı. Native kod mevcut RR HUB geliştirme branch’ine kaydedilir. SQL dosyaları manuel kurulum içindir.
