"use client";

import {
  ArrowDown,
  ArrowUp,
  Palette,
  Plus,
  RefreshCw,
  Trash2,
  Type,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { adminRequest } from "@/lib/adminApi";
import { ExactDataCard, ExactEmptyState } from "./data";
import {
  ExactButton,
  ExactIconButton,
  ExactPageHeader,
  exactFormInputClass,
} from "./primitives";

export type ProductOptionValue = {
  id: string;
  label: string;
  color?: string;
};

export type ProductOptionDefinition = {
  id: string;
  name: string;
  displayType: "list" | "color";
  active: boolean;
  values: ProductOptionValue[];
};

type ProductPageContent = {
  materialTitle: string;
  materialFallback: string;
  careTitle: string;
  careFallback: string;
  sizeUsageTitle: string;
  sizeUsageFallback: string;
  shippingTitle: string;
  shippingText: string;
};

const EMPTY_PRODUCT_PAGE: ProductPageContent = {
  materialTitle: "",
  materialFallback: "",
  careTitle: "",
  careFallback: "",
  sizeUsageTitle: "",
  sizeUsageFallback: "",
  shippingTitle: "",
  shippingText: "",
};

type Payload = {
  ok: boolean;
  definitions?: ProductOptionDefinition[];
  productPage?: ProductPageContent;
  updatedAt?: string | null;
  warning?: string | null;
};

function makeId(prefix: string) {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
  return `${prefix}-${random}`;
}

function cloneDefinitions(value: ProductOptionDefinition[]) {
  return value.map((group) => ({
    ...group,
    values: group.values.map((item) => ({ ...item })),
  }));
}

export function ExactProductOptions() {
  const [definitions, setDefinitions] = useState<ProductOptionDefinition[]>([]);
  const [productPage, setProductPage] = useState<ProductPageContent>(EMPTY_PRODUCT_PAGE);
  const [savedSnapshot, setSavedSnapshot] = useState("[]");
  const [savedProductPageSnapshot, setSavedProductPageSnapshot] = useState("{}");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [message, setMessage] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const dirty = useMemo(
    () =>
      JSON.stringify(definitions) !== savedSnapshot ||
      JSON.stringify(productPage) !== savedProductPageSnapshot,
    [definitions, productPage, savedProductPageSnapshot, savedSnapshot],
  );

  const load = async (hardRefresh = false) => {
    setLoading(true);
    setMessage("");
    try {
      const payload = await adminRequest<Payload>("/api/product-settings/options", {
        hardRefresh,
        ttlMs: hardRefresh ? 0 : 30_000,
        staleMs: 120_000,
      });
      const next = cloneDefinitions(payload.definitions || []);
      const nextProductPage = payload.productPage || EMPTY_PRODUCT_PAGE;
      setDefinitions(next);
      setProductPage(nextProductPage);
      setSavedSnapshot(JSON.stringify(next));
      setSavedProductPageSnapshot(JSON.stringify(nextProductPage));
      setUpdatedAt(payload.updatedAt || null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ürün seçenekleri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    if (!definitions.length) return;
    setSaving(true);
    setSavedFlash(false);
    setMessage("");
    try {
      const payload = await adminRequest<Payload>("/api/product-settings/options", {
        method: "PUT",
        body: JSON.stringify({ definitions, productPage }),
        invalidate: ["/api/product-settings/options"],
      });
      const next = cloneDefinitions(payload.definitions || definitions);
      const nextProductPage = payload.productPage || productPage;
      setDefinitions(next);
      setProductPage(nextProductPage);
      setSavedSnapshot(JSON.stringify(next));
      setSavedProductPageSnapshot(JSON.stringify(nextProductPage));
      setUpdatedAt(payload.updatedAt || new Date().toISOString());
      setMessage(payload.warning || "Ürün seçenekleri kaydedildi.");
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1600);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ürün seçenekleri kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  const addGroup = () => {
    setDefinitions((current) => [
      ...current,
      {
        id: makeId("option"),
        name: "Yeni Seçenek",
        displayType: "list",
        active: true,
        values: [{ id: makeId("value"), label: "Yeni değer" }],
      },
    ]);
  };

  const patchGroup = (groupId: string, patch: Partial<ProductOptionDefinition>) => {
    setDefinitions((current) =>
      current.map((group) => group.id === groupId ? { ...group, ...patch } : group),
    );
  };

  const removeGroup = (groupId: string) => {
    setDefinitions((current) => current.filter((group) => group.id !== groupId));
  };

  const addValue = (groupId: string) => {
    setDefinitions((current) => current.map((group) => {
      if (group.id !== groupId) return group;
      return {
        ...group,
        values: [
          ...group.values,
          {
            id: makeId("value"),
            label: "",
            ...(group.displayType === "color" ? { color: "#111111" } : {}),
          },
        ],
      };
    }));
  };

  const patchValue = (groupId: string, valueId: string, patch: Partial<ProductOptionValue>) => {
    setDefinitions((current) => current.map((group) => {
      if (group.id !== groupId) return group;
      return {
        ...group,
        values: group.values.map((value) =>
          value.id === valueId ? { ...value, ...patch } : value,
        ),
      };
    }));
  };

  const removeValue = (groupId: string, valueId: string) => {
    setDefinitions((current) => current.map((group) => {
      if (group.id !== groupId) return group;
      return { ...group, values: group.values.filter((value) => value.id !== valueId) };
    }));
  };

  const moveValue = (groupId: string, valueIndex: number, direction: -1 | 1) => {
    setDefinitions((current) => current.map((group) => {
      if (group.id !== groupId) return group;
      const nextIndex = valueIndex + direction;
      if (nextIndex < 0 || nextIndex >= group.values.length) return group;
      const values = [...group.values];
      const [moved] = values.splice(valueIndex, 1);
      values.splice(nextIndex, 0, moved);
      return { ...group, values };
    }));
  };

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-4 md:px-6 md:py-6">
      <ExactPageHeader
        title="Ürün Seçenekleri"
        subtitle="Ürün oluştururken kullanacağın seçenek gruplarını ve değerlerini tek yerden yönet."
        actions={
          <>
            <ExactButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void load(true)}
              disabled={loading || saving}
            >
              <RefreshCw className="h-4 w-4" />
              Yenile
            </ExactButton>
            <ExactButton
              type="button"
              size="sm"
              onClick={() => void save()}
              loading={saving}
              success={savedFlash}
              disabled={!dirty || !definitions.length}
            >
              Kaydet
            </ExactButton>
          </>
        }
      />

      <div className="mb-4 rounded-[16px] border border-border-subtle bg-surface-secondary px-4 py-3">
        <p className="ruth-type-body text-main">
          Buradan hem ürün seçeneklerini hem de storefront ürün sayfasındaki bakım, ölçü/kullanım ve kargo metinlerini yönetebilirsin.
        </p>
        <p className="ruth-type-caption mt-1 text-muted">
          Bir seçeneği buradan kaldırmak mevcut ürünlerdeki kayıtlı varyantları silmez; yeni düzenlemelerde kütüphaneden kaldırır.
          {updatedAt ? ` Son kayıt: ${new Date(updatedAt).toLocaleString("tr-TR")}.` : ""}
        </p>
        {message ? <p className="ruth-type-caption mt-2 font-medium text-accent">{message}</p> : null}
      </div>

      {!loading ? (
        <ExactDataCard
          title="Ürün Sayfası Bilgi Alanları"
          className="mb-4"
        >
          <div className="grid gap-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label>
                <span className="ruth-type-label mb-1.5 block text-subtle">Ürün bilgisi başlığı</span>
                <input
                  value={productPage.materialTitle}
                  onChange={(event) => setProductPage((current) => ({ ...current, materialTitle: event.target.value }))}
                  className={exactFormInputClass}
                  placeholder="Materyal ve Bakım / Ürün Bilgisi"
                />
              </label>
              <label>
                <span className="ruth-type-label mb-1.5 block text-subtle">Bakım başlığı</span>
                <input
                  value={productPage.careTitle}
                  onChange={(event) => setProductPage((current) => ({ ...current, careTitle: event.target.value }))}
                  className={exactFormInputClass}
                  placeholder="Bakım / Saklama ve Kullanım"
                />
              </label>
            </div>

            <label>
              <span className="ruth-type-label mb-1.5 block text-subtle">Ürün bilgisi varsayılan metni</span>
              <textarea
                value={productPage.materialFallback}
                onChange={(event) => setProductPage((current) => ({ ...current, materialFallback: event.target.value }))}
                className={`${exactFormInputClass} min-h-24`}
                placeholder="Üründe özel bilgi girilmediyse storefrontta gösterilecek metin"
              />
            </label>

            <label>
              <span className="ruth-type-label mb-1.5 block text-subtle">Bakım / saklama varsayılan metni</span>
              <textarea
                value={productPage.careFallback}
                onChange={(event) => setProductPage((current) => ({ ...current, careFallback: event.target.value }))}
                className={`${exactFormInputClass} min-h-28`}
                placeholder="Üründe özel bakım önerisi yoksa gösterilecek metin"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-[260px_minmax(0,1fr)]">
              <label>
                <span className="ruth-type-label mb-1.5 block text-subtle">Ölçü / kullanım başlığı</span>
                <input
                  value={productPage.sizeUsageTitle}
                  onChange={(event) => setProductPage((current) => ({ ...current, sizeUsageTitle: event.target.value }))}
                  className={exactFormInputClass}
                  placeholder="Ölçü ve Kullanım"
                />
              </label>
              <label>
                <span className="ruth-type-label mb-1.5 block text-subtle">Ölçü / kullanım varsayılan metni</span>
                <textarea
                  value={productPage.sizeUsageFallback}
                  onChange={(event) => setProductPage((current) => ({ ...current, sizeUsageFallback: event.target.value }))}
                  className={`${exactFormInputClass} min-h-24`}
                  placeholder="Üründe özel ölçü veya kullanım bilgisi yoksa gösterilecek metin"
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-[260px_minmax(0,1fr)]">
              <label>
                <span className="ruth-type-label mb-1.5 block text-subtle">Kargo alanı başlığı</span>
                <input
                  value={productPage.shippingTitle}
                  onChange={(event) => setProductPage((current) => ({ ...current, shippingTitle: event.target.value }))}
                  className={exactFormInputClass}
                  placeholder="Kargo İade ve Değişim"
                />
              </label>
              <label>
                <span className="ruth-type-label mb-1.5 block text-subtle">Kargo / iade / değişim metni</span>
                <textarea
                  value={productPage.shippingText}
                  onChange={(event) => setProductPage((current) => ({ ...current, shippingText: event.target.value }))}
                  className={`${exactFormInputClass} min-h-28`}
                  placeholder="Ürün sayfasında gösterilecek kargo, iade ve değişim metni"
                />
              </label>
            </div>

            <p className="ruth-type-caption text-subtle">
              Ürünün kendi bakım veya ölçü bilgisi varsa o ürünün özel metni kullanılır; boş bırakılan ürünlerde buradaki varsayılan metin devreye girer.
            </p>
          </div>
        </ExactDataCard>
      ) : null}

      {loading ? (
        <div className="grid gap-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-44 animate-pulse rounded-[20px] bg-surface-secondary" />
          ))}
        </div>
      ) : definitions.length ? (
        <div className="grid gap-4">
          {definitions.map((group) => (
            <ExactDataCard
              key={group.id}
              title={
                <div className="flex min-w-0 items-center gap-2">
                  {group.displayType === "color"
                    ? <Palette className="h-4 w-4 text-accent" />
                    : <Type className="h-4 w-4 text-accent" />}
                  <span className="truncate">{group.name || "Adsız seçenek"}</span>
                  {!group.active ? (
                    <span className="rounded-full bg-surface-tertiary px-2 py-0.5 text-[9px] font-semibold text-subtle">PASİF</span>
                  ) : null}
                </div>
              }
              action={
                <ExactIconButton
                  icon={Trash2}
                  label="Seçenek grubunu sil"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeGroup(group.id)}
                  disabled={definitions.length <= 1}
                />
              }
            >
              <div className="grid gap-4">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_130px]">
                  <label>
                    <span className="ruth-type-label mb-1.5 block text-subtle">Seçenek adı</span>
                    <input
                      value={group.name}
                      onChange={(event) => patchGroup(group.id, { name: event.target.value })}
                      className={exactFormInputClass}
                      placeholder="Örn. Renk, Gramaj, Zincir Uzunluğu"
                    />
                  </label>

                  <label>
                    <span className="ruth-type-label mb-1.5 block text-subtle">Gösterim</span>
                    <select
                      value={group.displayType}
                      onChange={(event) => {
                        const displayType = event.target.value === "color" ? "color" : "list";
                        patchGroup(group.id, {
                          displayType,
                          values: group.values.map((value) => ({
                            ...value,
                            ...(displayType === "color" ? { color: value.color || "#111111" } : {}),
                          })),
                        });
                      }}
                      className={exactFormInputClass}
                    >
                      <option value="list">İsim olarak</option>
                      <option value="color">Renk olarak</option>
                    </select>
                  </label>

                  <label className="flex items-end">
                    <span className="flex h-11 w-full items-center justify-between rounded-[var(--radius-control)] border border-border-subtle bg-surface-secondary px-3 md:h-9">
                      <span className="ruth-type-control text-main">Aktif</span>
                      <input
                        type="checkbox"
                        checked={group.active}
                        onChange={(event) => patchGroup(group.id, { active: event.target.checked })}
                        className="h-4 w-4 accent-[hsl(var(--accent))]"
                      />
                    </span>
                  </label>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <p className="ruth-type-card-title text-main">Değerler</p>
                      <p className="ruth-type-caption text-subtle">{group.values.length} değer</p>
                    </div>
                    <ExactButton type="button" variant="secondary" size="sm" onClick={() => addValue(group.id)}>
                      <Plus className="h-4 w-4" />
                      Değer ekle
                    </ExactButton>
                  </div>

                  <div className="space-y-2">
                    {group.values.map((value, valueIndex) => (
                      <div
                        key={value.id}
                        className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-[14px] border border-border-subtle bg-surface-secondary p-2"
                      >
                        {group.displayType === "color" ? (
                          <input
                            type="color"
                            value={value.color || "#111111"}
                            onChange={(event) => patchValue(group.id, value.id, { color: event.target.value })}
                            className="h-10 w-11 rounded-[10px] border-0 bg-transparent p-0"
                            aria-label={`${value.label || "Renk"} renk değeri`}
                          />
                        ) : (
                          <span className="ruth-type-code flex h-10 w-10 items-center justify-center rounded-[10px] bg-surface-primary font-semibold tabular-nums text-subtle">
                            {String(valueIndex + 1).padStart(2, "0")}
                          </span>
                        )}

                        <input
                          value={value.label}
                          onChange={(event) => patchValue(group.id, value.id, { label: event.target.value })}
                          className={`${exactFormInputClass} h-10`}
                          placeholder="Seçenek değeri"
                        />

                        <div className="flex items-center">
                          <ExactIconButton
                            icon={ArrowUp}
                            label="Yukarı taşı"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => moveValue(group.id, valueIndex, -1)}
                            disabled={valueIndex === 0}
                          />
                          <ExactIconButton
                            icon={ArrowDown}
                            label="Aşağı taşı"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => moveValue(group.id, valueIndex, 1)}
                            disabled={valueIndex === group.values.length - 1}
                          />
                          <ExactIconButton
                            icon={Trash2}
                            label="Değeri sil"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => removeValue(group.id, value.id)}
                          />
                        </div>
                      </div>
                    ))}
                    {!group.values.length ? (
                      <ExactEmptyState
                        compact
                        title="Henüz değer yok"
                        description="Bu seçenek grubuna en az bir değer ekle."
                        action={
                          <ExactButton type="button" variant="secondary" size="sm" onClick={() => addValue(group.id)}>
                            <Plus className="h-4 w-4" /> Değer ekle
                          </ExactButton>
                        }
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            </ExactDataCard>
          ))}
        </div>
      ) : (
        <ExactEmptyState
          title="Ürün seçeneği yok"
          description="İlk seçenek grubunu oluştur."
          action={<ExactButton onClick={addGroup}><Plus className="h-4 w-4" /> Seçenek ekle</ExactButton>}
        />
      )}

      {!loading ? (
        <div className="mt-4 flex justify-center">
          <ExactButton type="button" variant="secondary" onClick={addGroup}>
            <Plus className="h-4 w-4" />
            Yeni seçenek grubu
          </ExactButton>
        </div>
      ) : null}
    </div>
  );
}
