"use client";

import {
  ArrowDown,
  ArrowUp,
  FolderTree,
  ImagePlus,
  Layers3,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSaveLifecycle, useSaveLifecycleSource } from "@ruth-commerce/ui";
import { adminAuthHeaders, adminRequest } from "@/lib/adminApi";
import { hardRefreshAdminResource } from "@/lib/adminFreshnessActions";
import {
  ExactButton,
  ExactField,
  ExactFilterBar,
  ExactFormModal,
  ExactIconButton,
  ExactPageHeader,
  ExactSearchInput,
  ExactSegmentedControl,
  ExactSkeleton,
  ExactStatusBadge,
  exactFormInputClass,
  useExactToast,
} from "./primitives";
import { ExactEmptyState, ExactMetricCard } from "./data";

type CatalogType = "category" | "collection";
type CatalogItem = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  cover_image_url?: string | null;
  sort_order?: number | null;
  status?: string | null;
  product_count?: number;
};
type CatalogForm = {
  id: string;
  name: string;
  slug: string;
  description: string;
  cover_image_url: string;
  sort_order: string;
  status: "active" | "inactive";
};
type CatalogResponse = { items?: CatalogItem[] };

const emptyForm: CatalogForm = {
  id: "",
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
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function meta(type: CatalogType) {
  return type === "category"
    ? { singular: "Kategori", plural: "Kategoriler", icon: FolderTree }
    : { singular: "Koleksiyon", plural: "Koleksiyonlar", icon: Layers3 };
}

function catalogPath(type: CatalogType) {
  return `/api/catalog-groups?type=${type}`;
}

function itemToForm(item: CatalogItem): CatalogForm {
  return {
    id: item.id,
    name: item.name || "",
    slug: item.slug || "",
    description: item.description || "",
    cover_image_url: item.cover_image_url || "",
    sort_order: String(item.sort_order ?? 0),
    status: item.status === "inactive" ? "inactive" : "active",
  };
}

function formFingerprint(form: CatalogForm) {
  return JSON.stringify({
    id: form.id,
    name: form.name,
    slug: form.slug,
    description: form.description,
    cover_image_url: form.cover_image_url,
    sort_order: form.sort_order,
    status: form.status,
  });
}

export function ExactCatalog() {
  const toast = useExactToast();
  const { save: saveLifecycle, requestTransition, saving: savePending } = useSaveLifecycle();
  const [type, setType] = useState<CatalogType>("category");
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [form, setForm] = useState<CatalogForm>(emptyForm);
  const [savedForm, setSavedForm] = useState<CatalogForm>(emptyForm);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CatalogItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [deletePending, setDeletePending] = useState(false);
  const [movePendingId, setMovePendingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const currentMeta = meta(type);
  const CurrentIcon = currentMeta.icon;
  const editorDirty = editorOpen && formFingerprint(form) !== formFingerprint(savedForm);

  const load = useCallback(async ({ silent = false, authoritative = false }: { silent?: boolean; authoritative?: boolean } = {}) => {
    if (!silent) setLoading(true);
    try {
      const path = catalogPath(type);
      const result = authoritative
        ? (await hardRefreshAdminResource<CatalogResponse>(path)).value
        : await adminRequest<CatalogResponse>(path);
      setItems(result.items || []);
    } catch (caught) {
      // A failed read is not an empty catalog. Preserve the last verified list and
      // let the next authoritative reconcile replace it when the provider recovers.
      toast.error(caught instanceof Error ? caught.message : `${meta(type).plural} alınamadı.`);
    } finally {
      if (!silent) setLoading(false);
    }
    // FeedbackContext changes its outer object when a toast is shown. The toast
    // methods themselves stay valid; catalog lifecycle must be owned by `type`,
    // otherwise an upload-success toast recreates load() and closes the editor.
  }, [type]);

  useEffect(() => {
    setForm(emptyForm);
    setSavedForm(emptyForm);
    setEditorOpen(false);
    setDeleteTarget(null);
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    return items.filter((item) => (
      (!needle || `${item.name} ${item.slug} ${item.description || ""}`.toLocaleLowerCase("tr-TR").includes(needle))
      && (statusFilter === "all" || (item.status === "inactive" ? "inactive" : "active") === statusFilter)
    ));
  }, [items, query, statusFilter]);

  const metrics = useMemo(() => ({
    total: items.length,
    active: items.filter((item) => item.status !== "inactive").length,
    inactive: items.filter((item) => item.status === "inactive").length,
    products: items.reduce((sum, item) => sum + Number(item.product_count || 0), 0),
  }), [items]);

  const openCreate = () => {
    const baseline = { ...emptyForm };
    setForm(baseline);
    setSavedForm(baseline);
    setEditorOpen(true);
  };

  const openEdit = (item: CatalogItem) => {
    const baseline = itemToForm(item);
    setForm(baseline);
    setSavedForm(baseline);
    setEditorOpen(true);
  };

  const closeEditorImmediately = useCallback(() => {
    setEditorOpen(false);
    setForm({ ...savedForm });
  }, [savedForm]);

  const requestEditorClose = useCallback(() => {
    if (savePending || uploading) return;
    void requestTransition(closeEditorImmediately);
  }, [closeEditorImmediately, requestTransition, savePending, uploading]);

  const validateEditor = useCallback(() => {
    if (uploading) {
      toast.error("Kapak görseli yüklemesinin bitmesini bekle.");
      return false;
    }
    if (!form.name.trim()) {
      toast.error(`${currentMeta.singular} adı zorunlu.`);
      return false;
    }
    return true;
  }, [currentMeta.singular, form.name, toast, uploading]);

  const persistEditor = useCallback(async () => {
    try {
      const isEdit = Boolean(form.id);
      const normalized: CatalogForm = {
        ...form,
        name: form.name.trim(),
        slug: (form.slug || slugify(form.name)).trim(),
        description: form.description.trim(),
        cover_image_url: form.cover_image_url.trim(),
        sort_order: String(Number(form.sort_order || 0)),
      };
      const result = await adminRequest<{ warning?: string }>("/api/catalog-groups", {
        method: isEdit ? "PATCH" : "POST",
        body: JSON.stringify({
          type,
          id: normalized.id || undefined,
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
      toast.success(
        result.warning
          ? `${currentMeta.singular} kaydedildi. ${result.warning}`
          : `${currentMeta.singular} kaydedildi.`,
      );
      // Mutation completion is followed by the exact active catalog query, never a
      // stale snapshot/cache response.
      void load({ silent: true, authoritative: true });
      return true;
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : `${currentMeta.singular} kaydedilemedi.`);
      return false;
    }
  }, [currentMeta.singular, form, load, toast, type]);

  const discardEditor = useCallback(() => {
    setForm({ ...savedForm });
  }, [savedForm]);

  useSaveLifecycleSource({
    id: "catalog-group-editor",
    dirty: editorDirty,
    validate: validateEditor,
    save: persistEditor,
    discard: discardEditor,
  });

  const saveEditor = async () => {
    const saved = await saveLifecycle();
    if (saved) closeEditorImmediately();
  };

  const requestTypeChange = (nextType: CatalogType) => {
    if (nextType === type || savePending || uploading) return;
    void requestTransition(() => setType(nextType));
  };

  const requestDeleteFromEditor = () => {
    if (!form.id || savePending || uploading) return;
    const target = items.find((item) => item.id === form.id);
    if (!target) return;
    void requestTransition(() => {
      setEditorOpen(false);
      setDeleteTarget(target);
    });
  };

  const remove = async () => {
    if (!deleteTarget || deletePending) return;
    setDeletePending(true);
    try {
      await adminRequest(
        `/api/catalog-groups?type=${type}&id=${encodeURIComponent(deleteTarget.id)}`,
        { method: "DELETE" },
      );
      toast.success(`${currentMeta.singular} kaldırıldı.`);
      setDeleteTarget(null);
      await load({ authoritative: true });
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : `${currentMeta.singular} silinemedi.`);
    } finally {
      setDeletePending(false);
    }
  };

  const uploadCover = async (file: File) => {
    setUploading(true);
    try {
      const headers = await adminAuthHeaders();
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/products/upload-image", { method: "POST", headers, body });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || "Kapak görseli yüklenemedi.");
      setForm((current) => ({ ...current, cover_image_url: String(result.url || "") }));
      toast.success("Kapak görseli yüklendi.");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Kapak görseli yüklenemedi.");
    } finally {
      setUploading(false);
    }
  };

  const move = async (item: CatalogItem, direction: -1 | 1) => {
    if (movePendingId) return;
    const sorted = [...items].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
    const index = sorted.findIndex((entry) => entry.id === item.id);
    const target = sorted[index + direction];
    if (!target) return;
    setMovePendingId(item.id);
    try {
      await Promise.all([
        adminRequest("/api/catalog-groups", {
          method: "PATCH",
          body: JSON.stringify({
            type,
            ...item,
            sort_order: Number(target.sort_order || index + direction),
            status: item.status === "inactive" ? "inactive" : "active",
          }),
        }),
        adminRequest("/api/catalog-groups", {
          method: "PATCH",
          body: JSON.stringify({
            type,
            ...target,
            sort_order: Number(item.sort_order || index),
            status: target.status === "inactive" ? "inactive" : "active",
          }),
        }),
      ]);
      await load({ authoritative: true });
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Sıralama güncellenemedi.");
    } finally {
      setMovePendingId(null);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in" data-exact-base44-page="catalog">
      <ExactPageHeader
        title="Kategori ve Koleksiyonlar"
        subtitle="Storefront gruplarını ve sıralamasını yönet"
        actions={(
          <>
            <ExactIconButton icon={RefreshCw} label="Yenile" variant="secondary" onClick={() => void load({ authoritative: true })} loading={loading} />
            <ExactButton size="sm" onClick={openCreate} disabled={loading}>
              <Plus className="h-4 w-4" /> Yeni {currentMeta.singular.toLocaleLowerCase("tr-TR")}
            </ExactButton>
          </>
        )}
      />

      <ExactSegmentedControl
        value={type}
        onChange={(value) => requestTypeChange(value as CatalogType)}
        options={[
          { value: "category", label: "Kategoriler", icon: FolderTree },
          { value: "collection", label: "Koleksiyonlar", icon: Layers3 },
        ]}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ExactMetricCard label={`Toplam ${currentMeta.singular.toLocaleLowerCase("tr-TR")}`} value={metrics.total} icon={CurrentIcon} />
        <ExactMetricCard label="Aktif" value={metrics.active} icon={CurrentIcon} />
        <ExactMetricCard label="Pasif" value={metrics.inactive} icon={CurrentIcon} />
        <ExactMetricCard label="Bağlı Ürün" value={metrics.products} icon={CurrentIcon} />
      </div>

      <div className="space-y-3">
        <ExactSearchInput value={query} onChange={setQuery} placeholder={`${currentMeta.plural} içinde ara...`} />
        <ExactFilterBar
          chips={[{
            key: "status",
            label: "Tüm Durumlar",
            value: statusFilter === "all" ? null : statusFilter,
            options: [{ label: "Aktif", value: "active" }, { label: "Pasif", value: "inactive" }],
          }]}
          onChipChange={(_, value) => setStatusFilter(value || "all")}
        />
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ExactSkeleton className="h-72" />
          <ExactSkeleton className="h-72" />
          <ExactSkeleton className="h-72" />
        </div>
      ) : !visible.length ? (
        <div className="bg-surface-primary radius-card shadow-card">
          <ExactEmptyState
            icon={CurrentIcon}
            title={`Henüz ${currentMeta.singular.toLocaleLowerCase("tr-TR")} yok`}
            action={<ExactButton size="sm" onClick={openCreate}>İlk kaydı oluştur</ExactButton>}
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((item, index) => (
            <article key={item.id} className="group overflow-hidden bg-surface-primary radius-card shadow-card transition-all duration-200 hover:shadow-floating">
              <button type="button" onClick={() => openEdit(item)} className="block w-full aspect-[16/9] overflow-hidden bg-surface-tertiary">
                {item.cover_image_url ? (
                  <img src={item.cover_image_url} alt={item.name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
                ) : (
                  <div className="flex h-full items-center justify-center text-subtle"><CurrentIcon className="h-9 w-9" /></div>
                )}
              </button>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-main">{item.name}</h3>
                    <p className="mt-0.5 text-[10px] text-subtle">/{type === "category" ? "category" : "collections"}/{item.slug}</p>
                  </div>
                  <ExactStatusBadge status={item.status === "inactive" ? "archived" : "active"} label={item.status === "inactive" ? "Pasif" : "Aktif"} size="sm" />
                </div>
                <p className="mt-3 min-h-8 line-clamp-2 text-xs text-muted">{item.description || "Açıklama eklenmemiş"}</p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-muted"><strong className="text-main">{item.product_count || 0}</strong> ürün · sıra {Number(item.sort_order || 0)}</span>
                  <div className="flex gap-1">
                    <ExactIconButton icon={ArrowUp} label="Yukarı taşı" variant="ghost" size="icon-sm" disabled={index === 0 || Boolean(movePendingId)} onClick={() => void move(item, -1)} />
                    <ExactIconButton icon={ArrowDown} label="Aşağı taşı" variant="ghost" size="icon-sm" disabled={index === visible.length - 1 || Boolean(movePendingId)} onClick={() => void move(item, 1)} />
                    <ExactIconButton icon={Pencil} label="Düzenle" variant="ghost" size="icon-sm" onClick={() => openEdit(item)} />
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <ExactFormModal
        open={editorOpen}
        onClose={requestEditorClose}
        title={form.id ? `${currentMeta.singular} düzenle` : `Yeni ${currentMeta.singular.toLocaleLowerCase("tr-TR")}`}
        subtitle="Kaydedildiğinde storefront yenilemesi otomatik tetiklenir."
        size="lg"
        footer={(
          <>
            <ExactButton variant="secondary" size="sm" onClick={requestEditorClose} disabled={savePending || uploading}>Vazgeç</ExactButton>
            {form.id ? (
              <ExactButton variant="destructive" size="sm" onClick={requestDeleteFromEditor} disabled={savePending || uploading}>
                <Trash2 className="h-4 w-4" /> Sil
              </ExactButton>
            ) : null}
            <ExactButton size="sm" onClick={() => void saveEditor()} loading={savePending} disabled={!editorDirty || uploading}>
              Kaydet
            </ExactButton>
          </>
        )}
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <ExactField label="Ad" required>
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value, slug: current.slug || slugify(event.target.value) }))}
                className={exactFormInputClass}
              />
            </ExactField>
            <ExactField label="Slug">
              <input value={form.slug} onChange={(event) => setForm((current) => ({ ...current, slug: slugify(event.target.value) }))} className={exactFormInputClass} />
            </ExactField>
            <ExactField label="Sıralama">
              <input type="number" value={form.sort_order} onChange={(event) => setForm((current) => ({ ...current, sort_order: event.target.value }))} className={exactFormInputClass} />
            </ExactField>
            <ExactField label="Durum">
              <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as CatalogForm["status"] }))} className={exactFormInputClass}>
                <option value="active">Aktif</option>
                <option value="inactive">Pasif</option>
              </select>
            </ExactField>
          </div>
          <ExactField label="Açıklama">
            <textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className={`${exactFormInputClass} min-h-24`} />
          </ExactField>
          <ExactField label="Kapak görseli">
            <div className="flex gap-2">
              <input value={form.cover_image_url} onChange={(event) => setForm((current) => ({ ...current, cover_image_url: event.target.value }))} className={exactFormInputClass} placeholder="https://..." />
              <label className="inline-flex h-10 cursor-pointer items-center gap-2 border border-border-subtle bg-surface-secondary px-3 text-xs font-medium text-main radius-control hover:bg-surface-tertiary">
                <ImagePlus className="h-4 w-4" />{uploading ? "Yükleniyor" : "Yükle"}
                <input type="file" accept="image/*" hidden disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadCover(file); }} />
              </label>
            </div>
          </ExactField>
          {form.cover_image_url ? <img src={form.cover_image_url} alt="Kapak önizleme" className="w-full aspect-[16/7] object-cover radius-card" /> : null}
        </div>
      </ExactFormModal>

      <ExactFormModal
        open={Boolean(deleteTarget)}
        onClose={() => { if (!deletePending) setDeleteTarget(null); }}
        dismissalPolicy="protected-action"
        title={`${currentMeta.singular} silinsin mi?`}
        subtitle={deleteTarget?.name}
        size="sm"
        footer={(
          <>
            <ExactButton variant="secondary" size="sm" onClick={() => setDeleteTarget(null)} disabled={deletePending}>Vazgeç</ExactButton>
            <ExactButton variant="destructive" size="sm" onClick={() => void remove()} loading={deletePending}>Sil</ExactButton>
          </>
        )}
      >
        <p className="text-sm text-muted">Bağlı ürünler silinmez; yalnızca grup ve storefront bağlantısı kaldırılır.</p>
      </ExactFormModal>
    </div>
  );
}
