"use client";

import {
  Ban,
  Box,
  Check,
  FileText,
  Globe,
  Hash,
  Search,
  ShoppingBag,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  SECTION_LIBRARY,
  type ThemeDocument,
} from "@ruth-commerce/commerce-core/store-design-v2";
import { adminRequest } from "@/lib/adminApi";

type PageOption = {
  path: string;
  label: string;
  group: string;
};

type ProductOption = {
  id: string | number;
  name?: string;
  slug?: string;
  price?: number;
};

type CollectionOption = {
  id: string | number;
  name?: string;
  slug?: string;
};

type ProductListResponse = {
  products?: ProductOption[];
  collections?: CollectionOption[];
};

type Props = {
  open: boolean;
  document: ThemeDocument;
  pages: PageOption[];
  activePath: string;
  targetLabel: string;
  currentHref?: string;
  currentTarget?: "_self" | "_blank";
  onApply: (href: string, target: "_self" | "_blank") => void;
  onClose: () => void;
};

type DestinationType = "page" | "collection" | "product" | "custom" | "anchor" | "none";

const TYPES: Array<{ key: DestinationType; label: string; icon: typeof FileText }> = [
  { key: "page", label: "Sayfa", icon: FileText },
  { key: "collection", label: "Koleksiyon", icon: ShoppingBag },
  { key: "product", label: "Ürün", icon: Box },
  { key: "custom", label: "Özel URL", icon: Globe },
  { key: "anchor", label: "Sayfa içi alan", icon: Hash },
  { key: "none", label: "Bağlantı yok", icon: Ban },
];

function inferType(href: string, pages: PageOption[]): DestinationType {
  if (!href) return "none";
  if (href.startsWith("#sd-section:")) return "anchor";
  if (href.startsWith("/collections/")) return "collection";
  if (href.startsWith("/products/")) return "product";
  if (pages.some((page) => page.path === href)) return "page";
  return "custom";
}

function activeTemplate(document: ThemeDocument, activePath: string) {
  const page = document.pages[activePath]
    || Object.values(document.pages).find((item) => item.route === activePath)
    || null;
  const id = page?.templateId
    || document.templateBindings[activePath]
    || (document.templates[activePath] ? activePath : "")
    || (document.templates[`route:${activePath}`] ? `route:${activePath}` : "");
  return id ? document.templates[id] || null : null;
}

export function StoreDesignDestinationPicker({
  open,
  document,
  pages,
  activePath,
  targetLabel,
  currentHref = "",
  currentTarget = "_self",
  onApply,
  onClose,
}: Props) {
  const [type, setType] = useState<DestinationType>("page");
  const [query, setQuery] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const [anchorId, setAnchorId] = useState("");
  const [openNewTab, setOpenNewTab] = useState(false);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [collections, setCollections] = useState<CollectionOption[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [catalogError, setCatalogError] = useState("");

  useEffect(() => {
    if (!open) return;
    setType(inferType(currentHref, pages));
    setQuery("");
    setCustomUrl(currentHref && !currentHref.startsWith("#sd-section:") ? currentHref : "");
    setAnchorId(currentHref.startsWith("#sd-section:") ? decodeURIComponent(currentHref.slice("#sd-section:".length)) : "");
    setOpenNewTab(currentTarget === "_blank");
  }, [open, currentHref, currentTarget, pages]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setLoadingCatalog(true);
      setCatalogError("");
      const q = query.trim();
      const url = `/api/products/list?page=1&pageSize=100${q ? `&q=${encodeURIComponent(q)}` : ""}`;
      adminRequest<ProductListResponse>(url, { force: true, timeoutMs: 8_000 })
        .then((result) => {
          if (!active) return;
          setProducts(Array.isArray(result.products) ? result.products : []);
          setCollections(Array.isArray(result.collections) ? result.collections : []);
        })
        .catch((error) => {
          if (!active) return;
          setCatalogError(error instanceof Error ? error.message : "Ürün ve koleksiyonlar yüklenemedi.");
        })
        .finally(() => {
          if (active) setLoadingCatalog(false);
        });
    }, query.trim() ? 220 : 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [open, query]);

  const pageOptions = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    return pages
      .filter((page) => !needle || `${page.label} ${page.path}`.toLocaleLowerCase("tr-TR").includes(needle))
      .slice(0, 80);
  }, [pages, query]);

  const collectionOptions = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    return collections
      .filter((item) => !needle || `${item.name || ""} ${item.slug || ""}`.toLocaleLowerCase("tr-TR").includes(needle))
      .slice(0, 80);
  }, [collections, query]);

  const template = useMemo(() => activeTemplate(document, activePath), [document, activePath]);
  const anchorOptions = useMemo(() => (template?.sectionIds || []).map((id) => {
    const section = document.sections[id];
    const definition = section ? SECTION_LIBRARY.find((item) => item.type === section.type) : null;
    const settings = section?.settings && typeof section.settings === "object" ? section.settings as Record<string, unknown> : {};
    const customLabel = typeof settings.title === "string" && settings.title.trim()
      ? settings.title.trim()
      : typeof settings.heading === "string" && settings.heading.trim()
        ? settings.heading.trim()
        : "";
    return {
      id,
      label: customLabel || definition?.label || section?.type || "Bölüm",
    };
  }), [document.sections, template]);

  if (!open) return null;

  const finish = (href: string, target: "_self" | "_blank" = openNewTab ? "_blank" : "_self") => {
    onApply(href, target);
    onClose();
  };

  const renderCatalogList = () => {
    const list = type === "page"
      ? pageOptions.map((item) => ({ key: item.path, label: item.label, detail: item.path, href: item.path }))
      : type === "collection"
        ? collectionOptions.map((item) => ({ key: String(item.id), label: item.name || "Koleksiyon", detail: item.slug || "", href: `/collections/${item.slug || ""}` }))
        : products.map((item) => ({ key: String(item.id), label: item.name || "Ürün", detail: item.slug || "", href: `/products/${item.slug || ""}` }));

    if (loadingCatalog && type !== "page" && !list.length) {
      return <div className="grid min-h-28 place-items-center text-[12px] text-black/45">Yükleniyor…</div>;
    }
    if (catalogError && type !== "page" && !list.length) {
      return <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-[11px] text-red-800">{catalogError}</div>;
    }
    if (!list.length) {
      return <div className="grid min-h-28 place-items-center rounded-xl border border-dashed border-black/10 text-center text-[11px] text-black/40">Sonuç bulunamadı.</div>;
    }

    return (
      <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
        {list.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => finish(item.href)}
            className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 text-left hover:bg-black/[0.035]"
          >
            <span className="min-w-0">
              <span className="block truncate text-[12px] font-semibold text-black/80">{item.label}</span>
              <span className="mt-0.5 block truncate text-[10px] text-black/40">{item.detail}</span>
            </span>
            <Check className="h-4 w-4 shrink-0 text-black/30" />
          </button>
        ))}
      </div>
    );
  };

  return (
    <div
      className="sd-modal-backdrop fixed inset-0 z-[2147483642] grid place-items-center bg-black/35 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Hedef seç"
        className="sd-modal-card flex w-full max-w-[560px] flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl"
        style={{ maxHeight: "80dvh" }}
      >
        <header className="flex min-h-14 items-center gap-3 border-b border-black/[0.08] px-4">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-black/85">Hedef seç</p>
            <p className="mt-0.5 truncate text-[10px] text-black/40">{targetLabel}</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-black/[0.04]" aria-label="Kapat">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-3 gap-2">
            {TYPES.map((item) => {
              const Icon = item.icon;
              const active = type === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setType(item.key)}
                  className={`flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-xl border px-2 text-[11px] font-semibold ${active ? "border-[var(--sd-accent)] bg-[color-mix(in_srgb,var(--sd-accent)_12%,white)]" : "border-black/[0.08] bg-black/[0.015]"}`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </div>

          {["page", "collection", "product"].includes(type) ? (
            <div className="mt-4">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/35" />
                <input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={type === "page" ? "Sayfa ara…" : type === "collection" ? "Koleksiyon ara…" : "Ürün ara…"}
                  className="sd-field h-10 w-full rounded-xl border border-black/10 bg-white pl-9 pr-3 text-[12px] outline-none"
                />
              </label>
              <div className="mt-2">{renderCatalogList()}</div>
            </div>
          ) : null}

          {type === "custom" ? (
            <div className="mt-4 grid gap-3">
              <label className="grid gap-1.5 text-[11px] font-semibold text-black/55">
                Web adresi
                <input
                  autoFocus
                  value={customUrl}
                  onChange={(event) => setCustomUrl(event.target.value)}
                  placeholder="/sayfa veya https://..."
                  className="sd-field h-10 rounded-xl border border-black/10 bg-white px-3 text-[12px] outline-none"
                />
              </label>
              <button
                type="button"
                disabled={!customUrl.trim()}
                onClick={() => finish(customUrl.trim())}
                className="sd-primary-button h-10 rounded-xl px-4 text-[12px] font-semibold disabled:opacity-40"
              >
                Uygula
              </button>
            </div>
          ) : null}

          {type === "anchor" ? (
            <div className="mt-4 grid gap-3">
              <label className="grid gap-1.5 text-[11px] font-semibold text-black/55">
                Bu sayfadaki bölüm
                <select
                  autoFocus
                  value={anchorId}
                  onChange={(event) => setAnchorId(event.target.value)}
                  className="sd-field h-10 rounded-xl border border-black/10 bg-white px-3 text-[12px] outline-none"
                >
                  <option value="">Bölüm seç…</option>
                  {anchorOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
              <button
                type="button"
                disabled={!anchorId}
                onClick={() => finish(`#sd-section:${encodeURIComponent(anchorId)}`, "_self")}
                className="sd-primary-button h-10 rounded-xl px-4 text-[12px] font-semibold disabled:opacity-40"
              >
                Uygula
              </button>
            </div>
          ) : null}

          {type === "none" ? (
            <div className="mt-4 rounded-xl border border-black/[0.08] bg-black/[0.015] p-4 text-center">
              <p className="text-[12px] text-black/55">Bu öğenin bağlantısı kaldırılacak.</p>
              <button type="button" onClick={() => finish("", "_self")} className="sd-primary-button mt-3 h-10 rounded-xl px-4 text-[12px] font-semibold">
                Bağlantıyı kaldır
              </button>
            </div>
          ) : null}

          {type !== "none" && type !== "anchor" ? (
            <label className="mt-4 flex items-center gap-2 border-t border-black/[0.07] pt-4 text-[12px] text-black/65">
              <input
                type="checkbox"
                checked={openNewTab}
                onChange={(event) => setOpenNewTab(event.target.checked)}
                className="h-4 w-4"
              />
              Yeni sekmede aç
            </label>
          ) : null}
        </div>
      </div>
    </div>
  );
}
