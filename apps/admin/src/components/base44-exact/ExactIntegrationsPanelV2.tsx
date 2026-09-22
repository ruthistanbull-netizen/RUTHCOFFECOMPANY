"use client";

import {
  BarChart3,
  CheckCircle2,
  CircleHelp,
  Cloud,
  CreditCard,
  Database,
  Github,
  Mail,
  Megaphone,
  Plug,
  RefreshCw,
  Sparkles,
  Tag,
  Truck,
  Unplug,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import { ConfirmDialog } from "@ruth-commerce/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminRequest } from "@/lib/adminApi";
import {
  ExactButton,
  ExactFormModal,
  ExactIconButton,
  ExactPageHeader,
  ExactSegmentedControl,
  ExactStatusBadge,
  useExactToast,
} from "./primitives";
import { ExactDataCard, ExactMetricCard } from "./data";

type Scope = "all" | "panel" | "insight" | "marketing";
type Integration = {
  key: string;
  label: string;
  description: string;
  scopes: Exclude<Scope, "all">[];
  icon: LucideIcon;
  help: string[];
  statusEndpoint?: string;
  manageHref?: string;
  mode?: "gmail" | "server";
};
type State = { connected: boolean; detail: string; checking?: boolean };

const definitions: Integration[] = [
  { key: "supabase", label: "Supabase", description: "Veritabanı, kimlik, storage ve canlı panel verisi", scopes: ["panel", "insight"], icon: Database, statusEndpoint: "/api/health", mode: "server", help: ["Supabase Project URL ve service role anahtarını Zeabur güvenli ortam değişkenlerine ekle.", "Admin servisini yeniden yayınla.", "Servis Sağlığı ekranından veritabanı kontrolünü çalıştır."] },
  { key: "paytr", label: "PayTR", description: "Ödeme, taksit, callback ve iade altyapısı", scopes: ["panel", "insight"], icon: CreditCard, statusEndpoint: "/api/payments/list?limit=1", manageHref: "/payments", mode: "server", help: ["PayTR mağaza bilgilerini storefront ve admin servisinin güvenli ayarlarına ekle.", "Callback adresini production ödeme rotasına yönlendir.", "Ödemeler ekranından canlı kayıt kontrolü yap."] },
  { key: "shipping", label: "Basit Kargo", description: "Barkod, etiket, fiyat ve ters kargo işlemleri", scopes: ["panel", "insight"], icon: Truck, statusEndpoint: "/api/shipping/basit-kargo/handlers", manageHref: "/shipping", mode: "server", help: ["Basit Kargo API erişimini Zeabur güvenli ayarlarına ekle.", "Kargo ekranından taşıyıcı listesini yenile.", "Test siparişinde barkod ve etiket üret."] },
  { key: "gmail", label: "Gmail", description: "Hizmet, pazarlama ve müşteri iletişimi e-postaları", scopes: ["panel", "insight", "marketing"], icon: Mail, statusEndpoint: "/api/email/status", manageHref: "/email", mode: "gmail", help: ["Google Cloud üzerinde Gmail API'yi etkinleştir.", "OAuth callback adresini Google istemcisine ekle.", "Bağla düğmesiyle Google hesabında izin ver."] },
  { key: "openai", label: "OpenAI · ROSTA Insight", description: "ROSTA Insight sohbeti, analiz ve onaylı panel işlemleri", scopes: ["insight"], icon: Sparkles, statusEndpoint: "/api/rosta-insight/integrations/status-v2", manageHref: "/rosta-insight", mode: "server", help: ["OpenAI API anahtarını yalnız Zeabur admin servisinde sakla.", "Model ve proje erişimini doğrula.", "ROSTA Insight ekranından sohbet ve onay akışını test et."] },
  { key: "meta", label: "Meta Marketing", description: "Reklam hesabı raporlama ve kampanya analizi", scopes: ["insight", "marketing"], icon: Megaphone, statusEndpoint: "/api/integrations/meta/status", mode: "server", help: ["Business Manager sistem kullanıcısı oluştur.", "Reklam hesabına raporlama izinlerini ver.", "Uzun ömürlü erişimi admin servisinde sakla."] },
  { key: "tiktok", label: "TikTok Ads", description: "TikTok reklam performansı ve raporları", scopes: ["insight", "marketing"], icon: Megaphone, mode: "server", help: ["TikTok for Business geliştirici uygulaması oluştur.", "Reklam hesabını uygulamaya bağla.", "API erişimini Zeabur güvenli ayarlarına ekle."] },
  { key: "ga4", label: "Google Analytics 4", description: "Oturum, dönüşüm ve davranış analizi", scopes: ["insight", "marketing"], icon: BarChart3, mode: "server", help: ["GA4 ölçüm kimliğini storefront ayarlarına ekle.", "Measurement Protocol veya raporlama erişimini admin servisine bağla.", "Analitik ekranında veri akışını doğrula."] },
  { key: "gtm", label: "Google Tag Manager", description: "Piksel, dönüşüm ve event etiketleri", scopes: ["panel", "marketing"], icon: Tag, mode: "server", help: ["Web container oluştur.", "Container kimliğini storefront ayarlarına ekle.", "Önizleme modunda sepet ve satın alma eventlerini test et."] },
  { key: "search-console", label: "Search Console", description: "SEO performansı ve arama görünürlüğü", scopes: ["insight", "marketing"], icon: BarChart3, mode: "server", help: ["Site mülkünü doğrula.", "Raporlama yetkisini admin servisine bağla.", "ROSTA Insight SEO analizini yenile."] },
  { key: "clarity", label: "Microsoft Clarity", description: "Isı haritası ve ziyaretçi oturum kayıtları", scopes: ["marketing"], icon: BarChart3, mode: "server", help: ["Clarity projesi oluştur.", "Proje kimliğini storefront'a ekle.", "Production oturumlarının geldiğini doğrula."] },
  { key: "github", label: "GitHub", description: "Kod, commit, PR ve geliştirme bağlantısı", scopes: ["panel", "insight"], icon: Github, mode: "server", help: ["Yalnız ROSTA Coffee Company reposuna erişim ver.", "Repo bağlantısını ve erişimi güvenli sunucu ayarlarında sakla.", "ROSTA Insight geliştirme işlemiyle bağlantıyı test et."] },
  { key: "zeabur", label: "Zeabur", description: "Admin ve storefront deploy, domain ve servis durumu", scopes: ["panel", "insight"], icon: Cloud, statusEndpoint: "/api/rosta-insight/integrations/status-v2", mode: "server", help: ["ROSTA admin ve storefront servislerinin Zeabur proje bağlantısını doğrula.", "Gizli değişkenleri yalnız Zeabur servis ayarlarında sakla.", "ZEABUR_SERVICE_ID, ZEABUR_PROJECT_ID ve ZEABUR_WEB_URL ile çalışan servisi doğrula."] },
];

export function ExactIntegrationsPanelV2() {
  const toast = useExactToast();
  const [scope, setScope] = useState<Scope>("all");
  const [states, setStates] = useState<Record<string, State>>({});
  const [help, setHelp] = useState<Integration | null>(null);
  const [pendingDisconnect, setPendingDisconnect] = useState<Integration | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const check = useCallback(async () => {
    setLoading(true);
    const next: Record<string, State> = {};
    await Promise.all(definitions.map(async (item) => {
      if (!item.statusEndpoint) {
        next[item.key] = { connected: false, detail: "Sunucu yapılandırması henüz doğrulanmadı." };
        return;
      }
      try {
        const result = await adminRequest<Record<string, unknown>>(item.statusEndpoint, { force: true });
        if (item.key === "gmail") {
          const active = result.activeIntegration as { provider?: string; status?: string; email?: string | null } | null | undefined;
          const connected = active?.provider === "gmail" && ["active", "connected"].includes(String(active.status || ""));
          next[item.key] = {
            connected,
            detail: connected ? `Gmail aktif${active?.email ? ` · ${active.email}` : ""}` : "Aktif Gmail hesabı bağlı değil.",
          };
          return;
        }
        const serialized = JSON.stringify(result).toLocaleLowerCase("tr-TR");
        const connected = !serialized.includes('"connected":false') && !serialized.includes('"ok":false');
        next[item.key] = { connected, detail: connected ? "Canlı servis yanıt verdi." : "Bağlantı ayarı veya yetki kontrol edilmeli." };
      } catch (error) {
        next[item.key] = { connected: false, detail: error instanceof Error ? error.message : "Servis yanıt vermedi." };
      }
    }));
    setStates(next);
    setLoading(false);
  }, []);

  useEffect(() => { void check(); }, [check]);

  const visible = useMemo(() => definitions.filter((item) => scope === "all" || item.scopes.includes(scope)), [scope]);
  const metrics = useMemo(() => ({
    connected: definitions.filter((item) => states[item.key]?.connected).length,
    waiting: definitions.filter((item) => !states[item.key]?.connected).length,
    insight: definitions.filter((item) => item.scopes.includes("insight") && states[item.key]?.connected).length,
  }), [states]);

  const connect = async (item: Integration) => {
    if (item.mode !== "gmail") {
      if (item.manageHref) window.location.href = item.manageHref;
      else setHelp(item);
      return;
    }
    setBusy(item.key);
    try {
      const result = await adminRequest<{ authUrl?: string }>("/api/email/gmail/connect");
      if (!result.authUrl) throw new Error("Gmail yetkilendirme bağlantısı alınamadı.");
      window.location.href = result.authUrl;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gmail bağlantısı başlatılamadı.");
      setBusy(null);
    }
  };

  const disconnect = async (item: Integration) => {
    if (item.mode !== "gmail") {
      setHelp(item);
      return;
    }
    setBusy(item.key);
    try {
      await adminRequest("/api/email/status?provider=gmail", { method: "DELETE" });
      toast.success("Gmail bağlantısı kesildi.");
      await check();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bağlantı kesilemedi.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in" data-exact-base44-page="integrations-v2">
      <ExactPageHeader
        title="Entegrasyonlar"
        subtitle="Panel ve ROSTA Insight'nin bağlı olduğu tüm servisler"
        actions={<ExactIconButton icon={RefreshCw} label="Canlı kontrol" variant="secondary" onClick={() => void check()} loading={loading} />}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ExactMetricCard label="Bağlı" value={metrics.connected} icon={CheckCircle2} />
        <ExactMetricCard label="Bağlantı Bekleyen" value={metrics.waiting} icon={Unplug} />
        <ExactMetricCard label="ROSTA Insight Bağlantıları" value={metrics.insight} icon={Sparkles} />
        <ExactMetricCard label="Toplam Sağlayıcı" value={definitions.length} icon={Webhook} />
      </div>
      <ExactSegmentedControl value={scope} onChange={(value) => setScope(value as Scope)} options={[{ value: "all", label: "Tümü" }, { value: "panel", label: "Panel" }, { value: "insight", label: "ROSTA Insight" }, { value: "marketing", label: "Pazarlama" }]} />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((item) => {
          const state = states[item.key] || { connected: false, detail: loading ? "Kontrol ediliyor…" : "Durum henüz doğrulanmadı." };
          const Icon = item.icon;
          return (
            <ExactDataCard key={item.key} className="transition-all hover:shadow-floating">
              <div className="flex items-start gap-3">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center radius-small ${state.connected ? "bg-success-soft text-success-foreground" : "bg-surface-tertiary text-subtle"}`}><Icon className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2"><h3 className="text-sm font-semibold text-main">{item.label}</h3><ExactStatusBadge status={state.connected ? "active" : "archived"} label={state.connected ? "Bağlı" : "Bağlı değil"} size="sm" /></div>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{item.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1">{item.scopes.map((entry) => <span key={entry} className="rounded-full bg-accent-soft px-2 py-0.5 text-[8px] font-semibold uppercase text-accent">{entry}</span>)}</div>
                </div>
              </div>
              <div className="mt-4 rounded-[var(--radius-small)] bg-surface-secondary p-3"><p className="text-[9px] font-semibold uppercase tracking-wide text-subtle">Durum</p><p className="mt-1 text-xs text-main">{state.detail}</p></div>
              <div className="mt-4 flex gap-2">
                <ExactButton variant={state.connected ? "secondary" : "primary"} size="sm" className="flex-1" onClick={() => state.connected ? setPendingDisconnect(item) : void connect(item)} loading={busy === item.key}>{state.connected ? <><Unplug className="h-4 w-4" /> Bağlantıyı kes</> : <><Plug className="h-4 w-4" /> Bağla</>}</ExactButton>
                <ExactIconButton icon={CircleHelp} label={`${item.label} nasıl bağlanır?`} variant="secondary" size="icon-sm" onClick={() => setHelp(item)} />
              </div>
            </ExactDataCard>
          );
        })}
      </div>
      <ExactFormModal open={Boolean(help)} onClose={() => setHelp(null)} title={help ? `${help.label} bağlantısı` : "Entegrasyon"} subtitle="Adım adım güvenli kurulum" size="lg" footer={<ExactButton variant="secondary" size="sm" onClick={() => setHelp(null)}>Kapat</ExactButton>}>
        {help ? <div className="space-y-3">{help.help.map((step, index) => <div key={step} className="flex gap-3 rounded-[var(--radius-control)] bg-surface-secondary p-3"><div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">{index + 1}</div><p className="text-sm leading-relaxed text-main">{step}</p></div>)}</div> : null}
      </ExactFormModal>
      <ConfirmDialog
        open={Boolean(pendingDisconnect)}
        title="Bağlantıyı kes"
        description={pendingDisconnect ? `${pendingDisconnect.label} bağlantısı kesilecek. Bu işlem servis üzerinden yeniden bağlanana kadar ilgili özellikleri durdurabilir.` : undefined}
        confirmLabel="Bağlantıyı kes"
        cancelLabel="Vazgeç"
        tone="danger"
        loading={Boolean(pendingDisconnect && busy === pendingDisconnect.key)}
        onClose={() => setPendingDisconnect(null)}
        onConfirm={() => {
          const item = pendingDisconnect;
          if (!item) return;
          void disconnect(item).finally(() => setPendingDisconnect(null));
        }}
      />
    </div>
  );
}
