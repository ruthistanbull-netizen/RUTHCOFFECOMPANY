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
        ["purchase", "Bu ürünün direkt kahve alış fiyatı"],
        ["coffee_per_kg", "Alternatif: kahve maliyeti / kg"],
        ["grams", "Paket gramajı (g)"],
        ["packaging", "Paket maliyeti"],
        ["label", "Etiket"],
        ["labor", "İşçilik"],
        ["other", "Diğer"],
      ]
    : [
        ["purchase", "Ürün alış fiyatı (adet)"],
        ["packaging", "Paketleme"],
        ["label", "Etiket"],
        ["labor", "Üretim / işçilik"],
        ["other", "Diğer"],
      ];
  const updateVariant = (next: string) => {
    if (JSON.stringify(values) === JSON.stringify(original)) {
      setError("");
      setVariant(next);
    } else {
      setError("Varyant değiştirmeden önce alış fiyatını kaydet veya değişikliklerden vazgeç.");
    }
  };
  const saveCost = async () => {
    if (busy || !setup.data) return;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const input = String(values.purchase ?? "").trim();
      if (input) {
        const parsed = Number(input.replace(",", "."));
        if (!Number.isFinite(parsed) || parsed < 0)
          throw new Error("Alış fiyatı sıfır veya daha büyük geçerli bir sayı olmalı.");
      } else if (
        rosta && (!String(values.coffee_per_kg ?? "").trim() ||
                  !String(values.grams ?? "").trim())
      ) {
        throw new Error("Alış fiyatını gir veya detaylardan kg fiyatı ile gramajı belirle.");
      } else if (!rosta) {
        throw new Error("Bu ürün veya varyant için alış fiyatını gir.");
      }
      const payload = Object.fromEntries(
        Object.entries(values)
          .filter(([key, value]) =>
            value !== "" && value != null && ![
              "id", "product_id", "variant_id", "created_by", "effective_at",
            ].includes(key),
          )
          .map(([key, value]) => [
            key,
            typeof value === "string" && [
              "purchase", "coffee_per_kg", "grams",
              "packaging", "label", "labor", "other",
            ].includes(key) ? value.replace(",", ".") : value,
          ]),
      );
      await command("cost", {
        ...payload,
        product_id: productId,
        variant_id: variant,
        currency: String(values.currency || "TRY"),
      });
      setOriginal(values);
      setSaved(true);
      await costs.load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <PageSection
      title="Ürünün alış fiyatı"
      description="Bu ürünün kendi alış fiyatı finans ve kârlılık hesabında kullanılır. Varyantlar için ayrı alış fiyatı girebilirsin. Geçmiş siparişlerin maliyet kaydı değişmez."
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Pick
          label="Fiyatın geçerli olduğu ürün / varyant"
          value={variant}
          onChange={updateVariant}
          options={[
            ["", "Bu ürünün varsayılan alış fiyatı"],
            ...variants
              .filter((v) => v.id)
              .map((v) => [v.id!, v.option_summary || v.id!] as [string,string]),
          ]}
        />
        <Field label={rosta ? "Kahvenin alış fiyatı (bu paket / adet)" : "Alış fiyatı (tek ürün / adet)"}>
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            placeholder="Örn. 125,00"
            value={values.purchase ?? ""}
            onChange={(e) => {
              setValues({ ...values, purchase: e.target.value });
              setSaved(false);
            }}
          />
        </Field>
      </div>
      <p className="text-xs text-muted">
        {variant ? "Seçili varyantın" : "Ürünün"} hesaplanan birim maliyeti:
        {" "}<strong>{money(costs.data?.unitCost, values.currency || "TRY")}</strong>
        {rosta ? " · İstersen ayrıntılardan kilogram fiyatı ve gramajla da hesaplayabilirsin." : ""}
      </p>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {saved ? <Notice>Alış fiyatı kaydedildi.</Notice> : null}
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || !setup.data} onClick={() => void saveCost()}>
          {busy ? "Kaydediliyor…" : "Alış fiyatını kaydet"}
        </Button>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Diğer maliyetler ve para birimi
        </Button>
      </div>
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
            onChange={updateVariant}
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
          <Button disabled={busy || !setup.data} onClick={() => void saveCost()}>
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
