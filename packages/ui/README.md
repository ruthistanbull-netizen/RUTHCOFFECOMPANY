# @ruth-commerce/ui

ROSTA Commerce storefront ve admin panelinin ortak görünüm, ölçü, erişilebilirlik ve etkileşim paketidir.

## Değişmez kural

**Aynı işlev = aynı ortak bileşen = aynı ölçü = aynı davranış.**

Uygulama sayfaları fiyat, stok, ödeme, sipariş, kargo, iade veya kampanya kararı üretmez. İş kuralları Commerce Core/API katmanında kalır; UI yalnız sonucu gösterir ve komut çağırır.

## Stil kurulumu

Her uygulama root layout içinde ortak stilleri bir kez ve aşağıdaki sırayla yükler:

```tsx
import "@ruth-commerce/ui/styles.css";
import "@ruth-commerce/ui/semantic-tokens.css";
import "@ruth-commerce/ui/core.css";
import "@ruth-commerce/ui/cards.css";
import "@ruth-commerce/ui/data-display.css";
import "@ruth-commerce/ui/order-card.css";
import "@ruth-commerce/ui/search-shell.css";
```

Uygulamaya ait `theme.css` en son yüklenir. Bu dosya yeni token üretmez; yalnız ortak semantik tokenlara storefront veya admin tema değeri verir ve geçici eski isimleri alias olarak bağlar.

## Faz 1B semantik token sözleşmesi

Renkler görsel isimlerle değil görevleriyle kullanılır:

- `--ruth-color-canvas`: uygulama zemini
- `--ruth-color-surface`: ana yüzey
- `--ruth-color-surface-muted`: ikincil yüzey
- `--ruth-color-text-primary`: ana metin
- `--ruth-color-text-muted`: yardımcı metin
- `--ruth-color-text-inverse`: koyu yüzey üzerindeki metin
- `--ruth-color-accent`, `accent-soft`, `accent-strong`, `accent-wash`
- `--ruth-color-border-subtle`, `border-strong`
- `--ruth-color-focus`, `overlay`
- `--ruth-color-success`, `warning`, `danger`, `info`

Yeni bileşenlerde `--ivory`, `--cream`, `--ink`, `--gold`, `--muted` gibi eski uygulama değişkenleri kullanılmaz. Bunlar Faz 1C–1D geçişinde mevcut ekranları kırmamak için yalnız alias olarak tutulur.

TypeScript tarafındaki adlar ve varsayılanlar:

```ts
import {
  ruthSemanticDefaults,
  ruthSemanticTokenNames,
} from "@ruth-commerce/ui";
```

## Status katmanları

Status sistemi üç katmana ayrılır:

1. `@ruth-commerce/contracts/status-display`: ortak display status tipleri
2. `@ruth-commerce/commerce-core/status-normalization`: provider ve eski veri aliaslarını canonical display durumuna çevirir
3. `@ruth-commerce/ui`: domain bazlı Türkçe etiket, ton ve badge sunumu

```ts
import {
  normalizeOrderDisplayStatus,
  normalizePaymentDisplayStatus,
} from "@ruth-commerce/commerce-core/status-normalization";
import {
  getOrderDisplayStatusPresentation,
  getPaymentDisplayStatusPresentation,
} from "@ruth-commerce/ui";

const status = normalizeOrderDisplayStatus(rawStatus, orderContext);
const presentation = getOrderDisplayStatusPresentation(status);
```

UI provider aliası, geçmiş sağlayıcı istisnası veya domain kararı üretmez. Commerce Core kullanıcıya gösterilecek renk/CSS belirlemez.

## Yeni sayfa bileşimi

```tsx
import {
  Button,
  FilterShell,
  PageHeader,
  PageSection,
  PageShell,
  Toolbar,
} from "@ruth-commerce/ui";

export default function ExamplePage() {
  return (
    <PageShell width="wide" density="standard">
      <PageHeader
        eyebrow="Operasyon"
        title="Siparişler"
        description="Kontrol gerektiren siparişleri yönetin."
        actions={<Button>Yeni sipariş</Button>}
      />

      <Toolbar>{/* arama ve ana aksiyonlar */}</Toolbar>
      <FilterShell>{/* filtre alanları */}</FilterShell>

      <PageSection title="Bugün" surface="surface">
        {/* ortak kart, tablo veya empty/loading state */}
      </PageSection>
    </PageShell>
  );
}
```

## Faz 1A çekirdeği

### Sayfa ve düzen

- `PageShell`: ortak genişlik ve dikey ritim
- `PageHeader`: eyebrow, başlık, açıklama, meta ve aksiyon hiyerarşisi
- `PageSection`: plain/surface/muted yüzey ve compact/standard/spacious yoğunluk
- `Toolbar`: arama, filtre tetikleyici ve sayfa aksiyonlarını hizalar
- `FilterShell`: filtre başlığı, açıklaması, sıfırlama aksiyonu ve responsive alan grid'i

### Kontroller ve yönlendirme

- `Button`, `IconButton`
- `ButtonLink`: buton görünümündeki gerçek bağlantı; navigasyon için `button` kullanılmaz
- `Input`, `Select`, `Textarea`, `Checkbox`, `Radio`, `Switch`

### Feedback ve katmanlar

- `Notice`: inline/banner; neutral/info/success/warning/danger
- `LoadingState`: standart ve compact bekleme görünümü
- `ErrorState`: isteğe bağlı retry aksiyonu
- `Modal`, `Drawer`, `Toast`
- `ConfirmDialog`: kritik işlem onayı; `alertdialog`, focus trap ve loading sırasında kapanma kilidi

### Veri ve ticaret yüzeyleri

- `Card`, `ProductCard`, `EditorialCard`
- `UnifiedOrderCard`
- `DataTable`, `Tabs`, `EmptyState`, `Skeleton`
- `CommerceStatusBadge`, `MoneySummary`
- `SearchShell`

## Yoğunluk seçimi

- `compact`: admin operasyon listeleri, sipariş, ödeme, müşteri ve iade kartları
- `standard`: genel entity, ayar ve içerik kartları
- `detailed`: detay ve özet yüzeyleri
- `editorial`: storefront koleksiyon ve kampanya anlatısı

Aynı listede farklı density, padding, radius veya aksiyon ölçüsü kullanılmaz.

## Kritik işlem kuralları

- İşlem sürerken buton loading durumuna geçer ve tekrar gönderim engellenir.
- Başarı mesajı yalnız sunucu işlemi tamamlandıktan sonra gösterilir.
- Kritik onaylar `ConfirmDialog` kullanır; `window.confirm` veya sayfaya özel modal yazılmaz.
- Modal ve drawer focus'u içeride tutar, Escape/backdrop davranışını ortak yönetir ve kapanınca önceki odağı geri verir.

## Yasaklar

- Yeni `.btn`, `.card`, `.modal-backdrop` veya kopya popup sistemi oluşturmak
- Ortak semantik token yerine rastgele ölçü, renk, radius veya transition yazmak
- Yeni bileşende eski `--ivory`, `--ink`, `--gold` gibi aliasları kullanmak
- Admin veya storefront içinde ikinci bir status label/normalization sözlüğü oluşturmak
- Navigasyon için button, işlem için link kullanmak
- `SearchShell` dışında yeni genel arama davranışı kurmak
- UI içinde fiyat, stok, ödeme, iade veya kargo iş kuralı hesaplamak
