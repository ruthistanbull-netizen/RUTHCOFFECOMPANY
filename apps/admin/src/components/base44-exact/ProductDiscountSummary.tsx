"use client";

import { BadgePercent, Hash } from "lucide-react";
import { useEffect, useState } from "react";
import { adminRequest } from "@/lib/adminApi";

type DiscountRuleBreakdown = {
  id: string;
  name: string;
  targetType: "all" | "collection" | "category" | "product";
  discountType: "percent" | "amount";
  value: number;
  stackable: boolean;
  amount: number;
};

type DiscountPricing = {
  productId: string;
  productName: string;
  currency: string;
  originalPrice: number;
  discountedPrice: number;
  discountAmount: number;
  discountPercentage: number;
  hasDiscount: boolean;
  rules: DiscountRuleBreakdown[];
};

type ProductCodeResponse = {
  product?: { product_code?: string | null } | null;
};

function money(value: number, currency = "TRY") {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: currency || "TRY",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function targetLabel(target: DiscountRuleBreakdown["targetType"]) {
  if (target === "collection") return "Koleksiyon indirimi";
  if (target === "category") return "Kategori indirimi";
  if (target === "product") return "Ürüne özel indirim";
  return "Tüm ürünler indirimi";
}

function ruleValue(rule: DiscountRuleBreakdown, currency: string) {
  return rule.discountType === "percent"
    ? `%${rule.value}`
    : money(rule.value, currency);
}

export function ProductDiscountSummary({ productId }: { productId: string }) {
  const [pricing, setPricing] = useState<DiscountPricing | null>(null);
  const [productCode, setProductCode] = useState("");

  useEffect(() => {
    let cancelled = false;
    setPricing(null);
    setProductCode("");
    if (!productId) return () => { cancelled = true; };

    void Promise.all([
      adminRequest<{ pricing?: DiscountPricing[] }>(
        `/api/products/discount-pricing?product_id=${encodeURIComponent(productId)}`,
        { force: true, ttlMs: 0, staleMs: 0 },
      ).catch(() => ({ pricing: [] })),
      adminRequest<ProductCodeResponse>(
        `/api/products/product-code?product_id=${encodeURIComponent(productId)}`,
        { force: true, ttlMs: 0, staleMs: 0 },
      ).catch(() => ({ product: null })),
    ]).then(([discountResult, codeResult]) => {
      if (cancelled) return;
      setPricing(discountResult.pricing?.[0] || null);
      setProductCode(String(codeResult.product?.product_code || ""));
    });

    return () => { cancelled = true; };
  }, [productId]);

  if (!productCode && !pricing?.hasDiscount) return null;

  return (
    <div className="mx-3 mt-3 grid gap-2 md:mx-4 md:mt-4">
      {productCode ? (
        <div
          data-ruth-product-code-summary
          className="inline-flex w-fit items-center gap-2 rounded-full border border-border-subtle bg-surface-primary px-2.5 py-1 shadow-card"
          aria-label={`Ürün kodu ${productCode}`}
        >
          <Hash className="h-3.5 w-3.5 text-accent" />
          <span className="ruth-type-label tracking-[0.08em] text-muted">ÜRÜN KODU</span>
          <strong className="ruth-type-code font-bold tabular-nums text-main">{productCode}</strong>
        </div>
      ) : null}

      {pricing?.hasDiscount ? (
        <div className="rounded-[var(--radius-card)] border border-accent/20 bg-accent-soft/60 p-3 shadow-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <BadgePercent className="h-4 w-4 shrink-0 text-accent" />
                <p className="ruth-type-card-title text-main">Aktif indirim</p>
                <span className="ruth-type-label rounded-full bg-accent px-2 py-0.5 text-white">-%{pricing.discountPercentage}</span>
              </div>
              <p className="ruth-type-caption mt-1 text-muted">Kaynak: Panel › İndirimler. Ürün kaydındaki eski fiyat alanları indirim oluşturmaz.</p>
            </div>
            <div className="shrink-0 text-left sm:text-right">
              <p className="ruth-type-caption text-subtle line-through">{money(pricing.originalPrice, pricing.currency)}</p>
              <p className="ruth-type-price text-main">{money(pricing.discountedPrice, pricing.currency)}</p>
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {pricing.rules.map((rule) => (
              <div key={rule.id} className="rounded-[var(--radius-small)] bg-surface-primary/80 px-3 py-2">
                <p className="ruth-type-card-title truncate text-main">{rule.name}</p>
                <p className="ruth-type-caption mt-0.5 text-muted">
                  {targetLabel(rule.targetType)} · {ruleValue(rule, pricing.currency)}
                  {rule.stackable ? " · Birleştirilebilir" : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
