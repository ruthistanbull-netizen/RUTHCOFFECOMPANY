"use client";

import {
  BrainCircuit,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleDollarSign,
  ImageIcon,
  Layers,
  Megaphone,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  Video,
  WandSparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminRequest } from "@/lib/adminApi";
import { ExactButton, ExactPageHeader, ExactSkeleton, useExactToast } from "./primitives";
import { ExactDataCard } from "./data";

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
type CreativePayload = { ok: boolean; ads: CreativeAd[] };
type MetricSet = { spend: number; purchases: number; revenue: number; roas: number; ctr: number; cpc: number; cpm: number; addToCart: number; contentViews: number; initiateCheckout: number; linkClicks: number };
type MetricsPayload = { ok: boolean; account: { name: string; currency: string }; ads: Array<{ id: string; metrics: MetricSet }> };
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
  return value === "UNKNOWN" ? "Bilinmiyor" : value;
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
  if (!items.length) return <div className={`grid ${aspect} place-items-center rounded-xl bg-surface-tertiary text-muted`}><ImageIcon className="h-5 w-5"/></div>;
  return <div className={`grid ${aspect} overflow-hidden rounded-xl bg-surface-tertiary ${items.length === 1 ? "grid-cols-1" : "grid-cols-2 grid-rows-2"}`}>
    {items.map((item, index) => <div key={`${item.url}:${index}`} className={`relative overflow-hidden ${items.length === 2 ? "row-span-2" : items.length === 3 && index === 0 ? "row-span-2" : ""}`}><img src={item.url} alt="" className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer"/><span className="absolute bottom-1 left-1 inline-flex items-center gap-1 rounded-full bg-black/65 px-1.5 py-0.5 text-[7px] font-semibold text-white">{item.type === "video" ? <Video className="h-2.5 w-2.5"/> : <ImageIcon className="h-2.5 w-2.5"/>}{item.type === "video" ? "Video" : "Fotoğraf"}</span>{index === 3 && media.length > 4 ? <span className="absolute inset-0 grid place-items-center bg-black/45 text-xs font-bold text-white">+{media.length - 4}</span> : null}</div>)}
  </div>;
}

function summarize(ads: CreativeAd[], metricMap: Map<string, MetricSet>): Summary {
  const value = ads.reduce((acc, ad) => {
    const metrics = metricMap.get(ad.id);
    if (metrics) { acc.spend += metrics.spend || 0; acc.purchases += metrics.purchases || 0; acc.revenue += metrics.revenue || 0; }
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
    if (!campaign) { campaign = { id: campaignId, name: campaignName, ads: [], adsets: new Map() }; campaigns.set(campaignKey, campaign); }
    campaign.ads.push(ad);
    const adsetId = ad.adset?.id ? String(ad.adset.id) : null;
    const adsetName = ad.adset?.name || "Reklam seti";
    const adsetKey = adsetId || `${campaignKey}:adset:${adsetName}`;
    let adset = campaign.adsets.get(adsetKey);
    if (!adset) { adset = { id: adsetId, name: adsetName, ads: [] }; campaign.adsets.set(adsetKey, adset); }
    adset.ads.push(ad);
  }
  return [...campaigns.entries()].map(([key, campaign]) => ({
    key, id: campaign.id, name: campaign.name, ads: campaign.ads, summary: summarize(campaign.ads, metricMap),
    adsets: [...campaign.adsets.entries()].map(([key, adset]) => ({ key, id: adset.id, name: adset.name, ads: adset.ads, summary: summarize(adset.ads, metricMap) })).sort((a, b) => b.summary.spend - a.summary.spend),
  })).sort((a, b) => b.summary.spend - a.summary.spend);
}

export function ExactMetaAdsAnalysis() {
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [creativeData, metricData] = await Promise.all([
        adminRequest<CreativePayload>("/api/meta-ads/creatives", { force: true, timeoutMs: 45_000 }),
        adminRequest<MetricsPayload>("/api/meta-ads?range=30d", { force: true, timeoutMs: 45_000 }),
      ]);
      setAds(creativeData.ads || []);
      setMetricMap(new Map((metricData.ads || []).map((item) => [item.id, item.metrics])));
      setAccountName(metricData.account?.name || "Meta Reklam Hesabı");
      setCurrency(metricData.account?.currency || "TRY");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Meta reklamları yüklenemedi.");
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!selected) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !analyzing) { setSelected(null); setResult(null); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [analyzing, selected]);

  const money = useCallback((value: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value || 0)), [currency]);
  const compact = (value: number) => new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value || 0));
  const roas = (value: number) => `${Number(value || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`;
  const activeCount = useMemo(() => ads.filter((ad) => ad.effectiveStatus === "ACTIVE").length, [ads]);
  const tree = useMemo(() => buildTree(ads, metricMap), [ads, metricMap]);

  const toggleCampaign = (key: string) => setExpandedCampaigns((current) => { const next = new Set(current); next.has(key) ? next.delete(key) : next.add(key); return next; });
  const toggleAdset = (key: string) => setExpandedAdsets((current) => { const next = new Set(current); next.has(key) ? next.delete(key) : next.add(key); return next; });
  const openAnalysis = (ad: CreativeAd) => { setSelected(ad); setResult(null); setSince(dateValue(-29)); setUntil(dateValue()); };

  const startAnalysis = async () => {
    if (!selected || !since || !until || since > until) { toast.error("Geçerli bir tarih aralığı seç."); return; }
    setAnalyzing(true); setResult(null);
    try {
      setResult(await adminRequest<AnalysisPayload>("/api/meta-ads/analyze", { method: "POST", body: JSON.stringify({ adId: selected.id, since, until }), timeoutMs: 70_000, confirmation: false, invalidate: false }));
    } catch (error) { toast.error(error instanceof Error ? error.message : "ROSTA Insight reklam analizini tamamlayamadı."); }
    finally { setAnalyzing(false); }
  };
  const close = () => { if (!analyzing) { setSelected(null); setResult(null); } };

  return <div className="space-y-4 animate-fade-in" data-exact-base44-page="meta-ads-analysis">
    <ExactPageHeader title="ROSTA Insight Reklam Analizi" subtitle="Kampanya, reklam seti ve reklamları aç; istediğin reklamı ROSTA Insight ile analiz et" />

    <div className="rounded-2xl border border-border-subtle bg-surface-primary p-4 sm:p-5"><div className="flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent"><BrainCircuit className="h-5 w-5"/></span><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-bold text-main">{accountName}</p><span className="rounded-full bg-success-soft px-2 py-1 text-[9px] font-semibold text-success-foreground">{activeCount} aktif reklam</span></div><p className="mt-1 max-w-3xl text-[11px] leading-5 text-muted">Kampanyayı, sonra reklam setini aç. Reklamın kreatifini ve performansını görüp Analiz Et ile tarih aralığını seçebilirsin.</p></div></div></div>

    {loading ? <div className="space-y-3">{Array.from({ length: 6 }, (_, index) => <ExactSkeleton key={index} className="h-20"/>)}</div> : <ExactDataCard title={`Kampanyalar · ${tree.length}`} bodyClassName="p-2 sm:p-3"><div className="space-y-2">
      {tree.map((campaign) => { const campaignOpen = expandedCampaigns.has(campaign.key); return <section key={campaign.key} className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-primary">
        <button type="button" onClick={() => toggleCampaign(campaign.key)} className="flex w-full flex-col gap-3 p-3 text-left transition hover:bg-surface-secondary/70 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <div className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">{campaignOpen ? <ChevronDown className="h-4 w-4"/> : <ChevronRight className="h-4 w-4"/>}</span><div className="min-w-0"><p className="truncate text-xs font-bold text-main">{campaign.name}</p><p className="mt-0.5 text-[9px] text-muted">{campaign.adsets.length} reklam seti · {campaign.ads.length} reklam</p></div></div>
          <SummaryStrip summary={campaign.summary} money={money} compact={compact} roas={roas}/>
        </button>
        {campaignOpen ? <div className="space-y-2 border-t border-border-subtle bg-surface-secondary/45 p-2 sm:p-3">{campaign.adsets.map((adset) => { const adsetOpen = expandedAdsets.has(adset.key); return <div key={adset.key} className="overflow-hidden rounded-xl border border-border-subtle bg-surface-primary">
          <button type="button" onClick={() => toggleAdset(adset.key)} className="flex w-full flex-col gap-2.5 p-3 text-left transition hover:bg-surface-secondary/60 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-2.5"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-secondary text-muted"><Layers className="h-4 w-4"/></span><div className="min-w-0"><p className="flex items-center gap-1.5 truncate text-[11px] font-semibold text-main">{adsetOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0"/> : <ChevronRight className="h-3.5 w-3.5 shrink-0"/>}<span className="truncate">{adset.name}</span></p><p className="mt-0.5 text-[9px] text-muted">{adset.ads.length} reklam</p></div></div>
            <SummaryStrip summary={adset.summary} money={money} compact={compact} roas={roas}/>
          </button>
          {adsetOpen ? <div className="divide-y divide-border-subtle border-t border-border-subtle">{adset.ads.map((ad) => { const metrics = metricMap.get(ad.id); return <article key={ad.id} className="grid gap-3 p-3 lg:grid-cols-[150px_minmax(220px,1fr)_minmax(310px,.9fr)_110px] lg:items-center">
            <MediaStrip media={ad.creative.media} compact/>
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-xs font-bold text-main">{ad.name}</h3><span className={`rounded-full px-2 py-1 text-[8px] font-semibold ${ad.effectiveStatus === "ACTIVE" ? "bg-success-soft text-success-foreground" : "bg-surface-tertiary text-muted"}`}>{statusLabel(ad.effectiveStatus)}</span></div><p className="mt-1 truncate text-[9px] text-muted">{ad.creative.name || "Meta kreatifi"}</p></div>
            {metrics ? <div className="grid grid-cols-4 gap-1.5"><Mini label="Harcama" value={money(metrics.spend)}/><Mini label="Alışveriş" value={compact(metrics.purchases)}/><Mini label="Gelir" value={money(metrics.revenue)}/><Mini label="ROAS" value={roas(metrics.roas)}/></div> : <div/>}
            <ExactButton size="sm" onClick={() => openAnalysis(ad)}><Sparkles className="h-3.5 w-3.5"/> Analiz Et</ExactButton>
          </article>; })}</div> : null}
        </div>; })}</div> : null}
      </section>; })}
      {!tree.length ? <div className="py-16 text-center"><Megaphone className="mx-auto h-7 w-7 text-muted"/><p className="mt-3 text-sm font-semibold text-main">Reklam bulunamadı</p></div> : null}
    </div></ExactDataCard>}

    {selected ? <div className="fixed inset-0 z-[2147483000] flex items-stretch justify-center bg-black/45 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true"><button className="absolute inset-0" type="button" onClick={close} aria-label="Kapat"/><div className="relative z-10 h-[100dvh] max-h-[100dvh] w-full overflow-y-auto bg-surface-primary shadow-2xl sm:h-auto sm:max-h-[94dvh] sm:max-w-5xl sm:rounded-[28px] sm:border sm:border-border-subtle"><div className="sticky top-0 z-20 flex items-center justify-between border-b border-border-subtle bg-surface-primary/95 px-4 py-4 backdrop-blur-xl sm:px-5"><div className="min-w-0"><p className="truncate text-sm font-bold text-main">{selected.name}</p><p className="text-[10px] text-muted">ROSTA Insight Reklam Analizi</p></div><button type="button" disabled={analyzing} onClick={close} className="grid h-9 w-9 place-items-center rounded-xl bg-surface-secondary disabled:opacity-40"><X className="h-4 w-4"/></button></div><div className="space-y-4 p-4 sm:p-5">{result ? <AnalysisView result={result} money={money} compact={compact} roas={roas}/> : <><div className="grid gap-4 lg:grid-cols-[280px,1fr]"><div><MediaStrip media={selected.creative.media}/><p className="mt-2 text-[10px] text-muted">{selected.creative.media.length ? `${selected.creative.media.length} kreatif medya` : "Kreatif önizlemesi yok"}</p></div><div className="space-y-4"><div><h3 className="text-base font-bold text-main">Analiz tarihini seç</h3><p className="mt-1 text-xs leading-5 text-muted">Bu dönemin performansını Meta’dan yeniden çekip diğer reklamlarla karşılaştıracağım.</p></div><div className="grid gap-3 sm:grid-cols-2"><DateField label="Başlangıç" value={since} min="" max={until || dateValue()} onChange={setSince} disabled={analyzing}/><DateField label="Bitiş" value={until} min={since} max={dateValue()} onChange={setUntil} disabled={analyzing}/></div><div className="flex flex-wrap gap-2">{[7, 30, 90].map((days) => <button key={days} type="button" disabled={analyzing} onClick={() => { setSince(dateValue(-(days - 1))); setUntil(dateValue()); }} className="rounded-full border border-border-subtle px-3 py-1.5 text-[10px] font-semibold text-muted hover:bg-surface-secondary">Son {days} gün</button>)}</div><ExactButton onClick={() => void startAnalysis()} disabled={analyzing}>{analyzing ? <><RefreshCw className="h-4 w-4 animate-spin"/> ROSTA Insight analiz ediyor...</> : <><BrainCircuit className="h-4 w-4"/> ROSTA Insight ile Analiz Et</>}</ExactButton></div></div>{analyzing ? <div className="rounded-2xl bg-accent-soft p-5"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-full bg-accent text-white"><BrainCircuit className="h-5 w-5"/></span><div><p className="text-sm font-bold text-main">ROSTA Insight reklamı inceliyor</p><p className="mt-1 text-[11px] text-muted">Performans, funnel, benchmark ve kreatif birlikte değerlendiriliyor.</p></div></div></div> : null}</>}</div></div></div> : null}
  </div>;
}

function SummaryStrip({ summary, money, compact, roas }: { summary: Summary; money: (value: number) => string; compact: (value: number) => string; roas: (value: number) => string }) {
  return <div className="grid min-w-0 grid-cols-4 gap-1.5 sm:min-w-[380px]"><Mini label="Harcama" value={money(summary.spend)}/><Mini label="Alışveriş" value={compact(summary.purchases)}/><Mini label="Gelir" value={money(summary.revenue)}/><Mini label="ROAS" value={roas(summary.roas)}/></div>;
}
function Mini({ label, value }: { label: string; value: string }) { return <div className="min-w-0 rounded-lg bg-surface-secondary p-2"><p className="truncate text-[7px] uppercase text-subtle">{label}</p><p className="mt-1 truncate text-[10px] font-bold text-main">{value}</p></div>; }
function DateField({ label, value, min, max, onChange, disabled }: { label: string; value: string; min: string; max: string; onChange: (value: string) => void; disabled: boolean }) { return <label><span className="mb-1 block text-[10px] text-subtle">{label}</span><input type="date" value={value} min={min || undefined} max={max || undefined} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="h-11 w-full rounded-xl border border-border-subtle bg-surface-secondary px-3 text-xs text-main outline-none focus:border-accent"/></label>; }

function AnalysisView({ result, money, compact, roas }: { result: AnalysisPayload; money: (value: number) => string; compact: (value: number) => string; roas: (value: number) => string }) {
  const meta = recommendationMeta(result.analysis.recommendation); const Icon = meta.icon;
  return <div className="space-y-4"><div className="rounded-2xl border border-border-subtle bg-surface-secondary p-4 sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:justify-between"><div><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${meta.className}`}><Icon className="h-3.5 w-3.5"/>{meta.label}</span><h3 className="mt-3 text-xl font-bold text-main">{result.analysis.headline}</h3><p className="mt-2 max-w-3xl text-xs leading-5 text-muted">{result.analysis.summary}</p></div><div className="shrink-0 rounded-2xl bg-surface-primary px-4 py-3 text-center"><p className="text-[9px] uppercase text-subtle">Güven</p><p className="text-2xl font-bold text-main">%{Math.round(result.analysis.confidence)}</p><p className="text-[9px] text-muted">{result.peerCount} reklam kıyası</p></div></div></div><div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><SummaryTile icon={CircleDollarSign} label="Harcama" value={money(result.metrics.spend)}/><SummaryTile icon={ShoppingBag} label="Alışveriş" value={compact(result.metrics.purchases)}/><SummaryTile icon={CircleDollarSign} label="Gelir" value={money(result.metrics.revenue)}/><SummaryTile icon={TrendingUp} label="ROAS" value={roas(result.metrics.roas)} accent/></div><div className="grid gap-3 lg:grid-cols-2"><ListCard title="ROSTA Insight neden böyle düşünüyor?" items={result.analysis.why}/><ListCard title="Ne yapmalısın?" items={result.analysis.actions} numbered/></div><div className="grid gap-3 lg:grid-cols-2"><ExactDataCard title="Kreatif Analizi"><p className="text-[11px] leading-5 text-main">{result.analysis.creativeAnalysis}</p></ExactDataCard><ExactDataCard title="Bütçe Yönü"><p className="text-[11px] leading-5 text-main">{result.analysis.budgetGuidance}</p></ExactDataCard></div><ExactDataCard title="Metrik Analizi"><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{result.analysis.metricAnalysis.map((item, index) => <div key={`${item.metric}:${index}`} className="rounded-xl bg-surface-secondary p-3"><p className="text-[10px] font-bold text-main">{item.metric}</p><p className="mt-1 text-[10px] leading-4 text-muted">{item.observation}</p><p className="mt-2 text-[10px] leading-4 text-main">{item.implication}</p></div>)}</div></ExactDataCard>{result.analysis.risks.length ? <ExactDataCard title="Dikkat Edilecekler"><div className="space-y-2">{result.analysis.risks.map((item, index) => <div key={index} className="flex gap-2 text-[11px] leading-5 text-main"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground"/><span>{item}</span></div>)}</div></ExactDataCard> : null}<div className="rounded-2xl bg-surface-secondary p-4"><div className="flex gap-3"><CalendarDays className="h-4 w-4 shrink-0 text-muted"/><div><p className="text-[10px] font-semibold uppercase text-subtle">Bir sonraki kontrol</p><p className="mt-1 text-[11px] leading-5 text-main">{result.analysis.nextCheck}</p><p className="mt-2 text-[9px] text-muted">{result.dateRange.since} – {result.dateRange.until}</p></div></div></div></div>;
}
function SummaryTile({ icon: Icon, label, value, accent = false }: { icon: typeof CircleDollarSign; label: string; value: string; accent?: boolean }) { return <div className={`rounded-2xl p-4 ${accent ? "bg-accent-soft" : "bg-surface-primary shadow-card"}`}><Icon className="h-4 w-4 text-muted"/><p className="mt-2 text-[9px] uppercase text-subtle">{label}</p><p className="text-lg font-bold text-main">{value}</p></div>; }
function ListCard({ title, items, numbered = false }: { title: string; items: string[]; numbered?: boolean }) { return <ExactDataCard title={title}><div className="space-y-2">{items.map((item, index) => <div key={index} className={`flex gap-2 rounded-xl p-3 ${numbered ? "bg-accent-soft" : "bg-surface-secondary"}`}>{numbered ? <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent text-[9px] font-bold text-white">{index + 1}</span> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-foreground"/>}<p className="text-[11px] leading-5 text-main">{item}</p></div>)}</div></ExactDataCard>; }
