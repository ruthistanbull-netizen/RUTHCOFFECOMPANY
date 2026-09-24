"use client";

import { AlertTriangle, ArrowLeft, Check, FolderPlus, ImagePlus, Layers3, Save, X } from "lucide-react";
import { LoadingIndicator } from "@ruth-commerce/ui";
import { SaveLifecycleProvider, useSaveLifecycle, useSaveLifecycleSource } from "@ruth-commerce/ui";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { adminAuthHeaders, adminRequest, apiUrl } from "@/lib/adminApi";

type CatalogType = "category" | "collection";

type FormState = {
  name: string;
  slug: string;
  description: string;
  cover_image_url: string;
  sort_order: string;
  status: "active" | "inactive";
};

const emptyForm: FormState = {
  name: "",
  slug: "",
  description: "",
  cover_image_url: "",
  sort_order: "0",
  status: "active",
};

function slugify(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formFingerprint(form: FormState) {
  return JSON.stringify({
    name: form.name,
    slug: form.slug,
    description: form.description,
    cover_image_url: form.cover_image_url,
    sort_order: form.sort_order,
    status: form.status,
  });
}

function NewCatalogGroupPageContent() {
  const params = useParams<{ type: string }>();
  const router = useRouter();
  const { save: saveLifecycle, requestTransition, saving } = useSaveLifecycle();
  const type: CatalogType = params?.type === "collection" ? "collection" : "category";
  const meta = useMemo(() => type === "category"
    ? { singular: "Kategori", plural: "Kategoriler", icon: FolderPlus }
    : { singular: "Koleksiyon", plural: "Koleksiyonlar", icon: Layers3 }, [type]);
  const Icon = meta.icon;
  const [form, setForm] = useState<FormState>({ ...emptyForm });
  const [savedForm, setSavedForm] = useState<FormState>({ ...emptyForm });
  const [slugEdited, setSlugEdited] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const dirty = formFingerprint(form) !== formFingerprint(savedForm);

  const updateName = (name: string) => {
    setForm((current) => ({ ...current, name, slug: slugEdited ? current.slug : slugify(name) }));
  };

  const upload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Yalnız görsel dosyaları yüklenebilir.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const headers = await adminAuthHeaders();
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(apiUrl("/api/products/upload-image"), { method: "POST", headers, body });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok || !result.url) throw new Error(result.error || "Kapak görseli yüklenemedi.");
      setForm((current) => ({ ...current, cover_image_url: String(result.url) }));
      setNotice("Kapak görseli yüklendi.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kapak görseli yüklenemedi.");
    } finally {
      setUploading(false);
    }
  };

  const validateCreate = useCallback(() => {
    setNotice(null);
    if (uploading) {
      setError("Kapak görseli yüklemesinin bitmesini bekle.");
      return false;
    }
    if (!form.name.trim()) {
      setError(`${meta.singular} adı gerekli.`);
      return false;
    }
    setError(null);
    return true;
  }, [form.name, meta.singular, uploading]);

  const persistCreate = useCallback(async () => {
    const normalized: FormState = {
      ...form,
      name: form.name.trim(),
      slug: form.slug.trim() || slugify(form.name),
      description: form.description.trim(),
      cover_image_url: form.cover_image_url.trim(),
      sort_order: String(Number(form.sort_order || 0)),
    };

    try {
      await adminRequest("/api/catalog-groups", {
        method: "POST",
        body: JSON.stringify({
          type,
          name: normalized.name,
          slug: normalized.slug,
          description: normalized.description,
          cover_image_url: normalized.cover_image_url,
          sort_order: Number(normalized.sort_order || 0),
          status: normalized.status,
        }),
      });
      setForm(normalized);
      setSavedForm(normalized);
      setNotice(`${meta.singular} oluşturuldu.`);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `${meta.singular} oluşturulamadı.`);
      return false;
    }
  }, [form, meta.singular, type]);

  const discardCreate = useCallback(() => {
    setForm({ ...savedForm });
    setSlugEdited(Boolean(savedForm.slug));
    setError(null);
    setNotice(null);
  }, [savedForm]);

  useSaveLifecycleSource({
    id: "catalog-group-create",
    dirty,
    validate: validateCreate,
    save: persistCreate,
    discard: discardCreate,
  });

  const create = async () => {
    if (saving || uploading) return;
    if (!dirty) {
      if (savedForm.name.trim()) {
        router.push(`/catalog?type=${type}`);
        return;
      }
      validateCreate();
      return;
    }
    const saved = await saveLifecycle();
    if (saved) router.push(`/catalog?type=${type}`);
  };

  const returnToProducts = () => {
    if (saving || uploading) return;
    void requestTransition(() => router.push("/products"));
  };

  return (
    <>
      <header className="cr-page-header">
        <div>
          <span className="cr-eyebrow">Ürün grubu oluştur</span>
          <h1>Yeni {meta.singular}</h1>
          <p className="cr-description">Ürün editöründe seçilebilecek yeni {meta.singular.toLocaleLowerCase("tr-TR")} kaydını oluştur.</p>
        </div>
        <div className="cr-actions">
          <button className="cr-button cr-button--secondary" type="button" onClick={returnToProducts} disabled={saving || uploading}><ArrowLeft /> Ürünlere dön</button>
          <button className="cr-button cr-button--primary" type="button" onClick={() => void create()} disabled={saving || uploading} aria-busy={saving || undefined}>{saving ? <LoadingIndicator size="sm" label={`${meta.singular} oluşturuluyor`} /> : <Save />} {meta.singular} oluştur</button>
        </div>
      </header>

      {error ? <div className="cr-notice cr-notice--danger" role="alert"><AlertTriangle /><span>{error}</span><button type="button" onClick={() => setError(null)} aria-label="Hata bildirimini kapat"><X /></button></div> : null}
      {notice ? <div className="cr-notice cr-notice--success" role="status"><Check /><span>{notice}</span><button type="button" onClick={() => setNotice(null)} aria-label="Başarı bildirimini kapat"><X /></button></div> : null}

      <section className="cr-grid cr-grid--split cr-catalog-create-layout">
        <article className="cr-card cr-card__body">
          <div className="cr-section-heading"><div><span className="cr-eyebrow">Temel bilgi</span><h2>{meta.singular} ayrıntıları</h2></div><Icon /></div>
          <div className="cr-product-form-grid">
            <label className="cr-field cr-field--wide"><span>{meta.singular} adı</span><input value={form.name} onChange={(event) => updateName(event.target.value)} placeholder={type === "category" ? "Örn. Yüzük" : "Örn. Nazar Koleksiyonu"} /></label>
            <label className="cr-field"><span>Slug</span><input value={form.slug} onChange={(event) => { setSlugEdited(true); setForm((current) => ({ ...current, slug: slugify(event.target.value) })); }} placeholder="url-slug" /></label>
            <label className="cr-field"><span>Sıralama</span><input type="number" value={form.sort_order} onChange={(event) => setForm((current) => ({ ...current, sort_order: event.target.value }))} /></label>
            <label className="cr-field"><span>Durum</span><select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value === "inactive" ? "inactive" : "active" }))}><option value="active">Aktif</option><option value="inactive">Pasif</option></select></label>
            <label className="cr-field cr-field--wide"><span>Açıklama</span><textarea rows={5} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></label>
          </div>
        </article>

        <article className="cr-card cr-card__body">
          <div className="cr-section-heading"><div><span className="cr-eyebrow">Görsel</span><h2>Kapak görseli</h2></div><ImagePlus /></div>
          <label className="cr-settings-upload" aria-busy={uploading || undefined}>{uploading ? <LoadingIndicator size="md" label="Kapak görseli yükleniyor" /> : <ImagePlus />}<strong>{uploading ? "Yükleniyor" : "Kapak görseli seç"}</strong><input type="file" accept="image/*" disabled={uploading} aria-label={`${meta.singular} kapak görseli yükle`} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ""; }} /></label>
          <label className="cr-field"><span>Kapak görsel URL</span><input value={form.cover_image_url} onChange={(event) => setForm((current) => ({ ...current, cover_image_url: event.target.value }))} /></label>
          {form.cover_image_url ? <div className="cr-catalog-create-preview"><img src={form.cover_image_url} alt={`${meta.singular} kapak önizlemesi`} /></div> : <div className="cr-empty cr-empty--compact"><Icon /><strong>Kapak görseli eklenmedi</strong></div>}
        </article>
      </section>
    </>
  );
}

export default function NewCatalogGroupPage() {
  return (
    <SaveLifecycleProvider>
      <NewCatalogGroupPageContent />
    </SaveLifecycleProvider>
  );
}
