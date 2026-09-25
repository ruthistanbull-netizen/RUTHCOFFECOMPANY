"use client";

import { Palette, RefreshCw, Type } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { adminRequest } from "@/lib/adminApi";
import {
  ExactButton,
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

type Payload = {
  ok: boolean;
  definitions?: ProductOptionDefinition[];
  updatedAt?: string | null;
  warning?: string | null;
  source?: string;
};

function cloneDefinitions(value: ProductOptionDefinition[]) {
  return value.map((group) => ({
    ...group,
    values: group.values.map((item) => ({ ...item })),
  }));
}

export function ExactProductOptions() {
  const [definitions, setDefinitions] = useState<ProductOptionDefinition[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState("[]");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [message, setMessage] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const dirty = useMemo(
    () => JSON.stringify(definitions) !== savedSnapshot,
    [definitions, savedSnapshot],
  );

  const load = async (hardRefresh = false) => {
    setLoading(true);
    setMessage("");
    try {
      const payload = await adminRequest<Payload>("/api/product-settings/options", {
        hardRefresh,
        ttlMs: hardRefresh ? 0 : 15_000,
        staleMs: 60_000,
      });
      const next = cloneDefinitions(payload.definitions || []);
      setDefinitions(next);
      setSavedSnapshot(JSON.stringify(next));
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
    if (!definitions.length || !dirty) return;
    setSaving(true);
    setSavedFlash(false);
    setMessage("");
    try {
      const payload = await adminRequest<Payload>("/api/product-settings/options", {
        method: "PUT",
        body: JSON.stringify({ definitions }),
        invalidate: ["/api/product-settings/options"],
      });
      const next = cloneDefinitions(payload.definitions || definitions);
      setDefinitions(next);
      setSavedSnapshot(JSON.stringify(next));
      setUpdatedAt(payload.updatedAt || new Date().toISOString());
      setMessage(payload.warning || "Seçenek görünümü kaydedildi.");
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1500);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ürün seçenekleri kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  const patchGroup = (groupId: string, patch: Partial<ProductOptionDefinition>) => {
    setDefinitions((current) =>
      current.map((group) => group.id === groupId ? { ...group, ...patch } : group),
    );
  };

  const patchValue = (
    groupId: string,
    valueId: string,
    patch: Partial<ProductOptionValue>,
  ) => {
    setDefinitions((current) =>
      current.map((group) => {
        if (group.id !== groupId) return group;
        return {
          ...group,
          values: group.values.map((value) =>
            value.id === valueId ? { ...value, ...patch } : value,
          ),
        };
      }),
    );
  };

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-4 md:px-6 md:py-6">
      <ExactPageHeader
        title="Ürün Seçenekleri"
        subtitle="Sistemdeki gerçek ürün varyantlarında kullanılan seçenekleri sade biçimde yönet."
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
          Burada yalnızca ürünlerde gerçekten kullanılan seçenek grupları ve değerleri görünür.
        </p>
        <p className="ruth-type-caption mt-1 text-muted">
          Yeni varyant oluşturma veya varyant silme işlemi ürün düzenleme ekranından yapılır. Buradan görünen adları ve gösterim biçimini düzenleyebilirsin.
          {updatedAt ? ` Son kayıt: ${new Date(updatedAt).toLocaleString("tr-TR")}.` : ""}
        </p>
        {message ? <p className="ruth-type-caption mt-2 font-medium text-accent">{message}</p> : null}
      </div>

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-48 animate-pulse rounded-[20px] bg-surface-secondary" />
          ))}
        </div>
      ) : definitions.length ? (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {definitions.map((group) => (
            <section
              key={group.id}
              className="rounded-[20px] border border-border-subtle bg-surface-primary p-4 shadow-card"
            >
              <div className="mb-4 flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-accent-soft text-accent">
                  {group.displayType === "color"
                    ? <Palette className="h-4 w-4" />
                    : <Type className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <label className="ruth-type-label mb-1.5 block text-subtle">Seçenek adı</label>
                  <input
                    value={group.name}
                    onChange={(event) => patchGroup(group.id, { name: event.target.value })}
                    className={exactFormInputClass}
                    placeholder="Seçenek adı"
                  />
                </div>
                <label className="w-[132px] shrink-0">
                  <span className="ruth-type-label mb-1.5 block text-subtle">Gösterim</span>
                  <select
                    value={group.displayType}
                    onChange={(event) => {
                      const displayType = event.target.value === "color" ? "color" : "list";
                      patchGroup(group.id, { displayType });
                    }}
                    className={exactFormInputClass}
                  >
                    <option value="list">Liste</option>
                    <option value="color">Renk</option>
                  </select>
                </label>
              </div>

              <div className="mb-2 flex items-center justify-between">
                <span className="ruth-type-card-title text-main">Gerçek değerler</span>
                <span className="ruth-type-caption rounded-full bg-surface-tertiary px-2 py-1 text-subtle">
                  {group.values.length}
                </span>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {group.values.map((value) => (
                  <label
                    key={value.id}
                    className="flex items-center gap-2 rounded-[12px] border border-border-subtle bg-surface-secondary p-2"
                  >
                    {group.displayType === "color" ? (
                      <input
                        type="color"
                        value={value.color || "#111111"}
                        onChange={(event) => patchValue(group.id, value.id, { color: event.target.value })}
                        className="h-8 w-8 shrink-0 cursor-pointer rounded-[9px] border-0 bg-transparent p-0"
                        aria-label={`${value.label || "Renk"} renk değeri`}
                      />
                    ) : null}
                    <input
                      value={value.label}
                      onChange={(event) => patchValue(group.id, value.id, { label: event.target.value })}
                      className="min-w-0 flex-1 border-0 bg-transparent px-1 py-1.5 text-sm text-main outline-none placeholder:text-subtle"
                      placeholder="Değer"
                    />
                  </label>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="rounded-[20px] border border-dashed border-border-strong bg-surface-secondary px-5 py-12 text-center">
          <Type className="mx-auto h-6 w-6 text-subtle" />
          <h2 className="mt-3 text-base font-semibold text-main">Gerçek varyant seçeneği bulunamadı</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            Bir ürüne varyant ve seçenek eklediğinde burada otomatik olarak görünür.
          </p>
        </div>
      )}
    </div>
  );
}
