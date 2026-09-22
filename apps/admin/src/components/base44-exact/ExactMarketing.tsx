"use client";

import {
  Activity,
  BadgePercent,
  Mail,
  Megaphone,
  MoreVertical,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Ticket,
  Trash2,
} from "lucide-react";
import { ConfirmDialog, useSaveLifecycle, useSaveLifecycleSource } from "@ruth-commerce/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminRequest } from "@/lib/adminApi";
import {
  defaultDiscountCampaignSettings,
  makeCampaignRule,
  makeCouponRule,
  makeDiscountRule,
  normalizeDiscountCampaignSettings,
  type CampaignRule,
  type CouponCodeRule,
  type DiscountCampaignSettings,
  type DiscountRule,
  type DiscountTargetType,
} from "@/lib/discountCampaignSettings";
import {
  ExactButton,
  ExactDetailDrawer,
  ExactField,
  ExactIconButton,
  ExactPageHeader,
  ExactSearchInput,
  ExactSegmentedControl,
  ExactSkeleton,
  ExactStatusBadge,
  exactFormInputClass,
  useExactToast,
} from "./primitives";
import {
  ExactDataCard,
  ExactEmptyState,
  ExactMetricCard,
} from "./data";

type Mode = "discounts" | "coupons" | "campaigns";
type Group = {
  id: string;
  name: string;
  slug: string;
};
type ProductOption = {
  id: string;
  name: string;
  slug: string;
  price: number;
  main_image_url?: string | null;
  status?: string | null;
};
type TargetOption = Group | ProductOption;
type Catalog = {
  collections: Group[];
  categories: Group[];
  products: ProductOption[];
};
type AnyRule = DiscountRule | CouponCodeRule | CampaignRule;

function money(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function ruleName(rule: AnyRule) {
  return "code" in rule && rule.code ? `${rule.name} · ${rule.code}` : rule.name;
}

function benefit(rule: AnyRule) {
  if ("benefitType" in rule) {
    if (rule.benefitType === "free_shipping") return "Ücretsiz kargo";
    return rule.benefitType === "percent" ? `%${rule.value}` : money(rule.value);
  }
  return rule.discountType === "percent" ? `%${rule.value}` : money(rule.value);
}

function targetSource(type: DiscountTargetType, catalog: Catalog): TargetOption[] {
  if (type === "collection") return catalog.collections;
  if (type === "category") return catalog.categories;
  if (type === "product") return catalog.products;
  return [];
}

function targetImage(item: TargetOption): string | null {
  const value = (item as ProductOption).main_image_url;
  return typeof value === "string" && value.trim() ? value : null;
}

function targetLabel(type: DiscountTargetType) {
  if (type === "collection") return "Koleksiyon";
  if (type === "category") return "Kategori";
  if (type === "product") return "Ürün";
  return "Tüm site";
}

function settingsFingerprint(value: DiscountCampaignSettings) {
  return JSON.stringify(normalizeDiscountCampaignSettings(value));
}

export function ExactMarketing() {
  const toast = useExactToast();
  const { save: saveLifecycle, requestTransition, saving } = useSaveLifecycle();
  const [mode, setMode] = useState<Mode>("discounts");
  const [settings, setSettings] = useState<DiscountCampaignSettings>(defaultDiscountCampaignSettings);
  const [savedSettings, setSavedSettings] = useState<DiscountCampaignSettings>(defaultDiscountCampaignSettings);
  const [catalog, setCatalog] = useState<Catalog>({
    collections: [],
    categories: [],
    products: [],
  });
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [targetSearch, setTargetSearch] = useState("");
  const [pendingDeleteRule, setPendingDeleteRule] = useState<{ id: string; name: string } | null>(null);

  const dirty = settingsFingerprint(settings) !== settingsFingerprint(savedSettings);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsResult, productsResult] = await Promise.all([
        adminRequest<{ settings?: unknown }>("/api/discount-campaigns", {
          force: true,
          ttlMs: 0,
          staleMs: 0,
        }),
        adminRequest<{
          products?: ProductOption[];
          collections?: Group[];
          categories?: Group[];
        }>("/api/products", {
          force: true,
          ttlMs: 0,
          staleMs: 0,
        }),
      ]);

      const nextSettings = normalizeDiscountCampaignSettings(settingsResult.settings);
      setSettings(nextSettings);
      setSavedSettings(nextSettings);
      setCatalog({
        collections: productsResult.collections || [],
        categories: productsResult.categories || [],
        products: (productsResult.products || []).filter((product) => product.status !== "inactive"),
      });
      setSelectedId(null);
      setTargetSearch("");
      setPendingDeleteRule(null);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Kampanya ayarları alınamadı.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const validateSettings = useCallback(() => {
    const invalid = [...settings.discounts, ...settings.coupons].find(
      (item) => item.targetType !== "all" && item.targetIds.length === 0,
    );
    if (invalid) {
      toast.error(
        `${invalid.name || "Kural"} için en az bir ${targetLabel(invalid.targetType).toLocaleLowerCase("tr-TR")} seç.`,
      );
      return false;
    }
    return true;
  }, [settings.coupons, settings.discounts, toast]);

  const persistSettings = useCallback(async () => {
    try {
      const result = await adminRequest<{ settings?: unknown }>("/api/discount-campaigns", {
        method: "PUT",
        body: JSON.stringify({ settings }),
      });
      const nextSettings = normalizeDiscountCampaignSettings(result.settings || settings);
      setSettings(nextSettings);
      setSavedSettings(nextSettings);
      toast.success("İndirim, kupon ve kampanya kuralları kaydedildi.");
      return true;
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Kampanya ayarları kaydedilemedi.");
      return false;
    }
  }, [settings, toast]);

  const discardSettings = useCallback(() => {
    setSettings(savedSettings);
    setSelectedId(null);
    setTargetSearch("");
    setPendingDeleteRule(null);
  }, [savedSettings]);

  useSaveLifecycleSource({
    id: "marketing-rules-editor",
    dirty,
    validate: validateSettings,
    save: persistSettings,
    discard: discardSettings,
  });

  const requestRefresh = () => {
    if (loading || saving) return;
    void requestTransition(load);
  };

  const stats = useMemo(
    () => ({
      discounts: settings.discounts.filter((item) => item.enabled).length,
      coupons: settings.coupons.filter((item) => item.enabled).length,
      campaigns: settings.campaigns.filter((item) => item.enabled).length,
      total: settings.discounts.length + settings.coupons.length + settings.campaigns.length,
    }),
    [settings],
  );

  const rules: AnyRule[] =
    mode === "discounts"
      ? settings.discounts
      : mode === "coupons"
        ? settings.coupons
        : settings.campaigns;
  const selected = rules.find((rule) => rule.id === selectedId) || null;

  const setRules = (next: AnyRule[]) => {
    setSettings((current) => {
      if (mode === "discounts") return { ...current, discounts: next as DiscountRule[] };
      if (mode === "coupons") return { ...current, coupons: next as CouponCodeRule[] };
      return { ...current, campaigns: next as CampaignRule[] };
    });
  };

  const patchRule = (patch: Record<string, unknown>) => {
    if (!selected) return;
    setRules(
      rules.map((rule) =>
        rule.id === selected.id ? ({ ...rule, ...patch } as AnyRule) : rule,
      ),
    );
  };

  const addRule = () => {
    const next =
      mode === "discounts"
        ? makeDiscountRule()
        : mode === "coupons"
          ? makeCouponRule()
          : makeCampaignRule();
    setRules([next as AnyRule, ...rules]);
    setSelectedId(next.id);
  };

  const removeRule = (id: string) => {
    setRules(rules.filter((rule) => rule.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const requestRuleDelete = (rule: AnyRule) => {
    setPendingDeleteRule({ id: rule.id, name: ruleName(rule) });
  };

  const toggleRule = (rule: AnyRule) => {
    setRules(
      rules.map((item) =>
        item.id === rule.id ? ({ ...item, enabled: !item.enabled } as AnyRule) : item,
      ),
    );
  };

  const targetItems: TargetOption[] =
    selected && "targetType" in selected
      ? targetSource(selected.targetType, catalog)
          .filter((item) => {
            const needle = targetSearch.toLocaleLowerCase("tr-TR");
            return !needle || `${item.name} ${item.slug}`.toLocaleLowerCase("tr-TR").includes(needle);
          })
          .slice(0, 80)
      : [];

  return (
    <div className="space-y-4 animate-fade-in" data-exact-base44-page="marketing">
      <ExactPageHeader
        title="Pazarlama"
        subtitle="İndirimler, kuponlar ve otomasyon kuralları"
        actions={
          <>
            <ExactIconButton
              icon={RefreshCw}
              label="Yenile"
              variant="secondary"
              onClick={requestRefresh}
              loading={loading}
              disabled={saving}
            />
            <ExactButton size="sm" onClick={() => void saveLifecycle()} loading={saving} disabled={loading}>
              <Save className="h-4 w-4" /> Tümünü kaydet
            </ExactButton>
            <ExactButton size="sm" onClick={addRule} disabled={loading || saving}>
              <Plus className="h-4 w-4" /> Yeni kural
            </ExactButton>
          </>
        }
      />

      <ExactSegmentedControl
        value={mode}
        onChange={(value) => {
          setMode(value as Mode);
          setSelectedId(null);
        }}
        options={[
          { value: "discounts", label: "İndirimler", icon: BadgePercent },
          { value: "coupons", label: "Kuponlar", icon: Ticket },
          { value: "campaigns", label: "Kampanyalar", icon: Sparkles },
        ]}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <ExactMetricCard label="Aktif İndirim" value={stats.discounts} icon={BadgePercent} />
        <ExactMetricCard label="Aktif Kupon" value={stats.coupons} icon={Ticket} />
        <ExactMetricCard label="Aktif Kampanya" value={stats.campaigns} icon={Sparkles} />
        <ExactMetricCard label="Toplam Kural" value={stats.total} icon={Activity} />
      </div>

      {loading ? (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          <ExactSkeleton className="h-48" />
          <ExactSkeleton className="h-48" />
          <ExactSkeleton className="h-48" />
        </div>
      ) : rules.length === 0 ? (
        <ExactDataCard>
          <ExactEmptyState
            icon={mode === "campaigns" ? Megaphone : mode === "coupons" ? Ticket : BadgePercent}
            title="Henüz kural yok"
            action={<ExactButton size="sm" onClick={addRule}>İlk kuralı oluştur</ExactButton>}
          />
        </ExactDataCard>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {rules.map((rule) => (
            <ExactDataCard
              key={rule.id}
              noPadding
              className="group hover:shadow-floating transition-all"
            >
              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center h-8 w-8 radius-small bg-accent-soft text-accent">
                      {mode === "campaigns" ? (
                        <Megaphone className="h-4 w-4" />
                      ) : mode === "coupons" ? (
                        <Mail className="h-4 w-4" />
                      ) : (
                        <BadgePercent className="h-4 w-4" />
                      )}
                    </div>
                    <ExactStatusBadge
                      status={rule.enabled ? "active" : "archived"}
                      label={rule.enabled ? "Aktif" : "Pasif"}
                      size="sm"
                    />
                  </div>
                  <ExactIconButton
                    icon={MoreVertical}
                    label="Düzenle"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setSelectedId(rule.id)}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedId(rule.id)}
                  className="text-left w-full"
                >
                  <p className="text-sm font-semibold text-main mb-3">{ruleName(rule)}</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-[10px] text-subtle uppercase">Avantaj</p>
                      <p className="text-sm font-bold text-main">{benefit(rule)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-subtle uppercase">Hedef</p>
                      <p className="text-xs font-bold text-main truncate">
                        {"targetType" in rule ? targetLabel(rule.targetType) : "Segment"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-subtle uppercase">Kod</p>
                      <p className="text-xs font-bold text-main truncate">
                        {"code" in rule
                          ? rule.code
                          : "couponCode" in rule
                            ? rule.couponCode || "—"
                            : "—"}
                      </p>
                    </div>
                  </div>
                </button>
              </div>

              <div className="px-4 py-2.5 border-t border-border-subtle bg-surface-secondary flex items-center gap-2">
                <ExactButton
                  variant={rule.enabled ? "secondary" : "primary"}
                  size="sm"
                  className="flex-1"
                  onClick={() => toggleRule(rule)}
                >
                  {rule.enabled ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                  {rule.enabled ? "Durdur" : "Aktifleştir"}
                </ExactButton>
                <ExactIconButton
                  icon={Trash2}
                  label="Sil"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => requestRuleDelete(rule)}
                />
              </div>
            </ExactDataCard>
          ))}
        </div>
      )}

      <ExactDetailDrawer
        open={Boolean(selected)}
        onClose={() => setSelectedId(null)}
        title={selected ? ruleName(selected) : "Kural"}
        subtitle={
          mode === "discounts"
            ? "İndirim kuralı"
            : mode === "coupons"
              ? "Kupon kodu"
              : "Müşteri kampanyası"
        }
        width={720}
        footer={
          selected ? (
            <div className="flex gap-2">
              <ExactButton
                variant="destructive"
                size="sm"
                onClick={() => requestRuleDelete(selected)}
              >
                <Trash2 className="h-4 w-4" /> Sil
              </ExactButton>
              <ExactButton
                variant="secondary"
                size="sm"
                className="ml-auto"
                onClick={() => setSelectedId(null)}
              >
                Kapat
              </ExactButton>
              <ExactButton size="sm" onClick={() => void saveLifecycle()} loading={saving}>
                <Save className="h-4 w-4" /> Kaydet
              </ExactButton>
            </div>
          ) : null
        }
      >
        {selected ? (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <ExactField label="Kural adı">
                <input
                  value={selected.name}
                  onChange={(event) => patchRule({ name: event.target.value })}
                  className={exactFormInputClass}
                />
              </ExactField>

              {"code" in selected ? (
                <ExactField label="Kupon kodu">
                  <input
                    value={selected.code}
                    onChange={(event) =>
                      patchRule({
                        code: event.target.value.toLocaleUpperCase("tr-TR").replace(/\s+/g, ""),
                      })
                    }
                    className={exactFormInputClass}
                  />
                </ExactField>
              ) : "couponCode" in selected ? (
                <ExactField label="Kupon kodu">
                  <input
                    value={selected.couponCode}
                    onChange={(event) =>
                      patchRule({
                        couponCode: event.target.value
                          .toLocaleUpperCase("tr-TR")
                          .replace(/\s+/g, ""),
                      })
                    }
                    className={exactFormInputClass}
                  />
                </ExactField>
              ) : null}
            </div>

            {"benefitType" in selected ? (
              <div className="grid sm:grid-cols-3 gap-3">
                <ExactField label="Kitle">
                  <select
                    value={selected.audience}
                    onChange={(event) =>
                      patchRule({ audience: event.target.value as CampaignRule["audience"] })
                    }
                    className={exactFormInputClass}
                  >
                    <option value="new_member">Yeni üyeler</option>
                    <option value="all_members">Tüm üyeler</option>
                    <option value="first_order">İlk sipariş</option>
                    <option value="cart_value">Sepet tutarı</option>
                  </select>
                </ExactField>
                <ExactField label="Avantaj">
                  <select
                    value={selected.benefitType}
                    onChange={(event) =>
                      patchRule({ benefitType: event.target.value as CampaignRule["benefitType"] })
                    }
                    className={exactFormInputClass}
                  >
                    <option value="percent">Yüzde</option>
                    <option value="amount">Tutar</option>
                    <option value="free_shipping">Ücretsiz kargo</option>
                  </select>
                </ExactField>
                <ExactField label="Değer">
                  <input
                    type="number"
                    value={selected.value}
                    onChange={(event) => patchRule({ value: Number(event.target.value) })}
                    className={exactFormInputClass}
                    disabled={selected.benefitType === "free_shipping"}
                  />
                </ExactField>
                <ExactField label="Minimum sepet">
                  <input
                    type="number"
                    value={selected.minOrderAmount}
                    onChange={(event) => patchRule({ minOrderAmount: Number(event.target.value) })}
                    className={exactFormInputClass}
                  />
                </ExactField>
                <ExactField label="Başlangıç">
                  <input
                    type="datetime-local"
                    value={selected.startsAt}
                    onChange={(event) => patchRule({ startsAt: event.target.value })}
                    className={exactFormInputClass}
                  />
                </ExactField>
                <ExactField label="Bitiş">
                  <input
                    type="datetime-local"
                    value={selected.endsAt}
                    onChange={(event) => patchRule({ endsAt: event.target.value })}
                    className={exactFormInputClass}
                  />
                </ExactField>
                <div className="sm:col-span-3">
                  <ExactField label="Açıklama">
                    <textarea
                      value={selected.description}
                      onChange={(event) => patchRule({ description: event.target.value })}
                      className={`${exactFormInputClass} min-h-24`}
                    />
                  </ExactField>
                </div>
              </div>
            ) : (
              <>
                <div className="grid sm:grid-cols-3 gap-3">
                  <ExactField label="İndirim tipi">
                    <select
                      value={selected.discountType}
                      onChange={(event) =>
                        patchRule({
                          discountType: event.target.value as DiscountRule["discountType"],
                        })
                      }
                      className={exactFormInputClass}
                    >
                      <option value="percent">Yüzde</option>
                      <option value="amount">Tutar</option>
                    </select>
                  </ExactField>
                  <ExactField label="Değer">
                    <input
                      type="number"
                      value={selected.value}
                      onChange={(event) => patchRule({ value: Number(event.target.value) })}
                      className={exactFormInputClass}
                    />
                  </ExactField>
                  {"minOrderAmount" in selected ? (
                    <ExactField label="Minimum sepet">
                      <input
                        type="number"
                        value={selected.minOrderAmount}
                        onChange={(event) =>
                          patchRule({ minOrderAmount: Number(event.target.value) })
                        }
                        className={exactFormInputClass}
                      />
                    </ExactField>
                  ) : (
                    <div />
                  )}
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <ExactField label="Başlangıç">
                    <input
                      type="datetime-local"
                      value={selected.startsAt}
                      onChange={(event) => patchRule({ startsAt: event.target.value })}
                      className={exactFormInputClass}
                    />
                  </ExactField>
                  <ExactField label="Bitiş">
                    <input
                      type="datetime-local"
                      value={selected.endsAt}
                      onChange={(event) => patchRule({ endsAt: event.target.value })}
                      className={exactFormInputClass}
                    />
                  </ExactField>
                </div>

                <ExactField label="Uygulama hedefi">
                  <select
                    value={selected.targetType}
                    onChange={(event) =>
                      patchRule({
                        targetType: event.target.value as DiscountTargetType,
                        targetIds: [],
                      })
                    }
                    className={exactFormInputClass}
                  >
                    <option value="all">Tüm site</option>
                    <option value="collection">Koleksiyon</option>
                    <option value="category">Kategori</option>
                    <option value="product">Ürün</option>
                  </select>
                </ExactField>

                {selected.targetType !== "all" ? (
                  <div>
                    <ExactSearchInput
                      value={targetSearch}
                      onChange={setTargetSearch}
                      placeholder={`${targetLabel(selected.targetType)} ara...`}
                    />
                    <div className="grid sm:grid-cols-2 gap-2 mt-2 max-h-72 overflow-y-auto">
                      {targetItems.map((item) => {
                        const imageUrl = targetImage(item);
                        const checked = selected.targetIds.includes(item.id);
                        return (
                          <label
                            key={item.id}
                            className={`flex items-center gap-2 p-2.5 radius-small border cursor-pointer transition-all ${checked ? "border-accent bg-accent-soft" : "border-border-subtle bg-surface-secondary"}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                patchRule({
                                  targetIds: checked
                                    ? selected.targetIds.filter((id) => id !== item.id)
                                    : [...selected.targetIds, item.id],
                                })
                              }
                            />
                            {imageUrl ? (
                              <img
                                src={imageUrl}
                                alt=""
                                className="h-9 w-8 object-cover radius-small"
                              />
                            ) : null}
                            <span className="text-xs font-medium text-main truncate">
                              {item.name}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <ExactField label="Not">
                  <textarea
                    value={selected.note}
                    onChange={(event) => patchRule({ note: event.target.value })}
                    className={`${exactFormInputClass} min-h-20`}
                  />
                </ExactField>
              </>
            )}

            <label className="flex items-center justify-between gap-3 p-3 radius-small bg-surface-secondary">
              <div>
                <p className="text-sm font-medium text-main">Kural aktif</p>
                <p className="text-[10px] text-muted">
                  Storefront ve checkout hesaplamasına dahil edilir.
                </p>
              </div>
              <button
                type="button"
                onClick={() => patchRule({ enabled: !selected.enabled })}
                className="relative flex h-11 w-11 items-center justify-center md:h-8 md:w-12"
                aria-pressed={selected.enabled}
                aria-label={selected.enabled ? "Kuralı durdur" : "Kuralı aktifleştir"}
              >
                <span className={`relative h-6 w-10 rounded-full transition-all ${selected.enabled ? "bg-accent" : "bg-surface-tertiary"}`}>
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${selected.enabled ? "translate-x-4" : ""}`}
                  />
                </span>
              </button>
            </label>
          </div>
        ) : null}
      </ExactDetailDrawer>

      <ConfirmDialog
        open={Boolean(pendingDeleteRule)}
        title="Pazarlama kuralını sil"
        description={pendingDeleteRule ? `${pendingDeleteRule.name} taslaktan kaldırılacak. Değişiklik kalıcı olarak “Tümünü kaydet” veya “Kaydet” ile uygulanır.` : undefined}
        confirmLabel="Kuralı sil"
        cancelLabel="Vazgeç"
        tone="danger"
        onClose={() => setPendingDeleteRule(null)}
        onConfirm={() => {
          if (!pendingDeleteRule) return;
          removeRule(pendingDeleteRule.id);
          setPendingDeleteRule(null);
        }}
      />
    </div>
  );
}
