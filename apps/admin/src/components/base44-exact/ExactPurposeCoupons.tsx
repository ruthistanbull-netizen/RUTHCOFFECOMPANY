"use client";

import { MessageSquareText, Save, ShoppingBag, Sparkles, Ticket } from "lucide-react";
import {
  SaveLifecycleProvider,
  useSaveLifecycle,
  useSaveLifecycleSource,
} from "@ruth-commerce/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminRequest } from "@/lib/adminApi";
import {
  defaultDiscountCampaignSettings,
  normalizeDiscountCampaignSettings,
  type CouponCodeRule,
  type CouponUsageContext,
  type DiscountCampaignSettings,
  type DiscountValueType,
} from "@/lib/discountCampaignSettings";
import {
  ExactButton,
  ExactField,
  ExactFormModal,
  ExactStatusBadge,
  exactFormInputClass,
  useExactToast,
} from "./primitives";
import { ExactDataCard } from "./data";

type Purpose = Exclude<CouponUsageContext, "general">;
type Draft = {
  id?: string;
  name: string;
  code: string;
  usageContext: Purpose;
  discountType: DiscountValueType;
  value: number;
  minOrderAmount: number;
  perCustomerLimit: number | null;
  startsAt: string;
  endsAt: string;
};

const emptyDraft: Draft = {
  name: "Terk Sepet Kuponu",
  code: "SEPET10",
  usageContext: "abandoned_cart",
  discountType: "percent",
  value: 10,
  minOrderAmount: 0,
  perCustomerLimit: 1,
  startsAt: "",
  endsAt: "",
};

function purposeLabel(value: Purpose) {
  return value === "abandoned_cart" ? "Terk edilmiş sepet" : "Yorum / değerlendirme";
}

function couponBenefit(coupon: CouponCodeRule) {
  return coupon.discountType === "percent"
    ? `%${coupon.value}`
    : `${Number(coupon.value || 0).toLocaleString("tr-TR")} TL`;
}

function couponId() {
  return `coupon-auto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function fingerprint(draft: Draft) {
  return JSON.stringify(draft);
}

function createDraft(purpose: Purpose): Draft {
  return {
    ...emptyDraft,
    usageContext: purpose,
    name: purpose === "abandoned_cart" ? "Terk Sepet Kuponu" : "Değerlendirme Kuponu",
    code: purpose === "abandoned_cart" ? "SEPET10" : "YORUM10",
  };
}

function editDraft(coupon: CouponCodeRule): Draft {
  return {
    id: coupon.id,
    name: coupon.name,
    code: coupon.code,
    usageContext: coupon.usageContext === "review" ? "review" : "abandoned_cart",
    discountType: coupon.discountType,
    value: coupon.value,
    minOrderAmount: coupon.minOrderAmount,
    perCustomerLimit: coupon.perCustomerLimit,
    startsAt: coupon.startsAt,
    endsAt: coupon.endsAt,
  };
}

function ExactPurposeCouponsContent() {
  const toast = useExactToast();
  const { save, saving, requestTransition } = useSaveLifecycle();
  const [settings, setSettings] = useState<DiscountCampaignSettings>(defaultDiscountCampaignSettings);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [savedDraft, setSavedDraft] = useState<Draft>(emptyDraft);
  // A new coupon is itself an unsaved draft even when its valid defaults have not been edited yet.
  const dirty = open && (!draft.id || fingerprint(draft) !== fingerprint(savedDraft));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminRequest<{ settings?: unknown }>("/api/discount-campaigns", {
        force: true,
        ttlMs: 0,
        staleMs: 0,
      });
      setSettings(normalizeDiscountCampaignSettings(result.settings));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Otomasyon kuponları alınamadı.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const purposeCoupons = useMemo(
    () => settings.coupons.filter((coupon) => coupon.usageContext !== "general"),
    [settings.coupons],
  );

  const latestFor = (purpose: Purpose) => purposeCoupons.find((coupon) => coupon.usageContext === purpose && coupon.enabled)
    || purposeCoupons.find((coupon) => coupon.usageContext === purpose)
    || null;

  const beginCreate = (purpose: Purpose) => {
    const baseline = createDraft(purpose);
    setDraft(baseline);
    setSavedDraft(baseline);
    setOpen(true);
  };

  const beginEdit = (coupon: CouponCodeRule) => {
    const baseline = editDraft(coupon);
    setDraft(baseline);
    setSavedDraft(baseline);
    setOpen(true);
  };

  const validateDraft = useCallback(() => {
    const code = draft.code.trim().toLocaleUpperCase("tr-TR").replace(/\s+/g, "");
    if (!code) {
      toast.error("Kupon kodu gerekli.");
      return false;
    }
    if (draft.value <= 0) {
      toast.error("İndirim değeri 0'dan büyük olmalı.");
      return false;
    }
    return true;
  }, [draft.code, draft.value, toast]);

  const persistDraft = useCallback(async () => {
    const code = draft.code.trim().toLocaleUpperCase("tr-TR").replace(/\s+/g, "");
    try {
      // This fresh read is correctness-critical: it prevents this editor from
      // overwriting another coupon/settings mutation with a stale snapshot.
      const freshResult = await adminRequest<{ settings?: unknown }>("/api/discount-campaigns", {
        force: true,
        ttlMs: 0,
        staleMs: 0,
      });
      const fresh = normalizeDiscountCampaignSettings(freshResult.settings);
      const id = draft.id || couponId();
      const nextCoupon: CouponCodeRule = {
        id,
        code,
        name: draft.name.trim() || purposeLabel(draft.usageContext),
        enabled: true,
        discountType: draft.discountType,
        value: draft.discountType === "percent"
          ? Math.min(100, Math.max(0, Number(draft.value)))
          : Math.max(0, Number(draft.value)),
        minOrderAmount: Math.max(0, Number(draft.minOrderAmount || 0)),
        usageLimit: null,
        perCustomerLimit: draft.perCustomerLimit == null
          ? null
          : Math.max(0, Math.floor(Number(draft.perCustomerLimit))),
        targetType: "all",
        targetIds: [],
        startsAt: draft.startsAt,
        endsAt: draft.endsAt,
        usageContext: draft.usageContext,
        note: `${purposeLabel(draft.usageContext)} otomasyonu için ayrılmış kupon.`,
      };

      const coupons = fresh.coupons
        .map((coupon) => coupon.usageContext === draft.usageContext && coupon.id !== id
          ? { ...coupon, enabled: false }
          : coupon)
        .filter((coupon) => coupon.id !== id);
      coupons.unshift(nextCoupon);

      const next: DiscountCampaignSettings = { ...fresh, coupons };
      const result = await adminRequest<{ settings?: unknown }>("/api/discount-campaigns", {
        method: "PUT",
        body: JSON.stringify({ settings: next }),
      });
      setSettings(normalizeDiscountCampaignSettings(result.settings || next));
      const normalizedSaved: Draft = {
        ...draft,
        id,
        code,
        name: nextCoupon.name,
        value: nextCoupon.value,
        minOrderAmount: nextCoupon.minOrderAmount,
        perCustomerLimit: nextCoupon.perCustomerLimit,
      };
      setDraft(normalizedSaved);
      setSavedDraft(normalizedSaved);
      toast.success(`${purposeLabel(draft.usageContext)} kuponu kaydedildi ve ilgili maillere bağlandı.`);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Kupon kaydedilemedi.");
      return false;
    }
  }, [draft, toast]);

  const discardDraft = useCallback(() => {
    setDraft({ ...savedDraft });
  }, [savedDraft]);

  useSaveLifecycleSource({
    id: "automation-coupon-editor",
    dirty,
    validate: validateDraft,
    save: persistDraft,
    discard: discardDraft,
  });

  const requestClose = () => {
    if (saving) return;
    void requestTransition(() => setOpen(false));
  };

  const handleSave = async () => {
    const saved = await save();
    if (saved) setOpen(false);
  };

  const cards: Array<{ purpose: Purpose; icon: typeof ShoppingBag; title: string; description: string }> = [
    {
      purpose: "abandoned_cart",
      icon: ShoppingBag,
      title: "Terk edilmiş sepet kuponu",
      description: "Yalnız terk sepet maillerinde gösterilir ve o akıştaki müşteride geçerli olur.",
    },
    {
      purpose: "review",
      icon: MessageSquareText,
      title: "Yorum / değerlendirme kuponu",
      description: "Yalnız değerlendirme mailinde gösterilir ve maili alan müşteride geçerli olur.",
    },
  ];

  return (
    <ExactDataCard
      title="Otomasyon Kuponları"
      action={<div className="flex items-center gap-1.5 text-[10px] font-medium text-accent"><Sparkles className="h-4 w-4" /> Mail akışına özel</div>}
      className="mb-4"
    >
      <div className="grid gap-3 md:grid-cols-2">
        {cards.map(({ purpose, icon: Icon, title, description }) => {
          const coupon = latestFor(purpose);
          return (
            <div key={purpose} className="rounded-[var(--radius-control)] border border-border-subtle bg-surface-secondary p-3 transition-all duration-200 ease-soft hover:-translate-y-0.5 hover:shadow-card">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-accent-soft text-accent"><Icon className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-main">{title}</p>
                    {coupon ? <ExactStatusBadge status={coupon.enabled ? "active" : "archived"} label={coupon.enabled ? "Aktif" : "Pasif"} size="sm" /> : null}
                  </div>
                  <p className="mt-1 text-[10px] leading-relaxed text-muted">{description}</p>
                  {coupon ? (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="rounded-full bg-surface-primary px-2.5 py-1 text-xs font-bold tracking-wide text-main shadow-sm">{coupon.code}</span>
                      <span className="text-xs font-semibold text-accent">{couponBenefit(coupon)}</span>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <ExactButton variant={coupon ? "secondary" : "primary"} size="sm" onClick={() => coupon ? beginEdit(coupon) : beginCreate(purpose)} disabled={loading}>
                  <Ticket className="h-3.5 w-3.5" /> {coupon ? "Kuponu düzenle" : "Kupon oluştur"}
                </ExactButton>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[10px] leading-relaxed text-subtle">
        Aynı kullanım amacı için yalnızca bir aktif otomasyon kuponu tutulur. Yeni bir tane oluşturduğunda önceki otomatik olarak pasife alınır; böylece mailde yanlış kod görünmez.
      </p>

      <ExactFormModal
        open={open}
        onClose={requestClose}
        title={draft.id ? "Otomasyon kuponunu düzenle" : "Otomasyon kuponu oluştur"}
        subtitle="Base44 kupon akışı · kullanım amacı mail ve checkout ile birlikte uygulanır"
        size="lg"
        footer={(
          <>
            <ExactButton variant="secondary" size="sm" onClick={requestClose} disabled={saving}>Vazgeç</ExactButton>
            <ExactButton size="sm" onClick={() => void handleSave()} loading={saving} disabled={!dirty}>
              <Save className="h-4 w-4" /> Kaydet
            </ExactButton>
          </>
        )}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <ExactField label="Kullanım amacı">
            <select value={draft.usageContext} onChange={(event) => setDraft((current) => ({ ...current, usageContext: event.target.value as Purpose }))} className={exactFormInputClass}>
              <option value="abandoned_cart">Yalnız terk edilmiş sepet</option>
              <option value="review">Yalnız yorum / değerlendirme</option>
            </select>
          </ExactField>
          <ExactField label="Kupon adı">
            <input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} className={exactFormInputClass} />
          </ExactField>
          <ExactField label="Kupon kodu" required>
            <input value={draft.code} onChange={(event) => setDraft((current) => ({ ...current, code: event.target.value.toLocaleUpperCase("tr-TR").replace(/\s+/g, "") }))} className={exactFormInputClass} />
          </ExactField>
          <ExactField label="İndirim tipi">
            <select value={draft.discountType} onChange={(event) => setDraft((current) => ({ ...current, discountType: event.target.value as DiscountValueType }))} className={exactFormInputClass}>
              <option value="percent">Yüzde</option>
              <option value="amount">Tutar</option>
            </select>
          </ExactField>
          <ExactField label={draft.discountType === "percent" ? "İndirim yüzdesi" : "İndirim tutarı"}>
            <input type="number" min="0" max={draft.discountType === "percent" ? 100 : undefined} value={draft.value} onChange={(event) => setDraft((current) => ({ ...current, value: Number(event.target.value) }))} className={exactFormInputClass} />
          </ExactField>
          <ExactField label="Minimum sepet">
            <input type="number" min="0" value={draft.minOrderAmount} onChange={(event) => setDraft((current) => ({ ...current, minOrderAmount: Number(event.target.value) }))} className={exactFormInputClass} />
          </ExactField>
          <ExactField label="Müşteri başına kullanım">
            <input type="number" min="1" value={draft.perCustomerLimit ?? ""} onChange={(event) => setDraft((current) => ({ ...current, perCustomerLimit: event.target.value === "" ? null : Number(event.target.value) }))} className={exactFormInputClass} placeholder="Sınırsız" />
          </ExactField>
          <div className="hidden sm:block" />
          <ExactField label="Başlangıç">
            <input type="datetime-local" value={draft.startsAt} onChange={(event) => setDraft((current) => ({ ...current, startsAt: event.target.value }))} className={exactFormInputClass} />
          </ExactField>
          <ExactField label="Bitiş">
            <input type="datetime-local" value={draft.endsAt} onChange={(event) => setDraft((current) => ({ ...current, endsAt: event.target.value }))} className={exactFormInputClass} />
          </ExactField>
        </div>
        <div className="mt-4 rounded-[var(--radius-control)] bg-accent-soft p-3 text-[11px] leading-relaxed text-main">
          <strong>{purposeLabel(draft.usageContext)}:</strong> Bu kod genel kupon gibi herkese açılmaz. İlgili otomasyon maili bu kodu gösterir ve checkout yalnız o akıştaki uygun müşterinin kullanmasına izin verir.
        </div>
      </ExactFormModal>
    </ExactDataCard>
  );
}

export function ExactPurposeCoupons() {
  return (
    <SaveLifecycleProvider>
      <ExactPurposeCouponsContent />
    </SaveLifecycleProvider>
  );
}
