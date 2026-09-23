"use client";

import { Boxes, Package, Pencil, RefreshCw, Save, Search, SquareStack, Undo2 } from "lucide-react";
import { SaveLifecycleProvider, useSaveLifecycle, useSaveLifecycleSource } from "@ruth-commerce/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminRequest } from "@/lib/adminApi";
import {
  ExactButton,
  ExactDetailDrawer,
  ExactField,
  ExactFilterBar,
  ExactIconButton,
  ExactPageHeader,
  ExactSearchInput,
  ExactSkeleton,
  ExactStatusBadge,
  exactFormInputClass,
  useExactToast,
} from "./primitives";
import { ExactDataTable, ExactEmptyState, ExactMetricCard, type ExactColumn } from "./data";

type Mode = "inventory" | "pricing";
type Variant = {
  id?: string;
  option_summary: string;
  price: number;
  stock: number;
  stock_status: string;
  image_url?: string | null;
  is_active?: boolean;
  options?: Record<string, string>;
};
type DiscountPricing = {
  productId: string;
  originalPrice: number;
  discountedPrice: number;
  discountAmount: number;
  discountPercentage: number;
  hasDiscount: boolean;
  rules: Array<{ id: string; name: string }>;
};
type Product = {
  id: string;
  name: string;
  slug: string;
  price: number;
  currency?: string;
  material?: string | null;
  finish_color?: string | null;
  status: string;
  stock_status: string;
  main_image_url?: string | null;
  product_variants?: Variant[];
  discount_pricing?: DiscountPricing | null;
};

function stock(product: Product) {
  return (product.product_variants || []).reduce((sum, variant) => sum + Math.max(0, Number(variant.stock || 0)), 0);
}

function money(value: number, currency = "TRY") {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: currency || "TRY",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function copyProduct(product: Product) {
  return { ...product, product_variants: (product.product_variants || []).map((variant) => ({ ...variant })) };
}

function draftFingerprint(product: Product | null) {
  if (!product) return "";
  return JSON.stringify({
    id: product.id,
    price: Number(product.price || 0),
    status: product.status,
    stock_status: product.stock_status,
    material: product.material || null,
    finish_color: product.finish_color || null,
    variants: (product.product_variants || []).map((variant) => ({
      id: variant.id || null,
      option_summary: variant.option_summary,
      price: Number(variant.price || 0),
      stock: Number(variant.stock || 0),
      stock_status: variant.stock_status,
      image_url: variant.image_url || null,
      is_active: variant.is_active !== false,
      options: variant.options || {},
    })),
  });
}

function PriceView({ product, align = "right" }: { product: Product; align?: "left" | "right" }) {
  const pricing = product.discount_pricing;
  if (!pricing?.hasDiscount) {
    return <p className="font-semibold text-main">{money(product.price, product.currency)}</p>;
  }
  return (
    <div className={align === "right" ? "text-right" : "text-left"}>
      <p className="text-[10px] text-subtle line-through">{money(pricing.originalPrice, product.currency)}</p>
      <p className="font-semibold text-main">{money(pricing.discountedPrice, product.currency)} <span className="text-[10px] text-danger-foreground">-%{pricing.discountPercentage}</span></p>
    </div>
  );
}

function ExactProductOpsContent({ mode }: { mode: Mode }) {
  const toast = useExactToast();
  const { save: saveLifecycle, discard: discardLifecycle, requestTransition, saving } = useSaveLifecycle();
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Product | null>(null);
  const [draft, setDraft] = useState<Product | null>(null);
  const [savedDraft, setSavedDraft] = useState<Product | null>(null);

  const editorDirty = Boolean(draft && savedDraft) && draftFingerprint(draft) !== draftFingerprint(savedDraft);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [catalog, discountResult] = await Promise.all([
        adminRequest<{ products?: Product[] }>("/api/products?q="),
        adminRequest<{ pricing?: DiscountPricing[] }>("/api/products/discount-pricing", { force: true, ttlMs: 0, staleMs: 0 })
          .catch(() => ({ pricing: [] })),
      ]);
      const pricingByProduct = new Map(
        (discountResult.pricing || []).map((pricing) => [String(pricing.productId), pricing] as const),
      );
      setProducts((catalog.products || []).map((product) => ({
        ...product,
        discount_pricing: pricingByProduct.get(String(product.id)) || null,
      })));
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Ürünler alınamadı.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    return products.filter((product) => {
      if (needle && !`${product.name} ${product.slug} ${product.material || ""} ${product.finish_color || ""}`.toLocaleLowerCase("tr-TR").includes(needle)) return false;
      if (statusFilter !== "all" && product.status !== statusFilter) return false;
      const count = stock(product);
      if (stockFilter === "out" && count > 0) return false;
      if (stockFilter === "low" && (count <= 0 || count >= 5)) return false;
      if (stockFilter === "in" && count < 5) return false;
      return true;
    });
  }, [products, query, statusFilter, stockFilter]);

  const metrics = useMemo(() => ({
    total: products.length,
    inStock: products.filter((product) => stock(product) >= 5).length,
    low: products.filter((product) => stock(product) > 0 && stock(product) < 5).length,
    out: products.filter((product) => stock(product) <= 0 && product.stock_status !== "in_stock").length,
  }), [products]);

  const acceptProduct = useCallback((product: Product) => {
    const baseline = copyProduct(product);
    setSelected(product);
    setDraft(baseline);
    setSavedDraft(copyProduct(baseline));
  }, []);

  const open = useCallback((product: Product) => {
    if (saving || selected?.id === product.id) return;
    void requestTransition(() => acceptProduct(product));
  }, [acceptProduct, requestTransition, saving, selected?.id]);

  const closeImmediately = useCallback(() => {
    setSelected(null);
    setDraft(null);
    setSavedDraft(null);
  }, []);

  const requestClose = useCallback(() => {
    if (saving) return;
    void requestTransition(closeImmediately);
  }, [closeImmediately, requestTransition, saving]);

  const persistDraft = useCallback(async () => {
    if (!draft) return false;
    try {
      await adminRequest("/api/products/safe-update", {
        method: "PATCH",
        body: JSON.stringify({
          id: draft.id,
          price: Number(draft.price || 0),
          status: draft.status,
          stock_status: draft.stock_status,
          material: draft.material || null,
          finish_color: draft.finish_color || null,
          variants: (draft.product_variants || []).map((variant) => ({
            ...variant,
            price: Number(variant.price || draft.price || 0),
            stock: Number(variant.stock || 0),
          })),
        }),
      });

      const persisted = copyProduct(draft);
      setProducts((current) => current.map((product) => product.id === persisted.id ? copyProduct(persisted) : product));
      setSelected(copyProduct(persisted));
      setDraft(copyProduct(persisted));
      setSavedDraft(copyProduct(persisted));
      toast.success(`${persisted.name} güncellendi.`);
      return true;
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Ürün güncellenemedi.");
      return false;
    }
  }, [draft, toast]);

  const discardDraft = useCallback(() => {
    if (!savedDraft) return;
    setDraft(copyProduct(savedDraft));
  }, [savedDraft]);

  useSaveLifecycleSource({
    id: `product-ops-${mode}`,
    dirty: editorDirty,
    save: persistDraft,
    discard: discardDraft,
  });

  const title = mode === "inventory" ? "Stok Yönetimi" : "Fiyatlandırma";
  const columns: ExactColumn<Product>[] = [
    {
      key: "name",
      label: "Ürün",
      sortable: true,
      render: (product) => <div className="flex items-center gap-2"><div className="h-10 w-8 radius-small bg-surface-tertiary overflow-hidden shrink-0">{product.main_image_url ? <img src={product.main_image_url} alt="" className="h-full w-full object-cover" /> : null}</div><div><p className="font-medium text-main">{product.name}</p><p className="text-[10px] text-subtle">{product.slug}</p></div></div>,
    },
    { key: "material", label: "Çekirdek / İçerik", render: (product) => <span className="text-xs text-muted">{product.material || "—"}</span> },
    { key: "price", label: "Fiyat", sortable: true, align: "right", render: (product) => <PriceView product={product} /> },
    { key: "stock", label: "Stok", sortable: true, align: "right", render: (product) => <span className={`font-semibold ${stock(product) <= 0 ? "text-danger-foreground" : stock(product) < 5 ? "text-warning-foreground" : "text-main"}`}>{stock(product)}</span> },
    { key: "status", label: "Durum", align: "center", render: (product) => <ExactStatusBadge status={product.status} label={product.status === "active" ? "Aktif" : product.status === "draft" ? "Taslak" : "Arşiv"} size="sm" /> },
  ];

  return <div className="space-y-4 animate-fade-in" data-exact-base44-page={`products-${mode}`}>
    <ExactPageHeader title={title} subtitle={`${visible.length} ürün`} actions={<ExactIconButton icon={RefreshCw} label="Yenile" variant="secondary" onClick={() => void load()} loading={loading} />} />
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3"><ExactMetricCard label="Toplam Ürün" value={metrics.total} icon={Package} /><ExactMetricCard label="Stokta" value={metrics.inStock} icon={Boxes} /><ExactMetricCard label="Düşük Stok" value={metrics.low} icon={SquareStack} /><ExactMetricCard label="Stok Yok" value={metrics.out} icon={Package} /></div>
    <div className="space-y-3"><ExactSearchInput value={query} onChange={setQuery} placeholder="Ürün, slug, çekirdek veya kavrum ara..." /><ExactFilterBar chips={[{ key: "status", label: "Tüm Durumlar", value: statusFilter === "all" ? null : statusFilter, options: [{ label: "Aktif", value: "active" }, { label: "Taslak", value: "draft" }, { label: "Arşiv", value: "archived" }] }, { key: "stock", label: "Tüm Stoklar", value: stockFilter === "all" ? null : stockFilter, options: [{ label: "Stokta", value: "in" }, { label: "Düşük stok", value: "low" }, { label: "Stok yok", value: "out" }] }]} onChipChange={(key, value) => key === "status" ? setStatusFilter(value || "all") : setStockFilter(value || "all")} /></div>
    {loading ? <div className="space-y-2"><ExactSkeleton className="h-16" /><ExactSkeleton className="h-16" /><ExactSkeleton className="h-16" /></div> : <ExactDataTable columns={columns} data={visible} onRowClick={open} emptyState={<ExactEmptyState icon={Search} title="Ürün bulunamadı" />} />}
    <ExactDetailDrawer open={Boolean(selected && draft)} onClose={requestClose} title={draft?.name || "Ürün"} subtitle={mode === "inventory" ? "Stok ve varyant yönetimi" : "Fiyat yönetimi"} width={700} footer={draft ? <div className="flex flex-wrap gap-2"><ExactButton variant="secondary" size="sm" className="flex-1" onClick={requestClose} disabled={saving}>Kapat</ExactButton>{editorDirty ? <ExactButton variant="secondary" size="sm" className="flex-1" onClick={() => void discardLifecycle()} disabled={saving}><Undo2 className="h-4 w-4" /> Değişiklikleri geri al</ExactButton> : null}<ExactButton size="sm" className="flex-1" onClick={() => void saveLifecycle()} loading={saving} disabled={!editorDirty}><Save className="h-4 w-4" /> Kaydet</ExactButton></div> : null}>
      {draft ? <div className="space-y-5"><div className="grid sm:grid-cols-2 gap-3"><ExactField label="Normal fiyat"><input type="number" step="0.01" value={draft.price} onChange={(event) => setDraft({ ...draft, price: Number(event.target.value) })} className={exactFormInputClass} /></ExactField><ExactField label="İndirimli fiyat">{draft.discount_pricing?.hasDiscount ? <div className="form-input flex items-center justify-between bg-surface-secondary"><span>{money(draft.discount_pricing.discountedPrice, draft.currency)}</span><span className="text-[10px] text-danger-foreground">-%{draft.discount_pricing.discountPercentage}</span></div> : <div className="form-input flex items-center text-muted bg-surface-secondary">Aktif indirim yok</div>}</ExactField><ExactField label="Yayın durumu"><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })} className={exactFormInputClass}><option value="active">Aktif</option><option value="draft">Taslak</option><option value="archived">Arşiv</option></select></ExactField><ExactField label="Stok durumu"><select value={draft.stock_status} onChange={(event) => setDraft({ ...draft, stock_status: event.target.value })} className={exactFormInputClass}><option value="in_stock">Stokta</option><option value="out_of_stock">Stok yok</option></select></ExactField><ExactField label="Çekirdek / İçerik"><input value={draft.material || ""} onChange={(event) => setDraft({ ...draft, material: event.target.value })} className={exactFormInputClass} /></ExactField><ExactField label="Kavrum"><input value={draft.finish_color || ""} onChange={(event) => setDraft({ ...draft, finish_color: event.target.value })} className={exactFormInputClass} /></ExactField></div>{draft.discount_pricing?.hasDiscount ? <div className="rounded-[var(--radius-small)] bg-accent-soft px-3 py-2 text-[11px] text-muted"><span className="font-semibold text-main">İndirim kaynağı:</span> {draft.discount_pricing.rules.map((rule) => rule.name).join(", ")} · İndirimler bölümünden yönetilir.</div> : null}<section><div className="flex items-center gap-2 mb-2"><Pencil className="h-3.5 w-3.5 text-subtle" /><h4 className="text-xs font-semibold text-muted uppercase tracking-wide">Varyantlar</h4></div><div className="space-y-2">{(draft.product_variants || []).map((variant, index) => <div key={variant.id || index} className="grid grid-cols-[1fr_90px_90px] gap-2 items-end p-3 radius-small bg-surface-secondary"><ExactField label="Varyant"><input value={variant.option_summary} onChange={(event) => setDraft({ ...draft, product_variants: draft.product_variants?.map((item, itemIndex) => itemIndex === index ? { ...item, option_summary: event.target.value } : item) })} className={exactFormInputClass} /></ExactField><ExactField label="Fiyat"><input type="number" step="0.01" value={variant.price} onChange={(event) => setDraft({ ...draft, product_variants: draft.product_variants?.map((item, itemIndex) => itemIndex === index ? { ...item, price: Number(event.target.value) } : item) })} className={exactFormInputClass} /></ExactField><ExactField label="Stok"><input type="number" min="0" value={variant.stock} onChange={(event) => setDraft({ ...draft, product_variants: draft.product_variants?.map((item, itemIndex) => itemIndex === index ? { ...item, stock: Number(event.target.value), stock_status: Number(event.target.value) > 0 ? "in_stock" : "out_of_stock" } : item) })} className={exactFormInputClass} /></ExactField></div>)}</div></section></div> : null}
    </ExactDetailDrawer>
  </div>;
}

export function ExactProductOps({ mode }: { mode: Mode }) {
  return (
    <SaveLifecycleProvider>
      <ExactProductOpsContent mode={mode} />
    </SaveLifecycleProvider>
  );
}
