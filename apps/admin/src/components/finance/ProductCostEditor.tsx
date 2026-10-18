"use client";
import { useEffect, useState } from "react";
import {
  Button,
  InputControl as Input,
  Notice,
  PageSection,
  Drawer,
  ConfirmDialog,
} from "@ruth-commerce/ui";
import {
  Field,
  Pick,
  command,
  money,
  useFinance,
  type Row,
  type Setup,
} from "./shared";
export function ProductCostEditor({
  productId,
  variants = [],
}: {
  productId: string;
  variants: Array<{ id?: string; option_summary?: string }>;
}) {
  const [variant, setVariant] = useState("");
  const [open, setOpen] = useState(false),
    [discard, setDiscard] = useState(false);
  const [original, setOriginal] = useState<Row>({});
  const setup = useFinance<Setup>("/api/finance/setup");
  const costs = useFinance<{ costs: Row[]; unitCost: string | null }>(
    `/api/finance/costs?product_id=${productId}&variant_id=${variant}`,
  );
  const [values, setValues] = useState<Row>({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  useEffect(() => {
    const row = costs.data?.costs.find((r) => (r.variant_id || "") === variant);
    setValues(row || {});
    setOriginal(row || {});
    setSaved(false);
  }, [costs.data, variant]);
  if (!productId)
    return <Notice>Maliyet girmek için önce ürünü oluştur.</Notice>;
  const rosta = setup.data?.settings.brand === "rosta";
  const fields = rosta
    ? [
        ["coffee_per_kg", "Kahve maliyeti / kg"],
        ["grams", "Paket gramajı (g)"],
        ["packaging", "Paket maliyeti"],
        ["label", "Etiket"],
        ["labor", "İşçilik"],
        ["other", "Diğer"],
      ]
    : [
        ["purchase", "Ürün alış maliyeti"],
        ["packaging", "Paketleme"],
        ["label", "Etiket"],
        ["labor", "Üretim / işçilik"],
        ["other", "Diğer"],
      ];
  return (
    <PageSection
      title="Ürün maliyeti"
      description="Yeni maliyet kaydı eklenir. Geçmiş siparişlerin maliyetleri korunur."
    >
      <p>{money(costs.data?.unitCost, values.currency || "TRY")}</p>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Maliyet düzenle
      </Button>
      <Drawer
        open={open}
        title="Ürün maliyeti"
        onClose={() => {
          if (JSON.stringify(values) !== JSON.stringify(original))
            setDiscard(true);
          else setOpen(false);
        }}
        dismissalPolicy="explicit-dismiss"
      >
        <div className="space-y-3">
          {setup.error || costs.error ? (
            <Notice tone="warning">{setup.error || costs.error}</Notice>
          ) : null}
          <Pick
            label="Maliyet düzeyi"
            value={variant}
            onChange={(v) => {
              if (JSON.stringify(values) === JSON.stringify(original))
                setVariant(v);
              else
                setError(
                  "Varyant değiştirmeden önce maliyeti kaydet veya değişikliklerden vazgeç.",
                );
            }}
            options={[
              ["", "Ürün varsayılanı"],
              ...variants
                .filter((v) => v.id)
                .map(
                  (v) => [v.id!, v.option_summary || v.id!] as [string, string],
                ),
            ]}
          />
          {fields.map(([key, label]) => (
            <Field key={key} label={label}>
              <Input
                inputMode="decimal"
                value={values[key] ?? ""}
                onChange={(e) => {
                  setValues({ ...values, [key]: e.target.value });
                  setSaved(false);
                }}
              />
            </Field>
          ))}
          <Pick
            label="Para birimi"
            value={values.currency || "TRY"}
            onChange={(v) => setValues({ ...values, currency: v })}
            options={[
              ["TRY", "TRY"],
              ["USD", "USD"],
              ["EUR", "EUR"],
            ]}
          />
          <p>
            Hesaplanan birim maliyet:{" "}
            {money(costs.data?.unitCost, values.currency || "TRY")}
          </p>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          {saved ? <Notice>Maliyet kaydedildi.</Notice> : null}
          <Button
            disabled={busy || !setup.data}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await command("cost", {
                  ...Object.fromEntries(
                    Object.entries(values).filter(([, v]) => v !== ""),
                  ),
                  product_id: productId,
                  variant_id: variant,
                });
                setOriginal(values);
                setSaved(true);
                void costs.load();
              } catch (e) {
                setError(String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Kaydediliyor…" : "Maliyeti kaydet"}
          </Button>
        </div>
      </Drawer>
      <ConfirmDialog
        open={discard}
        title="Maliyet değişiklikleri silinsin mi?"
        onClose={() => setDiscard(false)}
        onConfirm={() => {
          setValues(original);
          setDiscard(false);
          setOpen(false);
        }}
      />
    </PageSection>
  );
}
