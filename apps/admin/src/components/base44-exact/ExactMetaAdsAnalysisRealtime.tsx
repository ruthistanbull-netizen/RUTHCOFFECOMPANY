"use client";

import {
  BrainCircuit,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  CircleDollarSign,
  ImageIcon,
  Layers,
  Megaphone,
  PauseCircle,
  PlayCircle,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  Video,
  WandSparkles,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminRequest } from "@/lib/adminApi";
import { ExactButton, ExactDetailDrawer, ExactPageHeader, ExactSkeleton, useExactToast } from "./primitives";
import { ExactDataCard } from "./data";
import { ExactDatePicker } from "./ExactDatePicker";

type MediaAsset = { type: "image" | "video"; url: string; label: string };
type CreativeAd = {
  id: string;
  name: string;
  status: string;
  effectiveStatus: string;
  campaign?: { id?: string; name?: string } | null;
  adset?: { id?: string; name?: string } | null;
  creative: { id?: string | null; name?: string | null; media: MediaAsset[] };
};
type CreativePayload = { ok: boolean; ads: CreativeAd[]; __fromCache?: boolean };
type MetricSet = { spend: number; purchases: number; revenue: number; roas: number; ctr: number; cpc: number; cpm: number; addToCart: number; contentViews: number; initiateCheckout: number; linkClicks: number };
type MetricsPayload = { ok: boolean; account: { name: string; currency: string }; ads: Array<{ id: string; metrics: MetricSet }>; __fromCache?: boolean };
type AnalysisResult = {
  recommendation: "continue" | "optimize" | "pause" | "insufficient_data";
  confidence: number;
  headline: string;
  summary: string;
  why: string[];
  actions: string[];
  creativeAnalysis: string;
  budgetGuidance: string;
  metricAnalysis: Array<{ metric: string; observation: string; implication: string }>;
  risks: string[];
  nextCheck: string;
};
type AnalysisPayload = {
  ok: boolean;
  generatedAt: string;
  dateRange: { since: string; until: string };
  peerCount: number;
  metrics: MetricSet & { impressions?: number; reach?: number; frequency?: number; clicks?: number; landingPageViews?: number; messages?: number };
  benchmark?: Record<string, number> | null;
  analysis: AnalysisResult;
};
type Summary = { spend: number; purchases: number; revenue: number; roas: number };
type AdsetNode = { key: string; id: string | null; name: string; ads: CreativeAd[]; summary: Summary };
type CampaignNode = { key: string; id: string | null; name: string; adsets: AdsetNode[]; ads: CreativeAd[]; summary: Summary };

const PANEL_SPRING = { type: "spring" as const, stiffness: 330, damping: 31, mass: 0.72 };

function dateValue(offset = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function statusLabel(status: string) {
  const value = String(status || "").toUpperCase();
  if (value === "ACTIVE") return "Aktif";
  if (value === "PAUSED") return "Duraklatıldı";
  if (value === "DISABLED") return "Devre dışı";
  if (value.includes("PENDING")) return "İnceleniyor";
  if (!value || value === "UNKNOWN") return "";
  return value;
}

function recommendationMeta(value: AnalysisResult["recommendation"]) {
  if (value === "continue") return { label: "Devam Et", icon: PlayCircle, className: "bg-success-soft text-success-foreground" };
  if (value === "pause") return { label: "Durdurmayı Değerlendir", icon: PauseCircle, className: "bg-danger-soft text-danger-foreground" };
  if (value === "optimize") return { label: "Optimize Et", icon: WandSparkles, className: "bg-warning-soft text-warning-foreground" };
  return { label: "Daha Fazla Veri Gerekli", icon: CircleAlert, className: "bg-info-soft text-info-foreground" };
}

function MediaStrip({ media, compact = false }: { media: MediaAsset[]; compact?: boolean }) {
  const items = media.slice(0, 4);
  const aspect = compact ? "aspect-[4/3]" : "aspect-[16/9]";
  if (!items.length) return <div className={`grid ${aspect} place-items-center rounded-xl bg-surface-tertiary text-muted`}><ImageIcon className="h-5 w-5" /></div>;
  return (
    <div className={`grid ${aspect} overflow-hidden rounded-xl bg-surface-tertiary ${items.length === 1 ? "grid-cols-1" : "grid-cols-2 grid-rows-2"}`}>
      {items.map((item, index) => (
        <div key={`${item.url}:${index}`} className={`relative overflow-hidden ${items.length === 2 ? "row-span-2" : items.length === 3 && index === 0 ? "row-span-2" : ""}`}>
          <img src={item.url} alt="" className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
          <span className="ruth-type-caption absolute bottom-1 left-1 inline-flex items-center gap-1 rounded-full bg-black/65 px-1.5 py-0.5 font-semibold text-white">{item.type === "video" ? <Video className="h-2.5 w-2.5" /> : <ImageIcon className="h-2.5 w-2.5" />}{item.type === "video" ? "Video" : "Fotoğraf"}</span>
          {index === 3 && media.length > 4 ? <span className="ruth-type-control absolute inset-0 grid place-items-center bg-black/45 text-white">+{media.length - 4}</span> : null}
        </div>
      ))}
    </div>
  );
}

function summarize(ads: CreativeAd[], metricMap: Map<string, MetricSet>): Summary {
  const value = ads.reduce((acc, ad) => {
    const metrics = metricMap.get(ad.id);
    if (metrics) {
      acc.spend += metrics.spend || 0;
      acc.purchases += metrics.purchases || 0;
      acc.revenue += metrics.revenue || 0;
    }
    return acc;
  }, { spend: 0, purchases: 0, revenue: 0 });
  return { ...value, roas: value.spend > 0 ? value.revenue / value.spend : 0 };
}

function buildTree(ads: CreativeAd[], metricMap: Map<string, MetricSet>): CampaignNode[] {
  const campaigns = new Map<string, { id: string | null; name: string; ads: CreativeAd[]; adsets: Map<string, { id: string | null; name: string; ads: CreativeAd[] }> }>();
  for (const ad of ads) {
    const campaignId = ad.campaign?.id ? String(ad.campaign.id) : null;
    const campaignName = ad.campaign?.name || "Kampanya";
    const campaignKey = campaignId || `campaign:${campaignName}`;
    let campaign = campaigns.get(campaignKey);
    if (!campaign) {
      campaign = { id: campaignId, name: campaignName, ads: [], adsets: new Map() };
      campaigns.set(campaignKey, campaign);
    }
    campaign.ads.push(ad);
    const adsetId = ad.adset?.id ? String(ad.adset.id) : null;
    const adsetName = ad.adset?.name || "Reklam seti";
    const adsetKey = adsetId || `${campaignKey}:adset:${adsetName}`;
    let adset = campaign.adsets.get(adsetKey);
    if (!adset) {
      adset = { id: adsetId, name: adsetName, ads: [] };
      campaign.adsets.set(adsetKey, adset);
    }
    adset.ads.push(ad);
  }
  return [...campaigns.entries()].map(([key, campaign]) => ({
    key,
    id: campaign.id,
    name: campaign.name,
    ads: campaign.ads,
    summary: summarize(campaign.ads, metricMap),
    adsets: [...campaign.adsets.entries()].map(([key, adset]) => ({ key, id: adset.id, name: adset.name, ads: adset.ads, summary: summarize(adset.ads, metricMap) })).sort((a, b) => b.summary.spend - a.summary.spend),
  })).sort((a, b) => b.summary.spend - a.summary.spend);
}

export function ExactMetaAdsAnalysisRealtime() {
  const toast = useExactToast();
  const [ads, setAds] = useState<CreativeAd[]>([]);
  const [metricMap, setMetricMap] = useState<Map<string, MetricSet>>(() => new Map());
  const [accountName, setAccountName] = useState("Meta Reklam Hesabı");
  const [currency, setCurrency] = useState("TRY");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CreativeAd | null>(null);
  const [since, setSince] = useState(() => dateValue(-29));
  const [until, setUntil] = useState(() => dateValue());
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisPayload | null>(null);
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(() => new Set());
  const [expandedAdsets, setExpandedAdsets] = useState<Set<string>>(() => new Set());

  const applyPayloads = useCallback((creativeData: CreativePayload, metricData: MetricsPayload) => {
    setAds(creativeData.ads || []);
    setMetricMap(new Map((metricData.ads || []).map((item) => [item.id, item.metrics])));
    setAccountName(metricData.account?.name || "Meta Reklam Hesabı");
    setCurrency(metricData.account?.currency || "TRY");
  }, []);

  const load = useCallback(async () => {
    try {
      const [creativeData, metricData] = await Promise.all([
        adminRequest<CreativePayload>("/api/meta-ads/creatives"),
        adminRequest<MetricsPayload>("/api/meta-ads?range=30d"),
      ]);
      applyPayloads(creativeData, metricData);
      setLoading(false);

      if (creativeData.__fromCache || metricData.__fromCache) {
        void Promise.all([
          adminRequest<CreativePayload>("/api/meta-ads/creatives", { hardRefresh: true, timeoutMs: 45_000 }),
          adminRequest<MetricsPayload>("/api/meta-ads?range=30d", { hardRefresh: true, timeoutMs: 45_000 }),
        ]).then(([freshCreative, freshMetrics]) => applyPayloads(freshCreative, freshMetrics)).catch(() => undefined);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Meta reklamları yüklenemedi.");
      setLoading(false);
    }
  }, [applyPayloads, toast]);

  useEffect(() => { void load(); }, [load]);

  const money = useCallback((value: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value || 0)), [currency]);
  const compact = (value: number) => new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value || 0));
  const roas = (value: number) => `${Number(value || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`;
  const activeCount = useMemo(() => ads.filter((ad) => ad.effectiveStatus === "ACTIVE").length, [ads]);
  const tree = useMemo(() => buildTree(ads, metricMap), [ads, metricMap]);

  const toggleCampaign = (key: string) => setExpandedCampaigns((current) => { const next = new Set(current); next.has(key) ? next.delete(key) : next.add(key); return next; });
  const toggleAdset = (key: string) => setExpandedAdsets((current) => { const next = new Set(current); next.has(key) ? next.delete(key) : next.add(key); return next; });
  const openAnalysis = (ad: CreativeAd) => { setSelected(ad); setResult(null); setSince(dateValue(-29)); setUntil(dateValue()); };
  const close = () => { if (!analyzing) { setSelected(null); setResult(null); } };

  const startAnalysis = async () => {
    if (!selected || !since || !until || since > until) {
      toast.error("Geçerli bir tarih aralığı seç.");
      return;
    }
    setAnalyzing(true);
    setResult(null);
    try {
      setResult(await adminRequest<AnalysisPayload>("/api/meta-ads/analyze", {
        method: "POST",
        body: JSON.stringify({ adId: selected.id, since, until }),
        timeoutMs: 70_000,
        confirmation: false,
        invalidate: false,
      }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ROSTA Insight reklam analizini tamamlayamadı.");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in" data-exact-base44-page="meta-ads-analysis">
      <ExactPageHeader title="ROSTA Insight Reklam Analizi" subtitle="Kampanya, reklam seti ve reklamları aç; istediğin reklamı ROSTA Insight ile analiz et" />

      <div className="rounded-2xl border border-border-subtle bg-surface-primary p-4 sm:p-5"><div className="flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent"><BrainCircuit className="h-5 w-5" /></span><div><div className="flex flex-wrap items-center gap-2"><p className="ruth-type-card-title text-main">{accountName}</p><span className="ruth-type-caption rounded-full bg-success-soft px-2 py-1 font-semibold text-success-foreground">{activeCount} aktif reklam</span></div><p className="ruth-type-caption mt-1 max-w-3xl text-muted">Kampanyayı, sonra reklam setini aç. Reklamın kreatifini ve performansını görüp Analiz Et ile tarih aralığını seçebilirsin.</p></div></div></div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 6 }, (_, index) => <ExactSkeleton key={index} className="h-20" />)}</div>
      ) : (
        <ExactDataCard title={`Kampanyalar · ${tree.length}`} bodyClassName="p-2 sm:p-3">
          <div className="space-y-2">
            {tree.map((campaign) => {
              const campaignOpen = expandedCampaigns.has(campaign.key);
              return (
                <section key={campaign.key} className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-primary">
                  <button type="button" onClick={() => toggleCampaign(campaign.key)} className="flex w-full flex-col gap-3 p-3 text-left transition hover:bg-surface-secondary/70 sm:flex-row sm:items-center sm:justify-between sm:p-4">
                    <div className="flex min-w-0 items-center gap-3"><motion.span animate={{ rotate: campaignOpen ? 90 : 0 }} transition={PANEL_SPRING} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><ChevronRight className="h-4 w-4" /></motion.span><div className="min-w-0"><p className="ruth-type-card-title truncate text-main">{campaign.name}</p><p className="ruth-type-caption mt-0.5 text-muted">{campaign.adsets.length} reklam seti · {campaign.ads.length} reklam</p></div></div>
                    <SummaryStrip summary={campaign.summary} money={money} compact={compact} roas={roas} />
                  </button>
                  <AnimatePresence initial={false}>
                    {campaignOpen ? (
                      <motion.div key="campaign-body" initial={{ height: 0, opacity: 0, y: -8 }} animate={{ height: "auto", opacity: 1, y: 0 }} exit={{ height: 0, opacity: 0, y: -6 }} transition={PANEL_SPRING} className="overflow-hidden border-t border-border-subtle bg-surface-secondary/45">
                        <div className="space-y-2 p-2 sm:p-3">
                          {campaign.adsets.map((adset) => {
                            const adsetOpen = expandedAdsets.has(adset.key);
                            return (
                              <div key={adset.key} className="overflow-hidden rounded-xl border border-border-subtle bg-surface-primary">
                                <button type="button" onClick={() => toggleAdset(adset.key)} className="flex w-full flex-col gap-2.5 p-3 text-left transition hover:bg-surface-secondary/60 sm:flex-row sm:items-center sm:justify-between">
                                  <div className="flex min-w-0 items-center gap-2.5"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-secondary text-muted"><Layers className="h-4 w-4" /></span><div className="min-w-0"><p className="ruth-type-card-title flex items-center gap-1.5 truncate text-main"><motion.span animate={{ rotate: adsetOpen ? 90 : 0 }} transition={PANEL_SPRING} className="inline-flex"><ChevronRight className="h-3.5 w-3.5 shrink-0" /></motion.span><span className="truncate">{adset.name}</span></p><p className="ruth-type-caption mt-0.5 text-muted">{adset.ads.length} reklam</p></div></div>
                                  <SummaryStrip summary={adset.summary} money={money} compact={compact} roas={roas} />
                                </button>
                                <AnimatePresence initial={false}>
                                  {adsetOpen ? (
                                    <motion.div key="adset-body" initial={{ height: 0, opacity: 0, y: -6 }} animate={{ height: "auto", opacity: 1, y: 0 }} exit={{ height: 0, opacity: 0, y: -4 }} transition={PANEL_SPRING} className="overflow-hidden border-t border-border-subtle">
                                      <div className="divide-y divide-border-subtle">
                                        {adset.ads.map((ad, adIndex) => {
                                          const metrics = metricMap.get(ad.id);
                                          const adStatus = statusLabel(ad.effectiveStatus);
                                          return (
                                            <motion.article key={ad.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ ...PANEL_SPRING, delay: Math.min(adIndex, 8) * 0.025 }} className="grid gap-3 p-3 lg:grid-cols-[150px_minmax(220px,1fr)_minmax(310px,.9fr)_110px] lg:items-center">
                                              <MediaStrip media={ad.creative.media} compact />
                                              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="ruth-type-card-title truncate text-main">{ad.name}</h3>{adStatus ? <span className={`ruth-type-caption rounded-full px-2 py-1 font-semibold ${ad.effectiveStatus === "ACTIVE" ? "bg-success-soft text-success-foreground" : "bg-surface-tertiary text-muted"}`}>{adStatus}</span> : null}</div><p className="ruth-type-caption mt-1 truncate text-muted">{ad.creative.name || "Meta kreatifi"}</p></div>
                                              {metrics ? <div className="grid grid-cols-4 gap-1.5"><Mini label="Harcama" value={money(metrics.spend)} /><Mini label="Alışveriş" value={compact(metrics.purchases)} /><Mini label="Gelir" value={money(metrics.revenue)} /><Mini label="ROAS" value={roas(metrics.roas)} /></div> : <div />}
                                              <ExactButton size="sm" onClick={() => openAnalysis(ad)}><Sparkles className="h-3.5 w-3.5" /> Analiz Et</ExactButton>
                                            </motion.article>
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
            {!tree.length ? <div className="py-16 text-center"><Megaphone className="mx-auto h-7 w-7 text-muted" /><p className="ruth-type-card-title mt-3 text-main">Reklam bulunamadı</p></div> : null}
          </div>
        </ExactDataCard>
      )}

      <ExactDetailDrawer open={Boolean(selected)} onClose={close} title={selected?.name || "ROSTA Insight Reklam Analizi"} subtitle={selected ? `${selected.campaign?.name || "Kampanya"} · ${selected.adset?.name || "Reklam seti"}` : undefined} width={860}>
        {selected ? (
          result ? <AnalysisView result={result} money={money} compact={compact} roas={roas} /> : (
            <div className="min-w-0 space-y-4">
              <div className="grid min-w-0 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
                <div className="min-w-0"><MediaStrip media={selected.creative.media} /><p className="ruth-type-caption mt-2 text-muted">{selected.creative.media.length ? `${selected.creative.media.length} kreatif medya` : "Kreatif önizlemesi yok"}</p></div>
                <div className="min-w-0 space-y-4">
                  <div><h3 className="ruth-type-section-title text-main">Analiz tarihini seç</h3><p className="ruth-type-caption mt-1 text-muted">Bu dönemin performansını Meta’dan yeniden çekip diğer reklamlarla karşılaştıracağım.</p></div>
                  <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2"><DateField label="Başlangıç" value={since} min="" max={until || dateValue()} onChange={setSince} disabled={analyzing} /><DateField label="Bitiş" value={until} min={since} max={dateValue()} onChange={setUntil} disabled={analyzing} /></div>
                  <div className="flex flex-wrap gap-2">{[7, 30, 90].map((days) => <button key={days} type="button" disabled={analyzing} onClick={() => { setSince(dateValue(-(days - 1))); setUntil(dateValue()); }} className="ruth-type-control rounded-full border border-border-subtle px-3 py-1.5 text-muted hover:bg-surface-secondary disabled:opacity-50">Son {days} gün</button>)}</div>
                  <ExactButton onClick={() => void startAnalysis()} loading={analyzing}>{analyzing ? "ROSTA Insight analiz ediyor..." : <><BrainCircuit className="h-4 w-4" /> ROSTA Insight ile Analiz Et</>}</ExactButton>
                </div>
              </div>
              {analyzing ? <div className="rounded-2xl bg-accent-soft p-5"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-full bg-accent text-white"><BrainCircuit className="h-5 w-5" /></span><div><p className="ruth-type-card-title text-main">ROSTA Insight reklamı inceliyor</p><p className="ruth-type-caption mt-1 text-muted">Performans, funnel, benchmark ve kreatif birlikte değerlendiriliyor.</p></div></div></div> : null}
            </div>
          )
        ) : null}
      </ExactDetailDrawer>
    </div>
  );
}

function SummaryStrip({ summary, money, compact, roas }: { summary: Summary; money: (value: number) => string; compact: (value: number) => string; roas: (value: number) => string }) {
  return <div className="grid min-w-0 grid-cols-4 gap-1.5 sm:min-w-[380px]"><Mini label="Harcama" value={money(summary.spend)} /><Mini label="Alışveriş" value={compact(summary.purchases)} /><Mini label="Gelir" value={money(summary.revenue)} /><Mini label="ROAS" value={roas(summary.roas)} /></div>;
}
function Mini({ label, value }: { label: string; value: string }) { return <div className="min-w-0 rounded-lg bg-surface-secondary p-2"><p className="ruth-type-label truncate uppercase text-subtle">{label}</p><p className="ruth-type-table mt-1 truncate font-bold text-main">{value}</p></div>; }
function DateField({ label, value, min, max, onChange, disabled }: { label: string; value: string; min: string; max: string; onChange: (value: string) => void; disabled: boolean }) {
  return (
    <label className="block min-w-0 w-full max-w-full overflow-visible">
      <span className="ruth-type-label mb-1 block text-subtle">{label}</span>
      <ExactDatePicker value={value} min={min || undefined} max={max || undefined} disabled={disabled} onChange={onChange} label={label} />
    </label>
  );
}

function AnalysisView({ result, money, compact, roas }: { result: AnalysisPayload; money: (value: number) => string; compact: (value: number) => string; roas: (value: number) => string }) {
  const meta = recommendationMeta(result.analysis.recommendation);
  const Icon = meta.icon;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border-subtle bg-surface-secondary p-4 sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:justify-between"><div><span className={`ruth-type-control inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${meta.className}`}><Icon className="h-3.5 w-3.5" />{meta.label}</span><h3 className="ruth-type-section-title mt-3 text-main">{result.analysis.headline}</h3><p className="ruth-type-body mt-2 max-w-3xl text-muted">{result.analysis.summary}</p></div><div className="shrink-0 rounded-2xl bg-surface-primary px-4 py-3 text-center"><p className="ruth-type-label uppercase text-subtle">Güven</p><p className="ruth-type-metric text-main">%{Math.round(result.analysis.confidence)}</p><p className="ruth-type-caption text-muted">{result.peerCount} reklam kıyası</p></div></div></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><SummaryTile icon={CircleDollarSign} label="Harcama" value={money(result.metrics.spend)} /><SummaryTile icon={ShoppingBag} label="Alışveriş" value={compact(result.metrics.purchases)} /><SummaryTile icon={CircleDollarSign} label="Gelir" value={money(result.metrics.revenue)} /><SummaryTile icon={TrendingUp} label="ROAS" value={roas(result.metrics.roas)} accent /></div>
      <div className="grid gap-3 lg:grid-cols-2"><ListCard title="ROSTA Insight neden böyle düşünüyor?" items={result.analysis.why} /><ListCard title="Ne yapmalısın?" items={result.analysis.actions} numbered /></div>
      <div className="grid gap-3 lg:grid-cols-2"><ExactDataCard title="Kreatif Analizi"><p className="ruth-type-body text-main">{result.analysis.creativeAnalysis}</p></ExactDataCard><ExactDataCard title="Bütçe Yönü"><p className="ruth-type-body text-main">{result.analysis.budgetGuidance}</p></ExactDataCard></div>
      <ExactDataCard title="Metrik Analizi"><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{result.analysis.metricAnalysis.map((item, index) => <div key={`${item.metric}:${index}`} className="rounded-xl bg-surface-secondary p-3"><p className="ruth-type-card-title text-main">{item.metric}</p><p className="ruth-type-caption mt-1 text-muted">{item.observation}</p><p className="ruth-type-body mt-2 text-main">{item.implication}</p></div>)}</div></ExactDataCard>
      {result.analysis.risks.length ? <ExactDataCard title="Dikkat Edilecekler"><div className="space-y-2">{result.analysis.risks.map((item, index) => <div key={index} className="ruth-type-body flex gap-2 text-main"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground" /><span>{item}</span></div>)}</div></ExactDataCard> : null}
      <div className="rounded-2xl bg-surface-secondary p-4"><div className="flex gap-3"><CalendarDays className="h-4 w-4 shrink-0 text-muted" /><div><p className="ruth-type-label uppercase text-subtle">Bir sonraki kontrol</p><p className="ruth-type-body mt-1 text-main">{result.analysis.nextCheck}</p><p className="ruth-type-code mt-2 text-muted">{result.dateRange.since} – {result.dateRange.until}</p></div></div></div>
    </div>
  );
}
function SummaryTile({ icon: Icon, label, value, accent = false }: { icon: typeof CircleDollarSign; label: string; value: string; accent?: boolean }) { return <div className={`rounded-2xl p-4 ${accent ? "bg-accent-soft" : "bg-surface-primary shadow-card"}`}><Icon className="h-4 w-4 text-muted" /><p className="ruth-type-label mt-2 uppercase text-subtle">{label}</p><p className="ruth-type-metric break-words text-main">{value}</p></div>; }
function ListCard({ title, items, numbered = false }: { title: string; items: string[]; numbered?: boolean }) { return <ExactDataCard title={title}><div className="space-y-2">{items.map((item, index) => <div key={index} className={`flex gap-2 rounded-xl p-3 ${numbered ? "bg-accent-soft" : "bg-surface-secondary"}`}>{numbered ? <span className="ruth-type-caption grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent font-bold text-white">{index + 1}</span> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-foreground" />}<p className="ruth-type-body text-main">{item}</p></div>)}</div></ExactDataCard>; }
