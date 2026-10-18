"use client";
import { useCallback, useState } from "react";
import {
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  Drawer,
  EmptyState,
  InputControl as Input,
  Notice,
  PageHeader,
  PageSection,
  PageShell,
  Toolbar,
  SearchShell,
  type SearchShellLoadContext,
} from "@ruth-commerce/ui";
import { adminAuthHeaders, adminRequest } from "@/lib/adminApi";
import { istanbulToday } from "@ruth-commerce/commerce-core/finance";
import {
  ActionForm,
  Field,
  FinanceNav,
  PeriodFilter,
  Pick,
  command,
  labels,
  money,
  useFinance,
  usePeriod,
  type Row,
  type Setup,
} from "./shared";
type FinancePurchasedItem = {
  id: string;
  product_name: string;
  variant_name?: string | null;
  image_url?: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
};

function purchasedItems(row: Row): FinancePurchasedItem[] {
  return Array.isArray(row.order_items) ? row.order_items as FinancePurchasedItem[] : [];
}

function PurchasedItemThumbnail({ item }: { item: FinancePurchasedItem }) {
  return (
    <div className="flex h-12 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-tertiary">
      {item.image_url
        ? <img src={item.image_url} alt={item.product_name} className="h-full w-full object-cover" loading="lazy" />
        : <span className="text-[10px] text-muted">Ürün</span>}
    </div>
  );
}

export function FinanceRecords({
  initialFilters = {},
}: {
  initialFilters?: Record<string, string>;
}) {
  const period = usePeriod(initialFilters);
  const [filter, setFilter] = useState<Row>({
      direction: "all",
      status: "all",
      q: "",
      source: "",
      category_id: "",
      ...initialFilters,
    }),
    [offset, setOffset] = useState(0);
  const [search, setSearch] = useState(initialFilters.q || "");
  const [selected, setSelected] = useState<Row | null>(null),
    [editing, setEditing] = useState<Row | null>(null);

  const records = useFinance<{ records: Row[]; count: number }>(
      `/api/finance/records?${period.query}&${new URLSearchParams({ ...filter, offset: String(offset), limit: "50" })}`,
    ),
    setup = useFinance<Setup>("/api/finance/setup");
  const searchProvider = useCallback(
    async (q: string, context: SearchShellLoadContext) => {
      const result = await adminRequest<{ records: Row[] }>(
        `/api/finance/records?${period.query}&${new URLSearchParams({ q, limit: "8" })}`,
        { signal: context.signal, ttlMs: 0, staleMs: 0 },
      );
      return {
        sections: [
          {
            id: "finance",
            title: "Finans kayıtları",
            results: result.records,
            getResultKey: (r: Row) => r.id,
            getResultLabel: (r: Row) => r.title,
            renderResult: (r: Row) => (
              <span>
                {r.title} · {money(r.gross, r.currency)}
              </span>
            ),
            onResultActivate: (r: Row) => setSelected(r),
          },
        ],
      };
    },
    [period.query],
  );
  const set = (key: string, value: string) => {
    setOffset(0);
    setFilter({ ...filter, [key]: value });
  };
  return (
    <PageShell density="compact">
      <PageHeader
        eyebrow="Finans"
        title="Kayıtlar"
        description="Gelirler, giderler, belgeler ve ödemeler"
        actions={
          <>
            <Button variant="secondary" onClick={() => void records.load()}>
              Yenile
            </Button>
            <Button
              variant="secondary"
              onClick={() => setEditing({ direction: "income" })}
            >
              Gelir Ekle
            </Button>
            <Button onClick={() => setEditing({ direction: "expense" })}>
              Gider Ekle
            </Button>
          </>
        }
      />
      <FinanceNav />
      <PeriodFilter period={period} />
      <Toolbar>
        <SearchShell<Row>
          label="Kayıtlarda ara"
          placeholder="İşlem adı veya tedarikçi ara"
          query={search}
          onQueryChange={setSearch}
          onSearchSubmit={(q) => set("q", q)}
          loadSections={searchProvider}
          mode="popover"
          minimumQueryLength={1}
        />
        <Pick
          label="İşlem türü"
          value={filter.direction}
          onChange={(v) => set("direction", v)}
          options={[
            ["all", "Tümü"],
            ["income", "Gelirler"],
            ["expense", "Giderler"],
          ]}
        />
        <Pick
          label="Ödeme durumu"
          value={filter.status}
          onChange={(v) => set("status", v)}
          options={[
            ["all", "Tümü"],
            ["paid", "Ödenenler"],
            ["unpaid", "Ödenmeyenler"],
            ["partial", "Kısmi ödenenler"],
            ["overdue", "Gecikmişler"],
            ["cancelled", "İptal edilenler"],
          ]}
        />
        <Pick
          label="Kaynak"
          value={filter.source}
          onChange={(v) => set("source", v)}
          options={[
            ["", "Tümü"],
            ["manual", "Manuel"],
            ["order", "Sipariş"],
            ["recurring", "Tekrarlayan"],
          ]}
        />
        <Pick
          label="Kategori"
          value={filter.category_id}
          onChange={(v) => set("category_id", v)}
          options={[
            ["", "Tümü"],
            ...(setup.data?.categories || []).map(
              (r) => [r.id, r.name] as [string, string],
            ),
          ]}
        />
      </Toolbar>
      <details>
        <summary>Diğer filtreler</summary>
        <Toolbar>
          {[
            ["supplier", "Tedarikçi"],
            ["min", "En düşük tutar"],
            ["max", "En yüksek tutar"],
          ].map(([key, label]) => (
            <Field key={key} label={label}>
              <Input
                value={filter[key] || ""}
                onChange={(e) => set(key, e.target.value)}
              />
            </Field>
          ))}
        </Toolbar>
      </details>
      {records.error ? (
        <Notice tone="danger">
          {records.error}
          <Button variant="secondary" onClick={() => void records.load()}>
            Tekrar dene
          </Button>
        </Notice>
      ) : null}
      <DataTable
        rows={records.data?.records || []}
        loading={records.loading && !records.data}
        getRowKey={(r) => r.id}
        onRowActivate={setSelected}
        getRowLabel={(r) => `${r.title} detaylarını aç`}
        columns={[
          {
            key: "title",
            header: "İşlem",
            cell: (r) => {
              const items = purchasedItems(r);
              if (r.source !== "order" || !items.length) {
                return <span>{r.direction === "income" ? "+" : "−"} {r.title}</span>;
              }
              return (
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex shrink-0 -space-x-1">
                    {items.slice(0, 2).map((item) =>
                      <PurchasedItemThumbnail key={item.id} item={item} />,
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold">{r.title}</p>
                    <p className="text-xs text-muted">
                      {items.map((item) =>
                        `${item.product_name}${item.variant_name ? " · " + item.variant_name : ""} ×${item.quantity}`
                      ).join(" · ")}
                    </p>
                    <p className="text-[11px] text-subtle">Ürünleri görmek için aç</p>
                  </div>
                </div>
              );
            },
          },
          { key: "date", header: "Tarih", cell: (r) => r.occurred_on },
          { key: "category", header: "Kategori", cell: (r) => r.category },
          {
            key: "source",
            header: "Kaynak",
            cell: (r) => labels[r.source] || r.source,
          },
          {
            key: "status",
            header: "Durum",
            cell: (r) =>
              r.status === "unpaid" ? "Ödenmedi" : labels[r.status],
          },
          {
            key: "amount",
            header: "Tutar",
            cell: (r) => money(r.gross, r.currency),
          },
          {
            key: "doc",
            header: "Belge",
            cell: (r) => (r.documents ? `${r.documents} belge` : "—"),
          },
        ]}
        emptyState={
          <EmptyState
            title="Bu filtrelerde kayıt bulunamadı"
            description="Tarih aralığını değiştir veya yeni gider ekle."
          />
        }
      />
      <Toolbar>
        <Button
          variant="secondary"
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - 50))}
        >
          Önceki
        </Button>
        <p>
          {offset + 1}–{Math.min(offset + 50, records.data?.count || 0)} /{" "}
          {records.data?.count || 0}
        </p>
        <Button
          variant="secondary"
          disabled={offset + 50 >= (records.data?.count || 0)}
          onClick={() => setOffset(offset + 50)}
        >
          Sonraki
        </Button>
      </Toolbar>
      {selected && setup.data ? (
        <FinanceRecordDetail
          record={selected}
          setup={setup.data}
          onClose={() => setSelected(null)}
          onEdit={(r) => {
            setSelected(null);
            setEditing(r);
          }}
          onSaved={() => void records.load()}
        />
      ) : null}
      {editing && setup.data ? (
        <FinanceEntryEditor
          key={editing.id || editing.direction}
          initial={editing}
          setup={setup.data}
          onClose={() => setEditing(null)}
          onSaved={(r) => {
            setEditing(null);
            setSelected(r);
            void records.load();
          }}
        />
      ) : null}
    </PageShell>
  );
}
export function FinanceEntryEditor({
  initial,
  setup,
  onClose,
  onSaved,
}: {
  initial: Row;
  setup: Setup;
  onClose: () => void;
  onSaved: (r: Row) => void;
}) {
  const initialValues = {
    ...initial,
    title: initial.title || "",
    direction: initial.direction || "expense",
    nature: initial.nature || "operating",
    amount: initial.gross || "",
    tax_rate: String(initial.metadata?.tax_rate || "0"),
    tax_included: true,
    currency: initial.currency || "TRY",
    occurred_on: initial.occurred_on || istanbulToday(),
    due_on: initial.due_on || "",
    category_id: initial.category_id || "",
    supplier: initial.supplier || "",
    description: initial.description || "",
    channel: initial.channel || "other",
  };
  const [form, setForm] = useState<Row>(initialValues),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [discard, setDiscard] = useState(false),
    [frequency, setFrequency] = useState("none"),
    [end, setEnd] = useState(""),
    [interval, setInterval] = useState("30");
  const [entryId] = useState(initial.id || crypto.randomUUID());
  const dirty =
    JSON.stringify(form) !== JSON.stringify(initialValues) ||
    frequency !== "none";
  const close = () => {
    if (saving) return;
    if (dirty) setDiscard(true);
    else onClose();
  };
  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const result = await command("entry", {
        ...form,
        id: entryId,
        ...(frequency !== "none"
          ? { recurrence: { frequency, end_on: end, interval_days: interval } }
          : {}),
      });
      onSaved(result.result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };
  const field = (key: string, label: string, type = "text") => (
    <Field label={label}>
      <Input
        required={["title", "amount", "occurred_on"].includes(key)}
        type={type}
        inputMode={key === "amount" ? "decimal" : undefined}
        value={form[key] ?? ""}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </Field>
  );
  return (
    <>
      <Drawer
        open
        title={
          initial.id
            ? "Kaydı düzenle"
            : form.direction === "expense"
              ? "Gider Ekle"
              : "Gelir Ekle"
        }
        onClose={close}
        dismissalPolicy="explicit-dismiss"
        dismissible={!saving}
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={saving}>
              Vazgeç
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error ? <Notice tone="danger">{error}</Notice> : null}
          {field("title", "İşlem adı")}
          <Pick
            label="Muhasebesel nitelik"
            value={form.nature}
            onChange={(v) => setForm({ ...form, nature: v })}
            options={[
              "operating",
              "inventory",
              "asset",
              "loan",
              "owner",
              "tax",
              "financing",
            ].map((k) => [k, labels[k]])}
          />
          <Pick
            label="Kategori"
            value={form.category_id}
            onChange={(v) => setForm({ ...form, category_id: v })}
            options={[
              ["", "Seçiniz"],
              ...setup.categories.map(
                (c) => [c.id, c.name] as [string, string],
              ),
            ]}
          />
          {field("amount", "Tutar")}
          <Pick
            label="Para birimi"
            value={form.currency}
            onChange={(v) => setForm({ ...form, currency: v })}
            options={[
              ["TRY", "TRY"],
              ["USD", "USD"],
              ["EUR", "EUR"],
            ]}
          />
          <Pick
            label="KDV"
            value={String(form.tax_included)}
            onChange={(v) => setForm({ ...form, tax_included: v === "true" })}
            options={[
              ["true", "KDV dahil"],
              ["false", "KDV hariç"],
            ]}
          />
          {field("tax_rate", "KDV oranı (%)", "number")}
          {field("occurred_on", "Muhasebe tarihi", "date")}
          {field("due_on", "Son ödeme tarihi", "date")}
          {field("supplier", "Tedarikçi / firma")}
          {field("description", "Açıklama")}
          {field("order_id", "İlgili sipariş kimliği (isteğe bağlı)")}
          {field("product_id", "İlgili ürün kimliği (isteğe bağlı)")}
          <Pick
            label="Kanal"
            value={form.channel}
            onChange={(v) => setForm({ ...form, channel: v })}
            options={[
              "other",
              "manual",
              "wholesale",
              "consulting",
              "website",
              "ios",
            ].map((k) => [k, labels[k]])}
          />
          {!initial.id ? (
            <>
              <Pick
                label="Tekrarlama"
                value={frequency}
                onChange={setFrequency}
                options={[
                  ["none", "Tek seferlik"],
                  ["weekly", "Haftalık"],
                  ["monthly", "Aylık"],
                  ["quarterly", "Üç aylık"],
                  ["yearly", "Yıllık"],
                  ["custom", "Özel aralık"],
                ]}
              />
              {frequency !== "none" ? (
                <Field label="Tekrar bitiş tarihi (isteğe bağlı)">
                  <Input
                    type="date"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </Field>
              ) : null}
              {frequency === "custom" ? (
                <Field label="Kaç günde bir?">
                  <Input
                    type="number"
                    min={1}
                    value={interval}
                    onChange={(e) => setInterval(e.target.value)}
                  />
                </Field>
              ) : null}
            </>
          ) : null}
          <Notice>
            Ödeme ve fatura/fiş kaydını kaydettikten sonra detay ekranından
            ekleyebilirsin. Stok alımı ve kredi ana parası faaliyet giderine
            dahil edilmez.
          </Notice>
        </div>
      </Drawer>
      <ConfirmDialog
        open={discard}
        title="Değişiklikler silinsin mi?"
        confirmLabel="Değişiklikleri sil"
        onClose={() => setDiscard(false)}
        onConfirm={onClose}
      />
    </>
  );
}
function FinanceRecordDetail({
  record,
  setup,
  onClose,
  onEdit,
  onSaved,
}: {
  record: Row;
  setup: Setup;
  onClose: () => void;
  onEdit: (r: Row) => void;
  onSaved: () => void;
}) {
  const detail = useFinance<{
      entry: Row;
      payments: Row[];
      documents: Row[];
      audit: Row[];
      snapshots: Row[];
      order_items: FinancePurchasedItem[];
    }>(`/api/finance/records/${record.id}`),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false);
  const r = detail.data?.entry || record;
  const canEdit = r.source === "manual" && !r.cancelled;
  const payment = async (v: Row) => {
    await command("payment", {
      ...v,
      entry_id: r.id,
      key: crypto.randomUUID(),
    });
    void detail.load();
    onSaved();
  };
  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.append("entry_id", r.id);
      body.append("file", file);
      const response = await fetch("/api/finance/documents", {
        method: "POST",
        headers: await adminAuthHeaders(),
        body,
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error);
      void detail.load();
      onSaved();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Drawer open title={r.title} onClose={onClose}>
        <div className="space-y-4">
          {error || detail.error ? (
            <Notice tone="danger">{error || detail.error}</Notice>
          ) : null}
          <Card density="compact">
            <p>
              {money(r.net, r.currency)} + {money(r.tax, r.currency)} KDV
            </p>
            <strong>{money(r.gross, r.currency)}</strong>
            <p>
              {r.occurred_on} · {r.supplier}
            </p>
            <p>{r.description}</p>
            {r.source === "order" ? (
              <a className="underline" href={`/orders?order_id=${r.order_id}`}>
                Kaynak siparişi aç
              </a>
            ) : null}
          </Card>
          {r.source === "order" && r.order_id ? (
            <PageSection
              title="Siparişteki ürünler"
              description="Satın alınan ürünlerin isimleri, fotoğrafları, adetleri ve satış fiyatları"
            >
              {(detail.data?.order_items || purchasedItems(record)).map((item) => (
                <Card key={item.id} density="compact">
                  <div className="flex items-center gap-3">
                    <PurchasedItemThumbnail item={item} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{item.product_name}</p>
                      {item.variant_name ? (
                        <p className="text-xs text-muted">{item.variant_name}</p>
                      ) : null}
                      <p className="text-xs text-muted">
                        {item.quantity} adet · Birim satış fiyatı {money(item.unit_price, r.currency)}
                      </p>
                    </div>
                    <strong className="shrink-0">{money(item.total_price, r.currency)}</strong>
                  </div>
                </Card>
              ))}
              {detail.loading && !detail.data ? <p>Ürünler yükleniyor…</p> : null}
              {!detail.loading && !(detail.data?.order_items || purchasedItems(record)).length ? (
                <Notice>Bu siparişin ürün bilgileri bulunamadı.</Notice>
              ) : null}
              <a className="inline-block font-semibold underline" href={`/orders/${r.order_id}`}>
                Siparişin tüm detaylarını aç
              </a>
            </PageSection>
          ) : null}
          {canEdit ? (
            <Toolbar>
              <Button onClick={() => onEdit(r)}>Düzenle</Button>
              <Button variant="danger" onClick={() => setConfirm(true)}>
                Kaydı iptal et
              </Button>
            </Toolbar>
          ) : null}
          <PageSection title="Ödemeler">
            {detail.data?.payments.map((p) => (
              <Card key={p.id} density="compact">
                {p.paid_on} · {money(p.amount, r.currency)} · {p.method}
              </Card>
            ))}
            {canEdit ? (
              <ActionForm
                fields={[
                  {
                    key: "account_id",
                    label: "Hesap",
                    options: [
                      ["", "Seçiniz"],
                      ...setup.accounts
                        .filter((a) => a.currency === r.currency)
                        .map((a) => [a.id, a.name] as [string, string]),
                    ],
                  },
                  { key: "amount", label: "Ödenen / tahsil edilen tutar" },
                  {
                    key: "paid_on",
                    label: "Ödeme tarihi",
                    type: "date",
                    value: istanbulToday(),
                  },
                  {
                    key: "method",
                    label: "Yöntem",
                    options: [
                      ["bank", "Banka"],
                      ["card", "Kart"],
                      ["cash", "Nakit"],
                    ],
                    value: "bank",
                  },
                ]}
                onSubmit={payment}
                label="Ödeme kaydet"
              />
            ) : null}
          </PageSection>
          <PageSection title="Belgeler">
            <Field label={busy ? "Yükleniyor…" : "Fatura / fiş yükle"}>
              <Input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/heic"
                disabled={busy}
                onChange={(e) => void upload(e.target.files?.[0])}
              />
            </Field>
            {detail.data?.documents.map((d) => (
              <Card key={d.id} density="compact">
                <Button
                  variant="secondary"
                  onClick={async () => {
                    try {
                      const result = await adminRequest<{ url: string }>(
                        `/api/finance/documents/${d.id}`,
                        { force: true, ttlMs: 0, staleMs: 0 },
                      );
                      window.open(result.url, "_blank", "noopener,noreferrer");
                    } catch (e) {
                      setError(String(e));
                    }
                  }}
                >
                  {d.name}
                </Button>
                <Button
                  variant="ghost"
                  onClick={async () => {
                    try {
                      await adminRequest(`/api/finance/documents/${d.id}`, {
                        method: "DELETE",
                        confirmation: false,
                      });
                      void detail.load();
                    } catch (e) {
                      setError(String(e));
                    }
                  }}
                >
                  Arşivle
                </Button>
              </Card>
            ))}
          </PageSection>
          {detail.data?.snapshots.length ? (
            <PageSection
              title="İade maliyet incelemesi"
              description="Sadece fiilen stoka dönen adedi gir. Parasal iadeden ürün adedi tahmin edilmez."
            >
              {detail.data.snapshots.map((s) => (
                <div key={s.item_id}>
                  <p>
                    {s.order_items?.product_name || s.item_id} · Satılan:{" "}
                    {s.quantity} · Stoka dönen: {s.returned_quantity}
                  </p>
                  <ActionForm
                    fields={[
                      {
                        key: "quantity",
                        label: "Toplam stoka dönen adet",
                        type: "number",
                        value: String(s.returned_quantity),
                      },
                    ]}
                    onSubmit={async (v) => {
                      await command("returned", {
                        item_id: s.item_id,
                        quantity: v.quantity,
                      });
                      void detail.load();
                      onSaved();
                    }}
                    label="İncelemeyi kaydet"
                  />
                </div>
              ))}
            </PageSection>
          ) : null}
          <PageSection title="Değişiklik geçmişi">
            {detail.data?.audit.map((a) => (
              <p key={a.id}>
                {new Date(a.created_at).toLocaleString("tr-TR", {
                  timeZone: "Europe/Istanbul",
                })}{" "}
                · {a.action} · {a.actor || "Sistem"}
              </p>
            ))}
          </PageSection>
        </div>
      </Drawer>
      <ConfirmDialog
        open={confirm}
        title="Finans kaydı iptal edilsin mi?"
        description="Geçmiş kayıtlar korunur. Ödenmiş işlemler önce ters kayıt ile düzeltilmelidir."
        tone="danger"
        loading={busy}
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await command("void", { id: r.id });
            onSaved();
            onClose();
          } catch (e) {
            setError(String(e));
            setConfirm(false);
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}
