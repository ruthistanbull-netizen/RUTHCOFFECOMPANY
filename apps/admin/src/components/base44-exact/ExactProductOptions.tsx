"use client";

import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { adminRequest } from "@/lib/adminApi";
import {
  ExactButton,
  ExactIconButton,
  ExactPageHeader,
  exactFormInputClass,
} from "./primitives";

type FieldKey = "material" | "finish_color" | "size_usage" | "care_advice";

type FieldOption = {
  id: string;
  label: string;
  value: string;
  originalValue?: string;
};

type FieldGroup = {
  field: FieldKey;
  title: string;
  template: boolean;
  options: FieldOption[];
};

type MainOptionValue = {
  id: string;
  label: string;
  color?: string;
};

type MainOptionGroup = {
  id: string;
  name: string;
  displayType: "list" | "color";
  values: MainOptionValue[];
};

type Payload = {
  ok: boolean;
  groups?: FieldGroup[];
  mainGroups?: MainOptionGroup[];
  updatedAt?: string | null;
  warning?: string | null;
};

function makeId(prefix: string) {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
  return `${prefix}-${random}`;
}

function cloneGroups(value: FieldGroup[]) {
  return value.map((group) => ({
    ...group,
    options: group.options.map((option) => ({ ...option })),
  }));
}

function cloneMainGroups(value: MainOptionGroup[]) {
  return value.map((group) => ({
    ...group,
    values: group.values.map((option) => ({ ...option })),
  }));
}

export function ExactProductOptions() {
  const [groups, setGroups] = useState<FieldGroup[]>([]);
  const [mainGroups, setMainGroups] = useState<MainOptionGroup[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState("{}");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [message, setMessage] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const dirty = useMemo(
    () => JSON.stringify({ groups, mainGroups }) !== savedSnapshot,
    [groups, mainGroups, savedSnapshot],
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
      const next = cloneGroups(payload.groups || []);
      const nextMainGroups = cloneMainGroups(payload.mainGroups || []);
      setGroups(next);
      setMainGroups(nextMainGroups);
      setSavedSnapshot(JSON.stringify({ groups: next, mainGroups: nextMainGroups }));
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
    if (!dirty || !groups.length) return;
    setSaving(true);
    setSavedFlash(false);
    setMessage("");
    try {
      const payload = await adminRequest<Payload>("/api/product-settings/options", {
        method: "PUT",
        body: JSON.stringify({ groups, mainGroups }),
        invalidate: ["/api/product-settings/options", "/api/products?q="],
      });
      const next = cloneGroups(payload.groups || groups);
      const nextMainGroups = cloneMainGroups(payload.mainGroups || mainGroups);
      setGroups(next);
      setMainGroups(nextMainGroups);
      setSavedSnapshot(JSON.stringify({ groups: next, mainGroups: nextMainGroups }));
      setUpdatedAt(payload.updatedAt || new Date().toISOString());
      setMessage(payload.warning || "Ürün seçenekleri kaydedildi.");
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1500);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ürün seçenekleri kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  const patchOption = (
    field: FieldKey,
    optionId: string,
    patch: Partial<FieldOption>,
  ) => {
    setGroups((current) =>
      current.map((group) =>
        group.field !== field
          ? group
          : {
              ...group,
              options: group.options.map((option) =>
                option.id === optionId ? { ...option, ...patch } : option,
              ),
            },
      ),
    );
  };

  const addOption = (group: FieldGroup) => {
    setGroups((current) =>
      current.map((item) =>
        item.field !== group.field
          ? item
          : {
              ...item,
              options: [
                ...item.options,
                {
                  id: makeId(group.field),
                  label: "Yeni seçenek",
                  value: group.template ? "Yeni şablon metni" : "Yeni seçenek",
                  originalValue: "",
                },
              ],
            },
      ),
    );
  };

  const removeOption = (field: FieldKey, optionId: string) => {
    setGroups((current) =>
      current.map((group) =>
        group.field !== field
          ? group
          : {
              ...group,
              options: group.options.filter((option) => option.id !== optionId),
            },
      ),
    );
  };

  const addMainGroup = () => {
    setMainGroups((current) => [
      ...current,
      {
        id: makeId("main-group"),
        name: "Yeni ana seçenek",
        displayType: "list",
        values: [{ id: makeId("main-value"), label: "Yeni seçenek" }],
      },
    ]);
  };

  const patchMainGroup = (groupId: string, patch: Partial<MainOptionGroup>) => {
    setMainGroups((current) =>
      current.map((group) => group.id === groupId ? { ...group, ...patch } : group),
    );
  };

  const removeMainGroup = (groupId: string) => {
    const group = mainGroups.find((item) => item.id === groupId);
    if (!group) return;
    if (!window.confirm(`"${group.name}" ana seçeneğini kütüphaneden kaldırmak istiyor musun? Mevcut ürünlerdeki seçenekler silinmez.`)) return;
    setMainGroups((current) => current.filter((item) => item.id !== groupId));
  };

  const addMainValue = (groupId: string) => {
    setMainGroups((current) =>
      current.map((group) => group.id !== groupId
        ? group
        : {
            ...group,
            values: [
              ...group.values,
              {
                id: makeId("main-value"),
                label: "Yeni seçenek",
                ...(group.displayType === "color" ? { color: "#111111" } : {}),
              },
            ],
          }),
    );
  };

  const patchMainValue = (
    groupId: string,
    valueId: string,
    patch: Partial<MainOptionValue>,
  ) => {
    setMainGroups((current) =>
      current.map((group) => group.id !== groupId
        ? group
        : {
            ...group,
            values: group.values.map((value) =>
              value.id === valueId ? { ...value, ...patch } : value,
            ),
          }),
    );
  };

  const removeMainValue = (groupId: string, valueId: string) => {
    setMainGroups((current) =>
      current.map((group) => group.id !== groupId
        ? group
        : {
            ...group,
            values: group.values.filter((value) => value.id !== valueId),
          }),
    );
  };

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 py-4 md:px-6 md:py-6">
      <ExactPageHeader
        title="Ürün Seçenekleri"
        subtitle="Ürün oluşturma ve düzenleme ekranındaki sabit seçim listelerini buradan yönet."
        actions={
          <>
            <ExactButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={addMainGroup}
              disabled={loading || saving}
            >
              <Plus className="h-4 w-4" />
              Ana seçenek ekle
            </ExactButton>
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
              disabled={!dirty || !groups.length}
            >
              Kaydet
            </ExactButton>
          </>
        }
      />

      <div className="mb-4 rounded-[16px] border border-border-subtle bg-surface-secondary px-4 py-3">
        <p className="ruth-type-body text-main">
          Ana seçenek gruplarını ve ürün formundaki sabit seçim listelerini buradan yönetebilirsin.
        </p>
        <p className="ruth-type-caption mt-1 text-muted">
          Ana seçenek ekleyebilir, silebilir ve alt seçeneklerini düzenleyebilirsin. Buradan silinen ana seçenek mevcut ürünlerdeki kayıtlı varyantları otomatik silmez.
          {updatedAt ? ` Son kayıt: ${new Date(updatedAt).toLocaleString("tr-TR")}.` : ""}
        </p>
        {message ? <p className="ruth-type-caption mt-2 font-medium text-accent">{message}</p> : null}
      </div>

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-64 animate-pulse rounded-[20px] bg-surface-secondary" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <section className="rounded-[20px] border border-border-subtle bg-surface-primary p-4 shadow-card">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-main">Ana Seçenekler</h2>
                <p className="ruth-type-caption mt-1 text-subtle">
                  Renk, beden, gramaj, öğütme gibi ana seçenek gruplarını ve değerlerini yönet.
                </p>
              </div>
              <span className="ruth-type-caption rounded-full bg-surface-tertiary px-2 py-1 text-subtle">
                {mainGroups.length} grup
              </span>
            </div>

            {mainGroups.length ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {mainGroups.map((group) => (
                  <div
                    key={group.id}
                    className="rounded-[16px] border border-border-subtle bg-surface-secondary p-3"
                  >
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px_auto]">
                      <label>
                        <span className="ruth-type-label mb-1.5 block text-subtle">Ana seçenek adı</span>
                        <input
                          value={group.name}
                          onChange={(event) => patchMainGroup(group.id, { name: event.target.value })}
                          className={exactFormInputClass}
                          placeholder="Örn. Renk, Beden, Gramaj"
                        />
                      </label>
                      <label>
                        <span className="ruth-type-label mb-1.5 block text-subtle">Gösterim</span>
                        <select
                          value={group.displayType}
                          onChange={(event) =>
                            patchMainGroup(group.id, {
                              displayType: event.target.value === "color" ? "color" : "list",
                            })
                          }
                          className={exactFormInputClass}
                        >
                          <option value="list">İsim olarak</option>
                          <option value="color">Renk olarak</option>
                        </select>
                      </label>
                      <div className="pt-[23px]">
                        <ExactIconButton
                          icon={Trash2}
                          label="Ana seçeneği sil"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => removeMainGroup(group.id)}
                        />
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
                      {group.values.map((value) => (
                        <div key={value.id} className="flex items-center gap-2">
                          {group.displayType === "color" ? (
                            <input
                              type="color"
                              value={value.color || "#111111"}
                              onChange={(event) =>
                                patchMainValue(group.id, value.id, { color: event.target.value })
                              }
                              className="h-10 w-11 shrink-0 cursor-pointer rounded-[10px] border border-border-subtle bg-transparent p-0"
                              aria-label={`${value.label || "Seçenek"} rengi`}
                            />
                          ) : null}
                          <input
                            value={value.label}
                            onChange={(event) =>
                              patchMainValue(group.id, value.id, { label: event.target.value })
                            }
                            className={`${exactFormInputClass} min-w-0 flex-1`}
                            placeholder="Seçenek değeri"
                          />
                          <ExactIconButton
                            icon={Trash2}
                            label="Alt seçeneği sil"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => removeMainValue(group.id, value.id)}
                            disabled={group.values.length <= 1}
                          />
                        </div>
                      ))}
                    </div>

                    <ExactButton
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="mt-3 w-full"
                      onClick={() => addMainValue(group.id)}
                    >
                      <Plus className="h-4 w-4" />
                      Alt seçenek ekle
                    </ExactButton>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-[14px] border border-dashed border-border-subtle bg-surface-secondary p-6 text-center">
                <p className="ruth-type-body font-medium text-main">Henüz ana seçenek yok.</p>
                <p className="ruth-type-caption mt-1 text-muted">
                  Renk, beden, gramaj veya öğütme gibi bir grup ekleyebilirsin.
                </p>
                <ExactButton type="button" size="sm" className="mt-3" onClick={addMainGroup}>
                  <Plus className="h-4 w-4" />
                  Ana seçenek ekle
                </ExactButton>
              </div>
            )}
          </section>

          <div className="grid items-start gap-4 lg:grid-cols-2">
            {groups.map((group) => (
            <section
              key={group.field}
              className="rounded-[20px] border border-border-subtle bg-surface-primary p-4 shadow-card"
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-main">{group.title}</h2>
                  <p className="ruth-type-caption mt-1 text-subtle">
                    {group.template
                      ? "Seçenek adı ürün formunda görünür; şablon metni ürüne kaydedilir."
                      : "Buradaki değerler ürün formundaki açılır listede görünür."}
                  </p>
                </div>
                <span className="ruth-type-caption shrink-0 rounded-full bg-surface-tertiary px-2 py-1 text-subtle">
                  {group.options.length}
                </span>
              </div>

              <div className="space-y-2">
                {group.options.map((option) => (
                  <div
                    key={option.id}
                    className="rounded-[14px] border border-border-subtle bg-surface-secondary p-3"
                  >
                    <div className="flex items-start gap-2">
                      <label className="min-w-0 flex-1">
                        <span className="ruth-type-label mb-1.5 block text-subtle">
                          Seçenek adı
                        </span>
                        <input
                          value={option.label}
                          onChange={(event) => {
                            const label = event.target.value;
                            patchOption(
                              group.field,
                              option.id,
                              group.template ? { label } : { label, value: label },
                            );
                          }}
                          className={exactFormInputClass}
                          placeholder="Seçenek adı"
                        />
                      </label>
                      <div className="pt-[23px]">
                        <ExactIconButton
                          icon={Trash2}
                          label="Seçeneği kaldır"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => removeOption(group.field, option.id)}
                          disabled={group.options.length <= 1}
                        />
                      </div>
                    </div>

                    {group.template ? (
                      <label className="mt-3 block">
                        <span className="ruth-type-label mb-1.5 block text-subtle">
                          Şablon metni
                        </span>
                        <textarea
                          value={option.value}
                          onChange={(event) =>
                            patchOption(group.field, option.id, { value: event.target.value })
                          }
                          className={`${exactFormInputClass} min-h-24 resize-y`}
                          placeholder="Bu seçenek seçildiğinde ürüne kaydedilecek metin"
                        />
                      </label>
                    ) : null}
                  </div>
                ))}
              </div>

              <ExactButton
                type="button"
                variant="secondary"
                size="sm"
                className="mt-3 w-full"
                onClick={() => addOption(group)}
              >
                <Plus className="h-4 w-4" />
                Yeni seçenek ekle
              </ExactButton>
            </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
