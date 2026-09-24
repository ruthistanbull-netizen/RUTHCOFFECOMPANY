"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Archive,
  ArrowLeft,
  Boxes,
  ImagePlus,
  PackagePlus,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminAuthHeaders, adminRequest, apiUrl, seedAdminApiCache } from "@/lib/adminApi";
import {
  ExactButton,
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
import { ExactDataCard, ExactEmptyState } from "./data";
import { ExactProductImageEditor } from "./ExactProductImageEditor";
import { ProductMediaStudioCard } from "./ProductMediaStudioCard";

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
type SaveResponse = {
  product?: (Partial<Product> & { id?: string }) | null;
  warning?: string;
  variantMediaHandled?: boolean;
};

const defaultMaterials = ["Arabica", "Robusta", "Arabica + Robusta Blend", "Kafeinsiz"];
const defaultFinishes = ["Açık Kavrum", "Orta Kavrum", "Koyu Kavrum", "Espresso Kavrum"];
const SIZE_GUIDE_VALUE = "__legacy_size_guide__";
const PRODUCT_CACHE_STALE_MS = 2 * 60 * 60_000;
const sizePresets = [
  { value: "250 g", label: "250 g paket" },
  { value: "500 g", label: "500 g paket" },
  { value: "1 kg", label: "1 kg paket" },
  { value: "Çekirdek / öğütülmüş seçenekleri", label: "Çekirdek / öğütülmüş seçenekleri" },
];
const carePresets = [
  { value: "Serin, kuru ve güneş almayan bir yerde; paketi hava almayacak şekilde kapalı saklayın.", label: "Standart kahve saklama önerisi" },
  { value: "En iyi aroma için açıldıktan sonra kısa sürede tüketin ve nemden uzak tutun.", label: "Tazelik önerisi" },
  { value: "Demlemeden hemen önce öğütmek aromayı daha iyi korur.", label: "Öğütme önerisi" },
];
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
  size_usage: "250 g",
  care_advice: carePresets[0].value,
  status: "active",
  stock_status: "in_stock",
  collection_ids: [],
  category_ids: [],
};

function slugify(value: string) {
  return value.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90);
}
function unique(values: Array<string | null | undefined>) { return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))]; }
function isBundle(product: Product) { return Boolean(product.is_bundle || product.product_type === "bundle"); }
function groupIds(product: Product, type: "collection" | "category") { return type === "collection" ? product.collection_ids || product.collection_list?.map((item) => item.id) || [] : product.category_ids || product.categories?.map((item) => item.id) || []; }
function money(value: number) { return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(Number(value || 0)); }
function presetMode(value: string, presets: Array<{ value: string }>) { return presets.some((item) => item.value === value) ? value : "__custom__"; }

export function ExactProductStudioV2() {
  const searchParams = useSearchParams();
  const toast = useExactToast();
  const requestedId = searchParams.get("id") || "";
  const requestedType = searchParams.get("type") === "bundle" ? "bundle" : "single";
  const routeApplied = useRef("");
  const [products, setProducts] = useState<Product[]>([]);
  const [collections, setCollections] = useState<Group[]>([]);
  const [categories, setCategories] = useState<Group[]>([]);
  const [materials, setMaterials] = useState(defaultMaterials);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>({ ...emptyForm, productType: requestedType });
  const [sizeMode, setSizeMode] = useState(emptyForm.size_usage);
  const [careMode, setCareMode] = useState(emptyForm.care_advice);
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoUrl, setPhotoUrl] = useState("");
  const [editingPhotoIndex, setEditingPhotoIndex] = useState<number | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [bundleItems, setBundleItems] = useState<Array<{ product_id: string; quantity: number }>>([]);
  const [bundleProductId, setBundleProductId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const commitProductCache = useCallback((nextProducts: Product[]) => {
    setProducts(nextProducts);
    seedAdminApiCache("/api/products?q=", {
      ok: true,
      products: nextProducts,
      collections,
      categories,
    }, { ttlMs: 0, staleMs: PRODUCT_CACHE_STALE_MS });
  }, [categories, collections]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [catalog, materialResult] = await Promise.all([
        adminRequest<{ products?: Product[]; collections?: Group[]; categories?: Group[] }>("/api/products?q=", { hardRefresh: true }),
        adminRequest<{ options?: string[] }>("/api/product-settings/materials").catch(() => ({ options: defaultMaterials })),
      ]);
      setProducts(catalog.products || []);
      setCollections(catalog.collections || []);
      setCategories(catalog.categories || []);
      setMaterials([...new Set([...(materialResult.options || []), ...defaultMaterials].filter(Boolean))]);
    } catch (caught) { toast.error(caught instanceof Error ? caught.message : "Ürün stüdyosu verileri alınamadı."); }
    finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  const reset = useCallback((type: "single" | "bundle" = requestedType) => {
    setSelected(null);
    setForm({ ...emptyForm, productType: type });
    setSizeMode(emptyForm.size_usage);
    setCareMode(emptyForm.care_advice);
    setPhotos([]);
    setPhotoUrl("");
    setEditingPhotoIndex(null);
    setVariants([]);
    setBundleItems([]);
    setBundleProductId("");
  }, [requestedType]);

  const open = useCallback((product: Product) => {
    const nextSize = product.size_usage || emptyForm.size_usage;
    const nextCare = product.care_advice || emptyForm.care_advice;
    setSelected(product);
    setForm({
      productType: isBundle(product) ? "bundle" : "single",
      name: product.name || "",
      slug: product.slug || "",
      price: String(product.price ?? ""),
      compare_at_price: product.compare_at_price == null ? "" : String(product.compare_at_price),
      material: product.material || materials[0] || "",
      finish_color: product.finish_color || "",
      short_description: product.short_description || "",
      description: product.description || "",
      size_usage: nextSize,
      care_advice: nextCare,
      status: product.status || "active",
      stock_status: product.stock_status || "in_stock",
      collection_ids: groupIds(product, "collection"),
      category_ids: groupIds(product, "category"),
    });
    setSizeMode(presetMode(nextSize, sizePresets));
    setCareMode(presetMode(nextCare, carePresets));
    setPhotos(unique([product.main_image_url, ...(product.image_urls || [])]));
    setVariants((product.product_variants || []).map((variant) => { const images = unique([...(variant.image_urls || []), variant.image_url]); return { ...variant, option_summary: variant.option_summary || "Standart", price: variant.price ?? product.price, stock: variant.stock ?? 0, stock_status: variant.stock_status || "in_stock", image_urls: images, image_url: images[0] || product.main_image_url || null }; }));
    setBundleItems((product.bundle_items || []).map((item) => ({ product_id: item.product_id, quantity: Math.max(1, Number(item.quantity || 1)) })));
  }, [materials]);

  useEffect(() => {
    if (loading) return;
    const routeKey = `${requestedId}:${requestedType}`;
    if (routeApplied.current === routeKey) return;
    routeApplied.current = routeKey;
    if (requestedId) { const product = products.find((item) => item.id === requestedId); if (product) open(product); else reset(requestedType); }
    else reset(requestedType);
  }, [loading, open, products, requestedId, requestedType, reset]);

  const visible = useMemo(() => { const needle = query.trim().toLocaleLowerCase("tr-TR"); return products.filter((product) => !needle || `${product.name} ${product.slug} ${product.material || ""} ${product.finish_color || ""}`.toLocaleLowerCase("tr-TR").includes(needle)); }, [products, query]);

  const upload = async (file: File, target: "gallery" | number) => {
    if (!file.type.startsWith("image/")) { toast.error("Yalnız görsel dosyaları yüklenebilir."); return; }
    setUploading(true);
    try {
      const headers = await adminAuthHeaders();
      const body = new FormData(); body.append("file", file);
      const response = await fetch(apiUrl("/api/products/upload-image"), { method: "POST", headers, body });
      const result = await response.json().catch(() => ({})) as { ok?: boolean; url?: string; error?: string };
      if (!response.ok || !result.ok || !result.url) throw new Error(result.error || "Görsel yüklenemedi.");
      const url = String(result.url);
      if (target === "gallery") setPhotos((current) => unique([...current, url]));
      else setVariants((current) => current.map((variant, index) => index === target ? { ...variant, image_url: url, image_urls: unique([...(variant.image_urls || []), url]) } : variant));
      toast.success("Görsel ürün medyasına eklendi. Düzenlemek için görseldeki araç düğmesine bas.");
    } catch (caught) { toast.error(caught instanceof Error ? caught.message : "Görsel yüklenemedi."); }
    finally { setUploading(false); }
  };

  const replaceEditedPhoto = (url: string) => {
    if (editingPhotoIndex == null) return;
    const oldUrl = photos[editingPhotoIndex];
    setPhotos((current) => current.map((photo, index) => index === editingPhotoIndex ? url : photo));
    setVariants((current) => current.map((variant) => ({ ...variant, image_url: variant.image_url === oldUrl ? url : variant.image_url, image_urls: (variant.image_urls || []).map((photo) => photo === oldUrl ? url : photo) })));
  };

  const toggleGroup = (field: "collection_ids" | "category_ids", id: string) => setForm((current) => ({ ...current, [field]: current[field].includes(id) ? current[field].filter((item) => item !== id) : [...current[field], id] }));
  const addVariant = () => setVariants((current) => [...current, { option_summary: "Standart", price: form.price || "", stock: 0, stock_status: "in_stock", image_url: photos[0] || null, image_urls: [] }]);
  const updateVariant = (index: number, patch: Partial<Variant>) => setVariants((current) => current.map((variant, itemIndex) => itemIndex === index ? { ...variant, ...patch } : variant));
  const addBundle = () => { if (!bundleProductId || bundleItems.some((item) => item.product_id === bundleProductId)) return; setBundleItems((current) => [...current, { product_id: bundleProductId, quantity: 1 }]); setBundleProductId(""); };
  const updateForm = (patch: Partial<ProductForm>) => setForm((current) => ({ ...current, ...patch }));

  const save = async () => {
    if (!form.name.trim() || !form.price) { toast.error("Ürün adı ve fiyat zorunlu."); return; }
    if (!photos.length) { toast.error("En az bir ürün görseli ekle."); return; }
    if (form.productType === "bundle" && !bundleItems.length) { toast.error("Paket ürün için en az bir ürün seç."); return; }
    setSaving(true);
    try {
      const serializedVariants = form.productType === "single" ? variants.map((variant) => { const images = unique([...(variant.image_urls || []), variant.image_url]); return { ...variant, image_urls: images, image_url: images[0] || photos[0] || null, price: Number(variant.price || form.price), stock: Number(variant.stock || 0) }; }) : [];
      const payload = { ...(selected ? { id: selected.id } : {}), ...form, slug: form.slug || slugify(form.name), price: Number(form.price), compare_at_price: form.compare_at_price ? Number(form.compare_at_price) : null, isBundle: form.productType === "bundle", is_bundle: form.productType === "bundle", product_type: form.productType, photos, image_urls: photos, main_image_url: photos[0], variants: serializedVariants, bundleItems: form.productType === "bundle" ? bundleItems : [], bundle_items: form.productType === "bundle" ? bundleItems : [] };
      const result = await adminRequest<SaveResponse>(selected ? "/api/products/safe-update" : "/api/products", { method: selected ? "PATCH" : "POST", body: JSON.stringify(payload) });
      const productId = String(result.product?.id || selected?.id || "");
      if (!productId) throw new Error("Kaydedilen ürün kimliği alınamadı.");
      if (serializedVariants.length && !result.variantMediaHandled) await adminRequest("/api/products/variant-media", { method: "POST", body: JSON.stringify({ productId, productName: form.name, variants: serializedVariants }) });

      const nextProduct: Product = {
        ...(selected || {} as Product),
        ...(result.product || {}),
        id: productId,
        name: String(result.product?.name || form.name.trim()),
        slug: String(result.product?.slug || form.slug || slugify(form.name)),
        price: Number(result.product?.price ?? form.price),
        compare_at_price: result.product?.compare_at_price === undefined
          ? (form.compare_at_price ? Number(form.compare_at_price) : null)
          : (result.product.compare_at_price ?? null),
        currency: selected?.currency || "TRY",
        material: result.product?.material === undefined ? (form.material || null) : (result.product.material ?? null),
        finish_color: result.product?.finish_color === undefined ? (form.finish_color || null) : (result.product.finish_color ?? null),
        short_description: result.product?.short_description === undefined ? (form.short_description || null) : (result.product.short_description ?? null),
        description: result.product?.description === undefined ? (form.description || null) : (result.product.description ?? null),
        main_image_url: photos[0] || null,
        image_urls: [...photos],
        stock_status: String(result.product?.stock_status || form.stock_status),
        status: String(result.product?.status || form.status),
        is_bundle: form.productType === "bundle",
        product_type: form.productType,
        bundle_items: form.productType === "bundle" ? bundleItems : [],
        size_usage: result.product?.size_usage === undefined ? (form.size_usage || null) : (result.product.size_usage ?? null),
        care_advice: result.product?.care_advice === undefined ? (form.care_advice || null) : (result.product.care_advice ?? null),
        product_variants: serializedVariants,
        collection_ids: [...form.collection_ids],
        category_ids: [...form.category_ids],
        collection_list: collections.filter((item) => form.collection_ids.includes(item.id)),
        categories: categories.filter((item) => form.category_ids.includes(item.id)),
      };

      const nextProducts = selected
        ? products.map((product) => product.id === productId ? nextProduct : product)
        : [nextProduct, ...products.filter((product) => product.id !== productId)];
      commitProductCache(nextProducts);
      open(nextProduct);
      toast.success(result.warning || (selected ? "Ürün ve bütün storefront bilgileri güncellendi." : "Ürün oluşturuldu ve storefront yenilemesi tetiklendi."));
    } catch (caught) { toast.error(caught instanceof Error ? caught.message : "Ürün kaydedilemedi."); }
    finally { setSaving(false); }
  };

  const archive = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const archivedId = selected.id;
      await adminRequest("/api/products/safe-update", { method: "DELETE", body: JSON.stringify({ id: archivedId }) });
      commitProductCache(products.filter((product) => product.id !== archivedId));
      toast.success(`${selected.name} arşivlendi.`);
      reset();
    } catch (caught) { toast.error(caught instanceof Error ? caught.message : "Ürün arşivlenemedi."); }
    finally { setSaving(false); }
  };
  const restore = async () => { if (!selected) return; setSaving(true); try { await adminRequest("/api/products/safe-update", { method: "POST", body: JSON.stringify({ id: selected.id, action: "restore" }) }); toast.success("Son ürün değişikliği geri alındı."); reset(); await load(); } catch (caught) { toast.error(caught instanceof Error ? caught.message : "Değişiklik geri alınamadı."); } finally { setSaving(false); } };

  return <div className="space-y-4 animate-fade-in" data-exact-base44-page="product-studio">
    <ExactPageHeader title={selected ? `Ürün Düzenleme · ${selected.name}` : form.productType === "bundle" ? "Paket Ürün Oluştur" : "Ürün Oluştur"} subtitle="Ürün, varyant, medya, ölçü rehberi, bakım ve katalog ilişkilerini tek alanda yönet" actions={<><Link href="/products"><ExactButton variant="secondary" size="sm"><ArrowLeft className="h-4 w-4" /> Ürünlere dön</ExactButton></Link><ExactIconButton icon={RefreshCw} label="Yenile" variant="secondary" onClick={() => void load()} loading={loading} /><ExactButton size="sm" onClick={() => reset("single")}><PackagePlus className="h-4 w-4" /> Yeni ürün</ExactButton><ExactButton variant="secondary" size="sm" onClick={() => reset("bundle")}><Boxes className="h-4 w-4" /> Paket ürün</ExactButton></>} />
    <div className="grid items-start gap-4 xl:grid-cols-[340px_1fr]">
      <div className="space-y-3 xl:sticky xl:top-20"><ExactSearchInput value={query} onChange={setQuery} placeholder="Düzenlenecek ürünü ara..." />{loading ? <ExactSkeleton className="h-[620px]" /> : <ExactDataCard noPadding><div className="max-h-[70vh] divide-y divide-border-subtle overflow-y-auto no-scrollbar">{visible.map((product) => <button key={product.id} type="button" onClick={() => open(product)} className={`flex w-full items-center gap-3 p-3 text-left transition-all hover:bg-surface-secondary ${selected?.id === product.id ? "bg-accent-soft" : ""}`}><div className="h-14 w-11 shrink-0 overflow-hidden bg-surface-tertiary radius-small">{product.main_image_url ? <img src={product.main_image_url} alt="" className="h-full w-full object-cover" /> : null}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-main">{product.name}</p><p className="truncate text-[10px] text-muted">{product.material || "Kahve türü yok"} · {product.product_variants?.length || 0} varyant</p><p className="mt-1 text-xs font-medium text-main">{money(product.price)}</p></div><ExactStatusBadge status={product.status} label={product.status === "active" ? "Aktif" : product.status === "archived" ? "Arşiv" : "Taslak"} size="sm" /></button>)}{!visible.length ? <ExactEmptyState compact icon={Search} title="Ürün bulunamadı" /> : null}</div></ExactDataCard>}</div>
      <div className="space-y-4">
        <ExactDataCard title={selected ? `Ürünü düzenle · ${selected.name}` : "Yeni ürün"} action={<ExactSegmentedControl size="sm" value={form.productType} onChange={(value) => updateForm({ productType: value as "single" | "bundle" })} options={[{ value: "single", label: "Tekil Ürün", icon: PackagePlus }, { value: "bundle", label: "Paket Ürün", icon: Boxes }]} />}>
          <div className="grid gap-3 md:grid-cols-2"><ExactField label="Ürün adı" required><input value={form.name} onChange={(event) => updateForm({ name: event.target.value, slug: form.slug || slugify(event.target.value) })} className={exactFormInputClass} /></ExactField><ExactField label="Slug"><input value={form.slug} onChange={(event) => updateForm({ slug: event.target.value })} className={exactFormInputClass} /></ExactField><ExactField label="Satış fiyatı" required><input type="number" min="0" step="0.01" value={form.price} onChange={(event) => updateForm({ price: event.target.value })} className={exactFormInputClass} /></ExactField><ExactField label="Karşılaştırma fiyatı"><input type="number" min="0" step="0.01" value={form.compare_at_price} onChange={(event) => updateForm({ compare_at_price: event.target.value })} className={exactFormInputClass} /></ExactField><ExactField label="Kahve türü"><select value={form.material} onChange={(event) => updateForm({ material: event.target.value })} className={exactFormInputClass}>{materials.map((item) => <option key={item} value={item}>{item}</option>)}</select></ExactField><ExactField label="Kavrum profili"><select value={form.finish_color} onChange={(event) => updateForm({ finish_color: event.target.value })} className={exactFormInputClass}><option value="">Seçilmedi</option>{defaultFinishes.map((item) => <option key={item} value={item}>{item}</option>)}</select></ExactField><ExactField label="Yayın durumu"><select value={form.status} onChange={(event) => updateForm({ status: event.target.value })} className={exactFormInputClass}><option value="active">Aktif</option><option value="draft">Taslak</option><option value="archived">Arşiv</option></select></ExactField><ExactField label="Stok durumu"><select value={form.stock_status} onChange={(event) => updateForm({ stock_status: event.target.value })} className={exactFormInputClass}><option value="in_stock">Stokta</option><option value="out_of_stock">Stok yok</option><option value="preorder">Ön sipariş</option></select></ExactField></div>
          <div className="mt-3 grid gap-3"><ExactField label="Kısa açıklama"><textarea value={form.short_description} onChange={(event) => updateForm({ short_description: event.target.value })} className={`${exactFormInputClass} min-h-20`} /></ExactField><ExactField label="Ürün açıklaması"><textarea value={form.description} onChange={(event) => updateForm({ description: event.target.value })} className={`${exactFormInputClass} min-h-32`} /></ExactField></div>
        </ExactDataCard>

        <ExactDataCard title="Ölçü, Kullanım ve Bakım">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3"><ExactField label="Paket / gramaj"><select value={sizeMode} onChange={(event) => { const value = event.target.value; setSizeMode(value); if (value !== "__custom__") updateForm({ size_usage: value }); }} className={exactFormInputClass}>{sizePresets.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}<option value="__custom__">Özel metin yaz</option></select></ExactField>{sizeMode === "__custom__" ? <ExactField label="Özel paket / kullanım"><textarea value={form.size_usage} onChange={(event) => updateForm({ size_usage: event.target.value })} className={`${exactFormInputClass} min-h-28`} /></ExactField> : null}{form.size_usage === SIZE_GUIDE_VALUE ? <div className="overflow-hidden rounded-[var(--radius-control)] border border-accent/20 bg-accent-soft"><div className="p-3"><p className="text-xs font-semibold text-accent">Paket bilgisi aktif</p><p className="mt-1 text-[10px] leading-relaxed text-muted">Storefront ürün detayında seçilen paket / gramaj bilgisi gösterilir.</p></div><img src="/rosta-coffee-co.svg" alt="ROSTA paket bilgisi" className="max-h-72 w-full bg-white object-contain" onError={(event) => { event.currentTarget.style.display = "none"; }} /></div> : null}</div>
            <div className="space-y-3"><ExactField label="Bakım önerisi şablonu"><select value={careMode} onChange={(event) => { const value = event.target.value; setCareMode(value); if (value !== "__custom__") updateForm({ care_advice: value }); }} className={exactFormInputClass}>{carePresets.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}<option value="__custom__">Özel bakım metni yaz</option></select></ExactField>{careMode === "__custom__" ? <ExactField label="Özel bakım önerisi"><textarea value={form.care_advice} onChange={(event) => updateForm({ care_advice: event.target.value })} className={`${exactFormInputClass} min-h-28`} /></ExactField> : <div className="rounded-[var(--radius-control)] bg-surface-secondary p-3 text-xs leading-relaxed text-muted">{form.care_advice}</div>}</div>
          </div>
        </ExactDataCard>

        <ProductMediaStudioCard
          images={photos}
          onChange={setPhotos}
          onEdit={setEditingPhotoIndex}
          busy={uploading}
          onBusyChange={setUploading}
          photoUrl={photoUrl}
          onPhotoUrlChange={setPhotoUrl}
        />

        <ExactDataCard title="Katalog İlişkileri"><div className="grid gap-4 md:grid-cols-2"><div><p className="mb-2 text-xs font-semibold text-muted">Koleksiyonlar</p><div className="flex flex-wrap gap-2">{collections.map((item) => <button key={item.id} type="button" onClick={() => toggleGroup("collection_ids", item.id)} className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition-all ${form.collection_ids.includes(item.id) ? "bg-accent text-white" : "bg-surface-secondary text-muted hover:bg-accent-soft hover:text-accent"}`}>{item.name}</button>)}</div></div><div><p className="mb-2 text-xs font-semibold text-muted">Kategoriler</p><div className="flex flex-wrap gap-2">{categories.map((item) => <button key={item.id} type="button" onClick={() => toggleGroup("category_ids", item.id)} className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition-all ${form.category_ids.includes(item.id) ? "bg-accent text-white" : "bg-surface-secondary text-muted hover:bg-accent-soft hover:text-accent"}`}>{item.name}</button>)}</div></div></div></ExactDataCard>

        {form.productType === "single" ? <ExactDataCard title="Varyantlar" action={<ExactButton variant="secondary" size="sm" onClick={addVariant}><Plus className="h-4 w-4" /> Varyant ekle</ExactButton>}><div className="space-y-3">{variants.map((variant, index) => <div key={variant.id || index} className="rounded-[var(--radius-control)] bg-surface-secondary p-3"><div className="grid gap-3 md:grid-cols-[1.3fr_0.8fr_0.6fr_0.8fr_auto]"><ExactField label="Varyant"><input value={variant.option_summary} onChange={(event) => updateVariant(index, { option_summary: event.target.value })} className={exactFormInputClass} /></ExactField><ExactField label="Fiyat"><input type="number" min="0" step="0.01" value={variant.price} onChange={(event) => updateVariant(index, { price: event.target.value })} className={exactFormInputClass} /></ExactField><ExactField label="Stok"><input type="number" min="0" value={variant.stock} onChange={(event) => updateVariant(index, { stock: event.target.value })} className={exactFormInputClass} /></ExactField><ExactField label="Durum"><select value={variant.stock_status} onChange={(event) => updateVariant(index, { stock_status: event.target.value })} className={exactFormInputClass}><option value="in_stock">Stokta</option><option value="out_of_stock">Stok yok</option><option value="preorder">Ön sipariş</option></select></ExactField><div className="flex items-end"><ExactIconButton icon={Trash2} label="Varyantı sil" variant="ghost" size="icon-sm" onClick={() => setVariants((current) => current.filter((_, itemIndex) => itemIndex !== index))} /></div></div><div className="mt-3 flex items-center gap-2">{variant.image_url ? <img src={variant.image_url} alt="" className="h-12 w-10 object-cover radius-small" /> : <div className="flex h-12 w-10 items-center justify-center bg-surface-tertiary text-subtle radius-small"><ImagePlus className="h-4 w-4" /></div>}<input value={variant.image_url || ""} onChange={(event) => updateVariant(index, { image_url: event.target.value })} className={exactFormInputClass} placeholder="Varyant görsel URL" /><label className="inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap border border-border-subtle bg-surface-primary px-3 text-xs font-medium text-main radius-small transition-all hover:bg-surface-tertiary"><Upload className="h-4 w-4" /> Yükle<input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file, index); event.currentTarget.value = ""; }} /></label></div></div>)}{!variants.length ? <ExactEmptyState compact icon={PackagePlus} title="Varyant yok" description="Standart ürün olarak kaydedebilir veya varyant ekleyebilirsin." /> : null}</div></ExactDataCard> : <ExactDataCard title="Paket İçeriği" action={<Boxes className="h-4 w-4 text-accent" />}><div className="flex gap-2"><select value={bundleProductId} onChange={(event) => setBundleProductId(event.target.value)} className={exactFormInputClass}><option value="">Pakete ürün seç</option>{products.filter((product) => product.id !== selected?.id && !isBundle(product)).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select><ExactButton variant="secondary" size="sm" onClick={addBundle}><Plus className="h-4 w-4" /> Ekle</ExactButton></div><div className="mt-3 space-y-2">{bundleItems.map((item, index) => { const product = products.find((entry) => entry.id === item.product_id); return <div key={item.product_id} className="flex items-center gap-3 bg-surface-secondary p-3 radius-small"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-main">{product?.name || item.product_id}</p><p className="text-[10px] text-muted">{product ? money(product.price) : "Ürün bilgisi yüklenemedi"}</p></div><input type="number" min="1" value={item.quantity} onChange={(event) => setBundleItems((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, quantity: Math.max(1, Number(event.target.value || 1)) } : entry))} className="form-input w-20" /><ExactIconButton icon={Trash2} label="Paketten çıkar" variant="ghost" size="icon-sm" onClick={() => setBundleItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} /></div>; })}{!bundleItems.length ? <ExactEmptyState compact icon={Boxes} title="Paket içeriği boş" description="Pakete dahil edilecek ürünleri seç." /> : null}</div></ExactDataCard>}

        <div className="sticky bottom-20 z-10 flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-border-subtle bg-surface-primary/95 p-3 shadow-floating backdrop-blur-xl lg:bottom-4">{selected ? <ExactButton variant="destructive" size="sm" onClick={() => void archive()} loading={saving}><Archive className="h-4 w-4" /> Arşivle</ExactButton> : null}{selected ? <ExactButton variant="secondary" size="sm" onClick={() => void restore()} loading={saving}><RotateCcw className="h-4 w-4" /> Son değişikliği geri al</ExactButton> : null}<ExactButton variant="secondary" size="sm" className="ml-auto" onClick={() => reset(form.productType)}>Temizle</ExactButton><ExactButton size="sm" onClick={() => void save()} loading={saving || uploading}><Save className="h-4 w-4" /> {selected ? "Değişiklikleri Kaydet" : form.productType === "bundle" ? "Paket Ürünü Oluştur" : "Ürünü Oluştur"}</ExactButton></div>
      </div>
    </div>
    <ExactProductImageEditor open={editingPhotoIndex != null} imageUrl={editingPhotoIndex == null ? null : photos[editingPhotoIndex] || null} onClose={() => setEditingPhotoIndex(null)} onSave={replaceEditedPhoto} />
  </div>;
}
