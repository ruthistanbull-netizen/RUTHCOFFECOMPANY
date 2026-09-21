"use client";

import * as React from "react";
import {
  Button,
  ButtonLink,
  Card,
  ConfirmDialog,
  Drawer,
  EditorialCard,
  FilterShell,
  Input,
  LoadingState,
  Modal,
  Notice,
  PageHeader,
  PageSection,
  PageShell,
  ProductCard,
  StatusBadge,
  Toast,
  Toolbar,
} from "@ruth-commerce/ui";

export function DesignSystemShowcase() {
  const [modalOpen, setModalOpen] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [toastVisible, setToastVisible] = React.useState(true);

  return (
    <PageShell as="div" width="wide" density="spacious" className="ds-page">
      <PageHeader
        eyebrow="Ruth Commerce V2 · Faz 1A"
        title="Ortak Tasarım Sistemi"
        description="Storefront ve operasyon panelinde aynı davranışları, boşlukları ve durum dilini kullanacak temel bileşenlerin canlı doğrulama sayfası."
        actions={(
          <>
            <ButtonLink href="#catalog" variant="secondary">Kartlara git</ButtonLink>
            <Button onClick={() => setDrawerOpen(true)}>Özeti aç</Button>
          </>
        )}
      />

      <Notice
        tone="info"
        variant="banner"
        title="Aynı çekirdek, farklı yüzey"
        description="Storefront editoryal kalabilir; ölçü, erişilebilirlik, feedback ve kritik işlem davranışı ortak paketten gelir."
      />

      <PageSection
        eyebrow="01"
        title="Sayfa ve karar yüzeyi"
        description="Arama, filtre ve tek birincil aksiyon aynı ritimde hizalanır."
        surface="surface"
      >
        <Toolbar
          leading={<Input aria-label="Katalog araması" placeholder="Ürün veya koleksiyon ara" />}
          trailing={(
            <>
              <Button variant="secondary">Filtrele</Button>
              <Button>Aramayı uygula</Button>
            </>
          )}
        />
        <FilterShell
          title="Katalog filtreleri"
          description="Mobil ve masaüstünde aynı alan sırası korunur."
          actions={<Button size="sm" variant="ghost">Temizle</Button>}
        >
          <Input label="Materyal" placeholder="925 Gümüş" />
          <Input label="Koleksiyon" placeholder="Ruth Atelier" />
          <Input label="Fiyat aralığı" placeholder="₺0 – ₺3.000" />
        </FilterShell>
      </PageSection>

      <PageSection
        eyebrow="02"
        title="Butonlar ve geri bildirim"
        description="Hiyerarşi, boyut, loading ve işlem sonucu ortak davranır."
        surface="surface"
      >
        <div className="ds-row">
          <Button>Birincil işlem</Button>
          <Button variant="secondary">İkincil işlem</Button>
          <Button variant="ghost">Sessiz işlem</Button>
          <Button variant="danger" onClick={() => setConfirmOpen(true)}>Sil</Button>
          <Button loading>Kaydediliyor</Button>
        </div>
        <div className="ds-row">
          <Button size="sm">Küçük</Button>
          <Button size="md">Orta</Button>
          <Button size="lg">Büyük</Button>
          <Button disabled>Devre dışı</Button>
        </div>
        <Notice tone="success" title="Sepet güncellendi" description="Sunucu işlemi tamamlandıktan sonra başarı görünür." />
        <LoadingState compact label="Koleksiyon yenileniyor" description="Mevcut içerik korunuyor." />
      </PageSection>

      <PageSection
        id="catalog"
        eyebrow="03"
        title="Kart sistemi"
        description="Aynı kart ailesi, belirlenmiş density ve hareket tokenlarını kullanır."
        surface="surface"
      >
        <div className="ds-card-grid">
          <ProductCard
            href="#product-card"
            title="The Sacred Seal Ring"
            material="925 Ayar Gümüş"
            price="₺1.250,00"
            oldPrice="₺1.390,00"
            badge="Yeni"
            favoriteAction={<button type="button" aria-label="Favorilere ekle">♡</button>}
            quickAction={<button type="button" aria-label="Hızlı ekle">+</button>}
          />
          <ProductCard
            href="#product-card"
            title="The Golden Relic Necklace"
            material="Ruth Atelier · Pirinç"
            price="₺1.490,00"
            badge="Atelier"
            favoriteAction={<button type="button" aria-label="Favorilere ekle">♡</button>}
          />
          <EditorialCard
            href="#collection-card"
            eyebrow="Yeni koleksiyon"
            title="Ruth Atelier"
            description="Mitolojiden ilham alan, elde şekillendirilen zamansız parçalar."
          />
        </div>
        <div className="ds-info-grid">
          <Card density="compact" interactive><strong>Compact</strong><p>Operasyon ve kısa bilgi kartları için.</p></Card>
          <Card density="standard" interactive><strong>Standard</strong><p>Genel entity ve içerik kartları için.</p></Card>
          <Card density="detailed" interactive><strong>Detailed</strong><p>Detay ve özet yüzeyleri için.</p></Card>
        </div>
      </PageSection>

      <PageSection
        eyebrow="04"
        title="Katmanlar ve durum dili"
        description="Modal, drawer, toast ve confirm aynı focus ve kapatma davranışını kullanır."
        surface="surface"
      >
        <div className="ds-row">
          <Button onClick={() => setModalOpen(true)}>Modal aç</Button>
          <Button variant="secondary" onClick={() => setDrawerOpen(true)}>Drawer aç</Button>
          <Button variant="ghost" onClick={() => setToastVisible(true)}>Toast göster</Button>
          <StatusBadge tone="success">Ödendi</StatusBadge>
          <StatusBadge tone="warning">Stok düşük</StatusBadge>
          <StatusBadge tone="danger">Ödeme başarısız</StatusBadge>
        </div>
        {toastVisible ? (
          <div className="ds-toast-wrap">
            <Toast
              tone="success"
              title="Değişiklik kaydedildi"
              description="Ortak bileşen paketi storefront içinde başarıyla çalışıyor."
              onDismiss={() => setToastVisible(false)}
            />
          </div>
        ) : null}
      </PageSection>

      <Modal
        open={modalOpen}
        title="Siparişi onayla"
        description="Bu örnek, kritik olmayan bilgi ve işlem modalını gösterir."
        onClose={() => setModalOpen(false)}
        footer={(
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Vazgeç</Button>
            <Button onClick={() => setModalOpen(false)}>Onayla</Button>
          </>
        )}
      >
        <p>RUTH-2026-0219 numaralı sipariş hazırlanıyor durumuna geçirilecek.</p>
      </Modal>

      <Drawer
        open={drawerOpen}
        title="Sipariş özeti"
        description="Operasyon paneli ve storefront için ortak yan panel örneği."
        onClose={() => setDrawerOpen(false)}
        footer={<Button onClick={() => setDrawerOpen(false)}>Tamam</Button>}
      >
        <div className="ds-summary">
          <div><span>Müşteri</span><strong>Ruth Müşterisi</strong></div>
          <div><span>Toplam</span><strong>₺2.450,00</strong></div>
          <div><span>Durum</span><StatusBadge tone="info">Hazırlanıyor</StatusBadge></div>
        </div>
      </Drawer>

      <ConfirmDialog
        open={confirmOpen}
        title="Ürünü kaldır"
        description="Bu işlem geri alınamaz."
        confirmLabel="Ürünü kaldır"
        tone="danger"
        onConfirm={() => setConfirmOpen(false)}
        onClose={() => setConfirmOpen(false)}
      >
        Ürün katalogdan kaldırılacak; stok veya sipariş kaydı UI tarafından silinmez.
      </ConfirmDialog>
    </PageShell>
  );
}
