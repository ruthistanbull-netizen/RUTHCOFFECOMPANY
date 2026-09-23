"use client";

import { useState } from "react";
import {
  Button,
  ConfirmDialog,
  FilterShell,
  Input,
  Notice,
  PageHeader,
  PageSection,
  PageShell,
  Select,
  Toolbar,
} from "@ruth-commerce/ui";
import { UnifiedOrderCard } from "@/components/UnifiedOrderCard";
import SearchShellDemo from "./SearchShellDemo";

const exampleOrder = {
  id: "demo-order",
  order_no: "ROSTA-1042",
  customer_name: "Elif Kaya",
  customer_email: "elif@example.com",
  customer_phone: null,
  total_amount: 2480,
  currency: "TRY",
  status: "preparing",
  payment_status: "paid",
  created_at: new Date().toISOString(),
  shipping_city: "İstanbul",
  shipping_town: "Beşiktaş",
  shipping_status: "ready_to_ship",
  cargo_tracking_no: null,
  basit_kargo_barcode: null,
  order_items: [{ id: "demo-item", product_name: "The Nazar Ring", variant_name: "Ayarlanabilir", quantity: 1, image_url: null }],
};

export default function AdminDesignSystemPage() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  return (
    <PageShell width="standard" density="spacious">
      <PageHeader eyebrow="ROSTA Coffee" title="Ortak UI doğrulama alanı" description="Panelin ortak sayfa, filtre, arama, sipariş kartı, geri bildirim ve onay bileşenlerini tek yerde doğrular." actions={<Button onClick={() => setConfirmOpen(true)}>Onay dialogu</Button>} />
      <Notice tone="info" variant="banner" title="İç doğrulama ekranı" description="Bu sayfa production iş kuralı çalıştırmaz; ortak UI sözleşmelerini gösterir." />
      <PageSection title="Sayfa ve filtre iskeleti" surface="surface">
        <Toolbar leading={<Input aria-label="Örnek arama" placeholder="Sipariş ara" />} trailing={<Button>Yeni kayıt</Button>} />
        <FilterShell title="Operasyon filtreleri" description="Ortak filtre yüzeyi" actions={<Button size="sm" variant="ghost">Sıfırla</Button>}>
          <Select label="Durum" defaultValue="all"><option value="all">Tümü</option><option value="preparing">Hazırlanıyor</option></Select>
          <Input label="Müşteri" placeholder="Ad veya e-posta" />
        </FilterShell>
      </PageSection>
      <PageSection title="SearchShell" surface="surface"><SearchShellDemo /></PageSection>
      <PageSection title="UnifiedOrderCard" surface="surface"><UnifiedOrderCard order={exampleOrder} showTimelineAction={false} action={<Button size="sm">Siparişi aç</Button>} /></PageSection>
      <ConfirmDialog open={confirmOpen} title="Örnek kritik işlem" description="Ortak ConfirmDialog davranışı" confirmLabel="Onayla" onConfirm={() => setConfirmOpen(false)} onClose={() => setConfirmOpen(false)}>Bu yalnız tasarım sistemi doğrulamasıdır.</ConfirmDialog>
    </PageShell>
  );
}
