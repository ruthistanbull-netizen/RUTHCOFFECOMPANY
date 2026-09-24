"use client";

import {
  BarChart3,
  CheckCircle2,
  CircleHelp,
  Cloud,
  CreditCard,
  Database,
  ExternalLink,
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
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminRequest } from "@/lib/adminApi";
import {
  ExactButton,
  ExactFormModal,
  ExactIconButton,
  ExactPageHeader,
  ExactSegmentedControl,
  ExactSkeleton,
  ExactStatusBadge,
  useExactToast,
} from "./primitives";
import { ExactDataCard, ExactMetricCard } from "./data";

type ProviderKey = "search-console" | "google-analytics" | "google-tag-manager" | "clarity" | "meta" | "tiktok" | "supabase" | "paytr" | "basit-kargo" | "gmail" | "openai" | "zeabur" | "github";
type Scope = "all" | "panel" | "ruthie" | "marketing";
type ProviderState = { connected: boolean; detail: string };
type Definition = {
  key: ProviderKey;
  label: string;
  description: string;
  scopes: Exclude<Scope, "all">[];
  icon: LucideIcon;
  mode: "gmail" | "server";
  href?: string;
  setup: string[];
};

const integrations: Definition[] = [
  { key: "supabase", label: "Supabase", description: "Panel veritabanı, kimlik, storage ve canlı veri", scopes: ["panel", "ruthie"], icon: Database, mode: "server", setup: ["Supabase proje ayarlarında API bölümünü aç.", "Project URL ve service role erişimini ROSTA Zeabur servislerinin güvenli ortam değişkenlerine ekle.", "Admin servisini yeniden yayınla ve Canlı Kontrol'e bas."] },
  { key: "paytr", label: "PayTR", description: "Ödeme, callback, taksit ve iade işlemleri", scopes: ["panel", "ruthie"], icon: CreditCard, mode: "server", href: "/payments", setup: ["PayTR mağaza panelinden entegrasyon bilgilerini al.", "Bilgileri storefront ve admin servisinin güvenli ayarlarına ekle.", "Bildirim adresini production callback adresine yönlendir."] },
  { key: "basit-kargo", label: "Basit Kargo", description: "Kargo fiyatı, barkod, etiket ve ters kargo", scopes: ["panel", "ruthie"], icon: Truck, mode: "server", href: "/shipping", setup: ["Basit Kargo hesabından API erişimini etkinleştir.", "Erişim bilgisini admin servisinin güvenli ayarlarına ekle.", "Kargo ekranından barkod ve etiket üretimini test et."] },
  { key: "gmail", label: "Gmail", description: "Hizmet, pazarlama ve müşteri iletişimi e-postaları", scopes: ["panel", "ruthie", "marketing"], icon: Mail, mode: "gmail", href: "/email", setup: ["Google Cloud'da Gmail API'yi etkinleştir.", "Panel OAuth callback adresini istemciye ekle.", "Bağla düğmesine basıp Google hesabında izin ver."] },
  { key: "openai", label: "OpenAI · ROSTA Insight", description: "ROSTA Insight sohbeti, analiz ve onaylı panel işlemleri", scopes: ["ruthie"], icon: Sparkles, mode: "server", href: "/rosta-insight", setup: ["OpenAI projesi için sunucu API erişimi oluştur.", "Erişimi yalnız ROSTA admin Zeabur servisinde sakla.", "ROSTA Insight ekranından sohbet ve onay akışını test et."] },
  { key: "meta", label: "Meta Marketing", description: "Reklam hesabı raporlama ve kampanya analizi", scopes: ["ruthie", "marketing"], icon: Megaphone, mode: "server", setup: ["ROSTA Business Manager'da sistem kullanıcısı oluştur ve reklam hesabı/Business/Page/Pixel varlık izinlerini ver.", "Admin Zeabur servisine META_SYSTEM_USER_ACCESS_TOKEN, META_AD_ACCOUNT_ID, META_BUSINESS_ID, META_PAGE_ID ve META_PIXEL_ID değerlerini ekle.", "Storefront reklam ölçümü için ayrıca NEXT_PUBLIC_META_PIXEL_ID ve server-side CAPI için META_CAPI_ACCESS_TOKEN değerlerini storefront servisine ekle."] },
  { key: "tiktok", label: "TikTok Ads", description: "TikTok reklam raporları ve performans analizi", scopes: ["ruthie", "marketing"], icon: Megaphone, mode: "server", setup: ["TikTok for Business geliştirici uygulaması oluştur ve reklam hesabı erişimini bağla.", "Admin Zeabur servisine TIKTOK_ACCESS_TOKEN ve TIKTOK_ADVERTISER_ID değerlerini ekle.", "Storefront dönüşüm ölçümü için TikTok Events Manager'daki Pixel ID'yi NEXT_PUBLIC_TIKTOK_PIXEL_ID olarak storefront servisine ekle."] },
  { key: "google-analytics", label: "Google Analytics 4", description: "Oturum, dönüşüm ve davranış analizi", scopes: ["ruthie", "marketing"], icon: BarChart3, mode: "server", setup: ["GA4 mülkünden Measurement ID ve gerekiyorsa Measurement Protocol API secret değerini al.", "Storefront Zeabur servisine NEXT_PUBLIC_GA_MEASUREMENT_ID ve GA4_API_SECRET değerlerini ekle; admin durum kartı için GA4_MEASUREMENT_ID değerini admin servisine ekle.", "Analytics ve ROSTA Insight raporlarında veri akışını doğrula."] },
  { key: "google-tag-manager", label: "Google Tag Manager", description: "Piksel, dönüşüm ve event etiketleri", scopes: ["panel", "marketing"], icon: Tag, mode: "server", setup: ["ROSTA için Web container oluştur.", "Storefront Zeabur servisine NEXT_PUBLIC_GTM_ID, admin durum kartı için GTM_CONTAINER_ID değerini ekle.", "GTM Preview ile page_view, view_item, add_to_cart, begin_checkout ve add_payment_info eventlerini doğrula."] },
  { key: "search-console", label: "Search Console", description: "SEO performansı ve arama görünürlüğü", scopes: ["ruthie", "marketing"], icon: BarChart3, mode: "server", setup: ["Web site mülkünü doğrula.", "Google raporlama yetkilendirmesini hazırla.", "Sunucu bağlantısını ekleyip ROSTA Insight SEO analizini yenile."] },
  { key: "clarity", label: "Microsoft Clarity", description: "Isı haritası ve ziyaretçi oturum kayıtları", scopes: ["marketing"], icon: BarChart3, mode: "server", setup: ["Clarity projesi oluştur.", "Proje kimliğini storefront ayarlarına ekle.", "Production ortamında yeni oturumları doğrula."] },
  { key: "github", label: "GitHub", description: "Kod, commit, PR ve ROSTA Insight geliştirme araçları", scopes: ["panel", "ruthie"], icon: Github, mode: "server", setup: ["Yalnız ROSTA Coffee Co. reposuna yetkili erişim oluştur.", "Repo ve erişim bilgisini admin servisine ekle.", "ROSTA Insight geliştirme işlemlerinde bağlantıyı test et."] },
  { key: "zeabur", label: "Zeabur", description: "Panel ve storefront deploy, servis durumu ve çalışma ortamı", scopes: ["panel", "ruthie"], icon: Cloud, mode: "server", setup: ["ROSTA Zeabur proje ve servis kimliklerini hazırla.", "ZEABUR_PROJECT_ID, ZEABUR_SERVICE_ID ve ZEABUR_WEB_URL değerlerini admin servisine ekle.", "Servis Sağlığı ekranından çalışma durumunu doğrula."] },
];

export function ExactIntegrationsWorkspace() {
  const toast = useExactToast();
  const [states, setStates] = useState<Partial<Record<ProviderKey, ProviderState>>>({});
  const [scope, setScope] = useState<Scope>("all");
  const [help, setHelp] = useState<Definition | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (live = false) => {
    setLoading(true);
    try {
      const status = await adminRequest<{ integrations?: Partial<Record<ProviderKey, ProviderState>> }>(`/api/rosta-insight/integrations/status-v2${live ? "?live=meta" : ""}`, { force: true });
      setStates(status.integrations || {});
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Entegrasyon durumları alınamadı.");
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => integrations.filter((item) => scope === "all" || item.scopes.includes(scope)), [scope]);
  const metrics = useMemo(() => ({ connected: integrations.filter((item) => states[item.key]?.connected).length, waiting: integrations.filter((item) => !states[item.key]?.connected).length, ruthie: integrations.filter((item) => item.scopes.includes("ruthie") && states[item.key]?.connected).length }), [states]);

  const connect = async (item: Definition) => {
    if (item.mode === "server") { setHelp(item); return; }
    setBusy(item.key);
    try {
      const result = await adminRequest<{ authUrl?: string }>("/api/email/gmail/connect");
      if (!result.authUrl) throw new Error("Gmail yetkilendirme bağlantısı alınamadı.");
      window.location.href = result.authUrl;
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Gmail bağlantısı başlatılamadı.");
      setBusy(null);
    }
  };

  const disconnect = async (item: Definition) => {
    if (item.mode === "server") { setHelp(item); return; }
    setBusy(item.key);
    try {
      await adminRequest("/api/email/status?provider=gmail", { method: "DELETE" });
      toast.success("Gmail bağlantısı kesildi.");
      await load();
    } catch (caught) { toast.error(caught instanceof Error ? caught.message : "Bağlantı kesilemedi."); }
    finally { setBusy(null); }
  };

  return <div className="space-y-4 animate-fade-in" data-exact-base44-page="integrations">
    <ExactPageHeader title="Entegrasyonlar" subtitle="Panel ve ROSTA Insight'ın ödeme, veri, reklam, kargo, e-posta ve deploy bağlantıları" actions={<ExactButton variant="secondary" size="sm" onClick={() => void load(true)} loading={loading}><RefreshCw className="h-4 w-4" /> Canlı Kontrol</ExactButton>} />
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><ExactMetricCard label="Bağlı" value={metrics.connected} icon={CheckCircle2} /><ExactMetricCard label="Bağlantı Bekleyen" value={metrics.waiting} icon={Unplug} /><ExactMetricCard label="ROSTA Insight Bağlantıları" value={metrics.ruthie} icon={Sparkles} /><ExactMetricCard label="Toplam Sağlayıcı" value={integrations.length} icon={Webhook} /></div>
    <ExactSegmentedControl value={scope} onChange={(value) => setScope(value as Scope)} options={[{ value: "all", label: "Tümü" }, { value: "panel", label: "Panel" }, { value: "ruthie", label: "ROSTA Insight" }, { value: "marketing", label: "Pazarlama" }]} />
    {loading ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"><ExactSkeleton className="h-64" /><ExactSkeleton className="h-64" /><ExactSkeleton className="h-64" /></div> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{visible.map((item) => { const state = states[item.key] || { connected: false, detail: "Durum bilgisi alınamadı." }; const Icon = item.icon; return <ExactDataCard key={item.key} className="transition-all hover:shadow-floating"><div className="flex items-start gap-3"><div className={`flex h-11 w-11 shrink-0 items-center justify-center radius-small ${state.connected ? "bg-success-soft text-success-foreground" : "bg-surface-tertiary text-subtle"}`}><Icon className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div><h3 className="text-sm font-semibold text-main">{item.label}</h3><div className="mt-1 flex flex-wrap gap-1">{item.scopes.map((entry) => <span key={entry} className="rounded-full bg-accent-soft px-2 py-0.5 text-[8px] font-semibold uppercase text-accent">{entry === "ruthie" ? "ROSTA Insight" : entry}</span>)}</div></div><ExactStatusBadge status={state.connected ? "active" : "archived"} label={state.connected ? "Bağlı" : "Bağlı değil"} size="sm" /></div><p className="mt-2 text-xs leading-relaxed text-muted">{item.description}</p></div></div><div className="mt-4 rounded-[var(--radius-small)] bg-surface-secondary p-3"><p className="text-[9px] font-semibold uppercase tracking-wide text-subtle">Bağlantı durumu</p><p className="mt-1 text-[11px] leading-relaxed text-main">{state.detail}</p></div><div className="mt-4 flex gap-2"><ExactButton className="flex-1" size="sm" variant={state.connected ? "secondary" : undefined} onClick={() => state.connected ? void disconnect(item) : void connect(item)} loading={busy === item.key}>{state.connected ? <><Unplug className="h-4 w-4" /> {item.mode === "server" ? "Bağlantıyı Yönet" : "Bağlantıyı Kes"}</> : <><Plug className="h-4 w-4" /> Bağla</>}</ExactButton><ExactIconButton icon={CircleHelp} label={`${item.label} nasıl bağlanır?`} variant="secondary" size="icon-sm" onClick={() => setHelp(item)} />{item.href ? <a href={item.href}><ExactIconButton icon={ExternalLink} label="Yönetim sayfasını aç" variant="ghost" size="icon-sm" /></a> : null}</div></ExactDataCard>; })}</div>}
    <ExactDataCard title="Bağlantı Güvenliği"><div className="grid gap-3 md:grid-cols-3">{[{ title: "Gizli bilgiler", text: "Sunucu erişimleri tarayıcıya gönderilmez; yalnız güvenli deployment ayarlarında tutulur." }, { title: "Canlı kontrol", text: "Kartlar sunucu yapılandırmasını ve desteklenen sağlayıcılarda gerçek bağlantıyı kontrol eder." }, { title: "Güvenli kesme", text: "Gmail panelden kesilir. Sunucu bağlantıları deployment ayarından kaldırılır." }].map((entry) => <div key={entry.title} className="rounded-[var(--radius-small)] bg-surface-secondary p-3"><CheckCircle2 className="h-4 w-4 text-success-foreground" /><p className="mt-2 text-xs font-semibold text-main">{entry.title}</p><p className="mt-1 text-[10px] leading-relaxed text-muted">{entry.text}</p></div>)}</div></ExactDataCard>

    <ExactFormModal open={Boolean(help)} onClose={() => setHelp(null)} dismissalPolicy="light-dismiss" title={help ? `${help.label} Bağlantısı` : "Entegrasyon"} subtitle="Güvenli kurulum ve bağlantı kesme adımları" size="lg" footer={<ExactButton variant="secondary" size="sm" onClick={() => setHelp(null)}>Kapat</ExactButton>}>{help ? <HelpContent item={help} onConnect={() => void connect(help)} busy={busy === help.key} /> : null}</ExactFormModal>
  </div>;
}

function HelpContent({ item, onConnect, busy }: { item: Definition; onConnect: () => void; busy: boolean }) {
  const Icon = item.icon;
  return <div className="space-y-4"><div className="flex items-center gap-3 rounded-[var(--radius-control)] bg-accent-soft p-3"><div className="flex h-10 w-10 items-center justify-center radius-small bg-accent text-white"><Icon className="h-5 w-5" /></div><div><p className="text-sm font-semibold text-main">{item.label}</p><p className="text-xs text-muted">{item.description}</p></div></div><ol className="space-y-2">{item.setup.map((step, index) => <li key={step} className="flex gap-3 rounded-[var(--radius-small)] bg-surface-secondary p-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">{index + 1}</span><span className="text-xs leading-relaxed text-main">{step}</span></li>)}</ol>{item.mode === "server" ? <div className="rounded-[var(--radius-control)] bg-warning-soft p-3 text-xs leading-relaxed text-warning-foreground">Bu sağlayıcının gizli sunucu erişimi panel formuna yazılmaz. Bağlamak veya kesmek için Zeabur güvenli ortam değişkenlerini güncelleyip ilgili servisi yeniden yayınla.</div> : null}{item.mode === "gmail" ? <ExactButton className="w-full" onClick={onConnect} loading={busy}><Plug className="h-4 w-4" /> Gmail OAuth ile Bağla</ExactButton> : null}</div>;
}
