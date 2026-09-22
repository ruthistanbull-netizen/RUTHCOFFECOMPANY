"use client";

import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Eye,
  Instagram,
  Layers,
  Link2,
  Megaphone,
  MessageCircle,
  RefreshCw,
  ShoppingBag,
  ShoppingCart,
  Target,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { LoadingIndicator } from "@ruth-commerce/ui";
import { AnimatePresence, motion } from "framer-motion";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { adminRequest } from "@/lib/adminApi";
import { ExactButton, ExactPageHeader, ExactSkeleton, useExactToast } from "./primitives";
import { ExactDataCard } from "./data";
import { ExactWorkspaceModal } from "./ExactWorkspaceModal";
import { ExactDatePicker } from "./ExactDatePicker";

type ResultItem = { type: string; label: string; value: number };
type MetaMetrics = {
  spend: number;
  purchases: number;
  revenue: number;
  roas: number;
  impressions: number;
  reach: number;
  frequency: number;
  clicks: number;
  linkClicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  landingPageViews: number;
  addToCart: number;
  initiateCheckout: number;
  contentViews: number;
  messages: number;
  resultBreakdown: ResultItem[];
};

type MetaAd = {
  id: string;
  name: string;
  status: string;
  effectiveStatus: string;
  createdTime?: string | null;
  updatedTime?: string | null;
  campaign: { id?: string | null; name: string };
  adset: { id?: string | null; name: string };
  creative: { id?: string | null; name?: string | null; thumbnailUrl?: string | null };
  metrics: MetaMetrics;
};

type MetaPayload = {
  ok: boolean;
  fetchedAt: string;
  range: string;
  dateRange?: { since: string; until: string } | null;
  account: {
    id: string;
    name: string;
    status: string;
    statusCode?: number | null;
    currency: string;
    timezone: string;
    balance: number;
    lifetimeSpend: number;
    spendCap: number;
  };
  totals: {
    spend: number;
    purchases: number;
    revenue: number;
    roas: number;
    impressions: number;
    reach: number;
    linkClicks: number;
    contentViews: number;
    addToCart: number;
    initiateCheckout: number;
    messages: number;
    cpc: number;
    cpm: number;
  };
  ads: MetaAd[];
  __fromCache?: boolean;
};

type BreakdownPopup = { ad: MetaAd; left: number; top: number };
type PreviewKey = "feed" | "story" | "reels" | "explore";
type PreviewPlacement = {
  key: PreviewKey;
  label: string;
  format: string;
  available: boolean;
  iframeUrl?: string | null;
  nativeWidth?: number | null;
  nativeHeight?: number | null;
  error?: string | null;
};
type PreviewPayload = {
  ok: boolean;
  generatedAt: string;
  ad: { id: string; name: string };
  placements: PreviewPlacement[];
};

type SummaryMetrics = { spend: number; purchases: number; revenue: number; roas: number };
type AdsetGroup = { key: string; id: string | null; name: string; ads: MetaAd[]; summary: SummaryMetrics };
type CampaignGroup = { key: string; id: string | null; name: string; adsets: AdsetGroup[]; ads: MetaAd[]; summary: SummaryMetrics };

const PANEL_SPRING = { type: "spring" as const, stiffness: 330, damping: 31, mass: 0.72 };

function dateValue(offsetDays = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function statusText(status: string) {
  const value = String(status || "").toUpperCase();
  if (value === "ACTIVE") return "Aktif";
  if (value === "PAUSED") return "Duraklatıldı";
  if (value === "DISABLED") return "Devre dışı";
  if (value === "UNSETTLED") return "Ödeme bekliyor";
  if (value.includes("PENDING")) return "İnceleniyor";
  if (value === "ARCHIVED") return "Arşivlendi";
  if (value === "DELETED") return "Silindi";
  if (!value || value === "UNKNOWN") return "";
  return value;
}

function statusClass(status: string) {
  const value = String(status || "").toUpperCase();
  if (value === "ACTIVE") return "bg-success-soft text-success-foreground";
  if (value === "PAUSED" || value.includes("PENDING")) return "bg-warning-soft text-warning-foreground";
  if (["DISABLED", "UNSETTLED", "DELETED"].includes(value)) return "bg-danger-soft text-danger-foreground";
  return "bg-surface-tertiary text-muted";
}

function summarizeAds(ads: MetaAd[]): SummaryMetrics {
  const totals = ads.reduce((acc, ad) => {
    acc.spend += Number(ad.metrics.spend || 0);
    acc.purchases += Number(ad.metrics.purchases || 0);
    acc.revenue += Number(ad.metrics.revenue || 0);
    return acc;
  }, { spend: 0, purchases: 0, revenue: 0 });
  return { ...totals, roas: totals.spend > 0 ? totals.revenue / totals.spend : 0 };
}

function buildCampaignTree(ads: MetaAd[]): CampaignGroup[] {
  const campaigns = new Map<string, {
    id: string | null;
    name: string;
    ads: MetaAd[];
    adsets: Map<string, { id: string | null; name: string; ads: MetaAd[] }>;
  }>();

  for (const ad of ads) {
    const campaignId = ad.campaign.id ? String(ad.campaign.id) : null;
    const campaignKey = campaignId || `campaign:${ad.campaign.name}`;
    let campaign = campaigns.get(campaignKey);
    if (!campaign) {
      campaign = { id: campaignId, name: ad.campaign.name || "Kampanya", ads: [], adsets: new Map() };
      campaigns.set(campaignKey, campaign);
    }
    campaign.ads.push(ad);

    const adsetId = ad.adset.id ? String(ad.adset.id) : null;
    const adsetKey = adsetId || `${campaignKey}:adset:${ad.adset.name}`;
    let adset = campaign.adsets.get(adsetKey);
    if (!adset) {
      adset = { id: adsetId, name: ad.adset.name || "Reklam seti", ads: [] };
      campaign.adsets.set(adsetKey, adset);
    }
    adset.ads.push(ad);
  }

  return [...campaigns.entries()].map(([key, campaign]) => ({
    key,
    id: campaign.id,
    name: campaign.name,
    ads: campaign.ads,
    summary: summarizeAds(campaign.ads),
    adsets: [...campaign.adsets.entries()].map(([adsetKey, adset]) => ({
      key: adsetKey,
      id: adset.id,
      name: adset.name,
      ads: adset.ads.slice().sort((a, b) => b.metrics.spend - a.metrics.spend),
      summary: summarizeAds(adset.ads),
    })).sort((a, b) => b.summary.spend - a.summary.spend),
  })).sort((a, b) => b.summary.spend - a.summary.spend);
}

function MetricTile({ label, value, hint, icon: Icon, accent = false }: {
  label: string;
  value: string;
  hint?: string;
  icon: typeof CircleDollarSign;
  accent?: boolean;
}) {
  return (
    <div className={`min-h-[116px] rounded-2xl border border-border-subtle p-4 ${accent ? "bg-accent-soft" : "bg-surface-primary"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="ruth-type-label uppercase tracking-[0.08em] text-subtle">{label}</p>
          <p className="ruth-type-metric mt-2 break-words text-main">{value}</p>
          {hint ? <p className="ruth-type-caption mt-2 text-muted">{hint}</p> : null}
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-secondary text-main">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
    </div>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-surface-secondary p-3">
      <p className="ruth-type-label truncate uppercase tracking-[0.06em] text-subtle">{label}</p>
      <p className="ruth-type-table mt-1 break-words font-bold text-main">{value}</p>
    </div>
  );
}

function TreeSummary({ summary, money, compact, roas }: {
  summary: SummaryMetrics;
  money: (value: number) => string;
  compact: (value: number) => string;
  roas: (value: number) => string;
}) {
  return (
    <div className="grid min-w-0 grid-cols-4 gap-1.5 sm:min-w-[380px] sm:gap-2">
      <TreeStat label="Harcama" value={money(summary.spend)} />
      <TreeStat label="Alışveriş" value={compact(summary.purchases)} />
      <TreeStat label="Gelir" value={money(summary.revenue)} />
      <TreeStat label="ROAS" value={roas(summary.roas)} />
    </div>
  );
}

function TreeStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-surface-secondary px-2 py-1.5 text-left">
      <p className="ruth-type-label truncate uppercase tracking-wide text-subtle">{label}</p>
      <p className="ruth-type-table mt-0.5 truncate font-bold text-main">{value}</p>
    </div>
  );
}

function ResultBreakdownContent({ ad, compactNumber }: {
  ad: MetaAd;
  compactNumber: (value: number) => string;
}) {
  const core = [
    { label: "Alışveriş", value: ad.metrics.purchases, icon: ShoppingBag },
    { label: "Sepete ekleme", value: ad.metrics.addToCart, icon: ShoppingCart },
    { label: "İçerik görüntüleme", value: ad.metrics.contentViews, icon: Eye },
    { label: "Ödeme başlatma", value: ad.metrics.initiateCheckout, icon: Target },
    { label: "Mesaj konuşması", value: ad.metrics.messages, icon: MessageCircle },
    { label: "Bağlantı tıklaması", value: ad.metrics.linkClicks, icon: Link2 },
  ];
  return (
    <div className="space-y-1.5">
      {core.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.label} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5">
            <span className="ruth-type-caption flex min-w-0 items-center gap-2 text-muted">
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{item.label}</span>
            </span>
            <strong className="ruth-type-table text-main">{compactNumber(item.value)}</strong>
          </div>
        );
      })}
    </div>
  );
}

function AdPreviewSection({ adId }: { adId: string }) {
  const [payload, setPayload] = useState<PreviewPayload | null>(null);
  const [active, setActive] = useState<PreviewKey>("feed");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPayload(null);
    setActive("feed");
    setLoading(true);
    setError(null);
    void adminRequest<PreviewPayload>(`/api/meta-ads/${encodeURIComponent(adId)}/previews`, {
      hardRefresh: true,
      timeoutMs: 30_000,
      ttlMs: 0,
      staleMs: 0,
    }).then((data) => {
      if (!cancelled) setPayload(data);
    }).catch((caught) => {
      if (!cancelled) setError(caught instanceof Error ? caught.message : "Meta reklam önizlemeleri alınamadı.");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [adId]);

  const placement = payload?.placements.find((item) => item.key === active) || null;

  return (
    <ExactDataCard title={<span className="flex items-center gap-2"><Instagram className="h-4 w-4" />Reklam Önizlemesi</span>}>
      <div className="space-y-3">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {([["feed", "Feed"], ["story", "Story"], ["reels", "Reels"], ["explore", "Keşfet"]] as Array<[PreviewKey, string]>).map(([key, label]) => {
            const item = payload?.placements.find((entry) => entry.key === key);
            return (
              <button key={key} type="button" onClick={() => setActive(key)} className={`ruth-type-control shrink-0 rounded-full border px-3 py-1.5 transition ${active === key ? "border-accent bg-accent-soft text-accent" : "border-border-subtle bg-surface-primary text-muted"}`}>
                {label}{!loading && item?.available === false ? <span className="ml-1 opacity-50">×</span> : null}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="mx-auto grid h-[min(66dvh,680px)] min-h-[360px] w-full max-w-[520px] place-items-center rounded-2xl bg-surface-secondary text-muted" role="status" aria-busy="true">
            <div className="text-center"><LoadingIndicator size="md" label="Meta önizlemesi oluşturuluyor" className="mx-auto" /><p className="ruth-type-caption mt-3">Meta önizlemeyi oluşturuyor...</p></div>
          </div>
        ) : error ? (
          <div className="rounded-2xl bg-danger-soft p-4 text-center"><p className="ruth-type-card-title text-danger-foreground">Önizleme alınamadı</p><p className="ruth-type-caption mt-1 text-muted">{error}</p></div>
        ) : placement?.available && placement.iframeUrl ? (
          <div className="mx-auto w-full max-w-[520px]">
            <div className="ruth-type-caption mb-2 flex items-center justify-between gap-2 text-muted"><span>{placement.label}</span><span>Meta canlı önizleme</span></div>
            <div className="mx-auto h-[min(66dvh,720px)] min-h-[420px] w-full overflow-hidden rounded-xl border border-border-subtle bg-white shadow-sm md:h-[min(72dvh,760px)]">
              <iframe key={`${placement.key}:${placement.iframeUrl}`} src={placement.iframeUrl} title={`${placement.label} reklam önizlemesi`} className="block h-full w-full border-0 bg-white" allow="autoplay; fullscreen; picture-in-picture" referrerPolicy="no-referrer" scrolling="no" />
            </div>
          </div>
        ) : (
          <div className="mx-auto grid min-h-[320px] w-full max-w-[460px] place-items-center rounded-2xl border border-dashed border-border-subtle bg-surface-secondary p-6 text-center">
            <div><Instagram className="mx-auto h-7 w-7 text-subtle" /><p className="ruth-type-card-title mt-3 text-main">Bu yerleşimde önizleme yok</p><p className="ruth-type-caption mx-auto mt-1 max-w-[280px] text-muted">{placement?.error || "Bu reklam bu Instagram yerleşimi için uygun olmayabilir."}</p></div>
          </div>
        )}
      </div>
    </ExactDataCard>
  );
}

export function ExactMetaAdsRealtime() {
  const toast = useExactToast();
  const [range, setRange] = useState("30d");
  const [customSince, setCustomSince] = useState(() => dateValue(-29));
  const [customUntil, setCustomUntil] = useState(() => dateValue());
  const [payload, setPayload] = useState<MetaPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<MetaAd | null>(null);
  const [breakdown, setBreakdown] = useState<BreakdownPopup | null>(null);
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(() => new Set());
  const [expandedAdsets, setExpandedAdsets] = useState<Set<string>>(() => new Set());
  const requestSequence = useRef(0);

  const load = useCallback(async () => {
    if (range === "custom" && (!customSince || !customUntil || customSince > customUntil)) {
      toast.error("Geçerli bir başlangıç ve bitiş tarihi seç.");
      return;
    }

    const sequence = ++requestSequence.current;
    if (!payload) setLoading(true);
    const params = new URLSearchParams({ range });
    if (range === "custom") {
      params.set("since", customSince);
      params.set("until", customUntil);
    }
    const path = `/api/meta-ads?${params.toString()}`;

    try {
      const immediate = await adminRequest<MetaPayload>(path);
      if (sequence !== requestSequence.current) return;
      setPayload(immediate);
      setLoading(false);

      if (immediate.__fromCache) {
        void adminRequest<MetaPayload>(path, { hardRefresh: true, timeoutMs: 45_000 }).then((fresh) => {
          if (sequence === requestSequence.current) setPayload(fresh);
        }).catch(() => undefined);
      }
    } catch (error) {
      if (sequence !== requestSequence.current) return;
      toast.error(error instanceof Error ? error.message : "Meta reklam verileri alınamadı.");
      setLoading(false);
    }
  }, [customSince, customUntil, payload, range, toast]);

  useEffect(() => {
    if (range !== "custom") void load();
  }, [range]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!breakdown) return;
    const close = () => setBreakdown(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [breakdown]);

  const currency = payload?.account.currency || "TRY";
  const money = useCallback((value: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value || 0)), [currency]);
  const compact = (value: number) => new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value || 0));
  const pct = (value: number) => `%${Number(value || 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 })}`;
  const roas = (value: number) => `${Number(value || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`;
  const activeAds = useMemo(() => payload?.ads.filter((ad) => ad.effectiveStatus === "ACTIVE").length || 0, [payload]);
  const campaigns = useMemo(() => buildCampaignTree(payload?.ads || []), [payload?.ads]);
  const estimatedTax = Number(payload?.account.balance || 0) * 0.2;
  const totalDebt = Number(payload?.account.balance || 0) + estimatedTax;

  const toggleCampaign = (key: string) => setExpandedCampaigns((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const toggleAdset = (key: string) => setExpandedAdsets((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const showBreakdown = (event: ReactMouseEvent<HTMLElement>, ad: MetaAd, toggle = false) => {
    event.stopPropagation();
    if (toggle && breakdown?.ad.id === ad.id) {
      setBreakdown(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const width = 252;
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.left + rect.width / 2 - width / 2));
    const below = rect.bottom + 8;
    const top = below + 230 < window.innerHeight ? below : Math.max(12, rect.top - 238);
    setBreakdown({ ad, left, top });
  };

  return (
    <div className="space-y-4 animate-fade-in" data-exact-base44-page="meta-ads">
      <ExactPageHeader
        title="Meta Reklamları"
        subtitle="Meta reklam hesabı, kampanyalar, reklam setleri ve reklam performansı"
        actions={(
          <label className="flex min-w-[170px] items-center gap-2 rounded-xl border border-border-subtle bg-surface-secondary px-3">
            <CalendarDays className="h-4 w-4 shrink-0 text-muted" />
            <select aria-label="Tarih aralığı" value={range} onChange={(event) => setRange(event.target.value)} className="ruth-type-control h-10 min-w-0 flex-1 appearance-none bg-transparent pr-5 text-main outline-none">
              <option value="today">Bugün</option>
              <option value="7d">Son 7 gün</option>
              <option value="30d">Son 30 gün</option>
              <option value="90d">Son 90 gün</option>
              <option value="all">Tüm zamanlar</option>
              <option value="custom">Özel tarih aralığı</option>
            </select>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-subtle" />
          </label>
        )}
      />

      {range === "custom" ? (
        <motion.div initial={{ opacity: 0, y: -8, height: 0 }} animate={{ opacity: 1, y: 0, height: "auto" }} transition={PANEL_SPRING} className="flex min-w-0 flex-col gap-3 overflow-visible rounded-2xl border border-border-subtle bg-surface-primary p-3 sm:flex-row sm:items-end">
          <div className="flex items-center gap-2 text-main sm:mr-1"><CalendarDays className="h-4 w-4" /><span className="ruth-type-card-title">Özel tarih aralığı</span></div>
          <label className="min-w-0 flex-1"><span className="ruth-type-label mb-1 block text-subtle">Başlangıç</span><ExactDatePicker value={customSince} max={customUntil || dateValue()} onChange={setCustomSince} label="Başlangıç" className="h-10" /></label>
          <label className="min-w-0 flex-1"><span className="ruth-type-label mb-1 block text-subtle">Bitiş</span><ExactDatePicker value={customUntil} min={customSince} max={dateValue()} onChange={setCustomUntil} label="Bitiş" className="h-10" /></label>
          <ExactButton size="sm" onClick={() => void load()}>Uygula</ExactButton>
        </motion.div>
      ) : null}

      {loading && !payload ? (
        <div className="space-y-3"><ExactSkeleton className="h-32" /><div className="grid grid-cols-2 gap-3 xl:grid-cols-6">{Array.from({ length: 6 }, (_, index) => <ExactSkeleton key={index} className="h-28" />)}</div><ExactSkeleton className="h-80" /></div>
      ) : payload ? (
        <>
          <div className="rounded-2xl border border-border-subtle bg-surface-primary p-4 sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#1877F2]/10 text-[#1877F2]"><Megaphone className="h-5 w-5" /></span><div className="min-w-0"><p className="ruth-type-card-title truncate text-main">{payload.account.name}</p><p className="ruth-type-code text-muted">{payload.account.id} · {payload.account.currency} · {payload.account.timezone}</p></div>{statusText(payload.account.status) ? <span className={`ruth-type-caption rounded-full px-2 py-1 font-semibold ${statusClass(payload.account.status)}`}>{statusText(payload.account.status)}</span> : null}</div></div>
              <div className="grid grid-cols-3 gap-2 sm:min-w-[430px]">
                <div className="rounded-xl bg-surface-secondary p-3">
                  <p className="ruth-type-label uppercase text-subtle">Mevcut Bakiye / Reklam Borcu</p>
                  <p className="ruth-type-price mt-1 font-bold text-main">{money(payload.account.balance)}</p>
                  <p className="ruth-type-caption mt-1 text-muted">+ {money(estimatedTax)} tahmini vergi</p>
                  <div data-meta-total-debt="true" className="mt-2 border-t border-border-subtle pt-2"><p data-meta-total-debt-label="true" className="ruth-type-label uppercase tracking-wide text-subtle">Vergi Dahil Toplam Borç</p><p data-meta-total-debt-value="true" className="ruth-type-price mt-0.5 font-bold text-main">{money(totalDebt)}</p></div>
                </div>
                <div className="rounded-xl bg-surface-secondary p-3"><p className="ruth-type-label uppercase text-subtle">Toplam Harcama</p><p className="ruth-type-price mt-1 font-bold text-main">{money(payload.account.lifetimeSpend)}</p></div>
                <div className="rounded-xl bg-surface-secondary p-3"><p className="ruth-type-label uppercase text-subtle">Harcama Limiti</p><p className="ruth-type-price mt-1 font-bold text-main">{payload.account.spendCap > 0 ? money(payload.account.spendCap) : "Limitsiz"}</p></div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
            <MetricTile label="Reklam Harcaması" value={money(payload.totals.spend)} hint={`${activeAds} aktif reklam`} icon={WalletCards} />
            <MetricTile label="Alışveriş" value={compact(payload.totals.purchases)} hint={`${compact(payload.totals.addToCart)} sepete ekleme`} icon={ShoppingBag} />
            <MetricTile label="Reklam Geliri" value={money(payload.totals.revenue)} hint="Satın alma değeri" icon={CircleDollarSign} />
            <MetricTile label="ROAS" value={roas(payload.totals.roas)} hint="Gelir / reklam harcaması" icon={TrendingUp} accent />
            <MetricTile label="İçerik Görüntüleme" value={compact(payload.totals.contentViews)} hint="Meta ViewContent" icon={Eye} />
            <MetricTile label="Sepet" value={compact(payload.totals.addToCart)} hint="Sepete ekleme" icon={ShoppingCart} />
          </div>

          <ExactDataCard title={`Kampanyalar · ${campaigns.length}`} bodyClassName="p-2 sm:p-3">
            <div className="space-y-2">
              {campaigns.map((campaign) => {
                const openCampaign = expandedCampaigns.has(campaign.key);
                return (
                  <section key={campaign.key} className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-primary">
                    <button type="button" onClick={() => toggleCampaign(campaign.key)} className="flex w-full flex-col gap-3 p-3 text-left transition hover:bg-surface-secondary/70 sm:flex-row sm:items-center sm:justify-between sm:p-4">
                      <div className="flex min-w-0 items-center gap-3"><motion.span animate={{ rotate: openCampaign ? 90 : 0 }} transition={PANEL_SPRING} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#1877F2]/10 text-[#1877F2]"><ChevronRight className="h-4 w-4" /></motion.span><div className="min-w-0"><p className="ruth-type-card-title truncate text-main">{campaign.name}</p><p className="ruth-type-caption mt-0.5 text-muted">{campaign.adsets.length} reklam seti · {campaign.ads.length} reklam</p></div></div>
                      <TreeSummary summary={campaign.summary} money={money} compact={compact} roas={roas} />
                    </button>
                    <AnimatePresence initial={false}>
                      {openCampaign ? (
                        <motion.div key="campaign-body" initial={{ height: 0, opacity: 0, y: -8 }} animate={{ height: "auto", opacity: 1, y: 0 }} exit={{ height: 0, opacity: 0, y: -6 }} transition={PANEL_SPRING} className="overflow-hidden border-t border-border-subtle bg-surface-secondary/45">
                          <div className="space-y-2 p-2 sm:p-3">
                            {campaign.adsets.map((adset) => {
                              const openAdset = expandedAdsets.has(adset.key);
                              return (
                                <div key={adset.key} className="overflow-hidden rounded-xl border border-border-subtle bg-surface-primary">
                                  <button type="button" onClick={() => toggleAdset(adset.key)} className="flex w-full flex-col gap-2.5 p-3 text-left transition hover:bg-surface-secondary/60 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex min-w-0 items-center gap-2.5"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-secondary text-muted"><Layers className="h-4 w-4" /></span><div className="min-w-0"><p className="ruth-type-card-title flex items-center gap-1.5 truncate text-main"><motion.span animate={{ rotate: openAdset ? 90 : 0 }} transition={PANEL_SPRING} className="inline-flex"><ChevronRight className="h-3.5 w-3.5 shrink-0" /></motion.span><span className="truncate">{adset.name}</span></p><p className="ruth-type-caption mt-0.5 text-muted">{adset.ads.length} reklam</p></div></div>
                                    <TreeSummary summary={adset.summary} money={money} compact={compact} roas={roas} />
                                  </button>
                                  <AnimatePresence initial={false}>
                                    {openAdset ? (
                                      <motion.div key="adset-body" initial={{ height: 0, opacity: 0, y: -6 }} animate={{ height: "auto", opacity: 1, y: 0 }} exit={{ height: 0, opacity: 0, y: -4 }} transition={PANEL_SPRING} className="overflow-hidden border-t border-border-subtle">
                                        <div className="divide-y divide-border-subtle">
                                          {adset.ads.map((ad, adIndex) => {
                                            const adStatus = statusText(ad.effectiveStatus);
                                            return (
                                              <motion.div key={ad.id} role="button" tabIndex={0} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ ...PANEL_SPRING, delay: Math.min(adIndex, 8) * 0.025 }} onClick={() => setSelected(ad)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(ad); } }} className="group grid cursor-pointer grid-cols-1 gap-3 bg-surface-primary px-3 py-3 transition hover:bg-surface-secondary/70 lg:grid-cols-[minmax(250px,1.6fr)_repeat(4,minmax(90px,.65fr))_82px] lg:items-center">
                                                <div className="flex min-w-0 items-center gap-3"><div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-surface-tertiary">{ad.creative.thumbnailUrl ? <img src={ad.creative.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" /> : <span className="grid h-full w-full place-items-center text-muted"><Megaphone className="h-4 w-4" /></span>}</div><div className="min-w-0"><p className="ruth-type-card-title truncate text-main group-hover:text-accent">{ad.name}</p><p className="ruth-type-caption mt-0.5 truncate text-subtle">{ad.creative.name || "Meta kreatifi"}</p></div></div>
                                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:contents">
                                                  <div><p className="ruth-type-label uppercase text-subtle lg:hidden">Harcama</p><p className="ruth-type-table font-semibold text-main">{money(ad.metrics.spend)}</p></div>
                                                  <div className="relative"><p className="ruth-type-label uppercase text-subtle lg:hidden">Sonuçlar</p><button type="button" onMouseEnter={(event) => showBreakdown(event, ad)} onMouseLeave={() => setBreakdown(null)} onClick={(event) => showBreakdown(event, ad, true)} className="rounded-lg px-1 py-0.5 text-left hover:bg-accent-soft"><span className="ruth-type-table block font-bold text-main">{compact(ad.metrics.purchases)}</span><span className="ruth-type-caption block text-muted">Alışveriş</span></button></div>
                                                  <div><p className="ruth-type-label uppercase text-subtle lg:hidden">Gelir</p><p className="ruth-type-table font-semibold text-main">{money(ad.metrics.revenue)}</p></div>
                                                  <div><p className="ruth-type-label uppercase text-subtle lg:hidden">ROAS</p><p className="ruth-type-table font-bold text-main">{roas(ad.metrics.roas)}</p></div>
                                                </div>
                                                <div className="flex items-center lg:block">{adStatus ? <span className={`ruth-type-caption inline-flex rounded-full px-2 py-1 font-semibold ${statusClass(ad.effectiveStatus)}`}>{adStatus}</span> : null}</div>
                                              </motion.div>
                                            );
                                          })}
                                        </div>
                                      </motion.div>
                                    ) : null}
                                  </AnimatePresence>
                                </div>
                              );
                            })}
                          </div>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </section>
                );
              })}
              {!campaigns.length ? <p className="ruth-type-caption py-14 text-center text-muted">Bu tarih aralığında reklam bulunamadı.</p> : null}
            </div>
          </ExactDataCard>

          <div className="ruth-type-caption flex flex-wrap items-center justify-between gap-2 px-1 text-subtle"><span>{compact(payload.totals.impressions)} gösterim · {compact(payload.totals.reach)} erişim · {compact(payload.totals.contentViews)} içerik görüntüleme · CPM {money(payload.totals.cpm)}</span><span>Son güncelleme: {new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(new Date(payload.fetchedAt))}</span></div>
        </>
      ) : null}

      {typeof document !== "undefined" ? createPortal(
        <AnimatePresence>
          {breakdown ? (
            <motion.div key={breakdown.ad.id} initial={{ opacity: 0, y: -8, scale: 0.92, filter: "blur(5px)" }} animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }} exit={{ opacity: 0, y: -5, scale: 0.95, filter: "blur(3px)" }} transition={PANEL_SPRING} className="pointer-events-none fixed z-[2147483646] w-[252px] rounded-2xl border border-border-subtle bg-surface-primary p-3 shadow-2xl" style={{ left: breakdown.left, top: breakdown.top }}><div className="mb-2"><p className="ruth-type-label uppercase tracking-[0.06em] text-subtle">Sonuç Kırılımı</p><p className="ruth-type-caption truncate text-muted">{breakdown.ad.name}</p></div><ResultBreakdownContent ad={breakdown.ad} compactNumber={compact} /></motion.div>
          ) : null}
        </AnimatePresence>,
        document.body,
      ) : null}

      <ExactWorkspaceModal open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.name || "Reklam Detayı"} subtitle={selected ? `${selected.campaign.name} · ${selected.adset.name}` : undefined} kind="product">
        {selected ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-2xl bg-surface-primary p-3"><div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-surface-tertiary">{selected.creative.thumbnailUrl ? <img src={selected.creative.thumbnailUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : <span className="grid h-full w-full place-items-center text-muted"><Megaphone className="h-5 w-5" /></span>}</div><div className="min-w-0"><p className="ruth-type-card-title truncate text-main">{selected.name}</p><p className="ruth-type-caption mt-1 truncate text-muted">{selected.campaign.name} · {selected.adset.name}</p>{statusText(selected.effectiveStatus) ? <span className={`ruth-type-caption mt-2 inline-flex rounded-full px-2 py-1 font-semibold ${statusClass(selected.effectiveStatus)}`}>{statusText(selected.effectiveStatus)}</span> : null}</div></div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><MetricTile label="Harcama" value={money(selected.metrics.spend)} icon={WalletCards} /><MetricTile label="Alışveriş" value={compact(selected.metrics.purchases)} icon={ShoppingBag} /><MetricTile label="Gelir" value={money(selected.metrics.revenue)} icon={CircleDollarSign} /><MetricTile label="ROAS" value={roas(selected.metrics.roas)} icon={TrendingUp} accent /></div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"><DetailMetric label="Gösterim" value={compact(selected.metrics.impressions)} /><DetailMetric label="Erişim" value={compact(selected.metrics.reach)} /><DetailMetric label="Frekans" value={selected.metrics.frequency.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} /><DetailMetric label="Tüm Tıklamalar" value={compact(selected.metrics.clicks)} /><DetailMetric label="Bağlantı Tıklaması" value={compact(selected.metrics.linkClicks)} /><DetailMetric label="CTR" value={pct(selected.metrics.ctr)} /><DetailMetric label="CPC" value={money(selected.metrics.cpc)} /><DetailMetric label="CPM" value={money(selected.metrics.cpm)} /><DetailMetric label="İçerik Görüntüleme" value={compact(selected.metrics.contentViews)} /><DetailMetric label="Landing Page" value={compact(selected.metrics.landingPageViews)} /><DetailMetric label="Sepete Ekleme" value={compact(selected.metrics.addToCart)} /><DetailMetric label="Checkout" value={compact(selected.metrics.initiateCheckout)} /><DetailMetric label="Mesaj" value={compact(selected.metrics.messages)} /><DetailMetric label="Satın Alma" value={compact(selected.metrics.purchases)} /></div>
            <AdPreviewSection adId={selected.id} />
            {selected.metrics.resultBreakdown.length ? <ExactDataCard title="Meta Sonuçlarının Tamamı"><div className="grid grid-cols-2 gap-1.5">{selected.metrics.resultBreakdown.map((item) => <div key={`${item.type}:${item.label}`} className="flex min-w-0 items-center justify-between gap-2 rounded-lg bg-surface-secondary px-2 py-1.5"><span className="ruth-type-caption min-w-0 truncate text-muted">{item.label}</span><strong className="ruth-type-table shrink-0 text-main">{compact(item.value)}</strong></div>)}</div></ExactDataCard> : null}
            <ExactDataCard title="Reklam Bilgileri"><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-surface-secondary p-3"><p className="ruth-type-label text-subtle">Kampanya</p><p className="ruth-type-card-title mt-1 text-main">{selected.campaign.name}</p></div><div className="rounded-xl bg-surface-secondary p-3"><p className="ruth-type-label text-subtle">Reklam Seti</p><p className="ruth-type-card-title mt-1 text-main">{selected.adset.name}</p></div><div className="rounded-xl bg-surface-secondary p-3"><p className="ruth-type-label text-subtle">Kreatif</p><p className="ruth-type-card-title mt-1 text-main">{selected.creative.name || "Meta kreatifi"}</p></div>{statusText(selected.effectiveStatus) ? <div className="rounded-xl bg-surface-secondary p-3"><p className="ruth-type-label text-subtle">Durum</p><p className="ruth-type-card-title mt-1 text-main">{statusText(selected.effectiveStatus)}</p></div> : null}</div></ExactDataCard>
          </div>
        ) : null}
      </ExactWorkspaceModal>
    </div>
  );
}
