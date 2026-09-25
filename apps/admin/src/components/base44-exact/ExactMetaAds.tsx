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
  MousePointerClick,
  RefreshCw,
  ShoppingBag,
  ShoppingCart,
  Target,
  TrendingUp,
  WalletCards,
  X,
} from "lucide-react";
import { InlineFeedback, LoadingIndicator } from "@ruth-commerce/ui";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { adminRequest } from "@/lib/adminApi";
import { ExactButton, ExactPageHeader, ExactSkeleton, useExactToast } from "./primitives";
import { ExactDataCard } from "./data";

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
    taxDebt?: number | null;
    taxDebtAvailable?: boolean;
    taxNote?: string;
    taxId?: string | null;
    taxIdStatus?: number | null;
    businessCountryCode?: string | null;
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
};

type BreakdownPopup = { ad: MetaAd; left: number; top: number };
type PreviewKey = "feed" | "story" | "reels" | "explore";
type PreviewPlacement = {
  key: PreviewKey;
  label: string;
  format: string;
  available: boolean;
  iframeUrl?: string | null;
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
  return value === "UNKNOWN" ? "Bilinmiyor" : value;
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
  const campaigns = new Map<string, { id: string | null; name: string; ads: MetaAd[]; adsets: Map<string, { id: string | null; name: string; ads: MetaAd[] }> }>();

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
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-subtle">{label}</p>
          <p className="mt-2 text-[clamp(20px,2vw,30px)] font-bold leading-none text-main">{value}</p>
          {hint ? <p className="mt-2 text-[10px] leading-4 text-muted">{hint}</p> : null}
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
    <div className="rounded-xl bg-surface-secondary p-3">
      <p className="text-[10px] uppercase tracking-[0.06em] text-subtle">{label}</p>
      <p className="mt-1 text-sm font-bold text-main">{value}</p>
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
      <p className="truncate text-[7px] uppercase tracking-wide text-subtle sm:text-[8px]">{label}</p>
      <p className="mt-0.5 truncate text-[9px] font-bold text-main sm:text-[10px]">{value}</p>
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
          <div key={item.label} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 active:bg-surface-secondary focus-visible:bg-surface-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            <span className="flex min-w-0 items-center gap-2 text-[10px] text-muted">
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{item.label}</span>
            </span>
            <strong className="text-[11px] text-main">{compactNumber(item.value)}</strong>
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminRequest<PreviewPayload>(`/api/meta-ads/${encodeURIComponent(adId)}/previews`, {
        force: true,
        timeoutMs: 30_000,
        ttlMs: 0,
        staleMs: 0,
      });
      setPayload(data);
    } catch (caught) {
      setPayload(null);
      setError(caught instanceof Error ? caught.message : "Meta reklam önizlemeleri alınamadı.");
    } finally {
      setLoading(false);
    }
  }, [adId]);

  useEffect(() => {
    setPayload(null);
    setActive("feed");
    void load();
  }, [load]);

  const placement = payload?.placements.find((item) => item.key === active) || null;
  const vertical = active === "story" || active === "reels";
  const previewHeight = vertical ? 720 : 650;

  return (
    <ExactDataCard
      title={(
        <span className="flex items-center gap-2">
          <Instagram className="h-4 w-4" />
          Reklam Önizlemesi
        </span>
      )}
    >
      <div className="space-y-3">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {([
            ["feed", "Feed"],
            ["story", "Story"],
            ["reels", "Reels"],
            ["explore", "Keşfet"],
          ] as Array<[PreviewKey, string]>).map(([key, label]) => {
            const item = payload?.placements.find((entry) => entry.key === key);
            const available = item?.available !== false;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActive(key)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-semibold transition ${active === key ? "border-accent bg-accent-soft text-accent" : "border-border-subtle bg-surface-primary text-muted active:bg-surface-secondary focus-visible:bg-surface-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"}`}
              >
                {label}
                {!loading && payload && !available ? <span className="ml-1 opacity-50">×</span> : null}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="mx-auto grid min-h-[420px] w-full max-w-[440px] place-items-center border border-border-subtle bg-surface-secondary text-muted" role="status" aria-busy="true">
            <div className="text-center">
              <LoadingIndicator size="md" label="Meta önizlemesi oluşturuluyor" className="mx-auto" />
              <p className="mt-3 text-[11px]">Meta önizlemeyi oluşturuyor...</p>
            </div>
          </div>
        ) : error ? (
          <InlineFeedback
            tone="danger"
            message={error}
            retryLabel="Önizlemeyi tekrar yükle"
            onRetry={() => void load()}
          />
        ) : placement?.available && placement.iframeUrl ? (
          <div className="mx-auto w-full max-w-[440px] border border-border-subtle bg-surface-secondary p-2 sm:p-3">
            <div className="mb-2 flex items-center justify-between gap-2 px-1 text-[9px] text-muted">
              <span>{placement.label}</span>
              <span>Meta canlı önizleme</span>
            </div>
            <div className="w-full overflow-hidden border border-border-subtle bg-[var(--rosta-cream)] shadow-sm leading-[0]">
              <iframe
                key={`${placement.key}:${placement.iframeUrl}`}
                src={placement.iframeUrl}
                title={`${placement.label} reklam önizlemesi`}
                className="block border-0 bg-white"
                style={{
                  width: "calc(100% + 2px)",
                  height: previewHeight + 2,
                  marginRight: -2,
                  marginBottom: -2,
                }}
                allow="autoplay; fullscreen; picture-in-picture"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        ) : (
          <div className="mx-auto grid min-h-[420px] w-full max-w-[440px] place-items-center border border-dashed border-border-subtle bg-surface-secondary p-6 text-center">
            <div>
              <Instagram className="mx-auto h-7 w-7 text-subtle" />
              <p className="mt-3 text-xs font-semibold text-main">Bu yerleşimde önizleme yok</p>
              <p className="mx-auto mt-1 max-w-[280px] text-[10px] leading-4 text-muted">
                {placement?.error || "Bu reklam bu Instagram yerleşimi için uygun olmayabilir."}
              </p>
            </div>
          </div>
        )}
      </div>
    </ExactDataCard>
  );
}

export function ExactMetaAds() {
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

  const money = useMemo(() => new Intl.NumberFormat("tr-TR", { style: "currency", currency: payload?.account.currency || "TRY", maximumFractionDigits: 2 }), [payload?.account.currency]);
  const compactNumber = useMemo(() => new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 }), []);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (range === "custom") {
        params.set("range", "custom");
        params.set("since", customSince);
        params.set("until", customUntil);
      } else {
        params.set("range", range);
      }
      const result = await adminRequest<MetaPayload>(`/api/meta-ads?${params.toString()}`, { force, timeoutMs: 45_000 });
      setPayload(result);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Meta reklam verileri alınamadı.");
    } finally {
      setLoading(false);
    }
  }, [customSince, customUntil, range, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setExpandedCampaigns(new Set());
    setExpandedAdsets(new Set());
  }, [payload?.fetchedAt, range]);

  const campaigns = useMemo(() => buildCampaignTree(payload?.ads || []), [payload?.ads]);

  const compact = (value: number) => compactNumber.format(value || 0);
  const formatMoney = (value: number) => money.format(value || 0);
  const formatRoas = (value: number) => `${Number(value || 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 })}x`;

  const toggleCampaign = (key: string) => {
    setExpandedCampaigns((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleAdset = (key: string) => {
    setExpandedAdsets((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const campaignSummary = payload?.totals || null;
  const refreshing = loading && Boolean(payload);

  return (
    <div className="space-y-6">
      <ExactPageHeader
        title="Meta Reklam Yönetimi"
        subtitle="Kampanya, reklam seti ve reklam seviyesini Meta ile aynı hiyerarşide izle; sonuçları, harcamayı ve satış değerini tek ekranda gör."
        actions={(
          <ExactButton
            variant="secondary"
            onClick={() => void load(true)}
            loading={refreshing}
            disabled={loading && !payload}
          >
            {!refreshing ? <RefreshCw className="h-4 w-4" /> : null}
            Yenile
          </ExactButton>
        )}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="Harcama" value={formatMoney(campaignSummary?.spend || 0)} icon={CircleDollarSign} />
        <MetricTile label="Alışveriş" value={compact(campaignSummary?.purchases || 0)} icon={ShoppingBag} />
        <MetricTile label="Satış değeri" value={formatMoney(campaignSummary?.revenue || 0)} icon={TrendingUp} accent />
        <MetricTile label="ROAS" value={formatRoas(campaignSummary?.roas || 0)} icon={Target} />
      </div>

      <div className="rounded-2xl border border-border-subtle bg-surface-primary p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[160px] flex-1">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-subtle">Tarih aralığı</span>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
              <select
                value={range}
                onChange={(event) => setRange(event.target.value)}
                className="h-10 w-full appearance-none rounded-xl border border-border-subtle bg-surface-primary pl-10 pr-9 text-xs font-semibold text-main outline-none focus:border-accent"
              >
                <option value="today">Bugün</option>
                <option value="7d">Son 7 gün</option>
                <option value="30d">Son 30 gün</option>
                <option value="90d">Son 90 gün</option>
                <option value="all">Tüm zamanlar</option>
                <option value="custom">Özel tarih</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
            </div>
          </label>

          {range === "custom" ? (
            <>
              <label>
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-subtle">Başlangıç</span>
                <input type="date" value={customSince} onChange={(event) => setCustomSince(event.target.value)} className="h-10 rounded-xl border border-border-subtle bg-surface-primary px-3 text-xs text-main outline-none focus:border-accent" />
              </label>
              <label>
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-subtle">Bitiş</span>
                <input type="date" value={customUntil} onChange={(event) => setCustomUntil(event.target.value)} className="h-10 rounded-xl border border-border-subtle bg-surface-primary px-3 text-xs text-main outline-none focus:border-accent" />
              </label>
              <ExactButton onClick={() => void load(true)} loading={refreshing}>Uygula</ExactButton>
            </>
          ) : null}
        </div>
      </div>

      {loading && !payload ? (
        <div className="space-y-3">
          <ExactSkeleton className="h-28 rounded-2xl" />
          <ExactSkeleton className="h-72 rounded-2xl" />
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((campaign) => {
            const campaignOpen = expandedCampaigns.has(campaign.key);
            return (
              <div key={campaign.key} className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-primary">
                <button type="button" onClick={() => toggleCampaign(campaign.key)} className="flex w-full flex-col gap-3 p-4 text-left active:bg-surface-secondary focus-visible:bg-surface-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><Megaphone className="h-4 w-4" /></span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-main">{campaign.name}</p>
                      <p className="mt-0.5 text-[9px] text-subtle">{campaign.adsets.length} reklam seti · {campaign.ads.length} reklam</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <TreeSummary summary={campaign.summary} money={formatMoney} compact={compact} roas={formatRoas} />
                    {campaignOpen ? <ChevronDown className="h-4 w-4 text-muted" /> : <ChevronRight className="h-4 w-4 text-muted" />}
                  </div>
                </button>

                {campaignOpen ? (
                  <div className="border-t border-border-subtle bg-surface-secondary/40 p-3 sm:p-4">
                    <div className="space-y-2">
                      {campaign.adsets.map((adset) => {
                        const adsetOpen = expandedAdsets.has(adset.key);
                        return (
                          <div key={adset.key} className="overflow-hidden rounded-xl border border-border-subtle bg-surface-primary">
                            <button type="button" onClick={() => toggleAdset(adset.key)} className="flex w-full flex-col gap-2.5 p-3 text-left active:bg-surface-secondary focus-visible:bg-surface-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex min-w-0 items-center gap-2.5">
                                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-secondary text-muted"><Layers className="h-3.5 w-3.5" /></span>
                                <div className="min-w-0">
                                  <p className="truncate text-[11px] font-semibold text-main">{adset.name}</p>
                                  <p className="mt-0.5 text-[8px] text-subtle">{adset.ads.length} reklam</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <TreeSummary summary={adset.summary} money={formatMoney} compact={compact} roas={formatRoas} />
                                {adsetOpen ? <ChevronDown className="h-4 w-4 text-muted" /> : <ChevronRight className="h-4 w-4 text-muted" />}
                              </div>
                            </button>

                            {adsetOpen ? (
                              <div className="border-t border-border-subtle">
                                {adset.ads.map((ad) => (
                                  <button key={ad.id} type="button" onClick={() => setSelected(ad)} className="flex w-full items-center justify-between gap-3 border-b border-border-subtle px-3 py-2.5 text-left last:border-b-0 active:bg-surface-secondary focus-visible:bg-surface-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                                    <div className="flex min-w-0 items-center gap-2.5">
                                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent"><MousePointerClick className="h-3.5 w-3.5" /></span>
                                      <div className="min-w-0">
                                        <p className="truncate text-[10px] font-semibold text-main">{ad.name}</p>
                                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                          <span className={`rounded-full px-2 py-0.5 text-[7px] font-semibold ${statusClass(ad.effectiveStatus || ad.status)}`}>{statusText(ad.effectiveStatus || ad.status)}</span>
                                          <span className="text-[8px] text-subtle">{formatMoney(ad.metrics.spend)}</span>
                                        </div>
                                      </div>
                                    </div>
                                    <ChevronRight className="h-4 w-4 shrink-0 text-subtle" />
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {selected ? (
        <div className="fixed inset-0 z-[120] bg-black/45 backdrop-blur-[2px]" onMouseDown={() => setSelected(null)}>
          <div className="absolute inset-x-0 bottom-0 max-h-[92dvh] overflow-y-auto rounded-t-[28px] bg-surface-primary pb-[calc(env(safe-area-inset-bottom)+16px)] shadow-2xl sm:inset-y-5 sm:left-auto sm:right-5 sm:w-[560px] sm:max-h-none sm:rounded-[24px]" onMouseDown={(event) => event.stopPropagation()}>
            <div className="sticky top-0 z-20 flex items-start justify-between gap-3 border-b border-border-subtle bg-surface-primary/95 px-4 py-4 backdrop-blur-xl sm:px-5">
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-main">{selected.name}</p>
                <p className="mt-0.5 truncate text-[10px] text-muted">{selected.campaign.name} · {selected.adset.name}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted active:bg-surface-secondary focus-visible:bg-surface-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"><X className="h-4 w-4" /></button>
            </div>

            <div className="space-y-4 p-4 sm:p-5">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <DetailMetric label="Harcama" value={formatMoney(selected.metrics.spend)} />
                <DetailMetric label="Alışveriş" value={compact(selected.metrics.purchases)} />
                <DetailMetric label="Satış" value={formatMoney(selected.metrics.revenue)} />
                <DetailMetric label="ROAS" value={formatRoas(selected.metrics.roas)} />
              </div>

              <AdPreviewSection adId={selected.id} />

              {selected.metrics.resultBreakdown.length ? (
                <ExactDataCard title="Meta Sonuçlarının Tamamı">
                  <div className="grid grid-cols-2 gap-1.5">
                    {selected.metrics.resultBreakdown.map((item) => (
                      <div key={`${item.type}:${item.label}`} className="flex min-w-0 items-center justify-between gap-2 rounded-lg bg-surface-secondary px-2 py-1.5">
                        <span className="min-w-0 truncate text-[8px] text-muted sm:text-[9px]">{item.label}</span>
                        <strong className="shrink-0 text-[9px] text-main sm:text-[10px]">{compact(item.value)}</strong>
                      </div>
                    ))}
                  </div>
                </ExactDataCard>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {breakdown ? (
        <div
          className="fixed z-[140] w-[230px] rounded-2xl border border-border-subtle bg-surface-primary p-3 shadow-2xl"
          style={{ left: Math.min(breakdown.left, typeof window !== "undefined" ? window.innerWidth - 246 : breakdown.left), top: Math.min(breakdown.top, typeof window !== "undefined" ? window.innerHeight - 300 : breakdown.top) }}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="truncate text-[10px] font-bold text-main">{breakdown.ad.name}</p>
            <button type="button" onClick={() => setBreakdown(null)} className="text-muted"><X className="h-3.5 w-3.5" /></button>
          </div>
          <ResultBreakdownContent ad={breakdown.ad} compactNumber={compact} />
        </div>
      ) : null}
    </div>
  );
}
