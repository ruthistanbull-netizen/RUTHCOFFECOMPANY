"use client";

import {
  Copy,
  LayoutTemplate,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  STORE_DESIGN_SCHEMA_VERSION,
  normalizePageSlug,
  type PageCompatibility,
  type SectionInstance,
  type ThemeDocument,
  type TemplateRecord,
} from "@ruth-commerce/commerce-core/store-design-v2";
import { useExactToast } from "@/components/base44-exact/primitives";

type Props = {
  document: ThemeDocument;
  activePath: string;
  activeLabel: string;
  compatibility: PageCompatibility;
  onApply: (next: ThemeDocument, label: string) => Promise<void>;
  onClose: () => void;
};

function uid(prefix: string) {
  const random = globalThis.crypto?.randomUUID?.().replace(/-/g, "") || Math.random().toString(36).slice(2);
  return `${prefix}-${random}`.slice(0, 180);
}

function pageForRoute(document: ThemeDocument, path: string) {
  return document.pages[path] || Object.values(document.pages).find((page) => page.route === path) || null;
}

function templateUsage(document: ThemeDocument, templateId: string) {
  const pages = Object.values(document.pages)
    .filter((page) => page.templateId === templateId)
    .map((page) => page.name);
  const routes = Object.entries(document.templateBindings)
    .filter(([, id]) => id === templateId)
    .map(([route]) => route);
  return { pages, routes, count: pages.length + routes.length };
}

function activeTemplateId(document: ThemeDocument, activePath: string) {
  const page = pageForRoute(document, activePath);
  if (page?.templateId) return page.templateId;
  const bound = document.templateBindings[activePath];
  if (bound) return bound;
  if (document.templates[activePath]) return activePath;
  if (document.templates[`route:${activePath}`]) return `route:${activePath}`;
  return "";
}

function cloneTemplateTree(document: ThemeDocument, sourceId: string, destinationId: string, label: string) {
  const source = document.templates[sourceId];
  if (!source) throw new Error("Kaynak template bulunamadı.");

  const next = structuredClone(document) as ThemeDocument;
  const sectionIds: string[] = [];

  for (const sourceSectionId of source.sectionIds) {
    const sourceSection = next.sections[sourceSectionId];
    if (!sourceSection) continue;

    const sectionId = uid(`section-${sourceSection.type}`);
    const blockIds: string[] = [];

    for (const sourceBlockId of sourceSection.blockIds || []) {
      const sourceBlock = next.blocks[sourceBlockId];
      if (!sourceBlock) continue;
      const blockId = uid(`block-${sourceBlock.type}`);
      next.blocks[blockId] = structuredClone({ ...sourceBlock, id: blockId });
      blockIds.push(blockId);
    }

    next.sections[sectionId] = structuredClone({
      ...sourceSection,
      id: sectionId,
      blockIds,
    } satisfies SectionInstance);
    sectionIds.push(sectionId);
  }

  const now = new Date().toISOString();
  next.templates[destinationId] = {
    ...structuredClone(source),
    id: destinationId,
    label,
    description: source.description ? `${source.description} · Kopya` : "Mevcut template'ten kopyalandı.",
    sectionIds,
    componentSettings: structuredClone(source.componentSettings || {}),
    version: 1,
    createdAt: now,
    updatedAt: now,
    schemaVersion: STORE_DESIGN_SCHEMA_VERSION,
  };
  return next;
}

function compatible(template: TemplateRecord, pageType: PageCompatibility) {
  return template.compatibility.includes(pageType);
}

export function StoreDesignTemplateManager({
  document,
  activePath,
  activeLabel,
  compatibility,
  onApply,
  onClose,
}: Props) {
  const toast = useExactToast();
  const currentTemplateId = activeTemplateId(document, activePath);
  const initialSelected = currentTemplateId || Object.values(document.templates).find((template) => compatible(template, compatibility))?.id || "";
  const [selectedId, setSelectedId] = useState(initialSelected);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const templates = useMemo(
    () => Object.values(document.templates)
      .filter((template) => compatible(template, compatibility))
      .sort((a, b) => a.label.localeCompare(b.label, "tr")),
    [compatibility, document.templates],
  );

  const selected = selectedId ? document.templates[selectedId] : undefined;
  const current = currentTemplateId ? document.templates[currentTemplateId] : undefined;
  const selectedUsage = selected ? templateUsage(document, selected.id) : { pages: [], routes: [], count: 0 };
  const protectedTemplate = Boolean(selected && (selected.id.startsWith("/") || selected.id.startsWith("route:")));
  const assignmentChanged = Boolean(selected && selected.id !== currentTemplateId);

  const commit = async (next: ThemeDocument, label: string) => {
    next.revision = Math.max(next.revision, document.revision) + 1;
    await onApply(next, label);
  };

  const createBlank = async () => {
    const label = newName.trim();
    if (!label) return toast.error("Template adı boş olamaz.");
    const slug = normalizePageSlug(label) || "template";
    const id = uid(`template-${slug}`);
    const now = new Date().toISOString();
    const next = structuredClone(document) as ThemeDocument;
    next.templates[id] = {
      id,
      label,
      description: newDescription.trim() || undefined,
      pageType: compatibility,
      compatibility: [compatibility],
      sectionIds: [],
      componentSettings: {},
      version: 1,
      createdAt: now,
      updatedAt: now,
      schemaVersion: STORE_DESIGN_SCHEMA_VERSION,
    };

    setBusy(true);
    try {
      await commit(next, `${label} template'i oluşturuldu`);
      setSelectedId(id);
      setCreating(false);
      setNewName("");
      setNewDescription("");
      toast.success("Boş template oluşturuldu.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Template oluşturulamadı.");
    } finally {
      setBusy(false);
    }
  };

  const duplicateSelected = async () => {
    if (!selected || busy) return;
    const id = uid(`template-${normalizePageSlug(selected.label) || "copy"}`);
    const label = `${selected.label} Kopya`;
    setBusy(true);
    try {
      const next = cloneTemplateTree(document, selected.id, id, label);
      next.revision = Math.max(next.revision, document.revision) + 1;
      await onApply(next, "Template kopyalandı");
      setSelectedId(id);
      toast.success("Template ve section/block ağacı kopyalandı.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Template kopyalanamadı.");
    } finally {
      setBusy(false);
    }
  };

  const assignSelected = async () => {
    if (!selected || !assignmentChanged || busy) return;
    const next = structuredClone(document) as ThemeDocument;
    const page = pageForRoute(next, activePath);
    if (page) {
      next.pages[page.route] = {
        ...page,
        templateId: selected.id,
        updatedAt: new Date().toISOString(),
      };
    } else {
      next.templateBindings[activePath] = selected.id;
    }

    setBusy(true);
    try {
      await commit(next, `${activeLabel} → ${selected.label} template'i atandı`);
      toast.success("Template ataması güncellendi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Template atanamadı.");
    } finally {
      setBusy(false);
    }
  };

  const saveMetadata = async () => {
    if (!selected || busy) return;
    const label = newName.trim() || selected.label;
    const next = structuredClone(document) as ThemeDocument;
    next.templates[selected.id] = {
      ...selected,
      label,
      description: newDescription.trim() || selected.description,
      pageType: selected.pageType || compatibility,
      version: Math.max(1, selected.version || 1),
      updatedAt: new Date().toISOString(),
    };

    setBusy(true);
    try {
      await commit(next, "Template bilgileri güncellendi");
      setNewName("");
      setNewDescription("");
      toast.success("Template bilgileri güncellendi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Template güncellenemedi.");
    } finally {
      setBusy(false);
    }
  };

  const deleteSelected = async () => {
    if (!selected || selectedUsage.count > 0 || protectedTemplate || busy) return;
    const next = structuredClone(document) as ThemeDocument;
    for (const sectionId of selected.sectionIds) {
      const section = next.sections[sectionId];
      for (const blockId of section?.blockIds || []) delete next.blocks[blockId];
      delete next.sections[sectionId];
    }
    delete next.templates[selected.id];

    setBusy(true);
    try {
      await commit(next, "Kullanılmayan template silindi");
      const fallback = templates.find((item) => item.id !== selected.id)?.id || "";
      setSelectedId(fallback);
      toast.success("Template silindi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Template silinemedi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[2147483615] grid place-items-center bg-black/35 p-3 backdrop-blur-sm">
      <div className="flex h-[min(820px,94dvh)] w-full max-w-[980px] overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl">
        <aside className="flex w-[300px] shrink-0 flex-col border-r border-black/10 bg-[#fafafa]">
          <header className="border-b border-black/10 p-4">
            <div className="flex items-center gap-2">
              <LayoutTemplate className="h-4 w-4" />
              <p className="min-w-0 flex-1 text-[11px] font-semibold">Template Manager</p>
              <button
                type="button"
                onClick={() => {
                  setCreating(true);
                  setNewName("");
                  setNewDescription("");
                }}
                className="flex h-8 items-center gap-1 rounded-lg bg-[#111] px-2.5 text-[7px] font-semibold text-white"
              >
                <Plus className="h-3 w-3" />Yeni
              </button>
            </div>
            <p className="mt-1 text-[8px] leading-4 text-black/40">{activeLabel} · {compatibility}</p>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {templates.map((template) => {
              const usage = templateUsage(document, template.id);
              const active = template.id === selectedId;
              const assigned = template.id === currentTemplateId;
              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(template.id);
                    setCreating(false);
                    setNewName("");
                    setNewDescription("");
                  }}
                  className={`mb-1 w-full rounded-lg border p-3 text-left ${active ? "border-black/20 bg-white shadow-sm" : "border-transparent hover:bg-white"}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[9px] font-semibold">{template.label}</span>
                    {assigned ? <span className="rounded-full bg-black px-1.5 py-0.5 text-[6px] font-semibold text-white">ATANMIŞ</span> : null}
                  </div>
                  <p className="mt-1 truncate text-[7px] text-black/35">{usage.count} kullanım · {template.sectionIds.length} bölüm · v{template.version || 1}</p>
                </button>
              );
            })}
            {!templates.length ? <p className="p-4 text-center text-[8px] leading-4 text-black/35">Bu page type ile uyumlu template yok.</p> : null}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-black/10 px-4">
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold">{creating ? "Yeni Template" : selected?.label || "Template Seç"}</p>
              <p className="mt-0.5 truncate text-[8px] text-black/40">{creating ? "Boş template oluştur" : selected?.id || "Soldan template seç"}</p>
            </div>
            <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-black/[0.04]" aria-label="Kapat"><X className="h-4 w-4" /></button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {!creating && selected ? (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-black/[0.07] p-3"><p className="text-[7px] text-black/35">Bölüm</p><p className="mt-1 text-[16px] font-semibold">{selected.sectionIds.length}</p></div>
                  <div className="rounded-xl border border-black/[0.07] p-3"><p className="text-[7px] text-black/35">Kullanım</p><p className="mt-1 text-[16px] font-semibold">{selectedUsage.count}</p></div>
                  <div className="rounded-xl border border-black/[0.07] p-3"><p className="text-[7px] text-black/35">Uyumluluk</p><p className="mt-1 truncate text-[9px] font-semibold">{selected.compatibility.join(", ")}</p></div>
                </div>

                {assignmentChanged ? (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <p className="text-[9px] font-semibold text-amber-950">Atama diff preview</p>
                    <p className="mt-1 text-[8px] leading-4 text-amber-900/70">
                      {current?.label || "Mevcut template yok"} ({current?.sectionIds.length || 0} bölüm) → {selected.label} ({selected.sectionIds.length} bölüm).
                      Bu atama section composition ve template-level component ayarlarını birlikte değiştirir.
                    </p>
                    <button type="button" disabled={busy} onClick={() => void assignSelected()} className="mt-3 h-9 rounded-lg bg-[#111] px-3 text-[8px] font-semibold text-white disabled:opacity-40">Bu Template'i Ata</button>
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[8px] font-medium text-emerald-900">Bu template şu an {activeLabel} üzerinde aktif.</div>
                )}

                <div className="mt-5 border-t border-black/[0.07] pt-5">
                  <p className="text-[9px] font-semibold">Template bilgileri</p>
                  <div className="mt-3 grid gap-3">
                    <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                      Ad
                      <input value={newName || selected.label} onChange={(event) => setNewName(event.target.value)} className="h-10 rounded-lg border border-black/10 px-3 text-[9px] font-medium outline-none" />
                    </label>
                    <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                      Açıklama
                      <textarea value={newDescription || selected.description || ""} onChange={(event) => setNewDescription(event.target.value)} className="min-h-20 resize-y rounded-lg border border-black/10 p-3 text-[9px] leading-5 outline-none" />
                    </label>
                    <button type="button" disabled={busy} onClick={() => void saveMetadata()} className="flex h-9 items-center justify-center gap-2 rounded-lg border border-black/10 bg-white text-[8px] font-semibold disabled:opacity-40"><Save className="h-3.5 w-3.5" />Bilgileri Kaydet</button>
                  </div>
                </div>

                <div className="mt-5 border-t border-black/[0.07] pt-5">
                  <p className="text-[9px] font-semibold">Kullanım referansları</p>
                  <div className="mt-2 rounded-xl bg-[#fafafa] p-3 text-[8px] leading-5 text-black/45">
                    {[...selectedUsage.pages.map((item) => `Sayfa · ${item}`), ...selectedUsage.routes.map((item) => `Route binding · ${item}`)].join("\n") || "Bu template henüz hiçbir page/route tarafından kullanılmıyor."}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" disabled={busy} onClick={() => void duplicateSelected()} className="flex h-9 items-center gap-2 rounded-lg border border-black/10 bg-white px-3 text-[8px] font-semibold disabled:opacity-40"><Copy className="h-3.5 w-3.5" />Template'i Kopyala</button>
                    <button type="button" disabled={busy || selectedUsage.count > 0 || protectedTemplate} onClick={() => void deleteSelected()} className="flex h-9 items-center gap-2 rounded-lg border border-red-200 bg-white px-3 text-[8px] font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-35"><Trash2 className="h-3.5 w-3.5" />Template'i Sil</button>
                  </div>
                  {(selectedUsage.count > 0 || protectedTemplate) ? (
                    <p className="mt-2 text-[7px] leading-4 text-black/35">
                      {protectedTemplate ? "Route/canonical template doğrudan silinmez." : "Template kullanımda; silmeden önce bağlı sayfa/route'ları başka template'e ata."}
                    </p>
                  ) : null}
                </div>
              </>
            ) : null}

            {creating ? (
              <div>
                <div className="rounded-xl border border-black/[0.08] bg-[#fafafa] p-4">
                  <p className="text-[10px] font-semibold">Yeni boş template</p>
                  <p className="mt-1 text-[8px] leading-4 text-black/35">Bu template {compatibility} page type ile uyumlu oluşturulur. Ardından template'i sayfaya atayıp Bölüm Ekle ile composition kurabilirsin.</p>
                </div>
                <div className="mt-4 grid gap-3">
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Template adı
                    <input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Örn. Editorial Product" className="h-10 rounded-lg border border-black/10 px-3 text-[9px] font-medium outline-none" />
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Açıklama
                    <textarea value={newDescription} onChange={(event) => setNewDescription(event.target.value)} placeholder="Bu template'in kullanım amacı…" className="min-h-20 resize-y rounded-lg border border-black/10 p-3 text-[9px] outline-none" />
                  </label>
                  <div className="flex justify-end gap-2">
                    <button type="button" disabled={busy} onClick={() => setCreating(false)} className="h-9 rounded-lg border border-black/10 bg-white px-3 text-[8px] font-semibold disabled:opacity-40">Vazgeç</button>
                    <button type="button" disabled={busy || !newName.trim()} onClick={() => void createBlank()} className="flex h-9 items-center gap-2 rounded-lg bg-[#111] px-3 text-[8px] font-semibold text-white disabled:opacity-35"><Plus className="h-3.5 w-3.5" />Boş Template Oluştur</button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
