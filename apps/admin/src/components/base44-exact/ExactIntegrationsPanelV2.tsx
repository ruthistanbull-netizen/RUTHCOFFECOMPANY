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

type Scope = "all" | "panel" | "ruthie" | "marketing";
type IntegrationMode = "gmail" | "server";
type Integration = {
  key: string;
  label: string;
  description: string;
  scopes: Exclude<Scope, "all">[];
  icon: LucideIcon;
  help: string[];
  manageHref?: string;
  mode: IntegrationMode;
};
type State = { connected: boolean; detail: string; checking?: boolean };
type StatusResponse = { integrations?: Record<string, State> };

const definitions: Integration[] = [
  { key: "supabase", label: "Supabase", description: "Veritabanı, kimlik, storage ve canlı panel verisi", scopes: ["panel", "ruthie"], icon: Database, mode: "server", help: ["ROSTA Supabase Project URL ve service role anahtarını Zeabur güvenli ortam değişkenlerine ekle.", "Admin ve storefront servislerini yeniden yayınla.", "Servis Sağlığı ekranından veritabanı kontrolünü çalıştır."] },
  { key: "paytr", label: "PayTR", description: "Ödeme, taksit, callback ve iade altyapısı", scopes: ["panel", "ruthie"], icon: CreditCard, manageHref: "/payments", mode: "server", help: ["ROSTA PayTR merchant ID, key ve salt değerlerini storefront ve admin Zeabur değişkenlerine ekle.", "PayTR callback adresini ROSTA production callback rotasına yönlendir.", "Test modunda bir ödeme akışıyla bağlantıyı doğrula."] },
  { key: "basit-kargo", label: "Basit Kargo", description: "Barkod, etiket, fiyat ve ters kargo işlemleri", scopes: ["panel", "ruthie"], icon: Truck, manageHref: "/shipping", mode: "server", help: ["ROSTA Basit Kargo API tokenını admin Zeabur değişkenlerine ekle.", "Kargo ekranından taşıyıcı listesini yenile.", "Test siparişinde barkod ve etiket üret."] },
  { key: "gmail", label: "Gmail", description: "Hizmet, pazarlama ve müşteri iletişimi e-postaları", scopes: ["panel", "ruthie", "marketing"], icon: Mail, manageHref: "/email", mode: "gmail", help: ["Google Cloud üzerinde ROSTA için Gmail API OAuth istemcisi oluştur.", "Callback adresi olarak paneldeki /api/email/gmail/callback rotasını ekle.", "Bağla düğmesine basıp kullanacağın ROSTA Gmail hesabında izin ver."] },
  { key: "openai", label: "OpenAI · ROSTA Insight", description: "ROSTA Insight sohbeti, analiz ve onaylı panel işlemleri", scopes: ["ruthie"], icon: Sparkles, manageHref: "/rosta-insight", mode: "server", help: ["ROSTA için OpenAI API anahtarını admin Zeabur servisinde OPENAI_API_KEY olarak ekle.", "Model değişkenlerini istersen ayrıca tanımla.", "ROSTA Insight ekranından sohbet ve onay akışını test et."] },
  { key: "meta", label: "Meta Marketing", description: "Reklam hesabı raporlama ve kampanya analizi", scopes: ["ruthie", "marketing"], icon: Megaphone, mode: "server", help: ["ROSTA Business Manager'da sistem kullanıcısı oluştur ve gerekli reklam/Business/Page/Pixel izinlerini ver.", "META_SYSTEM_USER_ACCESS_TOKEN, META_AD_ACCOUNT_ID, META_BUSINESS_ID, META_PAGE_ID ve META_PIXEL_ID değerlerini admin Zeabur servisine ekle.", "Storefront ölçümü için NEXT_PUBLIC_META_PIXEL_ID ve server-side CAPI için META_CAPI_ACCESS_TOKEN değerlerini storefront servisine ekle."] },
  { key: "tiktok", label: "TikTok Ads", description: "TikTok reklam performansı ve raporları", scopes: ["ruthie", "marketing"], icon: Megaphone, mode: "server", help: ["ROSTA TikTok for Business geliştirici erişimini hazırla ve reklam hesabını uygulamaya bağla.", "TIKTOK_ACCESS_TOKEN ve TIKTOK_ADVERTISER_ID değerlerini admin Zeabur servisine ekle.", "Storefront dönüşüm ölçümü için NEXT_PUBLIC_TIKTOK_PIXEL_ID değerini storefront Zeabur servisine ekle."] },
  { key: "google-analytics", label: "Google Analytics 4", description: "Oturum, dönüşüm ve davranış analizi", scopes: ["ruthie", "marketing"], icon: BarChart3, mode: "server", help: ["ROSTA GA4 mülkünden ölçüm kimliğini al.", "Admin Zeabur servisine GA4_MEASUREMENT_ID, storefront servisine NEXT_PUBLIC_GA_MEASUREMENT_ID ekle; sunucu eventleri kullanacaksan GA4_API_SECRET da ekle.", "Production event akışını doğrula."] },
  { key: "google-tag-manager", label: "Google Tag Manager", description: "Piksel, dönüşüm ve event etiketleri", scopes: ["panel", "marketing"], icon: Tag, mode: "server", help: ["ROSTA için web container oluştur.", "Admin Zeabur servisine GTM_CONTAINER_ID ve storefront servisine aynı değeri NEXT_PUBLIC_GTM_ID olarak ekle.", "Önizleme modunda rosta_page_view, rosta_cart_add ve rosta_payment_start eventlerini test et."] },
  { key: "search-console", label: "Search Console", description: "SEO performansı ve arama görünürlüğü", scopes: ["ruthie", "marketing"], icon: BarChart3, mode: "server", help: ["ROSTA site mülkünü doğrula.", "ROSTA raporlama OAuth veya servis hesabı yetkisini hazırla.", "Search Console erişim değişkenlerini admin Zeabur servisine ekle."] },
  { key: "clarity", label: "Microsoft Clarity", description: "Isı haritası ve ziyaretçi oturum kayıtları", scopes: ["marketing"], icon: BarChart3, mode: "server", help: ["ROSTA için yeni Clarity projesi oluştur.", "Admin Zeabur servisine CLARITY_PROJECT_ID, storefront servisine aynı değeri NEXT_PUBLIC_CLARITY_PROJECT_ID olarak ekle.", "Production oturumlarının geldiğini doğrula."] },
  { key: "github", label: "GitHub", description: "Kod, commit, PR ve geliştirme bağlantısı", scopes: ["panel", "ruthie"], icon: Github, mode: "server", help: ["Yalnız ROSTA Coffee Co. reposuna gerekli kapsamda erişim oluştur.", "Tokenı GITHUB_TOKEN olarak admin Zeabur servisine ekle.", "ROSTA_GITHUB_REPOSITORY değerinin ROSTA reposunu gösterdiğini doğrula."] },
  { key: "zeabur", label: "Zeabur", description: "Panel ve storefront deploy, servis durumu ve çalışma ortamı", scopes: ["panel", "ruthie"], icon: Cloud, mode: "server", help: ["ROSTA Zeabur proje ve servis kimliklerini hazırla.", "ZEABUR_PROJECT_ID, ZEABUR_SERVICE_ID ve ZEABUR_WEB_URL değerlerini admin servisine ekle.", "Servis Sağlığı ekranından çalışma durumunu doğrula."] },
];

export function ExactIntegrationsPanelV2() {
  const toast = useExactToast();
  const [scope, setScope] = useState<Scope>("all");
  const [states, setStates] = useState<Record<string, State>>({});
  const [help, setHelp] = useState<Integration | null>(null);
  const [pendingDisconnect, setPendingDisconnect] = useState<Integration | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const check = useCallback(async (liveMeta = false) => {
    setLoading(true);
    try {
      const suffix = liveMeta ? "?live=meta" : "";
      const result = await adminRequest<StatusResponse>(`/api/rosta-insight/integrations/status-v2${suffix}`, { force: true });
      const reported = result.integrations || {};
      const next: Record<string, State> = {};
      for (const item of definitions) {
        next[item.key] = reported[item.key] || {
          connected: false,
          detail: "Bu sağlayıcı için ROSTA bağlantı bilgileri henüz tanımlı değil.",
        };
      }
      setStates(next);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Entegrasyon durumları alınamadı.";
      setStates(Object.fromEntries(definitions.map((item) => [item.key, { connected: false, detail }])));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void check(false); }, [check]);

  const visible = useMemo(() => definitions.filter((item) => scope === "all" || item.scopes.includes(scope)), [scope]);
  const metrics = useMemo(() => ({
    connected: definitions.filter((item) => states[item.key]?.connected).length,
    waiting: definitions.filter((item) => !states[item.key]?.connected).length,
    ruthie: definitions.filter((item) => item.scopes.includes("ruthie") && states[item.key]?.connected).length,
  }), [states]);
  const helpManageHref = help?.manageHref || "";

  const connect = async (item: Integration) => {
    if (item.mode !== "gmail") {
      setHelp(item);
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

  const disconnectGmail = async (item: Integration) => {
    setBusy(item.key);
    try {
      await adminRequest("/api/email/status?provider=gmail", { method: "DELETE" });
      toast.success("Gmail bağlantısı kesildi.");
      await check(false);
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
        subtitle="Altyapı hazır; ROSTA'ya ait hesapları ve erişimleri buradan tamamla"
        actions={<ExactIconButton icon={RefreshCw} label="Canlı kontrol" variant="secondary" onClick={() => void check(true)} loading={loading} />}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ExactMetricCard label="Bağlı" value={metrics.connected} icon={CheckCircle2} />
        <ExactMetricCard label="Bağlantı Bekleyen" value={metrics.waiting} icon={Unplug} />
        <ExactMetricCard label="ROSTA Insight Bağlantıları" value={metrics.ruthie} icon={Sparkles} />
        <ExactMetricCard label="Toplam Sağlayıcı" value={definitions.length} icon={Webhook} />
      </div>
      <ExactSegmentedControl value={scope} onChange={(value) => setScope(value as Scope)} options={[{ value: "all", label: "Tümü" }, { value: "panel", label: "Panel" }, { value: "ruthie", label: "ROSTA Insight" }, { value: "marketing", label: "Pazarlama" }]} />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((item) => {
          const state = states[item.key] || { connected: false, detail: loading ? "Kontrol ediliyor…" : "Durum henüz doğrulanmadı." };
          const Icon = item.icon;
          const connectedAction = item.mode === "gmail" ? "Bağlantıyı kes" : "Bağlantıyı yönet";
          return (
            <ExactDataCard key={item.key} className="transition-all hover:shadow-floating">
              <div className="flex items-start gap-3">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center radius-small ${state.connected ? "bg-success-soft text-success-foreground" : "bg-surface-tertiary text-subtle"}`}><Icon className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2"><h3 className="text-sm font-semibold text-main">{item.label}</h3><ExactStatusBadge status={state.connected ? "active" : "archived"} label={state.connected ? "Bağlı" : "Bağlı değil"} size="sm" /></div>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{item.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1">{item.scopes.map((entry) => <span key={entry} className="rounded-full bg-accent-soft px-2 py-0.5 text-[8px] font-semibold uppercase text-accent">{entry === "ruthie" ? "ROSTA Insight" : entry}</span>)}</div>
                </div>
              </div>
              <div className="mt-4 rounded-[var(--radius-small)] bg-surface-secondary p-3"><p className="text-[9px] font-semibold uppercase tracking-wide text-subtle">Durum</p><p className="mt-1 text-xs text-main">{state.detail}</p></div>
              <div className="mt-4 flex gap-2">
                <ExactButton
                  variant={state.connected ? "secondary" : "primary"}
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    if (state.connected && item.mode === "gmail") setPendingDisconnect(item);
                    else void connect(item);
                  }}
                  loading={busy === item.key}
                >
                  {state.connected ? <><Unplug className="h-4 w-4" /> {connectedAction}</> : <><Plug className="h-4 w-4" /> Bağla</>}
                </ExactButton>
                <ExactIconButton icon={CircleHelp} label={`${item.label} nasıl bağlanır?`} variant="secondary" size="icon-sm" onClick={() => setHelp(item)} />
              </div>
            </ExactDataCard>
          );
        })}
      </div>
      <ExactFormModal open={Boolean(help)} onClose={() => setHelp(null)} title={help ? `${help.label} bağlantısı` : "Entegrasyon"} subtitle="ROSTA hesabını bağlamak için gerekli adımlar" size="lg" footer={<ExactButton variant="secondary" size="sm" onClick={() => setHelp(null)}>Kapat</ExactButton>}>
        {help ? <div className="space-y-3">
          {help.help.map((step, index) => <div key={step} className="flex gap-3 rounded-[var(--radius-control)] bg-surface-secondary p-3"><div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">{index + 1}</div><p className="text-sm leading-relaxed text-main">{step}</p></div>)}
          {helpManageHref ? <ExactButton className="w-full" variant="secondary" size="sm" onClick={() => { window.location.href = helpManageHref; }}>Yönetim sayfasını aç</ExactButton> : null}
        </div> : null}
      </ExactFormModal>
      <ConfirmDialog
        open={Boolean(pendingDisconnect)}
        title="Gmail bağlantısını kes"
        description={pendingDisconnect ? `${pendingDisconnect.label} hesabının ROSTA panel bağlantısı kesilecek. Yeniden kullanmak için OAuth ile tekrar bağlaman gerekir.` : undefined}
        confirmLabel="Bağlantıyı kes"
        cancelLabel="Vazgeç"
        tone="danger"
        loading={Boolean(pendingDisconnect && busy === pendingDisconnect.key)}
        onClose={() => setPendingDisconnect(null)}
        onConfirm={() => {
          const item = pendingDisconnect;
          if (!item) return;
          void disconnectGmail(item).finally(() => setPendingDisconnect(null));
        }}
      />
    </div>
  );
}
