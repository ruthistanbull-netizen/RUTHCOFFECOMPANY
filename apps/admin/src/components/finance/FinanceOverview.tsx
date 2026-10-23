"use client";
import { useState } from "react";
import {
  Button,
  Card,
  Checkbox,
  DataTable,
  EmptyState,
  MetricCard,
  Notice,
  PageHeader,
  PageSection,
  PageShell,
  Skeleton,
} from "@ruth-commerce/ui";
import { adminAuthHeaders } from "@/lib/adminApi";
import {
  FinanceNav,
  FinanceSegments,
  FinanceExport,
  PeriodFilter,
  Pick,
  labels,
  money,
  useFinance,
  usePeriod,
  type Row,
  type Setup,
} from "./shared";
import { FinanceSettings } from "./FinanceSettings";
const metrics = [
  "net_sales", "total_expenses", "unpaid", "receivables",
];
function readableDate(value:string) {
  const date=new Date(value+"T12:00:00Z");
  return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat(
    "tr-TR",{timeZone:"UTC",day:"2-digit",month:"long",year:"numeric"}
  ).format(date);
}
function monthBounds(month:string,period:{from:string;to:string}) {
  const end=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0))
    .toISOString().slice(0,10);
  return {from:month>period.from?month:period.from,
    to:end<period.to?end:period.to};
}

export function FinanceOverview() {
  const period = usePeriod();
  const [view, setView] = useState("summary");
  const [productSort, setProductSort] = useState("revenue");
  const [group, setGroup] = useState("day"),
    [chart, setChart] = useState("line"),
    [settings, setSettings] = useState(false),
    [exportError, setExportError] = useState("");
  const [expensesOpen, setExpensesOpen] = useState(false);
  const [visible, setVisible] = useState([
    "net_sales",
    "operating_expenses",
  ]);
  const report = useFinance<{ report: Row }>(
      `/api/finance/overview?${period.query}&group=${group}`,
    ),
    setup = useFinance<Setup>("/api/finance/setup"),
    payouts = useFinance<{upcoming:Array<{date:string;currency:string;net:number;sales:number;refunds:number}>;unpaidTotal:number;checkedAt:string}>("/api/finance/payouts");
  const data = report.data?.report;
  const expenseDetails = data?.expenseBreakdown as {
    totalTRY: number | null;
    cogs: number | null;
    linesTotalTRY: number;
    legacyWarning: boolean;
    error?:string;
    monthly: Record<string,number>;
    rows: Array<{
      id: string;title: string; occurred_on:string;currency:string;
      nature:string;originalNet:number;originalGross:number;
      fxToTry:number;fxPublishedOn:string|null;
      fxMode:"original"|"recorded"|"current_for_legacy";tryNet:number;
    }>;
  } | undefined;
  const displayAmount=(key:string,values:Row)=>{
    if(key==="receivables") return payouts.error?"PayTR API hatası":
      payouts.data ? money(payouts.data.upcoming.filter(x=>x.currency===period.currency)
        .reduce((sum,x)=>sum+Number(x.net||0),0),period.currency)
        : "Yükleniyor…";
    if(key==="total_expenses") {
      // Always TL, even when the other finance charts have a USD/EUR filter.
      if (data?.current === values) return expenseDetails
        ? expenseDetails.error ? "Kur / gider verisi alınamadı"
          : expenseDetails.totalTRY == null ? "Ürün maliyeti eksik" :
            money(expenseDetails.totalTRY,"TRY")
        : "Hesaplanıyor…";
      return money(expenseDetails?.monthly?.[String(values?.date||"")] ?? null,"TRY");
    }
    return money(values[key],period.currency);
  };
  const records = (extra: Row = {}) =>
    `/finance/records?${period.query}&${new URLSearchParams(extra).toString()}`;
  const download = async (format = "csv") => {
    try {
      setExportError("");
      const response = await fetch(
        `/api/finance/export?${period.query}&format=${format}`,
        { headers: await adminAuthHeaders() },
      );
      if (!response.ok) throw new Error((await response.json()).error);
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `finans-${period.dates.from}-${period.dates.to}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(String(e));
    }
  };
  const delta = (key: string) => {
    const a = data?.current[key],
      b = data?.previous[key];
    if (a == null || b == null || Number(b) === 0)
      return "Önceki dönemle karşılaştırma yok";
    const change = ((Number(a) - Number(b)) / Math.abs(Number(b))) * 100;
    return `Önceki döneme göre ${change >= 0 ? "+" : ""}%${change.toFixed(1)}`;
  };
  return (
    <PageShell density="compact" className="finance-workspace">
      <PageHeader className="finance-header"
        eyebrow="Finans"
        title="Finansal genel bakış"
        description="İşletmenin finansal durumunu tek bakışta takip et."
        actions={
          <>
            <Button variant="secondary" onClick={() => void report.load()}>
              Yenile
            </Button>
            <FinanceExport onDownload={(format) => void download(format)} />
            <Button disabled={!setup.data} onClick={() => setSettings(true)}>
              Ayarlar
            </Button>
          </>
        }
      />
      <FinanceNav />
      <PeriodFilter period={period} />
      {report.error || setup.error ? (
        <Notice tone="danger">
          {report.error || setup.error}
          <Button
            variant="secondary"
            onClick={() => {
              void report.load();
              void setup.load();
            }}
          >
            Tekrar dene
          </Button>
        </Notice>
      ) : null}
      {exportError ? <Notice tone="danger">{exportError}</Notice> : null}
      {report.loading && !data ? <Skeleton height={160} /> : null}
      {data ? (
        <>
          {Number(data.current.missing_costs) > 0 ||
          Number(data.current.refund_review) > 0 ? (
            <Notice tone="warning">
              {data.current.missing_costs} maliyet kaydı eksik;{" "}
              {data.current.refund_review} iadede maliyet / stok incelemesi
              gerekiyor. Eksikler tamamlanana kadar kâr tutarları gösterilmez.
            </Notice>
          ) : null}
          {Number(data.current.cash_refund_unknown || 0) > 0 ? (
            <Notice tone="warning">
              {data.current.cash_refund_unknown} siparişte iadenin gerçekleşme tarihi doğrulanamadı.
              Nakit akışı bu kayıtlar mutabık hale gelene kadar eksik olabilir.
            </Notice>
          ) : null}
          <div className="finance-view-bar">
            <FinanceSegments label="Genel bakış bölümü" value={view} onChange={setView}
              options={[["summary", "Özet"], ["analysis", "Ayrıntılı analiz"], ["accounts", "Kasa ve bütçe"]]} />
            <p>Tutarlar seçilen döneme aittir.</p>
          </div>
          <div className="finance-metrics">
            {metrics.map((key) => key==="total_expenses" ? (
              <MetricCard key={key} className="finance-metric" label="Toplam giderler (TL)"
                value={displayAmount(key, data.current)} expanded={expensesOpen}
                onToggle={() => setExpensesOpen(value => !value)}
                description={expensesOpen ? "Gider ayrıntılarını kapat" : "Giderleri ve uygulanan kurları incele"} />
            ) : (
              <MetricCard
                key={key}
                className={key === "net_sales" ? "finance-metric finance-metric--sales" : "finance-metric"}
                label={labels[key]}
                value={displayAmount(key,data.current)}
                description={key==="receivables"?"PayTR'nin henüz hesaba aktarmadığı ödemeler":
                  delta(key)}
              />
            ))}
          </div>
          <div className="finance-summary" aria-label="Satış ve maliyet özeti">
            {["cogs", "gross_profit", "period_result"].map(key => <div key={key}>
              <span>{key === "period_result" ? "Net kâr · kayıtlı giderlere göre tahmini" : labels[key]}</span><strong className="ruth-type-card-title">{displayAmount(key, data.current)}</strong>
            </div>)}
          </div>
          {expensesOpen ? (
            <PageSection className="finance-section" title="Toplam giderler · TL karşılıkları">
              <div id="finance-expense-details" className="finance-expense-list">
                <p className="text-xs text-muted">
                  Ürün maliyeti bir kez dahil edilir. Ürün alış borçları tekrar
                  eklenmez. Gider tutarları iade edilebilir KDV hariç net değerdir.
                  USD ve EUR için uygulanan kur ve TL karşılığı aşağıda yer alır.
                </p>
                {expenseDetails?.error?<Notice tone="danger">{expenseDetails.error}</Notice>:null}
                {expenseDetails?.legacyWarning?<Notice tone="warning">
                  Bazı eski döviz giderlerinin kayıt tarihinde saklanmış kuru yok.
                  Bu satırlar güncel TCMB kuruyla çevrilmiştir; tarihî muhasebe
                  kuru olarak değerlendirilmemelidir.
                </Notice>:null}
                {!expenseDetails?<p className="text-sm">Giderler yükleniyor…</p>:null}
                {expenseDetails?.cogs!=null?(
                  <div className="finance-expense-row">
                    <div>
                      <strong>Satılan ürünlerin alış maliyeti</strong>
                      <p className="text-xs text-muted">Siparişlerin maliyet kayıtlarından · ikinci kez sayılmaz</p>
                    </div>
                    <strong>{money(expenseDetails.cogs,"TRY")}</strong>
                  </div>
                ):null}
                {expenseDetails?.rows.map((e)=>(
                  <div key={e.id} className="finance-expense-row">
                    <div className="min-w-0">
                      <strong className="text-sm">{e.title}</strong>
                      <p className="text-xs text-muted">{readableDate(e.occurred_on)} · {labels[e.nature]||"Gider"}</p>
                      {e.currency!=="TRY"?<>
                        <p className="finance-fx">
                          {money(e.originalNet,e.currency)} · 1 {e.currency} =
                          {" "}{new Intl.NumberFormat("tr-TR",{maximumFractionDigits:6}).format(e.fxToTry)} TL
                        </p>
                        <p className="text-xs text-muted">
                          TCMB döviz satış · {readableDate(e.fxPublishedOn||e.occurred_on)}
                          {e.fxMode==="current_for_legacy"?" · Güncel kur / eski kayıt":" · Kayıtlı kur"}
                        </p>
                      </>:null}
                    </div>
                    <strong className="text-sm">{money(e.tryNet,"TRY")}</strong>
                  </div>
                ))}
                {expenseDetails?.rows.length===0 ? <p className="text-sm text-muted">Bu dönemde ek gider kaydı yok.</p>:null}
                <div className="flex justify-between border-t border-border-subtle pt-3 font-semibold">
                  <span>Tüm giderler (TL)</span>
                  <strong>{expenseDetails?.error?"Kur / gider verisi alınamadı":expenseDetails?.totalTRY==null?"Eksik maliyet kaydı":money(expenseDetails.totalTRY,"TRY")}</strong>
                </div>
              </div>
            </PageSection>
          ):null}
          {view === "summary" ? <>
            <div className="finance-columns finance-overview-main">
          <PageSection className="finance-section"
            title="Gelir · Gider · Kâr"
            actions={
              <>
                <Pick
                  label="Gruplama"
                  value={group}
                  onChange={setGroup}
                  options={[
                    ["day", "Günlük"],
                    ["week", "Haftalık"],
                    ["month", "Aylık"],
                    ["year", "Yıllık"],
                  ]}
                />
                <Pick
                  label="Grafik"
                  value={chart}
                  onChange={setChart}
                  options={[
                    ["line", "Çizgi"],
                    ["bar", "Sütun"],
                  ]}
                />
              </>
            }
          >
            <div className="finance-chart-legend">
              {["net_sales", "operating_expenses"].map(
                (k) => (
                  <div key={k} className="flex items-center gap-2">
                    <Checkbox
                      label={labels[k]}
                      checked={visible.includes(k)}
                      onChange={(e) =>
                        setVisible(
                          e.target.checked
                            ? [...visible, k]
                            : visible.filter((x) => x !== k),
                        )
                      }
                    />
                  </div>
                ),
              )}
            </div>
            <FinanceChart
              series={data.series}
              keys={visible}
              kind={chart}
              currency={period.currency}
              onSelect={(d) => {
                window.location.href = records({ from: d, to: d });
              }}
            />
          </PageSection>
          <PageSection className="finance-section" title="PayTR'den beklenen tahsilatlar"
            description="PayTR Ödeme Özeti API'sinin bildirdiği gerçek aktarım tarihleri ve tutarları">
            {payouts.error?<Notice tone="warning">
              PayTR bekleyen tahsilatları alınamadı: {payouts.error}
              <Button variant="secondary" onClick={()=>void payouts.load()}>Tekrar dene</Button>
            </Notice>:null}
            {payouts.loading&&!payouts.data?<p>PayTR ödeme takvimi yükleniyor…</p>:null}
            {payouts.data && !payouts.data.upcoming.length?<p className="text-sm text-muted">
              PayTR hakediş raporunda doğrulanmış bekleyen transfer bulunmuyor.
            </p>:null}
            {payouts.data?.upcoming?.length?<DataTable<Row> layout="fit" density="compact"
              rows={payouts.data.upcoming}
              getRowKey={(row)=>row.date+"-"+row.currency}
              columns={[
                {key:"date",header:"Hesaba geçiş tarihi",
                 cell:(row)=>readableDate(row.date)},
                {key:"net",header:"Beklenen net aktarım",
                 cell:(row)=>money(row.net,row.currency)},
                {key:"currency",header:"Para birimi",cell:(row)=>row.currency},
              ]}
            />:null}
          </PageSection>
            </div>
          <div className="finance-columns">
            <PageSection className="finance-section" title="Gider dağılımı">
              <DataTable<Row> layout="fit" density="compact"
                rows={data.categories}
                getRowKey={(r) => r.category_id || "other"}
                onRowActivate={(r) => {
                  window.location.href = records({
                    category_id: r.category_id || "",
                    direction: "expense",
                  });
                }}
                columns={[
                  { key: "name", header: "Kategori", cell: (r) => r.name },
                  {
                    key: "amount",
                    header: "Tutar",
                    cell: (r) => money(r.amount, period.currency),
                  },
                  {
                    key: "share",
                    header: "Pay",
                    cell: (r) =>
                      Number(data.current.operating_expenses)
                        ? `%${((Number(r.amount) / Number(data.current.operating_expenses)) * 100).toFixed(1)}`
                        : "—",
                  },
                ]}
              />
              <div className="mt-3 space-y-1 rounded-lg bg-surface-secondary p-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span>PayTR taksit vade farkı (PayTR&apos;ye aktarılan)</span>
                  <strong>{data.paytrInstallmentPassThrough == null
                    ? "Mutabakat verisi henüz yok"
                    : money(data.paytrInstallmentPassThrough, period.currency)}</strong>
                </div>
                <p className="finance-note">
                  Bilgilendirme kalemidir. Müşteri tarafından ödenir ve
                  işletmemizin satış geliri olmadığı için gider toplamından
                  ve kârdan ikinci kez düşülmez. PayTR %4,10 komisyonu ise
                  yukarıdaki gider dağılımına otomatik eklenir.
                </p>
              </div>
            </PageSection>
            <PageSection className="finance-section" title="Satış kanalları">
              <DataTable<Row> layout="fit" density="compact"
                rows={data.channels}
                getRowKey={(r) => r.name}
                columns={[
                  {
                    key: "name",
                    header: "Kanal",
                    cell: (r) => labels[r.name] || r.name,
                  },
                  {
                    key: "amount",
                    header: "Gelir",
                    cell: (r) => money(r.amount, period.currency),
                  },
                ]}
              />
            </PageSection>
          </div>
          </> : null}
          {view === "analysis" ? <>
          <PageSection className="finance-section" title="Finansal tablo">
            <div
              tabIndex={0}
              className="overflow-x-auto"
              role="region"
              aria-label="Aylık finansal tablo"
            >
              <table className="finance-table ruth-type-table">
                <thead>
                  <tr>
                    <th scope="col">Kalem</th>
                    {data.monthly.map((m: Row) => (
                      <th key={m.date} scope="col">
                        {readableDate(monthBounds(m.date,period.dates).from)}
                        {" — "}
                        {readableDate(monthBounds(m.date,period.dates).to)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    "gross_sales","discounts","refunds","net_sales","cogs",
                    "gross_profit","operating_expenses","taxes",
                    "total_expenses","unpaid",
                  ].map((k) => (
                    <tr key={k}>
                      <th scope="row">{k==="total_expenses"?"Toplam gider":labels[k]}</th>
                      {data.monthly.map((m: Row) => (
                        <td key={m.date}>
                          <a
                            className="underline"
                            href={records({
                              ...monthBounds(m.date,period.dates),
                            })}
                          >
                            {k==="total_expenses"
                              ? Number.isFinite(expenseDetails?.monthly?.[m.date.slice(0,7)])
                                ? money(expenseDetails?.monthly?.[m.date.slice(0,7)],"TRY")
                                : "Eksik maliyet kaydı"
                              : displayAmount(k,m.values)}
                          </a>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PageSection>
          <PageSection className="finance-section"
            title="Ürün analizi"
            actions={
              <Pick
                label="Ürün analizi sıralaması"
                value={productSort}
                onChange={setProductSort}
                options={[
                  ["revenue", "En yüksek gelir"],
                  ["profit", "En yüksek brüt kâr"],
                  ["margin", "En yüksek marj"],
                  ["loss", "Zarar eden ürünler"],
                ]}
              />
            }
            description="Sipariş net geliri kalemlere orantılı dağıtılır. Son kalem yuvarlama farkını alır; maliyet ve iade eksiğinde kâr gösterilmez."
          >
            <DataTable<Row> layout="fit" density="compact"
              rows={[...data.products]
                .filter(
                  (r: Row) =>
                    productSort !== "loss" ||
                    (r.profit != null && Number(r.profit) < 0),
                )
                .sort(
                  (a: Row, b: Row) =>
                    Number(
                      b[productSort === "loss" ? "profit" : productSort] || 0,
                    ) -
                    Number(
                      a[productSort === "loss" ? "profit" : productSort] || 0,
                    ),
                )}
              getRowKey={(r) => r.product_id || r.name}
              columns={[
                {
                  key: "name",
                  header: "Ürün",
                  cell: (r) => (
                    <a href={`/products/studio?id=${r.product_id}`}>{r.name}</a>
                  ),
                },
                {
                  key: "revenue",
                  header: "Net gelir payı",
                  cell: (r) => money(r.revenue, period.currency),
                },
                {
                  key: "cost",
                  header: "Maliyet",
                  cell: (r) => money(r.cost, period.currency),
                },
                {
                  key: "profit",
                  header: "Brüt kâr",
                  cell: (r) => money(r.profit, period.currency),
                },
                {
                  key: "margin",
                  header: "Brüt marj",
                  cell: (r) =>
                    r.margin == null ? "Eksik veri" : `%${r.margin}`,
                },
                {
                  key: "missing",
                  header: "Eksik maliyet",
                  cell: (r) => r.missing,
                },
              ]}
            />
          </PageSection>
          <PageSection className="finance-section"
            title="Kategori ve koleksiyon kârlılığı"
            description="Bir ürün birden fazla grupta olabilir; grupların toplamı şirket toplamı değildir."
          >
            <DataTable<Row> layout="fit" density="compact"
              rows={data.product_groups || []}
              getRowKey={(r) => r.kind + r.id}
              columns={[
                {
                  key: "name",
                  header: "Grup",
                  cell: (r) =>
                    `${r.kind === "category" ? "Kategori" : "Koleksiyon"} · ${r.name}`,
                },
                {
                  key: "revenue",
                  header: "Net gelir payı",
                  cell: (r) => money(r.revenue, period.currency),
                },
                {
                  key: "cost",
                  header: "Maliyet",
                  cell: (r) => money(r.cost, period.currency),
                },
                {
                  key: "profit",
                  header: "Brüt kâr",
                  cell: (r) => money(r.profit, period.currency),
                },
              ]}
            />
          </PageSection>
          </> : null}
          {view === "accounts" ? <>
          <div className="finance-columns">
            <PageSection className="finance-section" title="Bütçe takibi">
              {data.budgets.length ? (
                data.budgets.map((r: Row) => (
                  <Card key={r.id} density="compact">
                    <strong>
                      {r.name} · {r.month.slice(0, 7)}
                    </strong>
                    <p>
                      {money(r.spent, period.currency)} /{" "}
                      {money(r.budget, period.currency)}
                    </p>
                    <progress
                      aria-label={r.name}
                      value={Math.min(Number(r.spent), Number(r.budget))}
                      max={Number(r.budget)}
                    />
                    {Number(r.spent) >= Number(r.budget) * 0.8 ? (
                      <Notice tone="warning">
                        {Number(r.spent) > Number(r.budget)
                          ? "Bütçe aşıldı"
                          : "Bütçe sınırına yaklaşıldı"}
                      </Notice>
                    ) : null}
                  </Card>
                ))
              ) : (
                <EmptyState
                  title="Bütçe tanımlanmadı"
                  description="Ayarlar üzerinden kategori bazlı bütçe oluştur."
                />
              )}
            </PageSection>
            <PageSection className="finance-section" title="Kasa ve banka bakiyeleri">
              {data.accounts.map((r: Row) => (
                <Card key={r.id} density="compact">
                  <strong>{r.name}</strong>
                  <p>{money(r.balance, r.currency)}</p>
                </Card>
              ))}
              <Notice>
                PayTR bakiyesi ödeme kuruluşundaki bekleyen tutarı içerir.
                Bankaya aktarımı transfer olarak kaydet.
              </Notice>
            </PageSection>
          </div>
          </> : null}
          <details className="finance-disclosure"><summary>Hesaplamalar ve para birimleri hakkında</summary><p>
            Girilen tüm satış, ürün maliyeti ve giderler hesaplanır.
            Eksik alış fiyatı veya henüz kaydedilmemiş vergi ve gider varsa
            kâr da eksik hesaplanır. PayTR bekleyen tahsilatlar gerçek ödeme
            özeti API&apos;sinden alınır; bu tutarlar henüz banka bakiyesi değildir.
            Giderler dövizli işlemlerde kayıtlı kurla TL&apos;ye çevrilir; satış ve diğer kayıtların para birimi değiştirilmez.
          </p></details>
        </>
      ) : null}
      {settings && setup.data ? (
        <FinanceSettings
          setup={setup.data}
          onClose={() => setSettings(false)}
          onSaved={() => {
            void setup.load();
            void report.load();
          }}
        />
      ) : null}
    </PageShell>
  );
}
function FinanceChart({ series, keys, kind, currency, onSelect }: {
  series: Row[]; keys: string[]; kind: string; currency: string; onSelect: (date: string) => void;
}) {
  if (!series.length) return <EmptyState title="Bu dönemde grafik verisi yok" description="Farklı bir tarih aralığı seçebilirsin." />;
  const values = series.flatMap(row => keys.flatMap(key => row.values[key] == null ? [] : [Number(row.values[key])]));
  const minimum = Math.min(0, ...values), maximum = Math.max(1, ...values);
  const yFor = (value: number) => 210 - ((value - minimum) / (maximum - minimum)) * 190;
  const xFor = (index: number) => series.length === 1 ? 360 : 30 + index * 660 / (series.length - 1);
  const colors: Record<string, string> = { net_sales: "var(--ruth-color-text-primary)", operating_expenses: "var(--ruth-color-warning)" };
  return <div className="finance-chart" role="region" aria-label="Finans grafiği" tabIndex={0}>
    <div className="finance-chart-caption"><span>{money(maximum, currency)}</span><span>{keys.length ? "Bir noktayı seçerek kayıtları aç" : "Gösterilecek bir kalem seç"}</span></div>
    <svg viewBox="0 0 720 230" role="group" aria-label="Satış ve gider grafiği">
      {[20, 83, 147, 210].map(y => <line key={y} x1="20" x2="700" y1={y} y2={y} stroke="var(--ruth-color-border-subtle)" strokeDasharray="4 6" />)}
      {keys.map((key, keyIndex) => {
        const segments: string[][] = [[]];
        series.forEach((row, index) => {
          if (row.values[key] == null) { if (segments.at(-1)?.length) segments.push([]); }
          else segments[segments.length - 1].push(`${xFor(index)},${yFor(Number(row.values[key]))}`);
        });
        const color = colors[key] || "var(--ruth-color-info)";
        const barWidth = Math.min(24, 600 / Math.max(series.length, 1) / Math.max(keys.length, 1));
        return <g key={key} fill={color} stroke={color}>
          {kind === "line" ? segments.filter(points => points.length).map((points, index) => <polyline key={index} points={points.join(" ")} fill="none" strokeWidth="2.5" strokeLinejoin="round" />) : null}
          {series.map((row, index) => {
            if (row.values[key] == null) return null;
            const x = xFor(index), y = yFor(Number(row.values[key])), zero = yFor(0);
            return <g key={row.date} role="button" tabIndex={0}
              aria-label={`${readableDate(row.date)} · ${labels[key]} · ${money(row.values[key], currency)}`}
              onClick={() => onSelect(row.date)} onKeyDown={event => {
                if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(row.date); }
              }}>
              <title>{readableDate(row.date)} · {labels[key]} · {money(row.values[key], currency)}</title>
              {kind === "bar" ? <rect x={x + (keyIndex - (keys.length - 1) / 2) * (barWidth + 2) - barWidth / 2}
                y={Math.min(y, zero)} width={barWidth} height={Math.abs(zero - y)} rx="2" /> : <circle cx={x} cy={y} r="4" />}
            </g>;
          })}
        </g>;
      })}
    </svg>
    <div className="finance-chart-caption"><span>{readableDate(series[0].date)}</span><span>{readableDate(series[series.length - 1].date)}</span></div>
  </div>;
}
