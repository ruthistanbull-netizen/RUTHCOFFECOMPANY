"use client";

import { Archive, Copy, Plus, Save, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  STORE_DESIGN_SCHEMA_VERSION,
  customPageRoute,
  flattenThemeRedirects,
  isReservedPageSlug,
  normalizePageSlug,
  type PageCompatibility,
  type PageRecord,
  type PageStatus,
  type SeoDocument,
  type ThemeDocument,
} from "@ruth-commerce/commerce-core/store-design-v2";
import { useExactToast } from "@/components/base44-exact/primitives";

type Props = {
  document: ThemeDocument;
  activePath: string;
  mode: "create" | "edit";
  onClose: () => void;
  onApply: (next: ThemeDocument, nextPath: string) => Promise<void>;
};

type FormState = {
  name: string;
  slug: string;
  compatibility: PageCompatibility;
  status: PageStatus;
  templateId: string;
  seoTitle: string;
  seoDescription: string;
  ogTitle: string;
  ogDescription: string;
  ogAssetId: string;
  canonical: string;
  robots: SeoDocument["robots"];
};

function id(prefix: string) {
  const random = globalThis.crypto?.randomUUID?.().replace(/-/g, "") || Math.random().toString(36).slice(2);
  return `${prefix}-${random}`.slice(0, 160);
}

function pageByRoute(document: ThemeDocument, path: string) {
  return document.pages[path] || Object.values(document.pages).find((page) => page.route === path) || null;
}

function seoFor(document: ThemeDocument, page: PageRecord | null) {
  return page ? document.seo[page.seoId] : undefined;
}

function compatibilityFor(document: ThemeDocument, page: PageRecord | null): PageCompatibility {
  const template = page ? document.templates[page.templateId] : null;
  return template?.compatibility?.[0] || "content";
}

function initialForm(document: ThemeDocument, page: PageRecord | null): FormState {
  const seo = seoFor(document, page);
  return {
    name: page?.name || "",
    slug: page?.slug || "",
    compatibility: compatibilityFor(document, page),
    status: page?.status || "draft",
    templateId: page?.templateId || "__new__",
    seoTitle: seo?.title || "",
    seoDescription: seo?.description || "",
    ogTitle: seo?.openGraphTitle || "",
    ogDescription: seo?.openGraphDescription || "",
    ogAssetId: seo?.openGraphAssetId || "",
    canonical: seo?.canonical || "",
    robots: seo?.robots || "index,follow",
  };
}

function uniqueSlug(document: ThemeDocument, seed: string, exceptPageId?: string) {
  const base = normalizePageSlug(seed) || "yeni-sayfa";
  for (let index = 0; index < 200; index += 1) {
    const candidate = index === 0 ? base : `${base}-${index + 1}`;
    const route = customPageRoute(candidate);
    const occupied = Object.values(document.pages).some((page) => page.id !== exceptPageId && page.route === route);
    if (!occupied && !isReservedPageSlug(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

function cloneTemplateTree(document: ThemeDocument, sourceTemplateId: string, nextPageId: string) {
  const source = document.templates[sourceTemplateId];
  const templateId = `page:${nextPageId}`;
  if (!source) {
    return {
      templateId,
      templates: {
        ...document.templates,
        [templateId]: {
          id: templateId,
          label: "Boş Sayfa",
          compatibility: ["content"] as PageCompatibility[],
          sectionIds: [],
          componentSettings: {},
          schemaVersion: STORE_DESIGN_SCHEMA_VERSION,
        },
      },
      sections: document.sections,
      blocks: document.blocks,
    };
  }

  const sections = { ...document.sections };
  const blocks = { ...document.blocks };
  const sectionIds: string[] = [];

  for (const sourceSectionId of source.sectionIds) {
    const sourceSection = document.sections[sourceSectionId];
    if (!sourceSection) continue;
    const sectionId = id(`section-${sourceSection.type}`);
    const blockIds: string[] = [];

    for (const sourceBlockId of sourceSection.blockIds || []) {
      const sourceBlock = document.blocks[sourceBlockId];
      if (!sourceBlock) continue;
      const blockId = id(`block-${sourceBlock.type}`);
      blocks[blockId] = structuredClone({ ...sourceBlock, id: blockId });
      blockIds.push(blockId);
    }

    sections[sectionId] = structuredClone({ ...sourceSection, id: sectionId, blockIds });
    sectionIds.push(sectionId);
  }

  return {
    templateId,
    templates: {
      ...document.templates,
      [templateId]: {
        ...structuredClone(source),
        id: templateId,
        label: `${source.label} Kopya`,
        sectionIds,
        schemaVersion: STORE_DESIGN_SCHEMA_VERSION,
      },
    },
    sections,
    blocks,
  };
}

export function StoreDesignPageManager({ document, activePath, mode, onClose, onApply }: Props) {
  const toast = useExactToast();
  const editingPage = mode === "edit" ? pageByRoute(document, activePath) : null;
  const routeLocked = Boolean(editingPage?.reserved || editingPage?.kind === "system" || editingPage?.kind === "catalog" || editingPage?.kind === "protected" || editingPage?.kind === "utility");
  const canDuplicate = Boolean(editingPage && !routeLocked && (editingPage.kind === "merchant" || editingPage.kind === "managed-static"));
  const fixedCompatibility = editingPage ? compatibilityFor(document, editingPage) : null;
  const robotsLocked = Boolean(routeLocked && fixedCompatibility && ["checkout", "account", "search"].includes(fixedCompatibility));
  const [form, setForm] = useState<FormState>(() => initialForm(document, editingPage));
  const [busy, setBusy] = useState(false);

  const compatibleTemplates = useMemo(() => (
    Object.values(document.templates).filter((template) => template.compatibility.includes(form.compatibility))
  ), [document.templates, form.compatibility]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = async () => {
    if (busy) return;
    const name = form.name.trim();
    const slug = routeLocked && editingPage ? editingPage.slug : normalizePageSlug(form.slug || name);
    if (!name) return toast.error("Sayfa adı boş olamaz.");
    if (!slug) return toast.error("Geçerli bir slug gir.");
    if (!routeLocked && isReservedPageSlug(slug)) return toast.error("Bu slug sistem tarafından korunuyor.");

    const route = routeLocked && editingPage ? editingPage.route : customPageRoute(slug);
    const duplicate = Object.values(document.pages).find((page) => page.route === route && page.id !== editingPage?.id);
    if (duplicate) return toast.error("Bu URL başka bir sayfa tarafından kullanılıyor.");

    const canonical = form.canonical.trim();
    if (canonical && !canonical.startsWith("/") && !/^https:\/\//i.test(canonical)) {
      return toast.error("Canonical relative path veya https URL olmalı.");
    }

    setBusy(true);
    try {
      const now = new Date().toISOString();
      const next = structuredClone(document) as ThemeDocument;
      const pageId = editingPage?.id || id("page");
      const seoId = editingPage?.seoId || `seo:${pageId}`;
      let templateId = form.templateId;

      if (templateId === "__new__" || !next.templates[templateId]) {
        templateId = editingPage?.templateId || `page:${pageId}`;
        if (!next.templates[templateId]) {
          next.templates[templateId] = {
            id: templateId,
            label: `${name} Şablonu`,
            compatibility: [form.compatibility],
            sectionIds: [],
            componentSettings: {},
            schemaVersion: STORE_DESIGN_SCHEMA_VERSION,
          };
        }
      }

      if (editingPage && editingPage.route !== route) {
        delete next.pages[editingPage.route];
        if (editingPage.status === "published" || editingPage.publishedAt) {
          next.redirects = flattenThemeRedirects([
            ...next.redirects,
            {
              id: id("redirect"),
              from: editingPage.route,
              to: route,
              sourcePath: editingPage.route,
              targetPath: route,
              status: 301,
              statusCode: 301,
              reason: "page-slug-change",
              pageId,
              active: true,
              createdAt: now,
            },
          ]);
        }
      }

      next.pages[route] = {
        id: pageId,
        name,
        slug,
        route,
        kind: editingPage?.kind || "merchant",
        type: editingPage?.type || editingPage?.kind || "merchant",
        templateId,
        status: routeLocked && editingPage ? editingPage.status : form.status,
        seoId,
        reserved: editingPage?.reserved || false,
        createdAt: editingPage?.createdAt || now,
        updatedAt: now,
        publishedAt: editingPage?.publishedAt || null,
        schemaVersion: STORE_DESIGN_SCHEMA_VERSION,
      };

      next.seo[seoId] = {
        title: form.seoTitle.trim(),
        description: form.seoDescription.trim(),
        openGraphTitle: form.ogTitle.trim() || undefined,
        openGraphDescription: form.ogDescription.trim() || undefined,
        openGraphAssetId: form.ogAssetId || undefined,
        canonical: canonical || undefined,
        robots: form.robots,
        robotsPreset: form.robots,
        structuredDataPolicy: next.seo[seoId]?.structuredDataPolicy || "inherit",
      };
      next.revision = Math.max(next.revision, document.revision) + 1;

      await onApply(next, route);
      toast.success(editingPage ? "Sayfa ayarları güncellendi." : "Yeni sayfa taslağı oluşturuldu.");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sayfa kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const duplicatePage = async () => {
    if (!editingPage || !canDuplicate || busy) return;
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const next = structuredClone(document) as ThemeDocument;
      const pageId = id("page");
      const slug = uniqueSlug(next, `${editingPage.slug}-kopya`);
      const route = customPageRoute(slug);
      const cloned = cloneTemplateTree(next, editingPage.templateId, pageId);
      next.templates = cloned.templates;
      next.sections = cloned.sections;
      next.blocks = cloned.blocks;
      const seoId = `seo:${pageId}`;
      const sourceSeo = next.seo[editingPage.seoId];

      next.pages[route] = {
        ...structuredClone(editingPage),
        id: pageId,
        name: `${editingPage.name} Kopya`,
        slug,
        route,
        templateId: cloned.templateId,
        status: "draft",
        seoId,
        reserved: false,
        createdAt: now,
        updatedAt: now,
        publishedAt: null,
        schemaVersion: STORE_DESIGN_SCHEMA_VERSION,
      };
      next.seo[seoId] = sourceSeo ? structuredClone(sourceSeo) : {
        title: "",
        description: "",
        robots: "index,follow",
        robotsPreset: "index,follow",
        structuredDataPolicy: "inherit",
      };
      next.revision = Math.max(next.revision, document.revision) + 1;

      await onApply(next, route);
      toast.success("Sayfa kopyalandı; yeni kopya taslak olarak açıldı.");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sayfa kopyalanamadı.");
    } finally {
      setBusy(false);
    }
  };

  const archivePage = async () => {
    if (!editingPage || editingPage.reserved || busy) return;
    setBusy(true);
    try {
      const next = structuredClone(document) as ThemeDocument;
      const route = editingPage.route;
      next.pages[route] = {
        ...next.pages[route],
        status: "archived",
        updatedAt: new Date().toISOString(),
      };
      next.revision = Math.max(next.revision, document.revision) + 1;
      await onApply(next, "/");
      toast.success("Sayfa arşivlendi. Canlı route yalnız yayın sonrası kapanır.");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sayfa arşivlenemedi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[2147483600] grid place-items-center bg-black/35 p-3 backdrop-blur-sm">
      <div className="flex max-h-[92dvh] w-full max-w-[720px] flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-black/10 px-4">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold">{editingPage ? "Sayfa Ayarları" : "Yeni Sayfa"}</p>
            <p className="mt-0.5 truncate text-[8px] text-black/40">{editingPage?.route || "Yeni storefront sayfası taslağı"}</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-black/[0.04]" aria-label="Kapat">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1.5 text-[9px] font-semibold text-black/50">
              Sayfa adı
              <input value={form.name} onChange={(event) => set("name", event.target.value)} className="h-10 rounded-lg border border-black/10 px-3 text-[10px] font-medium text-black outline-none focus:border-black/25" placeholder="Örn. Kahve Rehberi" />
            </label>
            <label className="grid gap-1.5 text-[9px] font-semibold text-black/50">
              Slug / URL
              <div>
                <input disabled={routeLocked} value={form.slug} onChange={(event) => set("slug", event.target.value)} className="h-10 w-full rounded-lg border border-black/10 px-3 text-[10px] font-medium text-black outline-none focus:border-black/25 disabled:bg-black/[0.03] disabled:text-black/35" placeholder="kahve-rehberi" />
                <p className="mt-1 text-[8px] font-normal text-black/35">{routeLocked && editingPage ? `${editingPage.route} · Sistem route'u korunuyor` : customPageRoute(form.slug || form.name || "sayfa-adi")}</p>
              </div>
            </label>
            <label className="grid gap-1.5 text-[9px] font-semibold text-black/50">
              Sayfa tipi
              <select disabled={routeLocked} value={form.compatibility} onChange={(event) => set("compatibility", event.target.value as PageCompatibility)} className="h-10 rounded-lg border border-black/10 bg-white px-3 text-[10px] font-medium text-black outline-none disabled:bg-black/[0.03] disabled:text-black/35">
                <option value="content">İçerik Sayfası</option>
                <option value="landing">Landing / Kampanya</option>
                <option value="legal">Yasal Sayfa</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-[9px] font-semibold text-black/50">
              Durum
              <select disabled={routeLocked} value={form.status} onChange={(event) => set("status", event.target.value as PageStatus)} className="h-10 rounded-lg border border-black/10 bg-white px-3 text-[10px] font-medium text-black outline-none disabled:bg-black/[0.03] disabled:text-black/35">
                <option value="draft">Taslak</option>
                <option value="published">Yayına Hazır</option>
                <option value="scheduled">Planlandı</option>
                <option value="archived">Arşiv</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-[9px] font-semibold text-black/50 md:col-span-2">
              Template
              <select value={form.templateId} onChange={(event) => set("templateId", event.target.value)} className="h-10 rounded-lg border border-black/10 bg-white px-3 text-[10px] font-medium text-black outline-none">
                <option value="__new__">Yeni boş şablon</option>
                {compatibleTemplates.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}
              </select>
            </label>
          </div>

          <div className="my-5 border-t border-black/[0.07]" />

          <div>
            <p className="text-[10px] font-semibold">SEO & Paylaşım</p>
            <p className="mt-1 text-[8px] leading-4 text-black/40">SEO alanları sayfa kaydından ayrı tutulur; boş alanlar storefront fallback politikasını kullanır.</p>
          </div>

          <div className="mt-3 grid gap-4">
            <label className="grid gap-1.5 text-[9px] font-semibold text-black/50">
              SEO başlık <span className="font-normal text-black/30">{form.seoTitle.length}/180</span>
              <input value={form.seoTitle} maxLength={180} onChange={(event) => set("seoTitle", event.target.value)} className="h-10 rounded-lg border border-black/10 px-3 text-[10px] font-medium text-black outline-none" />
            </label>
            <label className="grid gap-1.5 text-[9px] font-semibold text-black/50">
              Meta açıklama <span className="font-normal text-black/30">{form.seoDescription.length}/400</span>
              <textarea value={form.seoDescription} maxLength={400} onChange={(event) => set("seoDescription", event.target.value)} className="min-h-20 resize-y rounded-lg border border-black/10 p-3 text-[10px] font-medium text-black outline-none" />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1.5 text-[9px] font-semibold text-black/50">
                Open Graph başlık
                <input value={form.ogTitle} onChange={(event) => set("ogTitle", event.target.value)} className="h-10 rounded-lg border border-black/10 px-3 text-[10px] font-medium text-black outline-none" />
              </label>
              <label className="grid gap-1.5 text-[9px] font-semibold text-black/50">
                Robots
                <select disabled={robotsLocked} value={form.robots} onChange={(event) => set("robots", event.target.value as SeoDocument["robots"])} className="h-10 rounded-lg border border-black/10 bg-white px-3 text-[10px] font-medium text-black outline-none disabled:bg-black/[0.03] disabled:text-black/35">
                  <option value="index,follow">index,follow</option>
                  <option value="noindex,follow">noindex,follow</option>
                  <option value="noindex,nofollow">noindex,nofollow</option>
                </select>
              </label>
            </div>
            <label className="grid gap-1.5 text-[9px] font-semibold text-black/50">
              Open Graph açıklama
              <textarea value={form.ogDescription} onChange={(event) => set("ogDescription", event.target.value)} className="min-h-16 resize-y rounded-lg border border-black/10 p-3 text-[10px] font-medium text-black outline-none" />
            </label>
            <label className="grid gap-1.5 text-[9px] font-semibold text-black/50">
              Open Graph görseli
              <select value={form.ogAssetId} onChange={(event) => set("ogAssetId", event.target.value)} className="h-10 rounded-lg border border-black/10 bg-white px-3 text-[10px] font-medium text-black outline-none">
                <option value="">SEO görseli yok / fallback</option>
                {Object.values(document.media).filter((asset) => asset.type === "image").map((asset) => (
                  <option key={asset.assetId} value={asset.assetId}>{asset.assetId} · v{asset.version || 1}</option>
                ))}
              </select>
              {form.ogAssetId && document.media[form.ogAssetId]?.url ? (
                <img src={document.media[form.ogAssetId]!.url} alt="" className="mt-1 h-20 w-32 rounded-lg border border-black/[0.08] object-cover" />
              ) : null}
            </label>
            <label className="grid gap-1.5 text-[9px] font-semibold text-black/50">
              Canonical URL
              <input value={form.canonical} onChange={(event) => set("canonical", event.target.value)} className="h-10 rounded-lg border border-black/10 px-3 text-[10px] font-medium text-black outline-none" placeholder="Boş = self canonical" />
            </label>
          </div>
        </div>

        <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-black/10 bg-[#fafafa] p-3">
          {editingPage ? (
            <>
              {canDuplicate ? (
                <button type="button" disabled={busy} onClick={() => void duplicatePage()} className="flex h-10 items-center gap-2 rounded-lg border border-black/10 bg-white px-3 text-[9px] font-semibold disabled:opacity-40">
                  <Copy className="h-3.5 w-3.5" />Çoğalt
                </button>
              ) : null}
              {!editingPage.reserved ? (
                <button type="button" disabled={busy} onClick={() => void archivePage()} className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-white px-3 text-[9px] font-semibold text-red-700 disabled:opacity-40">
                  <Archive className="h-3.5 w-3.5" />Arşivle
                </button>
              ) : null}
            </>
          ) : (
            <div className="flex items-center gap-2 text-[8px] text-black/40"><Plus className="h-3.5 w-3.5" />Sayfa önce draft olarak oluşur.</div>
          )}
          <div className="flex-1" />
          <button type="button" disabled={busy} onClick={onClose} className="h-10 rounded-lg border border-black/10 bg-white px-4 text-[9px] font-semibold disabled:opacity-40">Vazgeç</button>
          <button type="button" disabled={busy} onClick={() => void submit()} className="flex h-10 items-center gap-2 rounded-lg bg-[#111] px-4 text-[9px] font-semibold text-white disabled:opacity-40">
            <Save className="h-3.5 w-3.5" />{busy ? "Kaydediliyor…" : editingPage ? "Değişiklikleri Uygula" : "Sayfayı Oluştur"}
          </button>
        </footer>
      </div>
    </div>
  );
}
