"use client";

import Link from "next/link";
import { Archive, ArrowLeft, Boxes, ImagePlus, PackagePlus, Plus, RefreshCw, RotateCcw, Save, Search, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminAuthHeaders, adminRequest, apiUrl } from "@/lib/adminApi";
import { ExactButton, ExactField, ExactIconButton, ExactPageHeader, ExactSearchInput, ExactSegmentedControl, ExactSkeleton, ExactStatusBadge, exactFormInputClass, useExactToast } from "./primitives";
import { ExactDataCard, ExactEmptyState } from "./data";

type Group = { id: string; name: string; slug: string };
type Variant = { id?: string; option_summary: string; price: string | number; stock: string | number; stock_status: string; image_url?: string | null; image_urls?: string[]; options?: Record<string, string> };
type Product = {
  id: string; name: string; slug: string; price: number; compare_at_price: number | null; currency: string;
  material: string | null; finish_color?: string | null; short_description?: string | null; description?: string | null;
  main_image_url: string | null; image_urls?: string[]; stock_status: string; status: string; is_bundle?: boolean | null;
  product_type?: string | null; bundle_items?: Array<{ product_id: string; quantity: number }>; size_usage?: string | null;
  care_advice?: string | null; product_variants?: Variant[]; collection_ids?: string[]; category_ids?: string[];
  collection_list?: Group[]; categories?: Group[];
};
type ProductForm = {
  productType: "single" | "bundle"; name: string; slug: string; price: string; compare_at_price: string; material: string;
  finish_color: string; short_description: string; description: string; size_usage: string; care_advice: string;
  status: string; stock_status: string; collection_ids: string[]; category_ids: string[];
};
type SaveResponse = { product?: { id?: string } | null; warning?: string; rollbackAvailable?: boolean };
const defaultMaterials = ["925 Ayar Gümüş", "Pirinç", "Çelik"];
const defaultFinishes = ["Gümüş", "18K Altın Kaplama", "Altın Rengi", "Eskitme"];
const emptyForm: ProductForm = { productType: "single", name: "", slug: "", price: "", compare_at_price: "", material: "925 Ayar Gümüş", finish_color: "", short_description: "", description: "", size_usage: "", care_advice: "Parfüm, su ve kimyasal temasından kaçının. Kullanmadığınızda kutusunda saklayın.", status: "active", stock_status: "in_stock", collection_ids: [], category_ids: [] };
function slugify(value: string) { return value.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90); }
function unique(values: Array<string | null | undefined>) { return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))]; }
function isBundle(product: Product) { return Boolean(product.is_bundle || product.product_type === "bundle"); }
function groupIds(product: Product, type: "collection" | "category") { return type === "collection" ? product.collection_ids || product.collection_list?.map((item) => item.id) || [] : product.category_ids || product.categories?.map((item) => item.id) || []; }
function money(value: number) { return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(Number(value || 0)); }

export function ExactProductStudio() {
  const toast = useExactToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [collections, setCollections] = useState<Group[]>([]);
  const [categories, setCategories] = useState<Group[]>([]);
  const [materials, setMaterials] = useState(defaultMaterials);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [photos, setPhotos] = useState<string[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [bundleItems, setBundleItems] = useState<Array<{ product_id: string; quantity: number }>>([]);
  const [bundleProductId, setBundleProductId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [catalog, materialResult] = await Promise.all([
        adminRequest<{ products?: Product[]; collections?: Group[]; categories?: Group[] }>("/api/products?q="),
        adminRequest<{ options?: string[] }>("/api/product-settings/materials").catch(() => ({ options: defaultMaterials })),
      ]);
      setProducts(catalog.products || []); setCollections(catalog.collections || []); setCategories(catalog.categories || []);
      setMaterials([...new Set([...(materialResult.options || []), ...defaultMaterials].filter(Boolean))]);
    } catch (caught) { toast.error(caught instanceof Error ? caught.message : "Ürün stüdyosu verileri alınamadı."); }
    finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => { const needle = query.trim().toLocaleLowerCase("tr-TR"); return products.filter((product) => !needle || `${product.name} ${product.slug} ${product.material || ""} ${product.finish_color || ""}`.toLocaleLowerCase("tr-TR").includes(needle)); }, [products, query]);

  const reset = () => { setSelected(null); setForm(emptyForm); setPhotos([]); setVariants([]); setBundleItems([]); setBundleProductId(""); };
  const open = (product: Product) => {
    setSelected(product);
    setForm({ productType: isBundle(product) ? "bundle" : "single", name: product.name || "", slug: product.slug || "", price: String(product.price ?? ""), compare_at_price: product.compare_at_price == null ? "" : String(product.compare_at_price), material: product.material || materials[0] || "", finish_color: product.finish_color || "", short_description: product.short_description || "", description: product.description || "", size_usage: product.size_usage || "", care_advice: product.care_advice || emptyForm.care_advice, status: product.status || "active", stock_status: product.stock_status || "in_stock", collection_ids: groupIds(product, "collection"), category_ids: groupIds(product, "category") });
    setPhotos(unique([product.main_image_url, ...(product.image_urls || [])]));
    setVariants((product.product_variants || []).map((variant) => ({ ...variant, image_urls: unique([...(variant.image_urls || []), variant.image_url]), image_url: unique([...(variant.image_urls || []), variant.image_url])[0] || product.main_image_url || null })));
    setBundleItems((product.bundle_items || []).map((item) => ({ product_id: item.product_id, quantity: Math.max(1, Number(item.quantity || 1)) })));
  };

  const upload = async (file: File, target: "gallery" | number) => {
    if (!file.type.startsWith("image/")) { toast.error("Yalnız görsel dosyaları yüklenebilir."); return; }
    setUploading(true);
    try {
      const headers = await adminAuthHeaders(); const body = new FormData(); body.append("file", file);
      const response = await fetch(apiUrl("/api/products/upload-image"), { method: "POST", headers, body });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok || !result.url) throw new Error(result.error || "Görsel yüklenemedi.");
      const url = String(result.url);
      if (target === "gallery") setPhotos((current) => unique([...current, url]));
      else setVariants((current) => current.map((variant, index) => index === target ? { ...variant, image_url: url, image_urls: unique([...(variant.image_urls || []), url]) } : variant));
      toast.success("Görsel 3:4 ürün medya akışına eklendi.");
    } catch (caught) { toast.error(caught instanceof Error ? caught.message : "Görsel yüklenemedi."); }
    finally { setUploading(false); }
  };

  const toggleGroup = (field: "collection_ids" | "category_ids", id: string) => setForm((current) => ({ ...current, [field]: current[field].includes(id) ? current[field].filter((item) => item !== id) : [...current[field], id] }));
  const addVariant = () => setVariants((current) => [...current, { option_summary: "Standart", price: form.price || "", stock: 0, stock_status: "in_stock", image_url: photos[0] || null, image_urls: [] }]);
  const updateVariant = (index: number, patch: Partial<Variant>) => setVariants((current) => current.map((variant, itemIndex) => itemIndex === index ? { ...variant, ...patch } : variant));
  const addBundle = () => { if (!bundleProductId || bundleItems.some((item) => item.product_id === bundleProductId)) return; setBundleItems((current) => [...current, { product_id: bundleProductId, quantity: 1 }]); setBundleProductId(""); };

  const save = async () => {
    if (!form.name.trim() || !form.price) { toast.error("Ürün adı ve fiyat zorunlu."); return; }
    if (!photos.length) { toast.error("En az bir adet 3:4 ürün görseli yükle."); return; }
    if (form.productType === "bundle" && !bundleItems.length) { toast.error("Set ürün için en az bir ürün seç."); return; }
    setSaving(true);
    try {
      const serializedVariants = form.productType === "single" ? variants.map((variant) => { const images = unique([...(variant.image_urls || []), variant.image_url]); return { ...variant, image_urls: images, image_url: images[0] || photos[0] || null, price: Number(variant.price || form.price), stock: Number(variant.stock || 0) }; }) : [];
      const payload = { ...(selected ? { id: selected.id } : {}), ...form, slug: form.slug || slugify(form.name), price: Number(form.price), compare_at_price: form.compare_at_price ? Number(form.compare_at_price) : null, isBundle: form.productType === "bundle", is_bundle: form.productType === "bundle", product_type: form.productType, photos, image_urls: photos, main_image_url: photos[0], variants: serializedVariants, bundleItems: form.productType === "bundle" ? bundleItems : [], bundle_items: form.productType === "bundle" ? bundleItems : [] };
      const result = await adminRequest<SaveResponse>(selected ? "/api/products/safe-update" : "/api/products", { method: selected ? "PATCH" : "POST", body: JSON.stringify(payload) });
      const productId = String(result.product?.id || selected?.id || "");
      if (productId && serializedVariants.length) await adminRequest("/api/products/variant-media", { method: "POST", body: JSON.stringify({ productId, productName: form.name, variants: serializedVariants }) });
      toast.success(result.warning || (selected ? "Ürün, varyant, medya ve katalog bilgileri güncellendi." : "Ürün oluşturuldu ve storefront yenilemesi tetiklendi."));
      reset(); await load();
    } catch (caught) { toast.error(caught instanceof Error ? caught.message : "Ürün kaydedilemedi."); }
    finally { setSaving(false); }
  };
  const archive = async () => { if (!selected) return; setSaving(true); try { await adminRequest("/api/products/safe-update", { method: "DELETE", body: JSON.stringify({ id: selected.id }) }); toast.success(`${selected.name} arşivlendi.`); reset(); await load(); } catch (caught) { toast.error(caught instanceof Error ? caught.message : "Ürün arşivlenemedi."); } finally { setSaving(false); } };
  const restore = async () => { if (!selected) return; setSaving(true); try { await adminRequest("/api/products/safe-update", { method: "POST", body: JSON.stringify({ id: selected.id, action: "restore" }) }); toast.success("Son ürün değişikliği geri alındı."); reset(); await load(); } catch (caught) { toast.error(caught instanceof Error ? caught.message : "Değişiklik geri alınamadı."); } finally { setSaving(false); } };

  return <div className="space-y-4 animate-fade-in" data-exact-base44-page="product-studio">
    <ExactPageHeader title="Gelişmiş Ürün Stüdyosu" subtitle="Ürün, varyant, medya, set içeriği ve katalog ilişkilerini tek alanda yönet" actions={<><Link href="/products"><ExactButton variant="secondary" size="sm"><ArrowLeft className="h-4 w-4" /> Ürünlere dön</ExactButton></Link><ExactIconButton icon={RefreshCw} label="Yenile" variant="secondary" onClick={() => void load()} loading={loading} /><ExactButton size="sm" onClick={reset}><PackagePlus className="h-4 w-4" /> Yeni ürün</ExactButton></>} />
    <div className="grid xl:grid-cols-[340px_1fr] gap-4 items-start"><div className="xl:sticky xl:top-20 space-y-3"><ExactSearchInput value={query} onChange={setQuery} placeholder="Ürün ara..." />{loading ? <ExactSkeleton className="h-[620px]" /> : <ExactDataCard noPadding><div className="max-h-[70vh] overflow-y-auto no-scrollbar divide-y divide-border-subtle">{visible.map((product) => <button key={product.id} type="button" onClick={() => open(product)} className={`w-full flex items-center gap-3 p-3 text-left hover:bg-surface-secondary transition-all ${selected?.id === product.id ? "bg-accent-soft" : ""}`}><div className="h-14 w-11 radius-small bg-surface-tertiary overflow-hidden shrink-0">{product.main_image_url ? <img src={product.main_image_url} alt="" className="h-full w-full object-cover" /> : null}</div><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-main truncate">{product.name}</p><p className="text-[10px] text-muted truncate">{product.material || "Materyal yok"} · {product.product_variants?.length || 0} varyant</p><p className="text-xs font-medium text-main mt-1">{money(product.price)}</p></div><ExactStatusBadge status={product.status} label={product.status === "active" ? "Aktif" : product.status === "archived" ? "Arşiv" : "Taslak"} size="sm" /></button>)}{!visible.length ? <ExactEmptyState compact icon={Search} title="Ürün bulunamadı" /> : null}</div></ExactDataCard>}</div>
      <div className="space-y-4"><ExactDataCard title={selected ? `Ürünü düzenle · ${selected.name}` : "Yeni ürün"} action={<ExactSegmentedControl size="sm" value={form.productType} onChange={(value) => setForm((current) => ({ ...current, productType: value as "single" | "bundle" }))} options={[{ value: "single", label: "Tekil Ürün", icon: PackagePlus }, { value: "bundle", label: "Set Ürün", icon: Boxes }]} />}><div className="grid md:grid-cols-2 gap-3"><ExactField label="Ürün adı" required><input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value, slug: current.slug || slugify(event.target.value) }))} className={exactFormInputClass} /></ExactField><ExactField label="Slug"><input value={form.slug} onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))} className={exactFormInputClass} /></ExactField><ExactField label="Fiyat" required><input type="number" min="0" step="0.01" value={form.price} onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))} className={exactFormInputClass} /></ExactField><ExactField label="Karşılaştırma fiyatı"><input type="number" min="0" step="0.01" value={form.compare_at_price} onChange={(event) => setForm((current) => ({ ...current, compare_at_price: event.target.value }))} className={exactFormInputClass} /></ExactField><ExactField label="Materyal"><select value={form.material} onChange={(event) => setForm((current) => ({ ...current, material: event.target.value }))} className={exactFormInputClass}>{materials.map((material) => <option key={material}>{material}</option>)}</select></ExactField><ExactField label="Kaplama / renk"><input list="finish-options" value={form.finish_color} onChange={(event) => setForm((current) => ({ ...current, finish_color: event.target.value }))} className={exactFormInputClass} /><datalist id="finish-options">{defaultFinishes.map((finish) => <option key={finish} value={finish} />)}</datalist></ExactField><ExactField label="Durum"><select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} className={exactFormInputClass}><option value="active">Aktif</option><option value="draft">Taslak</option><option value="archived">Arşiv</option></select></ExactField><ExactField label="Stok durumu"><select value={form.stock_status} onChange={(event) => setForm((current) => ({ ...current, stock_status: event.target.value }))} className={exactFormInputClass}><option value="in_stock">Stokta</option><option value="out_of_stock">Stok yok</option><option value="preorder">Ön sipariş</option></select></ExactField><ExactField label="Kısa açıklama" className="md:col-span-2"><textarea value={form.short_description} onChange={(event) => setForm((current) => ({ ...current, short_description: event.target.value }))} className={`${exactFormInputClass} min-h-20`} /></ExactField><ExactField label="Açıklama" className="md:col-span-2"><textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className={`${exactFormInputClass} min-h-32`} /></ExactField><ExactField label="Ölçü ve kullanım"><textarea value={form.size_usage} onChange={(event) => setForm((current) => ({ ...current, size_usage: event.target.value }))} className={`${exactFormInputClass} min-h-24`} /></ExactField><ExactField label="Bakım önerisi"><textarea value={form.care_advice} onChange={(event) => setForm((current) => ({ ...current, care_advice: event.target.value }))} className={`${exactFormInputClass} min-h-24`} /></ExactField></div></ExactDataCard>
        <ExactDataCard title="Ürün Galerisi" action={<label className="inline-flex items-center gap-2 h-9 px-3 radius-control bg-accent text-white text-xs font-medium cursor-pointer"><ImagePlus className="h-4 w-4" /> Görsel yükle<input type="file" accept="image/*" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file, "gallery"); }} /></label>}><div className="grid grid-cols-2 md:grid-cols-4 gap-3">{photos.map((photo, index) => <div key={`${photo}-${index}`} className="group relative aspect-[3/4] radius-card bg-surface-secondary overflow-hidden"><img src={photo} alt="" className="h-full w-full object-cover" /><span className="absolute top-2 left-2 text-[9px] px-2 py-1 rounded-full bg-black/55 text-white">{index === 0 ? "Ana" : index + 1}</span><button type="button" onClick={() => setPhotos((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/55 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><X className="h-3.5 w-3.5" /></button></div>)}{!photos.length ? <ExactEmptyState compact icon={ImagePlus} title="3:4 ürün görseli yükle" /> : null}</div></ExactDataCard>
        <ExactDataCard title={form.productType === "single" ? "Varyantlar" : "Set İçeriği"} action={form.productType === "single" ? <ExactButton variant="secondary" size="sm" onClick={addVariant}><Plus className="h-4 w-4" /> Varyant ekle</ExactButton> : null}>{form.productType === "single" ? <div className="space-y-3">{variants.map((variant, index) => <div key={variant.id || index} className="p-3 radius-control bg-surface-secondary"><div className="grid md:grid-cols-[1.2fr_.7fr_.6fr_.8fr_auto] gap-2 items-end"><ExactField label="Varyant"><input value={variant.option_summary} onChange={(event) => updateVariant(index, { option_summary: event.target.value })} className={exactFormInputClass} /></ExactField><ExactField label="Fiyat"><input type="number" value={variant.price} onChange={(event) => updateVariant(index, { price: event.target.value })} className={exactFormInputClass} /></ExactField><ExactField label="Stok"><input type="number" value={variant.stock} onChange={(event) => updateVariant(index, { stock: event.target.value })} className={exactFormInputClass} /></ExactField><ExactField label="Durum"><select value={variant.stock_status} onChange={(event) => updateVariant(index, { stock_status: event.target.value })} className={exactFormInputClass}><option value="in_stock">Stokta</option><option value="out_of_stock">Stok yok</option><option value="preorder">Ön sipariş</option></select></ExactField><ExactIconButton icon={Trash2} label="Varyantı sil" variant="ghost" onClick={() => setVariants((current) => current.filter((_, itemIndex) => itemIndex !== index))} /></div><div className="flex items-center gap-3 mt-3"><div className="h-16 w-12 radius-small bg-surface-tertiary overflow-hidden">{variant.image_url ? <img src={variant.image_url} alt="" className="h-full w-full object-cover" /> : null}</div><label className="inline-flex items-center gap-2 h-9 px-3 radius-control bg-surface-primary border border-border-subtle text-xs cursor-pointer"><ImagePlus className="h-4 w-4" /> Varyant görseli<input type="file" accept="image/*" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file, index); }} /></label></div></div>)}{!variants.length ? <ExactEmptyState compact icon={PackagePlus} title="Varyant eklenmedi" description="Standart ürün için varyant eklemek zorunlu değildir." /> : null}</div> : <div className="space-y-3"><div className="flex gap-2"><select value={bundleProductId} onChange={(event) => setBundleProductId(event.target.value)} className={`${exactFormInputClass} flex-1`}><option value="">Sete ürün seç</option>{products.filter((product) => product.id !== selected?.id && !isBundle(product)).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select><ExactButton variant="secondary" onClick={addBundle}><Plus className="h-4 w-4" /> Ekle</ExactButton></div>{bundleItems.map((item, index) => { const product = products.find((candidate) => candidate.id === item.product_id); return <div key={item.product_id} className="flex items-center gap-3 p-3 radius-control bg-surface-secondary"><div className="h-14 w-11 radius-small bg-surface-tertiary overflow-hidden">{product?.main_image_url ? <img src={product.main_image_url} alt="" className="h-full w-full object-cover" /> : null}</div><div className="flex-1"><p className="text-sm font-semibold text-main">{product?.name || item.product_id}</p><p className="text-[10px] text-muted">Set bileşeni</p></div><input type="number" min="1" value={item.quantity} onChange={(event) => setBundleItems((current) => current.map((candidate, itemIndex) => itemIndex === index ? { ...candidate, quantity: Math.max(1, Number(event.target.value)) } : candidate))} className="form-input w-20" /><ExactIconButton icon={Trash2} label="Setten çıkar" variant="ghost" onClick={() => setBundleItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} /></div>; })}{!bundleItems.length ? <ExactEmptyState compact icon={Boxes} title="Set içeriği boş" /> : null}</div>}</ExactDataCard>
        <ExactDataCard title="Katalog İlişkileri"><div className="grid md:grid-cols-2 gap-4"><div><p className="text-xs font-semibold text-main mb-2">Koleksiyonlar</p><div className="flex flex-wrap gap-2">{collections.map((collection) => <button key={collection.id} type="button" onClick={() => toggleGroup("collection_ids", collection.id)} className={`px-3 py-1.5 radius-small text-xs font-medium border ${form.collection_ids.includes(collection.id) ? "bg-accent-soft border-accent text-accent" : "bg-surface-secondary border-border-subtle text-muted"}`}>{collection.name}</button>)}</div></div><div><p className="text-xs font-semibold text-main mb-2">Kategoriler</p><div className="flex flex-wrap gap-2">{categories.map((category) => <button key={category.id} type="button" onClick={() => toggleGroup("category_ids", category.id)} className={`px-3 py-1.5 radius-small text-xs font-medium border ${form.category_ids.includes(category.id) ? "bg-accent-soft border-accent text-accent" : "bg-surface-secondary border-border-subtle text-muted"}`}>{category.name}</button>)}</div></div></div></ExactDataCard>
        <div className="flex flex-wrap gap-2 justify-end">{selected ? <><ExactButton variant="destructive" onClick={() => void archive()} loading={saving}><Archive className="h-4 w-4" /> Arşivle</ExactButton><ExactButton variant="secondary" onClick={() => void restore()} loading={saving}><RotateCcw className="h-4 w-4" /> Son değişikliği geri al</ExactButton></> : null}<ExactButton size="lg" onClick={() => void save()} loading={saving || uploading}><Save className="h-4 w-4" /> {selected ? "Tüm değişiklikleri kaydet" : "Ürünü oluştur"}</ExactButton></div>
      </div></div>
  </div>;
}
