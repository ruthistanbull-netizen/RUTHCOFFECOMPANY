"use client";

import {
  Archive,
  Boxes,
  PackagePlus,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSaveLifecycle, useSaveLifecycleSource } from "@ruth-commerce/ui";
import { adminRequest } from "@/lib/adminApi";
import {
  ExactButton,
  ExactField,
  ExactIconButton,
  ExactSearchInput,
  ExactSegmentedControl,
  ExactSkeleton,
  ExactStatusBadge,
  exactFormInputClass,
  useExactToast,
} from "./primitives";
import { ExactDataCard, ExactEmptyState } from "./data";
import { ProductMediaStudioCard } from "./ProductMediaStudioCard";
import { VariantStudioManager } from "./VariantStudioManager";

type Group = { id: string; name: string; slug: string };
type Variant = {
  id?: string;
  option_summary: string;
  price: string | number;
  stock: string | number;
  stock_status: string;
  image_url?: string | null;
  image_urls?: string[];
  options?: Record<string, string>;
  variant_display_type?: string;
  color_value?: string;
};
type Product = {
  id: string;
  name: string;
  slug: string;
  price: number;
  compare_at_price: number | null;
  currency: string;
  material: string | null;
  finish_color?: string | null;
  short_description?: string | null;
  description?: string | null;
  main_image_url: string | null;
  image_urls?: string[];
  stock_status: string;
  status: string;
  is_bundle?: boolean | null;
  product_type?: string | null;
  bundle_items?: Array<{ product_id: string; quantity: number }>;
  size_usage?: string | null;
  care_advice?: string | null;
  product_variants?: Variant[];
  collection_ids?: string[];
  category_ids?: string[];
  collection_list?: Group[];
  categories?: Group[];
};
type ProductForm = {
  productType: "single" | "bundle";
  name: string;
  slug: string;
  price: string;
  compare_at_price: string;
  material: string;
  finish_color: string;
  short_description: string;
  description: string;
  size_usage: string;
  care_advice: string;
  status: string;
  stock_status: string;
  collection_ids: string[];
  category_ids: string[];
};
type ProductStudioDraft = {
  productId: string | null;
  form: ProductForm;
  photos: string[];
  variants: Variant[];
  bundleItems: Array<{ product_id: string; quantity: number }>;
};
type SaveResponse = {
  product?: { id?: string } | null;
  warning?: string;
  variantMediaHandled?: boolean;
  durationMs?: number;
};
type SizePreset = "none" | "adjustable-ring" | "necklace-guide" | "custom";
type CarePreset = "none" | "standard" | "custom";
type ProductSelectHandler = (productId: string, productType: "single" | "bundle") => void;

const defaultMaterials = ["Arabica", "Robusta", "Arabica + Robusta Blend", "Kafeinsiz"];
const defaultFinishes = ["Açık Kavrum", "Orta Kavrum", "Koyu Kavrum", "Espresso Kavrum"];
const STANDARD_CARE_VALUE = "Serin, kuru ve güneş almayan bir yerde; paketi hava almayacak şekilde kapalı saklayın.";
const ADJUSTABLE_RING_VALUE = "250 g paket";
const NECKLACE_SIZE_GUIDE_VALUE = "500 g paket";
const necklaceGuideValues = new Set([
  NECKLACE_SIZE_GUIDE_VALUE,
  "500 g",
  "500 gram paket",
]);
const standardCareValues = new Set([
  STANDARD_CARE_VALUE,
  "Paketi serin, kuru ve güneş almayan bir yerde kapalı saklayın.",
]);
const emptyForm: ProductForm = {
  productType: "single",
  name: "",
  slug: "",
  price: "",
  compare_at_price: "",
  material: "Arabica",
  finish_color: "",
  short_description: "",
  description: "",
  size_usage: "",
  care_advice: STANDARD_CARE_VALUE,
  status: "active",
  stock_status: "in_stock",
  collection_ids: [],
  category_ids: [],
};

function slugify(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function isBundle(product: Product) {
  return Boolean(product.is_bundle || product.product_type === "bundle");
}

function groupIds(product: Product, type: "collection" | "category") {
  return type === "collection"
    ? product.collection_ids || product.collection_list?.map((item) => item.id) || []
    : product.category_ids || product.categories?.map((item) => item.id) || [];
}

function sizePresetFor(value: string | null | undefined): SizePreset {
  const current = String(value || "").trim();
  if (!current) return "none";
  if (necklaceGuideValues.has(current)) return "necklace-guide";
  if (current.toLocaleLowerCase("tr-TR") === ADJUSTABLE_RING_VALUE.toLocaleLowerCase("tr-TR")) return "adjustable-ring";
  return "custom";
}

function carePresetFor(value: string | null | undefined): CarePreset {
  const current = String(value || "").trim();
  if (!current) return "none";
  if (standardCareValues.has(current)) return "standard";
  return "custom";
}

function money(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function cloneVariant(variant: Variant): Variant {
  return {
    ...variant,
    image_urls: [...(variant.image_urls || [])],
    options: variant.options ? { ...variant.options } : undefined,
  };
}

function cloneDraft(draft: ProductStudioDraft): ProductStudioDraft {
  return {
    productId: draft.productId,
    form: {
      ...draft.form,
      collection_ids: [...draft.form.collection_ids],
      category_ids: [...draft.form.category_ids],
    },
    photos: [...draft.photos],
    variants: draft.variants.map(cloneVariant),
    bundleItems: draft.bundleItems.map((item) => ({ ...item })),
  };
}

function emptyDraftFor(type: "single" | "bundle"): ProductStudioDraft {
  return {
    productId: null,
    form: {
      ...emptyForm,
      productType: type,
      collection_ids: [],
      category_ids: [],
    },
    photos: [],
    variants: [],
    bundleItems: [],
  };
}

function productDraft(product: Product, materials: string[]): ProductStudioDraft {
  const sizeUsage = product.size_usage || "";
  const careAdvice = product.care_advice || emptyForm.care_advice;
  return {
    productId: product.id,
    form: {
      productType: isBundle(product) ? "bundle" : "single",
      name: product.name || "",
      slug: product.slug || "",
      price: String(product.price ?? ""),
      compare_at_price: product.compare_at_price == null ? "" : String(product.compare_at_price),
      material: product.material || materials[0] || "",
      finish_color: product.finish_color || "",
      short_description: product.short_description || "",
      description: product.description || "",
      size_usage: sizeUsage,
      care_advice: careAdvice,
      status: product.status || "active",
      stock_status: product.stock_status || "in_stock",
      collection_ids: groupIds(product, "collection"),
      category_ids: groupIds(product, "category"),
    },
    photos: unique([product.main_image_url, ...(product.image_urls || [])]),
    variants: (product.product_variants || []).map((variant) => {
      const images = unique([...(variant.image_urls || []), variant.image_url]);
      return {
        ...variant,
        option_summary: variant.option_summary || "Standart",
        price: variant.price ?? product.price,
        stock: variant.stock ?? 0,
        stock_status: variant.stock_status || "in_stock",
        image_urls: images,
        image_url: images[0] || product.main_image_url || null,
      };
    }),
    bundleItems: (product.bundle_items || []).map((item) => ({
      product_id: item.product_id,
      quantity: Math.max(1, Number(item.quantity || 1)),
    })),
  };
}

function draftFingerprint(draft: ProductStudioDraft) {
  return JSON.stringify({
    productId: draft.productId,
    form: {
      ...draft.form,
      collection_ids: [...draft.form.collection_ids].sort(),
      category_ids: [...draft.form.category_ids].sort(),
    },
    photos: unique(draft.photos),
    variants: draft.variants.map((variant) => ({
      id: variant.id || "",
      option_summary: variant.option_summary || "",
      price: String(variant.price ?? ""),
      stock: String(variant.stock ?? ""),
      stock_status: variant.stock_status || "",
      image_urls: unique([...(variant.image_urls || []), variant.image_url]),
      options: Object.fromEntries(Object.entries(variant.options || {}).sort(([a], [b]) => a.localeCompare(b))),
      variant_display_type: variant.variant_display_type || "",
      color_value: variant.color_value || "",
    })),
    bundleItems: draft.bundleItems.map((item) => ({
      product_id: item.product_id,
      quantity: Math.max(1, Number(item.quantity || 1)),
    })),
  });
}

function ProductWorkspaceHeaderActions({
  selected,
  productType,
  actionPending,
  savePending,
  dirty,
  uploading,
  onArchive,
  onRestore,
  onDiscard,
  onSave,
}: {
  selected: boolean;
  productType: "single" | "bundle";
  actionPending: boolean;
  savePending: boolean;
  dirty: boolean;
  uploading: boolean;
  onArchive: () => void;
  onRestore: () => void;
  onDiscard: () => void;
  onSave: () => void;
}) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setTarget(document.querySelector<HTMLElement>("[data-exact-workspace-modal][data-workspace-kind='product'] [data-product-workspace-actions]"));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  if (!target) return null;

  return createPortal(
    <div className="flex min-w-max items-center gap-2">
      {selected ? (
        <ExactButton className="shrink-0" variant="destructive" size="sm" onClick={onArchive} loading={actionPending} disabled={savePending || uploading}>
          <Archive className="h-4 w-4" /> Arşivle
        </ExactButton>
      ) : null}
      {selected ? (
        <ExactButton className="shrink-0" variant="secondary" size="sm" onClick={onRestore} loading={actionPending} disabled={savePending || uploading}>
          <RotateCcw className="h-4 w-4" /> Geri al
        </ExactButton>
      ) : null}
      <ExactButton className="shrink-0" variant="secondary" size="sm" onClick={onDiscard} disabled={actionPending || savePending || uploading || !dirty}>
        Vazgeç
      </ExactButton>
      <ExactButton className="shrink-0" size="sm" onClick={onSave} loading={savePending} disabled={actionPending || uploading || !dirty}>
        <Save className="h-4 w-4" /> {selected ? "Değişiklikleri Kaydet" : productType === "bundle" ? "Paket Ürünü Oluştur" : "Ürünü Oluştur"}
      </ExactButton>
    </div>,
    target,
  );
}

export function ExactProductStudioWorkspace({
  productId = "",
  productType = "single",
  onSaved,
  onSelectProduct,
}: {
  productId?: string;
  productType?: "single" | "bundle";
  onSaved?: (productId: string) => void;
  onSelectProduct?: ProductSelectHandler;
}) {
  const toast = useExactToast();
  const {
    save: saveLifecycle,
    discard: discardLifecycle,
    requestTransition,
    saving: savePending,
  } = useSaveLifecycle();
  const requestedId = productId;
  const requestedType = productType;
  const routeApplied = useRef("");

  const [products, setProducts] = useState<Product[]>([]);
  const [collections, setCollections] = useState<Group[]>([]);
  const [categories, setCategories] = useState<Group[]>([]);
  const [materials, setMaterials] = useState(defaultMaterials);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>({ ...emptyForm, productType: requestedType });
  const [savedDraft, setSavedDraft] = useState<ProductStudioDraft>(() => emptyDraftFor(requestedType));
  const [sizePreset, setSizePreset] = useState<SizePreset>("none");
  const [carePreset, setCarePreset] = useState<CarePreset>("standard");
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoUrl, setPhotoUrl] = useState("");
  const [variants, setVariants] = useState<Variant[]>([]);
  const [bundleItems, setBundleItems] = useState<Array<{ product_id: string; quantity: number }>>([]);
  const [bundleProductId, setBundleProductId] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState(false);
  const [uploading, setUploading] = useState(false);

  const currentDraft = useMemo<ProductStudioDraft>(() => ({
    productId: selected?.id || null,
    form: {
      ...form,
      collection_ids: [...form.collection_ids],
      category_ids: [...form.category_ids],
    },
    photos: [...photos],
    variants: variants.map(cloneVariant),
    bundleItems: bundleItems.map((item) => ({ ...item })),
  }), [bundleItems, form, photos, selected?.id, variants]);
  const dirty = useMemo(
    () => draftFingerprint(currentDraft) !== draftFingerprint(savedDraft),
    [currentDraft, savedDraft],
  );

  const applyDraft = useCallback((draft: ProductStudioDraft) => {
    const next = cloneDraft(draft);
    setForm(next.form);
    setSizePreset(sizePresetFor(next.form.size_usage));
    setCarePreset(carePresetFor(next.form.care_advice));
    setPhotos(next.photos);
    setPhotoUrl("");
    setVariants(next.variants);
    setBundleItems(next.bundleItems);
    setBundleProductId("");
  }, []);

  const load = useCallback(async (showLoading = true): Promise<Product[]> => {
    if (showLoading) setLoading(true);
    try {
      const detailRequest = requestedId
        ? adminRequest<{ products?: Product[] }>(
            `/api/products?id=${encodeURIComponent(requestedId)}`,
            { hardRefresh: true, force: true, ttlMs: 0, staleMs: 0 },
          )
        : Promise.resolve<{ products?: Product[] }>({ products: [] });
      const [catalog, materialResult, detailResult] = await Promise.all([
        adminRequest<{ products?: Product[]; collections?: Group[]; categories?: Group[] }>("/api/products?q="),
        adminRequest<{ options?: string[] }>("/api/product-settings/materials")
          .catch(() => ({ options: defaultMaterials })),
        detailRequest,
      ]);
      const detailProduct = detailResult.products?.[0] || null;
      const catalogProducts = catalog.products || [];
      const nextProducts = detailProduct
        ? [
            ...catalogProducts.map((product) => product.id === detailProduct.id ? detailProduct : product),
            ...(catalogProducts.some((product) => product.id === detailProduct.id) ? [] : [detailProduct]),
          ]
        : catalogProducts;
      setProducts(nextProducts);
      setCollections(catalog.collections || []);
      setCategories(catalog.categories || []);
      setMaterials([...new Set([...(materialResult.options || []), ...defaultMaterials].filter(Boolean))]);
      return nextProducts;
    } catch (caught) {
      if (showLoading) {
        toast.error(caught instanceof Error ? caught.message : "Ürün stüdyosu verileri alınamadı.");
      }
      return [];
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [requestedId, toast]);

  useEffect(() => { void load(); }, [load]);

  const reset = useCallback((type: "single" | "bundle" = requestedType) => {
    const draft = emptyDraftFor(type);
    setSelected(null);
    applyDraft(draft);
    setSavedDraft(cloneDraft(draft));
  }, [applyDraft, requestedType]);

  const open = useCallback((product: Product) => {
    const draft = productDraft(product, materials);
    setSelected(product);
    applyDraft(draft);
    setSavedDraft(cloneDraft(draft));
  }, [applyDraft, materials]);

  useEffect(() => {
    if (!selected?.id) return;
    let cancelled = false;
    void adminRequest<{ variantImages?: Record<string, string[]> }>(`/api/products/variant-media?product_id=${encodeURIComponent(selected.id)}`, { force: true, ttlMs: 0, staleMs: 0 })
      .then((result) => {
        if (cancelled) return;
        const variantImages = result.variantImages || {};
        const mergeMedia = (current: Variant[]) => current.map((variant) => {
          const stored = variant.id ? unique(variantImages[String(variant.id)] || []) : [];
          const images = stored.length ? stored : unique([...(variant.image_urls || []), variant.image_url]);
          return { ...variant, image_urls: images, image_url: images[0] || variant.image_url || null };
        });
        setVariants(mergeMedia);
        setSavedDraft((current) => current.productId === selected.id
          ? { ...current, variants: mergeMedia(current.variants) }
          : current);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [selected?.id]);

  useEffect(() => {
    if (loading) return;
    const routeKey = `${requestedId}:${requestedType}`;
    if (routeApplied.current === routeKey) return;
    routeApplied.current = routeKey;
    if (requestedId) {
      const product = products.find((item) => item.id === requestedId);
      if (product) open(product);
      else reset(requestedType);
    } else {
      reset(requestedType);
    }
  }, [loading, open, products, requestedId, requestedType, reset]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    return products.filter((product) => !needle || `${product.name} ${product.slug} ${product.material || ""} ${product.finish_color || ""}`.toLocaleLowerCase("tr-TR").includes(needle));
  }, [products, query]);

  const toggleGroup = (field: "collection_ids" | "category_ids", id: string) => {
    setForm((current) => ({
      ...current,
      [field]: current[field].includes(id)
        ? current[field].filter((item) => item !== id)
        : [...current[field], id],
    }));
  };

  const addBundle = () => {
    if (!bundleProductId || bundleItems.some((item) => item.product_id === bundleProductId)) return;
    setBundleItems((current) => [...current, { product_id: bundleProductId, quantity: 1 }]);
    setBundleProductId("");
  };

  const validateDraft = useCallback(() => {
    if (!form.name.trim() || !form.price) {
      toast.error("Ürün adı ve fiyat zorunlu.");
      return false;
    }
    if (!photos.length) {
      toast.error("En az bir ürün görseli ekle.");
      return false;
    }
    if (form.productType === "bundle" && !bundleItems.length) {
      toast.error("Paket ürün için en az bir ürün seç.");
      return false;
    }
    return true;
  }, [bundleItems.length, form.name, form.price, form.productType, photos.length, toast]);

  const persistDraft = useCallback(async () => {
    try {
      const serializedVariants = form.productType === "single"
        ? variants.map((variant) => {
            const images = unique([...(variant.image_urls || []), variant.image_url]);
            return {
              ...variant,
              image_urls: images,
              image_url: images[0] || photos[0] || null,
              price: Number(variant.price || form.price),
              stock: Number(variant.stock || 0),
            };
          })
        : [];
      const payload = {
        ...(selected ? { id: selected.id } : {}),
        ...form,
        slug: form.slug || slugify(form.name),
        price: Number(form.price),
        compare_at_price: form.compare_at_price ? Number(form.compare_at_price) : null,
        isBundle: form.productType === "bundle",
        is_bundle: form.productType === "bundle",
        product_type: form.productType,
        photos,
        image_urls: photos,
        main_image_url: photos[0],
        variants: serializedVariants,
        bundleItems: form.productType === "bundle" ? bundleItems : [],
        bundle_items: form.productType === "bundle" ? bundleItems : [],
      };
      const result = await adminRequest<SaveResponse>(
        selected ? "/api/products/safe-update" : "/api/products",
        { method: selected ? "PATCH" : "POST", body: JSON.stringify(payload) },
      );
      const savedProductId = String(result.product?.id || selected?.id || "");
      if (savedProductId && serializedVariants.length && !result.variantMediaHandled) {
        await adminRequest("/api/products/variant-media", {
          method: "POST",
          body: JSON.stringify({ productId: savedProductId, productName: form.name, variants: serializedVariants }),
        });
      }

      if (savedProductId) {
        const optimisticProduct: Product = {
          ...(selected || {
            id: savedProductId,
            currency: "TRY",
            status: form.status,
            stock_status: form.stock_status,
          } as Product),
          id: savedProductId,
          name: form.name.trim(),
          slug: String(payload.slug),
          price: Number(form.price),
          compare_at_price: form.compare_at_price ? Number(form.compare_at_price) : null,
          material: form.material || null,
          finish_color: form.finish_color || null,
          short_description: form.short_description || null,
          description: form.description || null,
          size_usage: form.size_usage || null,
          care_advice: form.care_advice || null,
          status: form.status,
          stock_status: form.stock_status,
          main_image_url: photos[0] || null,
          image_urls: photos,
          product_type: form.productType,
          is_bundle: form.productType === "bundle",
          bundle_items: form.productType === "bundle" ? bundleItems : [],
          product_variants: serializedVariants,
          collection_ids: form.collection_ids,
          category_ids: form.category_ids,
        };
        setProducts((current) => {
          const exists = current.some((product) => product.id === savedProductId);
          return exists
            ? current.map((product) => product.id === savedProductId ? optimisticProduct : product)
            : [optimisticProduct, ...current];
        });
        if (selected) {
          open(optimisticProduct);
          routeApplied.current = `${optimisticProduct.id}:${requestedType}`;
        } else {
          setSavedDraft(cloneDraft(currentDraft));
        }
        onSaved?.(savedProductId);
      }

      toast.success(result.warning || (selected
        ? "Ürün, varyant, medya ve katalog bilgileri güncellendi."
        : "Ürün oluşturuldu ve düzenleme modunda açık bırakıldı."));

      // The durable mutation already succeeded. Refreshing the full catalogue is
      // eventual-consistency work and must never keep the Save button spinning.
      window.setTimeout(() => { void load(false); }, 2_500);
      return true;
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Ürün kaydedilemedi.");
      return false;
    }
  }, [bundleItems, currentDraft, form, load, onSaved, open, photos, requestedType, selected, toast, variants]);

  const discardDraft = useCallback(() => {
    applyDraft(savedDraft);
  }, [applyDraft, savedDraft]);

  useSaveLifecycleSource({
    id: "product-studio",
    dirty,
    validate: validateDraft,
    save: persistDraft,
    discard: discardDraft,
  });

  const archive = async () => {
    if (!selected) return;
    setActionPending(true);
    try {
      await adminRequest("/api/products/safe-update", {
        method: "DELETE",
        body: JSON.stringify({ id: selected.id }),
      });
      setSelected((current) => current ? { ...current, status: "archived" } : current);
      setProducts((current) => current.map((product) =>
        product.id === selected.id ? { ...product, status: "archived" } : product
      ));
      setForm((current) => ({ ...current, status: "archived" }));
      setSavedDraft((current) => ({
        ...current,
        form: { ...current.form, status: "archived" },
      }));
      toast.success(`${selected.name} arşivlendi.`);
      window.setTimeout(() => { void load(false); }, 2_500);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Ürün arşivlenemedi.");
    } finally {
      setActionPending(false);
    }
  };

  const restore = async () => {
    if (!selected) return;
    setActionPending(true);
    try {
      await adminRequest("/api/products/safe-update", {
        method: "POST",
        body: JSON.stringify({ id: selected.id, action: "restore" }),
      });
      toast.success("Son ürün değişikliği geri alındı.");
      window.setTimeout(() => {
        void load(false).then((refreshed) => {
          const restoredProduct = refreshed.find((product) => product.id === selected.id);
          if (restoredProduct) open(restoredProduct);
        });
      }, 1_200);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Değişiklik geri alınamadı.");
    } finally {
      setActionPending(false);
    }
  };

  const updateForm = (patch: Partial<ProductForm>) => setForm((current) => ({ ...current, ...patch }));

  return (
    <>
      <ProductWorkspaceHeaderActions
        selected={Boolean(selected)}
        productType={form.productType}
        actionPending={actionPending}
        savePending={savePending}
        dirty={dirty}
        uploading={uploading}
        onArchive={() => { void requestTransition(archive); }}
        onRestore={() => { void requestTransition(restore); }}
        onDiscard={() => { void discardLifecycle(); }}
        onSave={() => { void saveLifecycle(); }}
      />

      <div className="animate-fade-in" data-exact-base44-page="product-studio">
        <div className="grid min-h-full items-start gap-4 xl:grid-cols-[340px_1fr]">
          <div className="space-y-3 xl:sticky xl:top-0">
            <ExactSearchInput value={query} onChange={setQuery} placeholder="Düzenlenecek ürünü ara..." />
            {loading ? <ExactSkeleton className="h-[620px]" /> : (
              <ExactDataCard noPadding>
                <div className="max-h-[calc(92vh-126px)] divide-y divide-border-subtle overflow-y-auto no-scrollbar">
                  {visible.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => {
                        const nextType = isBundle(product) ? "bundle" : "single";
                        if (onSelectProduct) onSelectProduct(product.id, nextType);
                        else open(product);
                      }}
                      className={`flex w-full items-center gap-3 p-3 text-left transition-all hover:bg-surface-secondary ${selected?.id === product.id ? "bg-accent-soft" : ""}`}
                    >
                      <div className="h-14 w-11 shrink-0 overflow-hidden bg-surface-tertiary radius-small">
                        {product.main_image_url ? <img src={product.main_image_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" /> : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="ruth-type-card-title truncate text-main">{product.name}</p>
                        <p className="ruth-type-caption truncate text-muted">{product.material || "Kahve türü yok"} · {product.product_variants?.length || 0} varyant</p>
                        <p className="ruth-type-price mt-1 text-main">{money(product.price)}</p>
                      </div>
                      <ExactStatusBadge status={product.status} label={product.status === "active" ? "Aktif" : product.status === "archived" ? "Arşiv" : "Taslak"} size="sm" />
                    </button>
                  ))}
                  {!visible.length ? <ExactEmptyState compact icon={Search} title="Ürün bulunamadı" /> : null}
                </div>
              </ExactDataCard>
            )}
          </div>

          <div className="space-y-4 py-3 md:py-4">
            <ExactDataCard
              title={selected ? `Ürünü düzenle · ${selected.name}` : "Yeni ürün"}
              action={
                <ExactSegmentedControl
                  size="sm"
                  value={form.productType}
                  onChange={(value) => updateForm({ productType: value as "single" | "bundle" })}
                  options={[
                    { value: "single", label: "Tekil Ürün", icon: PackagePlus },
                    { value: "bundle", label: "Paket Ürün", icon: Boxes },
                  ]}
                />
              }
            >
              <div className="grid gap-3 md:grid-cols-2">
                <ExactField label="Ürün adı" required><input value={form.name} onChange={(event) => updateForm({ name: event.target.value, slug: form.slug || slugify(event.target.value) })} className={exactFormInputClass} /></ExactField>
                <ExactField label="Slug"><input value={form.slug} onChange={(event) => updateForm({ slug: event.target.value })} className={exactFormInputClass} /></ExactField>
                <ExactField label="Satış fiyatı" required><input type="number" min="0" step="0.01" value={form.price} onChange={(event) => updateForm({ price: event.target.value })} className={exactFormInputClass} /></ExactField>
                <ExactField label="Karşılaştırma fiyatı"><input type="number" min="0" step="0.01" value={form.compare_at_price} onChange={(event) => updateForm({ compare_at_price: event.target.value })} className={exactFormInputClass} /></ExactField>
                <ExactField label="Kahve türü"><select value={form.material} onChange={(event) => updateForm({ material: event.target.value })} className={exactFormInputClass}>{materials.map((item) => <option key={item} value={item}>{item}</option>)}</select></ExactField>
                <ExactField label="Kavrum profili"><select value={form.finish_color} onChange={(event) => updateForm({ finish_color: event.target.value })} className={exactFormInputClass}><option value="">Seçilmedi</option>{defaultFinishes.map((item) => <option key={item} value={item}>{item}</option>)}</select></ExactField>
                <ExactField label="Yayın durumu"><select value={form.status} onChange={(event) => updateForm({ status: event.target.value })} className={exactFormInputClass}><option value="active">Aktif</option><option value="draft">Taslak</option><option value="archived">Arşiv</option></select></ExactField>
                <ExactField label="Stok durumu"><select value={form.stock_status} onChange={(event) => updateForm({ stock_status: event.target.value })} className={exactFormInputClass}><option value="in_stock">Stokta</option><option value="out_of_stock">Stok yok</option><option value="preorder">Ön sipariş</option></select></ExactField>
              </div>
              <div className="mt-3 grid gap-3">
                <ExactField label="Kısa açıklama"><textarea value={form.short_description} onChange={(event) => updateForm({ short_description: event.target.value })} className={`${exactFormInputClass} min-h-20`} /></ExactField>
                <ExactField label="Ürün açıklaması"><textarea value={form.description} onChange={(event) => updateForm({ description: event.target.value })} className={`${exactFormInputClass} min-h-32`} /></ExactField>
                <div className="grid gap-3 md:grid-cols-2">
                  <ExactField label="Paket / gramaj">
                    <div className="grid gap-2">
                      <select
                        value={sizePreset}
                        onChange={(event) => {
                          const next = event.target.value as SizePreset;
                          setSizePreset(next);
                          if (next === "none") updateForm({ size_usage: "" });
                          else if (next === "adjustable-ring") updateForm({ size_usage: ADJUSTABLE_RING_VALUE });
                          else if (next === "necklace-guide") updateForm({ size_usage: NECKLACE_SIZE_GUIDE_VALUE });
                          else if (sizePreset !== "custom") updateForm({ size_usage: "" });
                        }}
                        className={exactFormInputClass}
                      >
                        <option value="none">Paket bilgisi yok</option>
                        <option value="adjustable-ring">250 g paket</option>
                        <option value="necklace-guide">500 g paket</option>
                        <option value="custom">Özel paket / kullanım metni…</option>
                      </select>
                      {sizePreset === "custom" ? (
                        <textarea
                          value={form.size_usage}
                          onChange={(event) => updateForm({ size_usage: event.target.value })}
                          className={`${exactFormInputClass} min-h-24`}
                          placeholder="Özel paket, gramaj veya kullanım metni"
                        />
                      ) : null}
                      {sizePreset === "necklace-guide" ? (
                        <p className="ruth-type-caption leading-relaxed text-subtle">Storefront ürün detayında 500 g paket seçeneği gösterilir.</p>
                      ) : null}
                    </div>
                  </ExactField>
                  <ExactField label="Saklama / demleme önerisi">
                    <div className="grid gap-2">
                      <select
                        value={carePreset}
                        onChange={(event) => {
                          const next = event.target.value as CarePreset;
                          setCarePreset(next);
                          if (next === "none") updateForm({ care_advice: "" });
                          else if (next === "standard") updateForm({ care_advice: STANDARD_CARE_VALUE });
                          else if (carePreset !== "custom") updateForm({ care_advice: "" });
                        }}
                        className={exactFormInputClass}
                      >
                        <option value="none">Öneri yok</option>
                        <option value="standard">Standart kahve saklama önerisi</option>
                        <option value="custom">Özel saklama / demleme metni…</option>
                      </select>
                      {carePreset === "standard" ? (
                        <p className="ruth-type-caption leading-relaxed text-subtle">{STANDARD_CARE_VALUE}</p>
                      ) : null}
                      {carePreset === "custom" ? (
                        <textarea
                          value={form.care_advice}
                          onChange={(event) => updateForm({ care_advice: event.target.value })}
                          className={`${exactFormInputClass} min-h-24`}
                          placeholder="Özel saklama veya demleme önerisi"
                        />
                      ) : null}
                    </div>
                  </ExactField>
                </div>
              </div>
            </ExactDataCard>

            <ProductMediaStudioCard
              images={photos}
              onChange={setPhotos}
              busy={uploading}
              onBusyChange={setUploading}
              photoUrl={photoUrl}
              onPhotoUrlChange={setPhotoUrl}
            />

            <ExactDataCard title="Katalog İlişkileri">
              <div className="grid gap-4 md:grid-cols-2">
                <div><p className="ruth-type-label mb-2 text-muted">Koleksiyonlar</p><div className="flex flex-wrap gap-2">{collections.map((item) => <button key={item.id} type="button" onClick={() => toggleGroup("collection_ids", item.id)} className={`ruth-type-control rounded-full px-3 py-1.5 transition-all ${form.collection_ids.includes(item.id) ? "bg-accent text-white" : "bg-surface-secondary text-muted hover:bg-accent-soft hover:text-accent"}`}>{item.name}</button>)}</div></div>
                <div><p className="ruth-type-label mb-2 text-muted">Kategoriler</p><div className="flex flex-wrap gap-2">{categories.map((item) => <button key={item.id} type="button" onClick={() => toggleGroup("category_ids", item.id)} className={`ruth-type-control rounded-full px-3 py-1.5 transition-all ${form.category_ids.includes(item.id) ? "bg-accent text-white" : "bg-surface-secondary text-muted hover:bg-accent-soft hover:text-accent"}`}>{item.name}</button>)}</div></div>
              </div>
            </ExactDataCard>

            {form.productType === "single" ? (
              <VariantStudioManager variants={variants} setVariants={setVariants} productPhotos={photos} basePrice={form.price} />
            ) : (
              <ExactDataCard title="Paket İçeriği" action={<Boxes className="h-4 w-4 text-accent" />}>
                <div className="flex gap-2">
                  <select value={bundleProductId} onChange={(event) => setBundleProductId(event.target.value)} className={exactFormInputClass}><option value="">Pakete ürün seç</option>{products.filter((product) => product.id !== selected?.id && !isBundle(product)).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select>
                  <ExactButton variant="secondary" size="sm" onClick={addBundle}><Plus className="h-4 w-4" /> Ekle</ExactButton>
                </div>
                <div className="mt-3 space-y-2">
                  {bundleItems.map((item, index) => {
                    const product = products.find((entry) => entry.id === item.product_id);
                    return (
                      <div key={item.product_id} className="flex items-center gap-3 bg-surface-secondary p-3 radius-small">
                        <div className="min-w-0 flex-1"><p className="ruth-type-card-title truncate text-main">{product?.name || item.product_id}</p><p className="ruth-type-price text-muted">{product ? money(product.price) : "Ürün bilgisi yüklenemedi"}</p></div>
                        <input type="number" min="1" value={item.quantity} onChange={(event) => setBundleItems((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, quantity: Math.max(1, Number(event.target.value || 1)) } : entry))} className={`${exactFormInputClass} w-20`} />
                        <ExactIconButton icon={Trash2} label="Paketten çıkar" variant="ghost" size="icon-sm" onClick={() => setBundleItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} />
                      </div>
                    );
                  })}
                  {!bundleItems.length ? <ExactEmptyState compact icon={Boxes} title="Paket içeriği boş" description="Pakete dahil edilecek ürünleri seç." /> : null}
                </div>
              </ExactDataCard>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
