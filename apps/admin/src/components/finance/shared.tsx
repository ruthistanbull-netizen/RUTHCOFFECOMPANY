"use client";
import "@/app/finance/finance.css";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartNoAxesCombined, ListFilter, WalletCards } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  InputControl as Input,
  SelectControl as Select,
  Button,
  Toolbar,
  SegmentedControl,
} from "@ruth-commerce/ui";
import { adminRequest } from "@/lib/adminApi";
import { financePeriod } from "@ruth-commerce/commerce-core/finance";
export type Row = Record<string, any>;
export type Setup = {
  settings: Row;
  categories: Row[];
  accounts: Row[];
  recurring: Row[];
  permissions: string[];
};
export const labels: Record<string, string> = {
  net_sales: "Net satış geliri",
  cogs: "Satılan ürünlerin maliyeti",
  gross_profit: "Brüt kâr",
  operating_expenses: "Faaliyet gideri",
  total_expenses: "Toplam gider",
  purchase_payable: "Ürün alış bedeli",
  operating_profit: "Faaliyet kârı",
  period_result: "Kayıtlı giderlere göre tahmini kâr",
  margin: "Faaliyet kâr marjı",
  cash_in: "Nakit girişleri",
  cash_out: "Nakit çıkışları",
  net_cash: "Net nakit akışı",
  unpaid: "Ödenmemiş giderler",
  receivables: "Beklenen tahsilatlar",
  gross_sales: "Brüt satış",
  discounts: "İndirimler",
  refunds: "İadeler",
  shipping_income: "Kargo geliri",
  input_tax: "Alış KDV",
  output_tax: "Satış KDV",
  taxes: "Vergi giderleri",
  financing: "Finansman sonucu",
  website: "Web sitesi",
  ios: "iOS uygulaması",
  manual: "Manuel",
  order: "Sipariş",
  recurring: "Tekrarlayan",
  wholesale: "Toptan kahve",
  consulting: "Danışmanlık",
  other: "Diğer",
  paid: "Ödendi",
  unpaid_status: "Ödenmedi",
  partial: "Kısmi ödendi",
  overdue: "Gecikti",
  cancelled: "İptal edildi",
  sale: "Satış",
  operating: "Faaliyet",
  inventory: "Stok alımı",
  asset: "Duran varlık",
  loan: "Kredi ana para",
  owner: "İşletme sahibi çekişi",
  tax: "Vergi",
  transfer: "Transfer",
  income: "Gelir",
  expense: "Gider",
};
export function money(value: unknown, currency = "TRY") {
  return value == null
    ? "Eksik veri"
    : new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(
        Number(value),
      );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="finance-field ruth-type-body">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Pick({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <Field label={label}>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </Select>
    </Field>
  );
}
const pendingCommands = new Map<string, string>();
export async function command(action: string, data: Row) {
  const clean = { ...data };
  delete clean.key;
  const fingerprint = action + JSON.stringify(clean);
  const key = pendingCommands.get(fingerprint) || crypto.randomUUID();
  pendingCommands.set(fingerprint, key);
  const result = await adminRequest<{ result: Row }>("/api/finance/command", {
    method: "POST",
    body: JSON.stringify({ action, data: { ...data, key } }),
    confirmation: false,
    invalidate: ["/api/finance"],
  });
  pendingCommands.delete(fingerprint);
  return result;
}
export function useFinance<T>(url: string) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const g = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const result = await adminRequest<T>(url, {
        hardRefresh: true,
        ttlMs: 0,
        staleMs: 0,
      });
      if (g === generation.current) setData(result);
    } catch (e) {
      if (
        g === generation.current &&
        !(e instanceof DOMException && e.name === "AbortError")
      )
        setError(e instanceof Error ? e.message : "Veriler alınamadı.");
    } finally {
      if (g === generation.current) setLoading(false);
    }
  }, [url]);
  useEffect(() => {
    void load();
    return () => {
      generation.current++;
    };
  }, [load]);
  return { data, error, loading, load, setData };
}
export function usePeriod(initial?: {
  from?: string;
  to?: string;
  currency?: string;
}) {
  const [preset, setPreset] = useState(initial?.from ? "custom" : "today");
  const [dates, setDates] = useState(() =>
    initial?.from && initial?.to
      ? { from: initial.from, to: initial.to }
      : financePeriod("today"),
  );
  const [currency, setCurrency] = useState(initial?.currency || "TRY");
  return {
    preset,
    dates,
    currency,
    setDates,
    setCurrency,
    select: (v: string) => {
      setPreset(v);
      if (v !== "custom") setDates(financePeriod(v));
    },
    query: new URLSearchParams({ ...dates, currency }).toString(),
  };
}
export function PeriodFilter({
  period,
  allCurrencies = false,
}: {
  period: ReturnType<typeof usePeriod>;
  allCurrencies?: boolean;
}) {
  return (
    <Toolbar className="finance-period">
      <Pick
        label="Tarih aralığı"
        value={period.preset}
        onChange={period.select}
        options={[
          ["today", "Bugün"],
          ["yesterday", "Dün"],
          ["7d", "Son 7 gün"],
          ["30d", "Son 30 gün"],
          ["week", "Bu hafta"],
          ["month", "Bu ay"],
          ["last_month", "Geçen ay"],
          ["3m", "Son 3 ay"],
          ["year", "Bu yıl"],
          ["last_year", "Geçen yıl"],
          ["custom", "Özel aralık"],
        ]}
      />
      {period.preset === "custom" ? (
        <>
          <Field label="Başlangıç">
            <Input
              type="date"
              value={period.dates.from}
              onChange={(e) =>
                period.setDates((d) => ({ ...d, from: e.target.value }))
              }
            />
          </Field>
          <Field label="Bitiş">
            <Input
              type="date"
              value={period.dates.to}
              onChange={(e) =>
                period.setDates((d) => ({ ...d, to: e.target.value }))
              }
            />
          </Field>
        </>
      ) : null}
      <Pick
        label="Para birimi"
        value={period.currency}
        onChange={period.setCurrency}
        options={[
          ...(allCurrencies ? [["ALL", "Tüm para birimleri"] as [string,string]] : []),
          ["TRY", "Türk lirası (TRY)"],
          ["USD", "ABD doları (USD)"],
          ["EUR", "Euro (EUR)"],
        ]}
      />
    </Toolbar>
  );
}
export function FinanceNav() {
  const pathname = usePathname();
  const links = [
    { href: "/finance", label: "Genel bakış", icon: ChartNoAxesCombined },
    { href: "/finance/records", label: "Kayıtlar", icon: ListFilter },
    { href: "/finance/payables", label: "Ödemeler", icon: WalletCards },
  ];
  return (
    <nav aria-label="Finans sayfaları" className="finance-nav">
      {links.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}>
          <Icon size={18} aria-hidden="true" />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}

export function FinanceSegments({ label, value, onChange, options }: {
  label: string; value: string; onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return <SegmentedControl className="finance-segments" ariaLabel={label} value={value}
    onValueChange={onChange} items={options.map(([value, label]) => ({ value, label }))} />;
}

export function FinanceExport({ onDownload }: { onDownload: (format: string) => void }) {
  const [format, setFormat] = useState("csv");
  return <div className="finance-export">
    <Select aria-label="Dışa aktarma biçimi" value={format} onChange={event => setFormat(event.target.value)}>
      <option value="csv">CSV</option><option value="xlsx">Excel</option><option value="pdf">PDF</option>
    </Select>
    <Button variant="secondary" onClick={() => onDownload(format)}>Dışa aktar</Button>
  </div>;
}
export function ActionForm({
  fields,
  onSubmit,
  label = "Kaydet",
}: {
  fields: Array<{
    key: string;
    label: string;
    type?: string;
    options?: Array<[string, string]>;
    value?: string;
  }>;
  onSubmit: (data: Row) => Promise<void>;
  label?: string;
}) {
  const [values, setValues] = useState<Row>(
      Object.fromEntries(fields.map((f) => [f.key, f.value || ""])),
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          await onSubmit(values);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Kaydedilemedi.");
        } finally {
          setBusy(false);
        }
      }}
    >
      {fields.map((f) =>
        f.options ? (
          <Pick
            key={f.key}
            label={f.label}
            value={String(values[f.key])}
            onChange={(v) => setValues({ ...values, [f.key]: v })}
            options={f.options}
          />
        ) : (
          <Field key={f.key} label={f.label}>
            <Input
              required
              type={f.type || "text"}
              value={values[f.key]}
              onChange={(e) =>
                setValues({ ...values, [f.key]: e.target.value })
              }
            />
          </Field>
        ),
      )}
      {error ? <p role="alert">{error}</p> : null}
      <Button type="submit" disabled={busy}>
        {busy ? "Kaydediliyor…" : label}
      </Button>
    </form>
  );
}
