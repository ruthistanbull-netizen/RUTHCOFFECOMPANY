"use client";

import Link from "next/link";
import { BellRing, CheckCircle2, CreditCard, Mail, Plug, RefreshCw, Settings2, Sparkles, Truck, Webhook } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminRequest } from "@/lib/adminApi";
import { ExactButton, ExactIconButton, ExactPageHeader, ExactSkeleton, ExactStatusBadge, useExactToast } from "./primitives";
import { ExactDataCard, ExactMetricCard } from "./data";

type IntegrationState = { key: string; label: string; description: string; status: "active" | "warning" | "inactive"; detail: string; href: string; icon: typeof Plug };
type EmailIntegration = { provider: string; status: string; email?: string | null; sender_name?: string | null };
type Handler = { code: string; name: string };
function statusLabel(status: IntegrationState["status"]) { return status === "active" ? "Aktif" : status === "warning" ? "Kontrol gerekli" : "Bağlı değil"; }

export function ExactIntegrations() {
  const toast = useExactToast();
  const [states, setStates] = useState<IntegrationState[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    const [email, shipping, push, theme, discounts] = await Promise.allSettled([
      adminRequest<{ integrations?: EmailIntegration[]; activeIntegration?: EmailIntegration | null }>("/api/email/status", { force: true }),
      adminRequest<{ handlers?: Handler[] }>("/api/shipping/basit-kargo/handlers", { force: true }),
      adminRequest<{ vapidPublicKey?: string }>("/api/push/config", { force: true }),
      adminRequest<{ settings?: unknown }>("/api/theme", { force: true }),
      adminRequest<{ settings?: unknown }>("/api/discount-campaigns", { force: true }),
    ]);
    const emailData = email.status === "fulfilled" ? email.value : null;
    const shippingData = shipping.status === "fulfilled" ? shipping.value : null;
    const pushData = push.status === "fulfilled" ? push.value : null;
    setStates([
      { key: "email", label: "E-posta Sağlayıcısı", description: "Gmail gönderim altyapısı", status: emailData?.activeIntegration?.provider === "gmail" && ["active", "connected"].includes(emailData.activeIntegration.status) ? "active" : "warning", detail: emailData?.activeIntegration?.provider === "gmail" ? `Gmail · ${emailData.activeIntegration.email || emailData.activeIntegration.sender_name || "bağlı"}` : "Aktif Gmail hesabı seçilmedi", href: "/email", icon: Mail },
      { key: "shipping", label: "Basit Kargo", description: "Kargo firmaları, fiyatlar ve webhook akışı", status: shippingData?.handlers?.length ? "active" : "warning", detail: `${shippingData?.handlers?.length || 0} taşıyıcı kullanılabilir`, href: "/shipping", icon: Truck },
      { key: "payments", label: "PayTR", description: "Ödeme, durum sorgusu ve iade işlemleri", status: "active", detail: "Ödeme API ve callback rotaları korunuyor", href: "/payments", icon: CreditCard },
      { key: "push", label: "Web Push", description: "Yeni sipariş ve CRM hatırlatma bildirimleri", status: pushData?.vapidPublicKey ? "active" : "warning", detail: pushData?.vapidPublicKey ? "VAPID yapılandırması hazır" : "VAPID anahtarı kontrol edilmeli", href: "/notifications", icon: BellRing },
      { key: "storefront", label: "Storefront Senkronizasyonu", description: "Tema, katalog ve önbellek yenileme", status: theme.status === "fulfilled" ? "active" : "warning", detail: theme.status === "fulfilled" ? "Tema API erişilebilir" : "Tema API yanıt vermedi", href: "/storefront", icon: Sparkles },
      { key: "campaigns", label: "Kampanya Motoru", description: "İndirim, kupon ve checkout kuralları", status: discounts.status === "fulfilled" ? "active" : "warning", detail: discounts.status === "fulfilled" ? "Kampanya ayarları erişilebilir" : "Kampanya ayarları kontrol edilmeli", href: "/marketing", icon: Webhook },
    ]);
    if ([email, shipping, push, theme, discounts].every((result) => result.status === "rejected")) toast.error("Entegrasyon durumları alınamadı.");
    setLoading(false);
  }, [toast]);
  useEffect(() => { void load(); }, [load]);
  const counts = useMemo(() => ({ active: states.filter((item) => item.status === "active").length, warning: states.filter((item) => item.status === "warning").length, total: states.length }), [states]);
  return <div className="space-y-4 animate-fade-in" data-exact-base44-page="integrations">
    <ExactPageHeader title="Entegrasyonlar" subtitle="Ödeme, kargo, e-posta, bildirim ve storefront bağlantıları" actions={<><Link href="/settings"><ExactButton variant="secondary" size="sm"><Settings2 className="h-4 w-4" /> Ayarlara dön</ExactButton></Link><ExactIconButton icon={RefreshCw} label="Durumu yenile" variant="secondary" onClick={() => void load()} loading={loading} /></>} />
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3"><ExactMetricCard label="Aktif Bağlantı" value={counts.active} icon={CheckCircle2} /><ExactMetricCard label="Kontrol Gereken" value={counts.warning} icon={Plug} /><ExactMetricCard label="Toplam Entegrasyon" value={counts.total} icon={Webhook} /><ExactMetricCard label="API Katmanı" value={1} icon={Sparkles} /></div>
    {loading ? <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3"><ExactSkeleton className="h-52" /><ExactSkeleton className="h-52" /><ExactSkeleton className="h-52" /></div> : <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{states.map((item) => { const Icon = item.icon; return <ExactDataCard key={item.key} className="hover:shadow-floating transition-all"><div className="flex items-start gap-3"><div className="flex items-center justify-center h-10 w-10 radius-small bg-accent-soft text-accent"><Icon className="h-5 w-5" /></div><div className="flex-1 min-w-0"><div className="flex items-center justify-between gap-2"><h3 className="ruth-type-card-title text-main">{item.label}</h3><ExactStatusBadge status={item.status === "active" ? "active" : item.status === "warning" ? "pending" : "archived"} label={statusLabel(item.status)} size="sm" /></div><p className="ruth-type-caption mt-1 text-muted">{item.description}</p></div></div><div className="p-3 radius-small bg-surface-secondary mt-4"><p className="ruth-type-label uppercase text-subtle">Durum ayrıntısı</p><p className="ruth-type-body-strong mt-1 text-main">{item.detail}</p></div><Link href={item.href} className="block mt-4"><ExactButton variant="secondary" size="sm" className="w-full"><Settings2 className="h-4 w-4" /> Yönetimi aç</ExactButton></Link></ExactDataCard>; })}</div>}
    <ExactDataCard title="Güvenli Entegrasyon İlkeleri"><div className="grid md:grid-cols-3 gap-3">{[{ title: "Gizli anahtarlar", text: "API anahtarları istemci koduna aktarılmaz; yalnız sunucu ortam değişkenlerinde tutulur." }, { title: "Webhook doğrulaması", text: "Ödeme ve kargo callback istekleri imza ve idempotency kontrollerinden geçirilir." }, { title: "Denetim izi", text: "İade, durum değişikliği ve kritik bağlantı işlemleri audit kayıtlarına yazılır." }].map((item) => <div key={item.title} className="p-3 radius-small bg-surface-secondary"><CheckCircle2 className="h-4 w-4 text-success-foreground" /><p className="ruth-type-card-title mt-2 text-main">{item.title}</p><p className="ruth-type-caption mt-1 text-muted">{item.text}</p></div>)}</div></ExactDataCard>
  </div>;
}
