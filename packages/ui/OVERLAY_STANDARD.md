# Ruth Overlay Standardı

Site ve panelde açılan tüm modal, drawer, sheet, popover ve dropdown yüzeyleri aynı Ruth tasarım sistemini kullanır.

## Yeni geliştirmelerde tercih sırası

1. Modal için `Modal`
2. Sağ/sol panel için `Drawer`
3. Tam ekran akış için `FullscreenOverlay`
4. Onay işlemi için `ConfirmDialog`

Bu bileşenler `@ruth-commerce/ui` paketinden alınır.

## Özel popup yüzeyleri

Hazır bileşenlerin uygun olmadığı küçük popup ve dropdownlarda aşağıdaki veri öznitelikleri kullanılır:

```tsx
<div data-ruth-overlay-backdrop="true">
  <div data-ruth-overlay-surface="popover">
    <button data-ruth-overlay-item="true">İşlem</button>
  </div>
</div>
```

Geçerli yüzey tipleri:

- `dialog`
- `drawer`
- `popover`
- `fullscreen`

## Tasarım kuralları

- Krem/ivory yüzey
- İnce altın kenarlık
- Dialoglarda 28 px, küçük popoverlarda 18 px yuvarlak köşe
- Yumuşak blur ve gölge
- Kompakt büyük-harfli aksiyon satırları
- Mobil safe-area ve ekran sınırı desteği

## Hariç tutma

Özel bir tam ekran deneyimin bu kurala girmemesi gerekiyorsa kök elemana aşağıdaki öznitelik eklenir:

```tsx
<div data-ruth-overlay-unstyled>...</div>
```

`OverlayStandardizer`, mevcut ve sonradan DOM'a eklenen uygun yüzeyleri otomatik olarak bu standarda bağlar.
