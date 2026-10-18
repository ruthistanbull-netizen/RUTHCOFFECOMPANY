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
  SegmentedControl,
  Skeleton,
} from "@ruth-commerce/ui";
import { adminAuthHeaders } from "@/lib/adminApi";
import {
  FinanceNav,
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
  "net_sales",
  "cogs",
  "gross_profit",
  "operating_expenses",
  "operating_profit",
  "period_result",
  "margin",
  "cash_in",
  "cash_out",
  "net_cash",
  "unpaid",
  "receivables",
];
export function FinanceOverview() {
  const period = usePeriod();
  const [productSort, setProductSort] = useState("revenue");
  const [group, setGroup] = useState("day"),
    [view, setView] = useState("profit"),
    [chart, setChart] = useState("line"),
    [settings, setSettings] = useState(false),
    [exportError, setExportError] = useState("");
  const [visible, setVisible] = useState([
    "net_sales",
    "operating_expenses",
    "operating_profit",
  ]);
  const report = useFinance<{ report: Row }>(
      `/api/finance/overview?${period.query}&group=${group}`,
    ),
    setup = useFinance<Setup>("/api/finance/setup");
  const data = report.data?.report;
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
    <PageShell density="compact">
      <PageHeader
        eyebrow="Finans"
        title="Genel Bakış"
        description="Satışlar, maliyetler, giderler ve nakit hareketleri"
        actions={
          <>
            <Button variant="secondary" onClick={() => void report.load()}>
              Yenile
            </Button>
            <Button variant="secondary" onClick={() => void download()}>
              CSV
            </Button>
            <Button variant="secondary" onClick={() => void download("xlsx")}>
              Excel
            </Button>
            <Button variant="secondary" onClick={() => void download("pdf")}>
              PDF
            </Button>
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
          <Notice>
            Kayıtlı giderlere göre tahmini kâr gösterilir. Vergi, amortisman,
            komisyon ve fatura mutabakatları tamamlanmadan kesin net dönem kârı
            değildir. Her para birimi ayrı raporlanır. Nakit girişleri, PayTR
            üzerinde bekleyen tahsilatı da içerir; tamamının banka hesabına
            aktarıldığı anlamına gelmez. Kasa ve banka hesaplarını ayrıca incele.
          </Notice>
          {Number(data.current.missing_costs) > 0 ||
          Number(data.current.refund_review) > 0 ? (
            <Notice tone="warning">
              {data.current.missing_costs} maliyet kaydı eksik;{" "}
              {data.current.refund_review} iadede maliyet / stok incelemesi
              gerekiyor. Eksikler tamamlanana kadar kâr tutarları gösterilmez.
            </Notice>
          ) : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((key) => (
              <MetricCard
                key={key}
                label={labels[key]}
                value={
                  key === "margin"
                    ? data.current[key] == null
                      ? "Eksik veri"
                      : `%${data.current[key]}`
                    : money(data.current[key], period.currency)
                }
                description={delta(key)}
              />
            ))}
          </div>
          <PageSection
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
            <div className="flex flex-wrap gap-3">
              {["net_sales", "operating_expenses", "operating_profit"].map(
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
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <PageSection title="Gider dağılımı">
              <DataTable<Row>
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
            </PageSection>
            <PageSection title="Satış kanalları">
              <DataTable<Row>
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
          <PageSection title="Finansal tablo">
            <SegmentedControl
              value={view}
              onValueChange={setView}
              items={[
                { value: "profit", label: "Kâr-Zarar" },
                { value: "cash", label: "Nakit Akışı" },
              ]}
              ariaLabel="Finansal görünüm"
            />
            <div
              tabIndex={0}
              className="overflow-x-auto"
              role="region"
              aria-label="Aylık finansal tablo"
            >
              <table className="w-full ruth-type-table">
                <thead>
                  <tr>
                    <th scope="col">Kalem</th>
                    {data.monthly.map((m: Row) => (
                      <th key={m.date} scope="col">
                        {m.date.slice(0, 7)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(view === "cash"
                    ? ["cash_in", "cash_out", "net_cash"]
                    : [
                        "gross_sales",
                        "discounts",
                        "refunds",
                        "net_sales",
                        "cogs",
                        "gross_profit",
                        "operating_expenses",
                        "operating_profit",
                        "financing",
                        "taxes",
                        "period_result",
                      ]
                  ).map((k) => (
                    <tr key={k}>
                      <th scope="row">{labels[k]}</th>
                      {data.monthly.map((m: Row) => (
                        <td key={m.date}>
                          <a
                            className="underline"
                            href={records({
                              from: m.date,
                              to: new Date(
                                Date.UTC(
                                  Number(m.date.slice(0, 4)),
                                  Number(m.date.slice(5, 7)),
                                  0,
                                ),
                              )
                                .toISOString()
                                .slice(0, 10),
                            })}
                          >
                            {money(m.values[k], period.currency)}
                          </a>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PageSection>
          <PageSection
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
            <DataTable<Row>
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
          <PageSection
            title="Kategori ve koleksiyon kârlılığı"
            description="Bir ürün birden fazla grupta olabilir; grupların toplamı şirket toplamı değildir."
          >
            <DataTable<Row>
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
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <PageSection title="Bütçe takibi">
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
            <PageSection title="Kasa ve banka bakiyeleri">
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
function FinanceChart({
  series,
  keys,
  kind,
  currency,
  onSelect,
}: {
  series: Row[];
  keys: string[];
  kind: string;
  currency: string;
  onSelect: (d: string) => void;
}) {
  const max = Math.max(
    1,
    ...series.flatMap((r) =>
      keys.map((k) => Math.abs(Number(r.values[k] || 0))),
    ),
  );
  const colors = [
    "var(--ruth-color-accent)",
    "var(--ruth-color-warning)",
    "var(--ruth-color-success)",
  ];
  return (
    <div
      className="overflow-x-auto"
      tabIndex={0}
      role="region"
      aria-label="Finans grafiği"
    >
      <svg
        viewBox="0 0 720 260"
        className="w-full min-w-72"
        role="img"
        aria-label="Gelir gider ve kâr grafiği"
      >
        <line
          x1="30"
          x2="700"
          y1="130"
          y2="130"
          stroke="var(--ruth-color-border-subtle)"
        />
        {keys.map((k, index) => {
          const pts = series
            .map((r, i) =>
              r.values[k] == null
                ? null
                : `${40 + (i * 650) / Math.max(series.length - 1, 1)},${130 - (Number(r.values[k]) / max) * 105}`,
            )
            .filter(Boolean)
            .join(" ");
          return (
            <g key={k} stroke={colors[index % 3]} fill={colors[index % 3]}>
              {kind === "line" ? (
                <polyline points={pts} fill="none" strokeWidth="2" />
              ) : null}
              {series.map((r, i) => {
                if (r.values[k] == null) return null;
                const x = 40 + (i * 650) / Math.max(series.length - 1, 1),
                  y = 130 - (Number(r.values[k] || 0) / max) * 105;
                return (
                  <g
                    key={r.date}
                    tabIndex={0}
                    role="button"
                    aria-label={`${r.date} ${labels[k]} ${money(r.values[k], currency)}`}
                    onClick={() => onSelect(r.date)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelect(r.date);
                      }
                    }}
                  >
                    <title>
                      {r.date} · {labels[k]} · {money(r.values[k], currency)}
                    </title>
                    {kind === "bar" ? (
                      <rect
                        x={x + index * 5}
                        y={Math.min(y, 130)}
                        width="5"
                        height={Math.abs(130 - y)}
                      />
                    ) : (
                      <circle cx={x} cy={y} r="4" />
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
        <text x="30" y="250" fill="var(--ruth-color-text-muted)">
          {series[0]?.date}
        </text>
        <text x="600" y="250" fill="var(--ruth-color-text-muted)">
          {series.at(-1)?.date}
        </text>
      </svg>
    </div>
  );
}
