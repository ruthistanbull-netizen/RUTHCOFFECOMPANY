"use client";

import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronDown,
  CircleDot,
  Copy,
  History,
  Images,
  LayoutTemplate,
  Link2,
  MoreHorizontal,
  Monitor,
  PanelLeft,
  PanelRight,
  Plus,
  Redo2,
  RefreshCw,
  Save,
  Send,
  SlidersHorizontal,
  Smartphone,
  Settings2,
  Undo2,
  X,
  Eye,
  EyeOff,
  FileText,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  STORE_DESIGN_MESSAGES,
  STORE_DESIGN_SCHEMA_VERSION,
  SECTION_LIBRARY_BY_TYPE,
  analyzeThemeDocumentReferences,
  createEmptyThemeDocument,
  normalizeThemeDocument,
  type EditorScope,
  type ThemeReferenceIssue,
  type PageCompatibility,
  type ThemeDocument,
} from "@ruth-commerce/commerce-core/store-design-v2";
import { normalizeThemeSectionSettings } from "@ruth-commerce/commerce-core/theme-sections";
import { adminRequest } from "@/lib/adminApi";
import {
  normalizeThemeCustomizerSettings,
  type ThemeCustomizerSettings,
} from "@/lib/themeCustomizer";
import { useExactToast } from "@/components/base44-exact/primitives";
import { StoreDesignPageManager } from "@/components/theme/StoreDesignPageManager";
import { StoreDesignSectionManager } from "@/components/theme/StoreDesignSectionManager";
import { StoreDesignMediaLibrary } from "@/components/theme/StoreDesignMediaLibrary";
import { StoreDesignTemplateManager } from "@/components/theme/StoreDesignTemplateManager";
import { StoreDesignRedirectManager } from "@/components/theme/StoreDesignRedirectManager";
import { StoreDesignSnapshotManager } from "@/components/theme/StoreDesignSnapshotManager";
import { StoreDesignPublishReport } from "@/components/theme/StoreDesignPublishReport";
import { StoreDesignDestinationPicker } from "@/components/theme/StoreDesignDestinationPicker";
import { StoreDesignMobileDockV22 } from "@/components/theme/StoreDesignMobileDockV22";

type Device = "desktop" | "mobile";
type PageItem = {
  path: string;
  label: string;
  group: string;
  previewPath?: string;
  template?: boolean;
};

type SelectedTarget = {
  id: string;
  type: string;
  label: string;
  instanceKey?: string;
  defaultScope: EditorScope;
  allowedScopes: EditorScope[];
  controlGroups: string[];
  protectedFields: string[];
  breadcrumb: Array<{ id: string; type: string; label: string }>;
  current: {
    visible?: boolean;
    textAlign?: string;
    opacity?: number;
    borderRadius?: number;
    backgroundColor?: string;
    color?: string;
    width?: number;
    height?: number;
    order?: number;
    content?: { text?: string } | null;
    link?: { href?: string; target?: "_self" | "_blank" } | null;
    media?: { kind?: "image" | "video"; src?: string; alt?: string; objectFit?: string; objectPosition?: string } | null;
    grid?: { columns?: number; gapX?: number; gapY?: number; maxWidth?: string } | null;
    card?: {
      density?: "s" | "m" | "l";
      imageRatio?: "1/1" | "4/5" | "3/4";
      titleLines?: number;
      showPrice?: boolean;
      showQuickAdd?: boolean;
    } | null;
  };
};

type ContextMenuState = {
  x: number;
  y: number;
  target: SelectedTarget;
};

type QuickMediaEditState = {
  target: SelectedTarget;
  scope: EditorScope;
  device: Device;
  page: PageItem;
  mediaType: "image" | "video" | "any";
  beforeOverride: unknown;
  visibleSource: string;
};

type StoreDesignResponse = {
  draft?: unknown;
  published?: unknown;
  draftUpdatedAt?: string | null;
  publishedUpdatedAt?: string | null;
};

type SemanticHistoryEntry = {
  kind: "semantic";
  target: SelectedTarget;
  scope: EditorScope;
  device: Device;
  path: string;
  before: unknown;
  after: unknown;
};

type SemanticBatchHistoryEntry = {
  kind: "semantic-batch";
  label: string;
  patches: SemanticHistoryEntry[];
};

type StructureHistoryEntry = {
  kind: "structure";
  label: string;
  before: ThemeDocument;
  after: ThemeDocument;
  pagePath: string;
  reload: boolean;
};

type EditorHistoryEntry = SemanticHistoryEntry | SemanticBatchHistoryEntry | StructureHistoryEntry;

const RAW_STOREFRONT_URL = process.env.NEXT_PUBLIC_STOREFRONT_URL || "https://rostacoffecompany.zeabur.app";
const STOREFRONT_ORIGIN = (() => {
  try { return new URL(RAW_STOREFRONT_URL).origin; }
  catch { return "https://rostacoffecompany.zeabur.app"; }
})();
const PREVIEW_SCROLL_MESSAGE = "store-design-v2:preview-scroll";
const PREVIEW_DOCUMENT_MESSAGE = "store-design-v2:document-sync";

function previewUrl(path: string, previewToken: string) {
  const url = new URL(path || "/", STOREFRONT_ORIGIN);
  url.searchParams.set("themeEditor", "1");
  url.searchParams.set("storeDesignV2", "1");
  if (previewToken) url.searchParams.set("storeDesignV2Preview", previewToken);
  if (typeof window !== "undefined") url.searchParams.set("editorOrigin", window.location.origin);
  return url.toString();
}

function cleanPreviewPath(page: PageItem) {
  const candidate = page.previewPath || (page.template ? "/" : page.path) || "/";
  try {
    const url = new URL(candidate, STOREFRONT_ORIGIN);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

function editorUid(prefix: string) {
  const random = globalThis.crypto?.randomUUID?.().replace(/-/g, "") || Math.random().toString(36).slice(2);
  return `${prefix}-${random}`.slice(0, 160);
}

function scopeLabel(scope: EditorScope) {
  if (scope === "instance") return "Bu öğe";
  if (scope === "section") return "Bu bölüm";
  if (scope === "family") return "Benzer öğeler";
  if (scope === "template") return "Bu sayfa türü";
  return "Tüm site";
}

function controlGroupLabel(group: string) {
  const labels: Record<string, string> = {
    content: "İçerik",
    data: "Veri kaynağı",
    typography: "Yazı",
    media: "Görsel ve medya",
    layout: "Düzen",
    style: "Görünüm",
    responsive: "Mobil ayarları",
    animation: "Hareket",
    card: "Kart görünümü",
    grid: "Izgara düzeni",
    visibility: "Görünürlük",
    spacing: "Boşluk",
    form: "Form",
    seo: "Arama görünümü",
    accessibility: "Erişilebilirlik",
    advanced: "Gelişmiş",
  };
  return labels[group] || "Diğer";
}

function groupPages(pages: PageItem[]) {
  const groups = new Map<string, PageItem[]>();
  for (const page of pages) groups.set(page.group || "Sayfalar", [...(groups.get(page.group || "Sayfalar") || []), page]);
  return [...groups.entries()];
}

function pageCompatibility(page: PageItem): PageCompatibility {
  if (page.path === "/") return "home";
  if (page.path.startsWith("/products/") || page.path === "/products/[slug]") return "product";
  if (page.path.startsWith("/category/") || page.path.startsWith("/categories/") || page.path === "/category/[slug]") return "category";
  if (page.path.startsWith("/collections/") || page.path === "/collections/[slug]") return "collection";
  if (page.path.startsWith("/search")) return "search";
  if (page.path.startsWith("/account")) return "account";
  if (page.path.startsWith("/cart")) return "cart";
  if (page.path.startsWith("/checkout")) return "checkout";
  if (/\/(privacy|kvkk|terms|commercial-communication-consent)/.test(page.path)) return "legal";
  return page.template ? "utility" : "content";
}

function setNested(target: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split(".").filter(Boolean);
  if (!parts.length) return;
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    const existing = cursor[part];
    if (!existing || typeof existing !== "object" || Array.isArray(existing)) cursor[part] = {};
    cursor = cursor[part] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]!] = value;
}

function deleteNested(target: Record<string, unknown>, path: string) {
  const parts = path.split(".").filter(Boolean);
  if (!parts.length) return;
  const stack: Array<{ parent: Record<string, unknown>; key: string }> = [];
  let cursor: Record<string, unknown> = target;

  for (const part of parts.slice(0, -1)) {
    const value = cursor[part];
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    stack.push({ parent: cursor, key: part });
    cursor = value as Record<string, unknown>;
  }

  delete cursor[parts[parts.length - 1]!];

  for (const { parent, key } of stack.reverse()) {
    const value = parent[key];
    if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value as Record<string, unknown>).length === 0) {
      delete parent[key];
    }
  }
}

function writeNested(target: Record<string, unknown>, path: string, value: unknown) {
  if (value === null) deleteNested(target, path);
  else setNested(target, path, value);
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function globalInstanceSemanticKey(targetId: string) {
  return `id:${encodeURIComponent(targetId).replace(/\./g, "%2E")}`;
}

function flattenResponsiveLeaves(value: unknown, prefix = ""): Array<[string, unknown]> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return prefix ? [[prefix, value]] : [];
  const output: Array<[string, unknown]> = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    output.push(...flattenResponsiveLeaves(child, path));
  }
  return output;
}

function sectionRegistration(target: SelectedTarget) {
  const entry = [...target.breadcrumb].reverse().find((item) => item.id.startsWith("section:"));
  return entry ? { id: entry.id.slice("section:".length), type: entry.type } : null;
}

function responsiveSettingsFor(
  document: ThemeDocument,
  target: SelectedTarget,
  scope: EditorScope,
  page: PageItem,
) {
  const globalContainer = target.type.startsWith("header")
    || target.type.includes("menu")
    || target.type.includes("nav")
    || target.id.startsWith("global.header")
      ? document.globals.header
      : target.type.startsWith("footer") || target.type === "social-links" || target.id.startsWith("global.footer")
        ? document.globals.footer
        : document.globals.tokens;

  if (scope === "global") {
    return recordValue(globalContainer[target.type]);
  }

  if (scope === "instance" && target.id.startsWith("global.")) {
    return recordValue(globalContainer[globalInstanceSemanticKey(target.id)]);
  }

  if (scope === "family") return recordValue(document.globals.componentFamilies[target.type]);

  const section = sectionRegistration(target);
  if ((scope === "section" || scope === "instance") && section) {
    const instance = document.sections[section.id];
    const semantic = recordValue(instance?.settings?.semantic);
    const semanticKey = scope === "section" ? target.type : target.id;
    return recordValue(semantic[semanticKey]);
  }

  const existingPage = document.pages[page.path];
  const templateId = existingPage?.templateId || (page.template ? (document.templateBindings[page.path] || page.path) : `route:${page.path}`);
  const template = document.templates[templateId];
  const semanticKey = scope === "instance" ? target.id : target.type;
  return recordValue(template?.componentSettings?.[semanticKey]);
}

function topLevelMenuSourceId(target: SelectedTarget) {
  if (target.type !== "menu-link") return null;
  const prefix = "global.header.menu.link.";
  if (!target.id.startsWith(prefix)) return null;
  const suffix = target.id.slice(prefix.length);
  const instanceKey = target.instanceKey?.trim() || "";
  if (!suffix || !instanceKey || suffix !== instanceKey) return null;
  return instanceKey;
}

function snapshotValue(target: SelectedTarget, path: string) {
  if (path === "order") return target.current.order || 0;
  if (path === "content.text") return target.current.content?.text || "";
  if (path === "link.href") return target.current.link?.href || "";
  if (path === "link.target") return target.current.link?.target || "_self";
  if (path === "media.src") return target.current.media?.src || "";
  if (path === "media.alt") return target.current.media?.alt || "";
  if (path === "media.objectFit") return target.current.media?.objectFit || "cover";
  if (path === "media.objectPosition") return target.current.media?.objectPosition || "50% 50%";
  if (path === "grid.columns") return target.current.grid?.columns ?? 2;
  if (path === "grid.gapX") return target.current.grid?.gapX ?? 16;
  if (path === "grid.gapY") return target.current.grid?.gapY ?? 32;
  if (path === "grid.maxWidth") return target.current.grid?.maxWidth || "none";
  if (path === "card.density") return target.current.card?.density || "m";
  if (path === "card.imageRatio") return target.current.card?.imageRatio || "3/4";
  if (path === "card.titleLines") return target.current.card?.titleLines ?? 2;
  if (path === "card.showPrice") return target.current.card?.showPrice !== false;
  if (path === "card.showQuickAdd") return target.current.card?.showQuickAdd !== false;
  if (path === "textAlign") return target.current.textAlign || "left";
  if (path === "borderRadius") return target.current.borderRadius || 0;
  if (path === "opacity") return target.current.opacity ?? 1;
  if (path === "visible") return target.current.visible !== false;
  return undefined;
}

function updateTargetSnapshot(target: SelectedTarget, path: string, value: unknown): SelectedTarget {
  if (value === null) return target;
  if (path === "order") {
    return { ...target, current: { ...target.current, order: Number(value) || 0 } };
  }
  if (path === "content.text") {
    return { ...target, current: { ...target.current, content: { ...(target.current.content || {}), text: String(value ?? "") } } };
  }
  if (path === "link.href" || path === "link.target") {
    const key = path === "link.href" ? "href" : "target";
    return {
      ...target,
      current: {
        ...target.current,
        link: {
          ...(target.current.link || {}),
          [key]: key === "target" ? (String(value) === "_blank" ? "_blank" : "_self") : String(value || ""),
        },
      },
    };
  }
  if (path === "media.src" || path === "media.alt" || path === "media.objectFit" || path === "media.objectPosition") {
    const key = path === "media.src" ? "src" : path === "media.alt" ? "alt" : path === "media.objectFit" ? "objectFit" : "objectPosition";
    return { ...target, current: { ...target.current, media: { ...(target.current.media || {}), [key]: String(value) } } };
  }
  if (path.startsWith("grid.")) {
    const key = path.slice("grid.".length) as "columns" | "gapX" | "gapY" | "maxWidth";
    return {
      ...target,
      current: {
        ...target.current,
        grid: {
          ...(target.current.grid || {}),
          [key]: key === "maxWidth" ? String(value) : Number(value),
        },
      },
    };
  }
  if (path.startsWith("card.")) {
    const key = path.slice("card.".length) as "density" | "imageRatio" | "titleLines" | "showPrice" | "showQuickAdd";
    const nextValue = key === "titleLines"
      ? Number(value)
      : key === "showPrice" || key === "showQuickAdd"
        ? Boolean(value)
        : value;
    return {
      ...target,
      current: {
        ...target.current,
        card: { ...(target.current.card || {}), [key]: nextValue },
      },
    };
  }
  return { ...target, current: { ...target.current, [path]: value } };
}

function documentFingerprint(value: ThemeDocument) {
  const { revision: _revision, publishedAt: _publishedAt, ...rest } = value;
  return JSON.stringify(rest);
}

function seedLegacyHomepage(value: ThemeDocument, input: unknown) {
  const alreadyHasHome = Boolean(value.pages["/"] || Object.values(value.pages).find((page) => page.route === "/"));
  if (alreadyHasHome) return value;

  const legacy = normalizeThemeSectionSettings(input);
  const legacyHome = legacy.pages["/"];
  if (!legacyHome?.sections?.length) return value;

  const next = structuredClone(value) as ThemeDocument;
  const templateId = "template:home";
  const sectionIds: string[] = [];

  for (const legacySection of legacyHome.sections) {
    const preferredId = legacySection.id || `legacy-${legacySection.type}-${sectionIds.length + 1}`;
    const sectionId = next.sections[preferredId] ? `legacy-${preferredId}` : preferredId;
    const { id: _id, type, enabled, ...settings } = legacySection;
    next.sections[sectionId] = {
      id: sectionId,
      type,
      schemaVersion: STORE_DESIGN_SCHEMA_VERSION,
      enabled: enabled !== false,
      settings: settings as Record<string, unknown>,
      blockIds: [],
    };
    sectionIds.push(sectionId);
  }

  next.templates[templateId] = {
    id: templateId,
    label: "Ana Sayfa Şablonu",
    compatibility: ["home"],
    sectionIds,
    componentSettings: {},
    schemaVersion: STORE_DESIGN_SCHEMA_VERSION,
  };
  next.pages["/"] = {
    id: "page:home",
    name: "Ana Sayfa",
    slug: "ana-sayfa",
    route: "/",
    kind: "system",
    type: "system",
    templateId,
    status: "published",
    seoId: "seo:home",
    reserved: true,
    schemaVersion: STORE_DESIGN_SCHEMA_VERSION,
  };
  next.seo["seo:home"] ||= {
    title: "",
    description: "",
    robots: "index,follow",
    robotsPreset: "index,follow",
    structuredDataPolicy: "inherit",
  };
  return next;
}

function persistSemanticPatch(
  current: ThemeDocument,
  target: SelectedTarget,
  scope: EditorScope,
  device: Device,
  page: PageItem,
  path: string,
  value: unknown,
  revision: number,
) {
  const next = structuredClone(current) as ThemeDocument;
  next.revision = revision;

  const globalContainer = target.type.startsWith("header")
    || target.type.includes("menu")
    || target.type.includes("nav")
    || target.id.startsWith("global.header")
      ? next.globals.header
      : target.type.startsWith("footer") || target.type === "social-links" || target.id.startsWith("global.footer")
        ? next.globals.footer
        : next.globals.tokens;

  if (scope === "global") {
    writeNested(globalContainer, `${target.type}.${device}.${path}`, value);
    return next;
  }

  if (scope === "instance" && target.id.startsWith("global.")) {
    const semanticKey = globalInstanceSemanticKey(target.id);
    const responsive = recordValue(globalContainer[semanticKey]);
    const deviceSettings = recordValue(responsive[device]);
    writeNested(deviceSettings, path, value);
    responsive[device] = deviceSettings;
    globalContainer[semanticKey] = responsive;
    return next;
  }

  if (scope === "family") {
    const family = next.globals.componentFamilies[target.type] || { type: target.type, desktop: {}, mobile: {} };
    writeNested(family[device], path, value);
    next.globals.componentFamilies[target.type] = family;
    return next;
  }

  const section = sectionRegistration(target);
  if ((scope === "section" || scope === "instance") && section) {
    const instance = next.sections[section.id] || {
      id: section.id,
      type: section.type,
      schemaVersion: STORE_DESIGN_SCHEMA_VERSION,
      enabled: true,
      settings: {},
      blockIds: [],
    };
    const semanticKey = scope === "section" ? target.type : target.id;
    const semantic = recordValue(instance.settings.semantic);
    const responsive = recordValue(semantic[semanticKey]);
    const deviceSettings = recordValue(responsive[device]);
    writeNested(deviceSettings, path, value);
    responsive[device] = deviceSettings;
    semantic[semanticKey] = responsive;
    instance.settings = { ...instance.settings, semantic };
    next.sections[section.id] = instance;
    return next;
  }

  const existingPage = next.pages[page.path];
  const templateId = existingPage?.templateId || (page.template ? (next.templateBindings[page.path] || page.path) : `route:${page.path}`);
  const template = next.templates[templateId] || {
    id: templateId,
    label: page.template ? page.label : `${page.label} şablonu`,
    compatibility: [pageCompatibility(page)],
    sectionIds: [],
    componentSettings: {},
    schemaVersion: STORE_DESIGN_SCHEMA_VERSION,
  };
  const componentSettings = { ...(template.componentSettings || {}) };
  const semanticKey = scope === "instance" ? target.id : target.type;
  const responsive = componentSettings[semanticKey] || { desktop: {}, mobile: {} };
  writeNested(responsive[device], path, value);
  componentSettings[semanticKey] = responsive;
  next.templates[templateId] = { ...template, componentSettings };
  return next;
}

function StableInspectorTextControl({
  value,
  onCommit,
  onEditingChange,
  multiline = false,
  className,
  placeholder,
  maxLength,
}: {
  value: string;
  onCommit: (value: string) => void;
  onEditingChange: (editing: boolean) => void;
  multiline?: boolean;
  className: string;
  placeholder?: string;
  maxLength?: number;
}) {
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(value);
  const focusedRef = useRef(false);

  useEffect(() => {
    if (focusedRef.current) return;
    draftRef.current = value;
    setDraft(value);
  }, [value]);

  const updateDraft = (next: string) => {
    draftRef.current = next;
    setDraft(next);
  };

  const beginEditing = () => {
    focusedRef.current = true;
    onEditingChange(true);
  };

  const finishEditing = () => {
    focusedRef.current = false;
    onEditingChange(false);
    const next = draftRef.current;
    if (next !== value) onCommit(next);
  };

  const common = {
    value: draft,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => updateDraft(event.target.value),
    onFocus: beginEditing,
    onBlur: finishEditing,
    placeholder,
    maxLength,
    className,
  };

  if (multiline) {
    return (
      <textarea
        {...common}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            updateDraft(value);
            event.currentTarget.blur();
          }
        }}
      />
    );
  }

  return (
    <input
      {...common}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          updateDraft(value);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

export function StoreDesignV21() {
  const toast = useExactToast();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const editorShellRef = useRef<HTMLDivElement | null>(null);
  const previewStageRef = useRef<HTMLElement | null>(null);
  const mobileMoreButtonRef = useRef<HTMLButtonElement | null>(null);
  const mobileMoreMenuRef = useRef<HTMLDivElement | null>(null);
  const mobileStructureButtonRef = useRef<HTMLButtonElement | null>(null);
  const mobileEditButtonRef = useRef<HTMLButtonElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const contextTextInputRef = useRef<HTMLInputElement | null>(null);
  const structurePanelRef = useRef<HTMLElement | null>(null);
  const inspectorPanelRef = useRef<HTMLElement | null>(null);
  const inspectorBodyRef = useRef<HTMLDivElement | null>(null);
  const inspectorEditingRef = useRef(false);
  const selectedIdRef = useRef<string | null>(null);
  const initialSrcRef = useRef("");
  const previewTokenRef = useRef("");
  const previewSyncTimerRef = useRef<number | null>(null);
  const lastPreviewJsonRef = useRef("");
  const [pages, setPages] = useState<PageItem[]>([]);
  const [activePath, setActivePath] = useState("/");
  const [document, setDocument] = useState<ThemeDocument>(createEmptyThemeDocument());
  const [savedDraft, setSavedDraft] = useState<ThemeDocument>(createEmptyThemeDocument());
  const [published, setPublished] = useState<ThemeDocument>(createEmptyThemeDocument());
  const [loading, setLoading] = useState(true);
  const [device, setDevice] = useState<Device>("desktop");
  const [interactionMode, setInteractionMode] = useState<"browse" | "edit">("edit");
  const [selected, setSelected] = useState<SelectedTarget | null>(null);
  const [scope, setScope] = useState<EditorScope>("global");
  const [connected, setConnected] = useState(false);
  const [connectionStalled, setConnectionStalled] = useState(false);
  const [lastHeartbeat, setLastHeartbeat] = useState(0);
  const [saving, setSaving] = useState<"draft" | "publish" | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<"draft" | "publish" | null>(null);
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [desktopPreviewViewport, setDesktopPreviewViewport] = useState({
    width: 1440,
    height: 900,
    scale: 0.75,
  });
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [sectionPickerSignal, setSectionPickerSignal] = useState(0);
  const [presetPickerSignal, setPresetPickerSignal] = useState(0);
  const [sectionEditorSignal, setSectionEditorSignal] = useState(0);
  const [sectionEditorTargetId, setSectionEditorTargetId] = useState<string | null>(null);
  const [sectionMediaPicker, setSectionMediaPicker] = useState<{
    sectionId: string;
    key: string;
    mediaType: "image" | "video" | "any";
  } | null>(null);
  const [structureFocusSectionId, setStructureFocusSectionId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [destinationTarget, setDestinationTarget] = useState<SelectedTarget | null>(null);
  const [inlineEditRequest, setInlineEditRequest] = useState<{ targetId: string; value: string } | null>(null);
  const [quickActionRequest, setQuickActionRequest] = useState<{ action: "media"; target: SelectedTarget } | null>(null);
  const [mobileSheetLevel, setMobileSheetLevel] = useState<"peek" | "medium" | "full">("peek");
  const [pageManagerMode, setPageManagerMode] = useState<"create" | "edit" | null>(null);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [quickMediaEdit, setQuickMediaEdit] = useState<QuickMediaEditState | null>(null);
  const [templateManagerOpen, setTemplateManagerOpen] = useState(false);
  const [redirectManagerOpen, setRedirectManagerOpen] = useState(false);
  const [snapshotManagerOpen, setSnapshotManagerOpen] = useState(false);
  const [publishIssues, setPublishIssues] = useState<ThemeReferenceIssue[] | null>(null);
  const [history, setHistory] = useState<EditorHistoryEntry[]>([]);
  const [future, setFuture] = useState<EditorHistoryEntry[]>([]);
  const revisionRef = useRef(0);
  const mobileSheetTouchStartRef = useRef<number | null>(null);
  const layoutBandRef = useRef<"mobile" | "tablet" | "compact" | "wide" | null>(null);

  useEffect(() => {
    const applyViewport = () => {
      const width = window.innerWidth;
      const band: "mobile" | "tablet" | "compact" | "wide" = width <= 767
        ? "mobile"
        : width <= 1199
          ? "tablet"
          : width <= 1599
            ? "compact"
            : "wide";

      setIsMobileViewport(band === "mobile");
      if (layoutBandRef.current === band) return;
      layoutBandRef.current = band;

      if (band === "mobile") {
        setDevice("mobile");
        setInteractionMode("browse");
        setLeftOpen(false);
        setRightOpen(false);
        setMobileSheetLevel("peek");
        return;
      }

      setDevice("desktop");
      setInteractionMode("edit");
      setMobileMoreOpen(false);
      setLeftOpen(false);
      setRightOpen(false);
    };

    applyViewport();
    window.addEventListener("resize", applyViewport);
    return () => window.removeEventListener("resize", applyViewport);
  }, []);

  useEffect(() => {
    selectedIdRef.current = selected?.id || null;
  }, [selected?.id]);

  useEffect(() => {
    const stage = previewStageRef.current;
    if (!stage || isMobileViewport || device !== "desktop") return;

    let frame = 0;
    let settleTimer = 0;

    const syncDesktopViewport = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const viewportWidth = Math.max(1024, Math.round(window.innerWidth));
        const viewportHeight = Math.max(640, Math.round(window.innerHeight));
        const rect = stage.getBoundingClientRect();
        const horizontalGutter = 20;
        const availableWidth = Math.max(520, rect.width - horizontalGutter);

        // Keep the storefront's real desktop viewport. Only scale it visually
        // by width so the editor never shrinks it because of panel/toolbar height.
        const scale = Math.min(1, availableWidth / viewportWidth);

        setDesktopPreviewViewport((current) => {
          const next = {
            width: viewportWidth,
            height: viewportHeight,
            scale: Math.max(0.48, scale),
          };
          if (
            current.width === next.width
            && current.height === next.height
            && Math.abs(current.scale - next.scale) < 0.001
          ) {
            return current;
          }
          return next;
        });
      });
    };

    syncDesktopViewport();
    // Side panels are desktop overlays; opening/closing them must never resize
    // or rescale the storefront preview. Only the real browser viewport may.
    settleTimer = window.setTimeout(syncDesktopViewport, 120);
    window.addEventListener("resize", syncDesktopViewport);
    window.visualViewport?.addEventListener("resize", syncDesktopViewport);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      if (settleTimer) window.clearTimeout(settleTimer);
      window.removeEventListener("resize", syncDesktopViewport);
      window.visualViewport?.removeEventListener("resize", syncDesktopViewport);
    };
  }, [device, isMobileViewport]);

  useEffect(() => {
    if (!isMobileViewport) return;
    const shell = editorShellRef.current;
    if (!shell) return;

    const viewport = window.visualViewport;
    const syncVisualViewport = () => {
      const height = Math.max(320, Math.round(viewport?.height || window.innerHeight));
      shell.style.setProperty("--sd-visual-height", `${height}px`);
      shell.style.setProperty("--sd-visual-55", `${Math.round(height * 0.55)}px`);
    };

    syncVisualViewport();
    viewport?.addEventListener("resize", syncVisualViewport);
    viewport?.addEventListener("scroll", syncVisualViewport);
    window.addEventListener("orientationchange", syncVisualViewport);
    return () => {
      viewport?.removeEventListener("resize", syncVisualViewport);
      viewport?.removeEventListener("scroll", syncVisualViewport);
      window.removeEventListener("orientationchange", syncVisualViewport);
      shell.style.removeProperty("--sd-visual-height");
      shell.style.removeProperty("--sd-visual-55");
    };
  }, [isMobileViewport]);

  useEffect(() => {
    if (!isMobileViewport) return;
    const focusFrame = window.requestAnimationFrame(() => {
      if (rightOpen && selected) inspectorPanelRef.current?.focus({ preventScroll: true });
      else if (leftOpen) structurePanelRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [isMobileViewport, leftOpen, rightOpen, selected]);

  useEffect(() => {
    if (!mobileMoreOpen) return;

    const focusFrame = window.requestAnimationFrame(() => {
      mobileMoreMenuRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus({ preventScroll: true });
    });

    const closeOutside = (event: PointerEvent) => {
      const element = event.target instanceof Element ? event.target : null;
      if (element?.closest(".sd-more-tools")) return;
      setMobileMoreOpen(false);
    };

    const onMenuKeyDown = (event: KeyboardEvent) => {
      const menu = mobileMoreMenuRef.current;
      if (!menu) return;
      const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
      if (!items.length) return;

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setMobileMoreOpen(false);
        window.requestAnimationFrame(() => mobileMoreButtonRef.current?.focus({ preventScroll: true }));
        return;
      }

      const current = Math.max(0, items.indexOf(window.document.activeElement as HTMLButtonElement));
      const moveTo = (index: number) => {
        event.preventDefault();
        items[(index + items.length) % items.length]?.focus({ preventScroll: true });
      };

      if (event.key === "ArrowDown") moveTo(current + 1);
      else if (event.key === "ArrowUp") moveTo(current - 1);
      else if (event.key === "Home") moveTo(0);
      else if (event.key === "End") moveTo(items.length - 1);
    };

    window.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", onMenuKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", onMenuKeyDown);
    };
  }, [mobileMoreOpen]);

  useEffect(() => {
    if (!isMobileViewport || (!leftOpen && !rightOpen && !mobileMoreOpen)) return;
    const onMobileEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (mobileMoreOpen) {
        setMobileMoreOpen(false);
        return;
      }
      if (rightOpen) {
        setRightOpen(false);
        setMobileSheetLevel("peek");
        window.requestAnimationFrame(() => mobileEditButtonRef.current?.focus({ preventScroll: true }));
        return;
      }
      if (leftOpen) {
        setLeftOpen(false);
        window.requestAnimationFrame(() => mobileStructureButtonRef.current?.focus({ preventScroll: true }));
      }
    };
    window.addEventListener("keydown", onMobileEscape);
    return () => window.removeEventListener("keydown", onMobileEscape);
  }, [isMobileViewport, leftOpen, mobileMoreOpen, rightOpen]);

  useEffect(() => {
    if (!contextMenu) return;

    const focusFrame = window.requestAnimationFrame(() => {
      const menu = contextMenuRef.current;
      if (!menu) return;

      const bounds = menu.getBoundingClientRect();
      const nextX = Math.max(12, Math.min(contextMenu.x, window.innerWidth - bounds.width - 12));
      const nextY = Math.max(68, Math.min(contextMenu.y, window.innerHeight - bounds.height - 12));
      if (Math.abs(nextX - contextMenu.x) > 0.5 || Math.abs(nextY - contextMenu.y) > 0.5) {
        setContextMenu((current) => current ? { ...current, x: nextX, y: nextY } : current);
      }
      menu.focus({ preventScroll: true });
    });

    const close = (event: PointerEvent) => {
      const element = event.target instanceof Element ? event.target : null;
      if (element?.closest("[data-store-design-context-menu]")) return;
      setContextMenu(null);
    };
    const closeWithKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setContextMenu(null);
        window.requestAnimationFrame(() => iframeRef.current?.focus({ preventScroll: true }));
        return;
      }
      if (event.key !== "Tab" || !contextMenuRef.current) return;

      const focusable = Array.from(contextMenuRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]),select:not([disabled]),input:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])',
      )).filter((element) => element.getClientRects().length > 0);

      if (!focusable.length) {
        event.preventDefault();
        contextMenuRef.current.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = window.document.activeElement;
      if (event.shiftKey && (active === first || active === contextMenuRef.current)) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };
    const closeOnResize = () => setContextMenu(null);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", closeWithKeyboard);
    window.addEventListener("resize", closeOnResize, { once: true });
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", closeWithKeyboard);
      window.removeEventListener("resize", closeOnResize);
    };
  }, [contextMenu]);

  const documentFingerprintValue = useMemo(() => documentFingerprint(document), [document]);
  const savedDraftFingerprintValue = useMemo(() => documentFingerprint(savedDraft), [savedDraft]);
  const publishedFingerprintValue = useMemo(() => documentFingerprint(published), [published]);
  const hasUnsavedChanges = documentFingerprintValue !== savedDraftFingerprintValue;
  const hasUnpublishedChanges = savedDraftFingerprintValue !== publishedFingerprintValue;

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warnBeforeExit = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeExit);
    return () => window.removeEventListener("beforeunload", warnBeforeExit);
  }, [hasUnsavedChanges]);

  const toggleStructurePanel = () => {
    setLeftOpen((current) => {
      const next = !current;
      if (next && window.innerWidth <= 1199) setRightOpen(false);
      return next;
    });
  };

  const toggleInspectorPanel = () => {
    setRightOpen((current) => {
      const next = !current;
      if (next && window.innerWidth <= 1199) setLeftOpen(false);
      return next;
    });
  };

  const requestEditorExit = useCallback(() => {
    if (hasUnsavedChanges) {
      const leave = window.confirm("Kaydedilmemiş değişiklikler var. Çıkarsan bu değişiklikler kaybolacak. Yine de çıkmak istiyor musun?");
      if (!leave) return;
    }
    window.history.back();
  }, [hasUnsavedChanges]);

  const editorPages = useMemo(() => {
    const merged = new Map(pages.map((page) => [page.path, page]));
    for (const page of Object.values(document.pages)) {
      if (page.status === "archived") continue;
      merged.set(page.route, {
        path: page.route,
        label: page.name,
        group: page.kind === "merchant" ? "Özel Sayfalar" : "Yönetilen Sayfalar",
        previewPath: page.route,
      });
    }
    return [...merged.values()];
  }, [document.pages, pages]);
  const groupedPages = useMemo(() => groupPages(editorPages), [editorPages]);
  const activePage = editorPages.find((item) => item.path === activePath) || editorPages[0] || null;
  const managedPage = document.pages[activePath] || Object.values(document.pages).find((page) => page.route === activePath) || null;
  const selectedSectionId = selected ? sectionRegistration(selected)?.id || null : null;
  const selectedSection = selectedSectionId ? document.sections[selectedSectionId] || null : null;
  const selectedSectionDefinition = selectedSection ? SECTION_LIBRARY_BY_TYPE[selectedSection.type] || null : null;
  const selectedSectionMediaKey = selectedSection
    ? (
        ["image-text-split", "video-text-split", "hero", "video-hero", "video-banner", "background-media", "brand-story", "rewards-promo", "hotspot-lookbook"].includes(selectedSection.type)
          ? "imageAssetId"
          : selectedSection.type === "before-after"
            ? "beforeAssetId"
            : null
      )
    : null;
  const selectedSectionMediaType: "image" | "video" | "any" = selectedSection?.type === "video-text-split"
    || selectedSection?.type === "video-hero"
    || selectedSection?.type === "video-banner"
      ? "video"
      : selectedSection?.type === "background-media" || selectedSection?.type === "hero"
        ? "any"
        : "image";
  const contextSectionRegistration = contextMenu ? sectionRegistration(contextMenu.target) : null;
  const contextSection = contextSectionRegistration ? document.sections[contextSectionRegistration.id] || null : null;
  const contextTargetsWholeSection = Boolean(
    contextSectionRegistration && contextMenu?.target.id === `section:${contextSectionRegistration.id}`,
  );
  const activeStructureTemplateId = activePage
    ? (managedPage?.templateId || (activePage.template ? (document.templateBindings[activePage.path] || activePage.path) : `route:${activePage.path}`))
    : null;
  const activeStructureTemplate = activeStructureTemplateId ? document.templates[activeStructureTemplateId] || null : null;
  const contextSectionTemplate = contextSectionRegistration
    ? (
        activeStructureTemplate?.sectionIds.includes(contextSectionRegistration.id)
          ? activeStructureTemplate
          : Object.values(document.templates).find((template) => template.sectionIds.includes(contextSectionRegistration.id)) || null
      )
    : null;
  const contextSectionIndex = contextSectionRegistration && contextSectionTemplate
    ? contextSectionTemplate.sectionIds.indexOf(contextSectionRegistration.id)
    : -1;
  const contextSectionReferenceCount = contextSectionRegistration
    ? Object.values(document.templates).filter((template) => template.sectionIds.includes(contextSectionRegistration.id)).length
    : 0;
  const activeCompatibility: PageCompatibility = (
    managedPage ? document.templates[managedPage.templateId]?.compatibility?.[0] : undefined
  ) || (activePage ? pageCompatibility(activePage) : "content");
  const consentResponsive = selected?.type === "consent-banner"
    ? recordValue(document.globals.tokens["consent-banner"])
    : {};
  const consentDesktopSettings = recordValue(consentResponsive.desktop);
  const consentMobileSettings = recordValue(consentResponsive.mobile);
  const consentDeviceSettings = device === "mobile" ? consentMobileSettings : consentDesktopSettings;
  const selectedResponsiveSettings = selected && activePage
    ? responsiveSettingsFor(document, selected, scope, activePage)
    : {};
  const selectedMobileLeaves = new Map(flattenResponsiveLeaves(recordValue(selectedResponsiveSettings.mobile)));
  const hasMobileOverrides = selectedMobileLeaves.size > 0;
  const consentSetting = (key: string, fallback: string) => {
    const direct = consentDeviceSettings[key];
    if (typeof direct === "string" && direct.trim()) return direct;
    const inherited = consentDesktopSettings[key];
    return typeof inherited === "string" && inherited.trim() ? inherited : fallback;
  };

  const postToPreview = useCallback((payload: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(payload, STOREFRONT_ORIGIN);
  }, []);

  const selectPreviewTarget = useCallback((targetId: string) => {
    setInteractionMode("edit");
    setContextMenu(null);
    setLeftOpen(false);
    postToPreview({
      type: "store-design-v2:select-target",
      targetId,
    });
  }, [postToPreview]);

  const addMenuHeading = useCallback(async () => {
    try {
      const result = await adminRequest<{ settings?: unknown }>(`/api/theme?t=${Date.now()}`, { force: true });
      const current = normalizeThemeCustomizerSettings(result.settings);
      const random = globalThis.crypto?.randomUUID?.().replace(/-/g, "").slice(0, 12)
        || Math.random().toString(36).slice(2, 14);
      const id = `menu-custom-${random}`.slice(0, 80);
      const next: ThemeCustomizerSettings = {
        ...current,
        header: {
          ...current.header,
          links: [
            ...current.header.links,
            { id, label: "Yeni Başlık", path: "/", side: "left", children: [] },
          ],
        },
      };

      const saved = await adminRequest<{ settings?: unknown }>("/api/theme", {
        method: "PUT",
        body: JSON.stringify({ settings: next }),
        confirmation: false,
      });
      const persisted = normalizeThemeCustomizerSettings(saved.settings || next);

      iframeRef.current?.contentWindow?.postMessage({
        type: "RUTH_THEME_EDITOR_SETTINGS",
        settings: persisted,
        revision: Date.now(),
      }, STOREFRONT_ORIGIN);

      setInteractionMode("edit");
      setContextMenu(null);
      setLeftOpen(false);
      setRightOpen(false);
      window.setTimeout(() => {
        postToPreview({
          type: "store-design-v2:select-target",
          targetId: `global.header.menu.link.${id}`,
        });
      }, 180);
      toast.success("Yeni menü başlığı eklendi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Yeni menü başlığı eklenemedi.");
    }
  }, [postToPreview, toast]);

  const persistMenuSourcePatch = useCallback(async (
    target: SelectedTarget,
    path: string,
    value: unknown,
  ) => {
    const itemId = topLevelMenuSourceId(target);
    if (!itemId || (path !== "content.text" && path !== "link.href")) return;

    try {
      const result = await adminRequest<{ settings?: unknown }>(`/api/theme?t=${Date.now()}`, { force: true });
      const current = normalizeThemeCustomizerSettings(result.settings);
      let changed = false;
      const links = current.header.links.map((item) => {
        if (item.id !== itemId) return item;
        if (path === "content.text") {
          const label = String(value ?? "").trim().slice(0, 80);
          if (!label || label === item.label) return item;
          changed = true;
          return { ...item, label };
        }
        const href = String(value ?? "").trim() || "/";
        if (href === item.path) return item;
        changed = true;
        return { ...item, path: href };
      });
      if (!changed) return;

      const next: ThemeCustomizerSettings = {
        ...current,
        header: { ...current.header, links },
      };
      const saved = await adminRequest<{ settings?: unknown }>("/api/theme", {
        method: "PUT",
        body: JSON.stringify({ settings: next }),
        confirmation: false,
      });
      const persisted = normalizeThemeCustomizerSettings(saved.settings || next);
      iframeRef.current?.contentWindow?.postMessage({
        type: "RUTH_THEME_EDITOR_SETTINGS",
        settings: persisted,
        revision: Date.now(),
      }, STOREFRONT_ORIGIN);
    } catch (error) {
      console.warn("Menü kaynağı Store Design değişikliğiyle eşitlenemedi:", error);
    }
  }, []);

  const postMediaDocumentDiff = useCallback((before: ThemeDocument, after: ThemeDocument) => {
    const ids = new Set([...Object.keys(before.media), ...Object.keys(after.media)]);
    for (const assetId of ids) {
      const previous = before.media[assetId];
      const asset = after.media[assetId];
      if (JSON.stringify(previous) === JSON.stringify(asset) || !asset) continue;

      const mobile = asset.mobileAssetId ? after.media[asset.mobileAssetId] : undefined;
      postToPreview({
        type: STORE_DESIGN_MESSAGES.MEDIA_ASSET_READY,
        asset: {
          assetId: asset.assetId,
          url: asset.url,
          version: asset.version,
          focalPoint: asset.focalPoint,
          mobileAssetId: mobile?.assetId,
          mobileUrl: mobile?.url,
          mobileFocalPoint: mobile?.focalPoint,
        },
      });
    }
  }, [postToPreview]);

  const syncPreviewDocument = useCallback(async (value: ThemeDocument, force = false) => {
    const token = previewTokenRef.current;
    if (!token) return;
    const serialized = JSON.stringify(value);
    if (!force && lastPreviewJsonRef.current === serialized) return;

    await adminRequest("/api/store-design-v2", {
      method: "POST",
      body: JSON.stringify({ token, document: value }),
      confirmation: false,
    });
    lastPreviewJsonRef.current = serialized;
    iframeRef.current?.contentWindow?.postMessage({
      type: PREVIEW_DOCUMENT_MESSAGE,
      document: value,
    }, STOREFRONT_ORIGIN);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);

    if (!previewTokenRef.current) {
      const random = window.crypto?.randomUUID?.().replace(/-/g, "") || Math.random().toString(36).slice(2);
      previewTokenRef.current = `sdv2_${Date.now().toString(36)}_${random}`.slice(0, 120);
    }
    const previewToken = previewTokenRef.current;

    Promise.all([
      adminRequest<StoreDesignResponse>(`/api/store-design-v2?t=${Date.now()}`, { force: true }),
      adminRequest<{ pages?: PageItem[] }>(`/api/theme-editor-pages?t=${Date.now()}`, { force: true, timeoutMs: 7_000 }),
      adminRequest<{ settings?: unknown }>(`/api/theme-sections?t=${Date.now()}`, { force: true, timeoutMs: 7_000 }).catch(() => ({ settings: undefined })),
    ]).then(async ([themeResult, pageResult, legacySections]) => {
      if (!active) return;
      const nextDraft = seedLegacyHomepage(normalizeThemeDocument(themeResult.draft || themeResult.published), legacySections.settings);
      const nextPublished = seedLegacyHomepage(normalizeThemeDocument(themeResult.published || themeResult.draft), legacySections.settings);
      const nextPages = Array.isArray(pageResult.pages) && pageResult.pages.length
        ? pageResult.pages
        : [{ path: "/", label: "Ana Sayfa", group: "Sayfalar" }];

      setDocument(nextDraft);
      setSavedDraft(nextDraft);
      setPublished(nextPublished);
      revisionRef.current = nextDraft.revision;
      setPages(nextPages);
      setActivePath(nextPages[0]?.path || "/");

      try {
        await syncPreviewDocument(nextDraft, true);
      } catch (error) {
        console.warn("Store Design V2 ilk preview taslağı senkronlanamadı:", error);
      }
      if (!active) return;

      initialSrcRef.current = previewUrl(
        cleanPreviewPath(nextPages[0] || { path: "/", label: "Ana Sayfa", group: "Sayfalar" }),
        previewToken,
      );
      setLoading(false);
    }).catch((error) => {
      if (!active) return;
      setLoading(false);
      toast.error(error instanceof Error ? error.message : "Mağaza tasarımı yüklenemedi.");
    });

    return () => { active = false; };
  }, [syncPreviewDocument, toast]);

  useEffect(() => {
    if (loading || !previewTokenRef.current) return;
    if (previewSyncTimerRef.current !== null) window.clearTimeout(previewSyncTimerRef.current);

    previewSyncTimerRef.current = window.setTimeout(() => {
      void syncPreviewDocument(document).catch((error) => {
        console.warn("Store Design V2 preview taslağı senkronlanamadı:", error);
      });
    }, 250);

    return () => {
      if (previewSyncTimerRef.current !== null) window.clearTimeout(previewSyncTimerRef.current);
    };
  }, [document, loading, syncPreviewDocument]);

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.origin !== STOREFRONT_ORIGIN || event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data;
      if (!data || typeof data !== "object") return;

      if (data.type === STORE_DESIGN_MESSAGES.READY) {
        setConnected(true);
        setConnectionStalled(false);
        setLastHeartbeat(Date.now());
        return;
      }

      if (data.type === STORE_DESIGN_MESSAGES.HEARTBEAT) {
        setConnected(true);
        setConnectionStalled(false);
        setLastHeartbeat(Date.now());
        return;
      }

      if (data.type === PREVIEW_SCROLL_MESSAGE) {
        setContextMenu(null);
        return;
      }

      if (data.type === STORE_DESIGN_MESSAGES.SELECT && data.target) {
        const target = data.target as SelectedTarget;
        const sameTarget = selectedIdRef.current === target.id;
        if (inspectorEditingRef.current && sameTarget) return;
        setSelected(target);
        setStructureFocusSectionId(null);
        setScope(target.defaultScope);
        setLeftOpen(false);

        const pointer = data.pointer && typeof data.pointer === "object"
          ? data.pointer as { x?: unknown; y?: unknown; kind?: unknown }
          : null;
        if (
          pointer?.kind === "mouse" &&
          typeof pointer.x === "number" &&
          typeof pointer.y === "number" &&
          iframeRef.current
        ) {
          const frame = iframeRef.current.getBoundingClientRect();
          const menuWidth = 336;
          const menuHeight = Math.min(620, Math.max(360, window.innerHeight - 88));
          const x = Math.max(12, Math.min(window.innerWidth - menuWidth - 12, frame.left + pointer.x));
          const y = Math.max(68, Math.min(window.innerHeight - menuHeight - 12, frame.top + pointer.y));
          setContextMenu({ x, y, target });
          setRightOpen(false);
        } else {
          setContextMenu(null);
          if (isMobileViewport && !inspectorEditingRef.current) setMobileSheetLevel("peek");
          setRightOpen(true);
        }
        return;
      }

      if (
        data.type === "store-design-v2:quick-action"
        && data.action === "media"
        && data.target
        && typeof data.target === "object"
      ) {
        setQuickActionRequest({ action: "media", target: data.target as SelectedTarget });
        return;
      }

      if (
        data.type === "store-design-v2:inline-edit"
        && typeof data.targetId === "string"
        && typeof data.value === "string"
      ) {
        setInlineEditRequest({ targetId: data.targetId, value: data.value });
        return;
      }

      if (data.type === STORE_DESIGN_MESSAGES.PATCH_APPLIED) {
        if (data.ok === false) {
          toast.error(String(data.error || "Değişiklik önizlemeye uygulanamadı."));
          return;
        }
        if (typeof data.targetId === "string" && data.current && typeof data.current === "object") {
          const targetId = data.targetId;
          const nextCurrent = data.current as SelectedTarget["current"];
          setSelected((current) => {
            if (!current || current.id !== targetId) return current;
            return { ...current, current: nextCurrent };
          });
        }
        return;
      }
    };

    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [isMobileViewport, toast]);

  useEffect(() => {
    if (!iframeRef.current?.contentWindow) return;
    postToPreview({
      type: STORE_DESIGN_MESSAGES.INTERACTION_MODE,
      mode: interactionMode,
    });
  }, [interactionMode, postToPreview, connected]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!lastHeartbeat) return;
      const staleFor = Date.now() - lastHeartbeat;
      if (staleFor > 12_000) {
        setConnected(false);
        setConnectionStalled(true);
      }
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [lastHeartbeat]);

  const reconnectPreview = async () => {
    if (!activePage || !iframeRef.current) return;
    setConnected(false);
    setConnectionStalled(false);
    setLastHeartbeat(Date.now());

    try {
      await syncPreviewDocument(document, true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Önizleme yeniden bağlanamadı.");
      setConnectionStalled(true);
      return;
    }

    iframeRef.current.src = previewUrl(cleanPreviewPath(activePage), previewTokenRef.current);
  };

  const changePage = async (path: string) => {
    const page = editorPages.find((item) => item.path === path);
    if (!page) return;

    try {
      await syncPreviewDocument(document, true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Taslak önizleme senkronlanamadı.");
      return;
    }

    setActivePath(path);
    setLastHeartbeat(Date.now());
    setSelected(null);
    setStructureFocusSectionId(null);
    setContextMenu(null);
    setHistory([]);
    setFuture([]);
    postToPreview({
      type: STORE_DESIGN_MESSAGES.ROUTE_NAVIGATE,
      path: cleanPreviewPath(page),
    });
  };

  const pagePathForIssue = (issue: ThemeReferenceIssue) => {
    const rawIds = [issue.source, issue.ownerId, issue.target, issue.targetId]
      .filter((value): value is string => typeof value === "string" && Boolean(value.trim()));

    const routeForTemplate = (templateId: string) => {
      const page = Object.values(document.pages).find((item) => item.templateId === templateId);
      if (page) return page.route;
      const binding = Object.entries(document.templateBindings).find(([, id]) => id === templateId);
      return binding?.[0] || null;
    };

    const routeForSection = (sectionId: string) => {
      const template = Object.values(document.templates).find((item) => item.sectionIds.includes(sectionId));
      return template ? routeForTemplate(template.id) : null;
    };

    for (const rawId of rawIds) {
      const id = rawId.replace(/^(section|block|preset|template|seo):/, "");
      if (rawId.startsWith("/")) {
        const page = editorPages.find((item) => item.path === rawId);
        if (page) return page.path;
      }

      const directPage = Object.values(document.pages).find((item) => (
        item.id === rawId || item.id === id || item.route === rawId || item.templateId === rawId || item.seoId === rawId
      ));
      if (directPage) return directPage.route;

      if (document.templates[rawId]) {
        const route = routeForTemplate(rawId);
        if (route) return route;
      }
      if (document.templates[id]) {
        const route = routeForTemplate(id);
        if (route) return route;
      }

      if (document.sections[rawId]) {
        const route = routeForSection(rawId);
        if (route) return route;
      }
      if (document.sections[id]) {
        const route = routeForSection(id);
        if (route) return route;
      }

      const blockId = document.blocks[rawId] ? rawId : document.blocks[id] ? id : null;
      if (blockId) {
        const ownerSection = Object.values(document.sections).find((section) => section.blockIds?.includes(blockId));
        if (ownerSection) {
          const route = routeForSection(ownerSection.id);
          if (route) return route;
        }
      }
    }

    return activePath;
  };

  const sectionIdForIssue = (issue: ThemeReferenceIssue) => {
    const rawIds = [issue.source, issue.ownerId, issue.target, issue.targetId]
      .filter((value): value is string => typeof value === "string" && Boolean(value.trim()));

    for (const rawId of rawIds) {
      const id = rawId.replace(/^(section|block):/, "");
      if (document.sections[rawId]) return rawId;
      if (document.sections[id]) return id;

      const blockId = document.blocks[rawId] ? rawId : document.blocks[id] ? id : null;
      if (!blockId) continue;
      const ownerSection = Object.values(document.sections).find((section) => section.blockIds?.includes(blockId));
      if (ownerSection) return ownerSection.id;
    }

    return null;
  };

  const fixPublishIssue = async (issue: ThemeReferenceIssue) => {
    const path = pagePathForIssue(issue);
    const sectionId = sectionIdForIssue(issue);
    const codeAliases: Record<string, string> = {
      PAGE_TEMPLATE_MISSING: "missing-page-template",
      PAGE_SEO_MISSING: "missing-page-seo",
      TEMPLATE_SECTION_MISSING: "missing-template-section",
      SECTION_BLOCK_MISSING: "missing-section-block",
      SECTION_MEDIA_MISSING: "missing-media-reference",
      BLOCK_MEDIA_MISSING: "missing-media-reference",
      SEO_MEDIA_MISSING: "missing-og-media",
      BROKEN_MANAGED_LINK: "broken-merchant-link",
      ORPHAN_SECTION: "orphan-section",
      ORPHAN_BLOCK: "orphan-block",
      ORPHAN_MEDIA: "orphan-media",
    };
    const code = codeAliases[issue.code] || issue.code;
    const source = typeof issue.source === "string"
      ? issue.source
      : typeof issue.ownerId === "string"
        ? issue.ownerId
        : "";
    const target = typeof issue.target === "string"
      ? issue.target
      : typeof issue.targetId === "string"
        ? issue.targetId
        : "";

    setPublishIssues(null);
    setMobileMoreOpen(false);
    setContextMenu(null);
    setQuickMediaEdit(null);

    if (code === "link-to-unpublished-page" && target.startsWith("/") && editorPages.some((page) => page.path === target)) {
      if (target !== activePath) await changePage(target);
      setPageManagerMode("edit");
      return;
    }

    if (path && path !== activePath && editorPages.some((page) => page.path === path)) {
      await changePage(path);
    }

    if (["missing-page-template", "missing-page-seo", "missing-og-media"].includes(code)) {
      setPageManagerMode("edit");
      return;
    }

    if (["missing-template-binding", "missing-template-section"].includes(code)) {
      setTemplateManagerOpen(true);
      return;
    }

    if (code === "invalid-preset-reference" || source.startsWith("preset:")) {
      setSelected(null);
      setStructureFocusSectionId(null);
      setRightOpen(false);
      setLeftOpen(true);
      setPresetPickerSignal((value) => value + 1);
      return;
    }

    if (code === "missing-media-reference" && !sectionId) {
      setQuickMediaEdit(null);
      setMediaOpen(true);
      return;
    }

    if (code === "broken-merchant-link" && !sectionId) {
      setRedirectManagerOpen(true);
      return;
    }

    if (code === "orphan-media") {
      setMediaOpen(true);
      return;
    }

    if (code === "orphan-section" || code === "orphan-block") {
      setSelected(null);
      setStructureFocusSectionId(sectionId);
      setRightOpen(false);
      setLeftOpen(true);
      return;
    }

    setSelected(null);
    setStructureFocusSectionId(sectionId);
    setRightOpen(false);
    setLeftOpen(true);
  };

  const applyPageDocument = useCallback(async (next: ThemeDocument, nextPath: string) => {
    await syncPreviewDocument(next, true);
    setDocument(next);
    revisionRef.current = next.revision;
    setActivePath(nextPath);
    setSelected(null);
    setHistory([]);
    setFuture([]);
    setLastHeartbeat(Date.now());

    if (iframeRef.current) {
      iframeRef.current.src = previewUrl(nextPath, previewTokenRef.current);
    }
  }, [syncPreviewDocument]);

  const applyStructureSnapshot = useCallback(async (snapshot: ThemeDocument, pagePath: string, reload = true) => {
    const next = structuredClone(snapshot) as ThemeDocument;
    next.revision = revisionRef.current + 1;
    await syncPreviewDocument(next, true);
    revisionRef.current = next.revision;
    setDocument(next);
    if (reload) setSelected(null);
    setLastHeartbeat(Date.now());

    if (reload && iframeRef.current) {
      const page = editorPages.find((item) => item.path === pagePath);
      iframeRef.current.src = previewUrl(page ? cleanPreviewPath(page) : pagePath, previewTokenRef.current);
    }
  }, [editorPages, syncPreviewDocument]);

  const applyStructureDocument = useCallback(async (next: ThemeDocument, label: string) => {
    const before = structuredClone(document) as ThemeDocument;
    const after = structuredClone(next) as ThemeDocument;
    await applyStructureSnapshot(after, activePath, true);
    setHistory((items) => [...items.slice(-79), { kind: "structure", label, before, after, pagePath: activePath, reload: true }]);
    setFuture([]);
    toast.success(label);
  }, [activePath, applyStructureSnapshot, document, toast]);

  const applySelectedSectionSetting = useCallback(async (key: string, value: unknown, label: string) => {
    if (!selectedSection) return;
    const next = structuredClone(document) as ThemeDocument;
    const section = next.sections[selectedSection.id];
    if (!section) return;
    section.settings = {
      ...section.settings,
      [key]: value,
    };
    await applyStructureDocument(next, label);
  }, [applyStructureDocument, document, selectedSection]);

  const applyMediaDocument = useCallback(async (next: ThemeDocument, label: string) => {
    const before = structuredClone(document) as ThemeDocument;
    const after = structuredClone(next) as ThemeDocument;
    await applyStructureSnapshot(after, activePath, false);
    postMediaDocumentDiff(before, after);
    setHistory((items) => [...items.slice(-79), { kind: "structure", label, before, after, pagePath: activePath, reload: false }]);
    setFuture([]);
  }, [activePath, applyStructureSnapshot, document, postMediaDocumentDiff]);

  const applyMetadataDocument = useCallback(async (next: ThemeDocument, label: string) => {
    const before = structuredClone(document) as ThemeDocument;
    const after = structuredClone(next) as ThemeDocument;
    await applyStructureSnapshot(after, activePath, false);
    setHistory((items) => [...items.slice(-79), { kind: "structure", label, before, after, pagePath: activePath, reload: false }]);
    setFuture([]);
    toast.success(label);
  }, [activePath, applyStructureSnapshot, document, toast]);

  const applyRestoredSnapshot = useCallback(async (next: ThemeDocument) => {
    await syncPreviewDocument(next, true);
    setDocument(next);
    setSavedDraft(next);
    revisionRef.current = next.revision;
    setSelected(null);
    setHistory([]);
    setFuture([]);
    setLastHeartbeat(Date.now());

    if (iframeRef.current && activePage) {
      iframeRef.current.src = previewUrl(cleanPreviewPath(activePage), previewTokenRef.current);
    }
  }, [activePage, syncPreviewDocument]);

  const applyPatchValue = (
    target: SelectedTarget,
    patchScope: EditorScope,
    patchDevice: Device,
    path: string,
    value: unknown,
  ) => {
    if (!activePage) return;
    const revision = revisionRef.current + 1;
    revisionRef.current = revision;
    setDocument((current) => persistSemanticPatch(current, target, patchScope, patchDevice, activePage, path, value, revision));
    setSelected((current) => current?.id === target.id ? updateTargetSnapshot(current, path, value) : current);
    postToPreview({
      type: STORE_DESIGN_MESSAGES.PATCH,
      targetId: target.id,
      path,
      value,
      revision,
      scope: patchScope,
      device: patchDevice,
    });
    if (path === "content.text" || path === "link.href") {
      void persistMenuSourcePatch(target, path, value);
    }
  };

  const applyInspectorPatch = (path: string, value: unknown) => {
    if (!selected || !activePage) return;
    const scopedResponsive = selected.type === "consent-banner"
      ? responsiveSettingsFor(document, selected, scope, activePage)
      : null;
    const scopedDevice = scopedResponsive ? recordValue(scopedResponsive[device]) : null;
    const before = scopedDevice && Object.prototype.hasOwnProperty.call(scopedDevice, path)
      ? scopedDevice[path]
      : selected.type === "consent-banner"
        ? null
        : snapshotValue(selected, path);
    if (Object.is(before, value)) return;
    const entry: SemanticHistoryEntry = { kind: "semantic", target: selected, scope, device, path, before, after: value };
    setHistory((items) => [...items.slice(-79), entry]);
    setFuture([]);
    applyPatchValue(selected, scope, device, path, value);
  };

  const applyContextPatch = (target: SelectedTarget, path: string, value: unknown) => {
    if (!activePage) return;
    const patchScope = target.allowedScopes.includes(scope) ? scope : target.defaultScope;
    const before = snapshotValue(target, path);
    if (Object.is(before, value)) return;
    setHistory((items) => [...items.slice(-79), {
      kind: "semantic",
      target,
      scope: patchScope,
      device,
      path,
      before,
      after: value,
    }]);
    setFuture([]);
    applyPatchValue(target, patchScope, device, path, value);
  };

  useEffect(() => {
    if (!inlineEditRequest || !selected || selected.id !== inlineEditRequest.targetId || !activePage) return;
    const before = snapshotValue(selected, "content.text");
    const after = inlineEditRequest.value;
    setInlineEditRequest(null);
    if (Object.is(before, after)) return;
    setHistory((items) => [...items.slice(-79), {
      kind: "semantic",
      target: selected,
      scope,
      device,
      path: "content.text",
      before,
      after,
    }]);
    setFuture([]);
    applyPatchValue(selected, scope, device, "content.text", after);
  }, [inlineEditRequest, selected, activePage, scope, device]);

  const applyDestination = (href: string, linkTarget: "_self" | "_blank") => {
    const target = destinationTarget;
    if (!target || !activePage) return;
    const patchScope = target.allowedScopes.includes(scope) ? scope : target.defaultScope;
    const beforeHref = snapshotValue(target, "link.href");
    const beforeTarget = snapshotValue(target, "link.target");
    const entries: SemanticHistoryEntry[] = [];
    if (!Object.is(beforeHref, href)) {
      entries.push({ kind: "semantic", target, scope: patchScope, device, path: "link.href", before: beforeHref, after: href });
    }
    if (!Object.is(beforeTarget, linkTarget)) {
      entries.push({ kind: "semantic", target, scope: patchScope, device, path: "link.target", before: beforeTarget, after: linkTarget });
    }
    if (!entries.length) return;
    setHistory((items) => [...items.slice(-79), { kind: "semantic-batch", label: "Bağlantı hedefi güncellendi", patches: entries }]);
    setFuture([]);
    for (const entry of entries) applyPatchValue(target, patchScope, device, entry.path, entry.after);
  };

  const openQuickMediaPickerForTarget = useCallback((target: SelectedTarget) => {
    if (!activePage || !target.current.media) return;
    const patchScope = target.allowedScopes.includes(scope) ? scope : target.defaultScope;
    const responsive = responsiveSettingsFor(document, target, patchScope, activePage);
    const deviceLeaves = new Map(flattenResponsiveLeaves(recordValue(responsive[device])));
    setSelected(target);
    setQuickMediaEdit({
      target,
      scope: patchScope,
      device,
      page: activePage,
      mediaType: /^(studio\.|wholesale\.)/.test(target.id) ? "any" : target.current.media.kind === "video" ? "video" : "image",
      beforeOverride: deviceLeaves.has("media.src") ? deviceLeaves.get("media.src") : null,
      visibleSource: target.current.media.src || "",
    });
    setContextMenu(null);
    setMediaOpen(true);
  }, [activePage, document, scope, device]);

  const openQuickMediaPicker = () => {
    if (!selected) return;
    openQuickMediaPickerForTarget(selected);
  };

  useEffect(() => {
    if (!quickActionRequest) return;
    openQuickMediaPickerForTarget(quickActionRequest.target);
    setQuickActionRequest(null);
  }, [quickActionRequest, openQuickMediaPickerForTarget]);

  const applyQuickMediaSource = (source: string) => {
    const edit = quickMediaEdit;
    const value = source.trim();
    if (!edit || !value) return;

    if (edit.visibleSource === value) {
      setMediaOpen(false);
      setQuickMediaEdit(null);
      return;
    }

    const revision = revisionRef.current + 1;
    revisionRef.current = revision;
    setDocument((current) => persistSemanticPatch(
      current,
      edit.target,
      edit.scope,
      edit.device,
      edit.page,
      "media.src",
      value,
      revision,
    ));
    setSelected((current) => current?.id === edit.target.id
      ? updateTargetSnapshot(current, "media.src", value)
      : current);
    setHistory((items) => [...items.slice(-79), {
      kind: "semantic",
      target: edit.target,
      scope: edit.scope,
      device: edit.device,
      path: "media.src",
      before: edit.beforeOverride,
      after: value,
    }]);
    setFuture([]);
    postToPreview({
      type: STORE_DESIGN_MESSAGES.PATCH,
      targetId: edit.target.id,
      path: "media.src",
      value,
      revision,
      scope: edit.scope,
      device: edit.device,
    });
    setMediaOpen(false);
    setQuickMediaEdit(null);
    toast.success(edit.mediaType === "video" ? "Video değiştirildi." : "Görsel değiştirildi.");
  };

  const applyContextSectionAction = async (action: "focus" | "up" | "down" | "toggle" | "duplicate" | "delete") => {
    const registration = contextMenu ? sectionRegistration(contextMenu.target) : null;
    if (!registration) return;

    if (action === "focus") {
      setContextMenu(null);
      setSelected(null);
      setStructureFocusSectionId(registration.id);
      setRightOpen(false);
      setLeftOpen(true);
      return;
    }

    const source = document.sections[registration.id];
    const preferredTemplateId = activePage
      ? (managedPage?.templateId || (activePage.template ? (document.templateBindings[activePage.path] || activePage.path) : `route:${activePage.path}`))
      : null;
    const preferredTemplate = preferredTemplateId ? document.templates[preferredTemplateId] || null : null;
    const ownerTemplate = preferredTemplate?.sectionIds.includes(registration.id)
      ? preferredTemplate
      : Object.values(document.templates).find((template) => template.sectionIds.includes(registration.id));
    if (!source || !ownerTemplate) {
      toast.error("Bu bölümün sayfa yapısı bulunamadı.");
      return;
    }

    const next = structuredClone(document) as ThemeDocument;
    const template = next.templates[ownerTemplate.id];
    const index = template?.sectionIds.indexOf(registration.id) ?? -1;
    if (!template || index < 0) {
      toast.error("Bu bölümün sayfa yapısı bulunamadı.");
      return;
    }

    let label = "Bölüm güncellendi";

    if (action === "up") {
      if (index <= 0) return;
      [template.sectionIds[index - 1], template.sectionIds[index]] = [template.sectionIds[index], template.sectionIds[index - 1]];
      label = "Bölüm yukarı taşındı";
    } else if (action === "down") {
      if (index >= template.sectionIds.length - 1) return;
      [template.sectionIds[index + 1], template.sectionIds[index]] = [template.sectionIds[index], template.sectionIds[index + 1]];
      label = "Bölüm aşağı taşındı";
    } else if (action === "toggle") {
      const referenceCount = Object.values(document.templates).filter((item) => item.sectionIds.includes(registration.id)).length;
      if (referenceCount > 1) {
        const confirmed = window.confirm(
          `Bu bölüm ${referenceCount} yerde kullanılıyor. Görünürlük değişikliği bağlı olan tüm yerleri etkiler. Devam etmek istiyor musun?`,
        );
        if (!confirmed) return;
      }
      next.sections[registration.id] = { ...source, enabled: !source.enabled };
      label = source.enabled ? "Bölüm gizlendi" : "Bölüm gösterildi";
    } else if (action === "duplicate") {
      const copyId = editorUid(`section-${source.type}`);
      const copiedBlockIds: string[] = [];
      for (const blockId of source.blockIds || []) {
        const block = next.blocks[blockId];
        if (!block) continue;
        const copyBlockId = editorUid(`block-${block.type}`);
        next.blocks[copyBlockId] = structuredClone({ ...block, id: copyBlockId });
        copiedBlockIds.push(copyBlockId);
      }
      next.sections[copyId] = structuredClone({ ...source, id: copyId, blockIds: copiedBlockIds });
      template.sectionIds.splice(index + 1, 0, copyId);
      label = "Bölüm çoğaltıldı";
    } else if (action === "delete") {
      const confirmed = window.confirm(
        contextTargetsWholeSection
          ? "Bu bölümü sayfa yapısından kaldırmak istiyor musun?"
          : "Seçili öğenin bulunduğu üst bölümü sayfa yapısından kaldırmak istiyor musun?",
      );
      if (!confirmed) return;

      template.sectionIds.splice(index, 1);
      const stillReferenced = Object.values(next.templates).some((item) => item.sectionIds.includes(registration.id));
      if (!stillReferenced) {
        for (const blockId of source.blockIds || []) {
          const usedElsewhere = Object.values(next.sections).some((section) => section.id !== registration.id && section.blockIds?.includes(blockId));
          if (!usedElsewhere) delete next.blocks[blockId];
        }
        delete next.sections[registration.id];
      }
      label = "Bölüm kaldırıldı";
    }

    setContextMenu(null);
    setSelected(null);
    setStructureFocusSectionId(null);
    await applyStructureDocument(next, label);
  };

  const resetQuickOverrides = () => {
    if (!selected || !activePage) return;

    const responsive = responsiveSettingsFor(document, selected, scope, activePage);
    const deviceSettings = recordValue(responsive[device]);
    const leaves = new Map(flattenResponsiveLeaves(deviceSettings));
    const candidates = [
      ...(selected.controlGroups.includes("typography") ? ["textAlign"] : []),
      ...(selected.controlGroups.includes("layout") ? ["visible"] : []),
      ...(selected.type !== "product-card" && (selected.controlGroups.includes("card") || selected.controlGroups.includes("layout")) ? ["borderRadius"] : []),
      ...(selected.type !== "product-card" && selected.controlGroups.includes("media") && selected.current.media ? ["media.src", "media.objectFit", "media.objectPosition"] : []),
      ...(selected.type === "product-grid" ? ["grid.columns"] : []),
      ...(selected.type === "product-card" ? ["card.density", "card.imageRatio", "card.showPrice"] : []),
    ];
    const paths = [...new Set(candidates)].filter((path) => leaves.has(path));

    if (!paths.length) {
      toast.success("Bu uygulama alanında sıfırlanacak özel hızlı ayar yok.");
      return;
    }

    let next = document;
    let revision = revisionRef.current;
    const patches: SemanticHistoryEntry[] = [];

    for (const path of paths) {
      const before = leaves.get(path);
      revision += 1;
      next = persistSemanticPatch(next, selected, scope, device, activePage, path, null, revision);
      patches.push({ kind: "semantic", target: selected, scope, device, path, before, after: null });
      postToPreview({
        type: STORE_DESIGN_MESSAGES.PATCH,
        targetId: selected.id,
        path,
        value: null,
        revision,
        scope,
        device,
      });
    }

    revisionRef.current = revision;
    setDocument(next);
    setHistory((items) => [...items.slice(-79), { kind: "semantic-batch", label: "Hızlı ayarlar sıfırlandı", patches }]);
    setFuture([]);
    setContextMenu(null);
    toast.success("Özel hızlı ayarlar varsayılana döndürüldü.");
  };

  const applyMobileResponsiveAction = (mode: "copy-desktop" | "inherit") => {
    if (!selected || !activePage || device !== "mobile") return;

    const responsive = responsiveSettingsFor(document, selected, scope, activePage);
    const desktop = recordValue(responsive.desktop);
    const mobile = recordValue(responsive.mobile);
    const desktopLeaves = new Map(flattenResponsiveLeaves(desktop));
    const mobileLeaves = new Map(flattenResponsiveLeaves(mobile));
    const paths = mode === "copy-desktop"
      ? [...new Set([...desktopLeaves.keys(), ...mobileLeaves.keys()])]
      : [...mobileLeaves.keys()];

    if (!paths.length) {
      toast.error(mode === "copy-desktop" ? "Kopyalanacak masaüstü ayarı yok." : "Kaldırılacak özel mobil ayar yok.");
      return;
    }

    let next = document;
    let revision = revisionRef.current;
    const patches: SemanticHistoryEntry[] = [];

    for (const path of paths) {
      const before = mobileLeaves.has(path) ? mobileLeaves.get(path) : null;
      const after = mode === "copy-desktop"
        ? (desktopLeaves.has(path) ? desktopLeaves.get(path) : null)
        : null;
      if (Object.is(before, after)) continue;

      revision += 1;
      next = persistSemanticPatch(next, selected, scope, "mobile", activePage, path, after, revision);
      patches.push({
        kind: "semantic",
        target: selected,
        scope,
        device: "mobile",
        path,
        before,
        after,
      });
      postToPreview({
        type: STORE_DESIGN_MESSAGES.PATCH,
        targetId: selected.id,
        path,
        value: after,
        revision,
        scope,
        device: "mobile",
      });
    }

    if (!patches.length) return;
    revisionRef.current = revision;
    setDocument(next);
    setHistory((items) => [...items.slice(-79), {
      kind: "semantic-batch",
      label: mode === "copy-desktop" ? "Masaüstü ayarları mobil görünüme aktarıldı" : "Mobil ayarlar masaüstü ayarına döndü",
      patches,
    }]);
    setFuture([]);
    toast.success(mode === "copy-desktop" ? "Masaüstü ayarları mobil görünüme aktarıldı." : "Mobil ayarlar artık masaüstü ayarını kullanacak.");
  };

  const undo = async () => {
    const entry = history.at(-1);
    if (!entry) return;
    setHistory((items) => items.slice(0, -1));
    setFuture((items) => [...items, entry]);
    if (entry.kind === "semantic") {
      applyPatchValue(entry.target, entry.scope, entry.device, entry.path, entry.before);
      return;
    }
    if (entry.kind === "semantic-batch") {
      for (const patch of [...entry.patches].reverse()) {
        applyPatchValue(patch.target, patch.scope, patch.device, patch.path, patch.before);
      }
      return;
    }
    try {
      await applyStructureSnapshot(entry.before, entry.pagePath, entry.reload);
      if (!entry.reload) postMediaDocumentDiff(entry.after, entry.before);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Yapısal geri alma uygulanamadı.");
    }
  };

  const redo = async () => {
    const entry = future.at(-1);
    if (!entry) return;
    setFuture((items) => items.slice(0, -1));
    setHistory((items) => [...items, entry]);
    if (entry.kind === "semantic") {
      applyPatchValue(entry.target, entry.scope, entry.device, entry.path, entry.after);
      return;
    }
    if (entry.kind === "semantic-batch") {
      for (const patch of entry.patches) {
        applyPatchValue(patch.target, patch.scope, patch.device, patch.path, patch.after);
      }
      return;
    }
    try {
      await applyStructureSnapshot(entry.after, entry.pagePath, entry.reload);
      if (!entry.reload) postMediaDocumentDiff(entry.before, entry.after);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Yapısal yineleme uygulanamadı.");
    }
  };

  const save = async (mode: "draft" | "publish", forcePublish = false) => {
    if (saving) return;

    if (mode === "publish" && !forcePublish) {
      setPublishIssues(analyzeThemeDocumentReferences(document));
      return;
    }

    setSaveFeedback(null);
    setSaving(mode);
    try {
      const result = await adminRequest<{ document?: unknown; revalidate?: { ok?: boolean; message?: string } }>("/api/store-design-v2", {
        method: "PUT",
        body: JSON.stringify({ mode, document }),
        confirmation: false,
      });
      const persisted = normalizeThemeDocument(result.document || document);
      setDocument(persisted);
      setSavedDraft(persisted);
      revisionRef.current = persisted.revision;
      if (mode === "publish") {
        setPublished(persisted);
        setPublishIssues(null);
      }
      toast.success(mode === "publish" ? "Mağaza tasarımı yayınlandı." : "Taslak kaydedildi.");
      setSaveFeedback(mode);
      window.setTimeout(() => {
        setSaveFeedback((current) => current === mode ? null : current);
      }, 1_400);
    } catch (error) {
      setSaveFeedback(null);
      toast.error(error instanceof Error ? error.message : "Mağaza tasarımı kaydedilemedi.");
    } finally {
      setSaving(null);
    }
  };

  if (loading || !initialSrcRef.current) {
    return (
      <div data-store-design-v2-loading className="sd-loading-screen grid min-h-dvh place-items-center bg-[#f5f5f3]">
        <div className="flex items-center gap-3 rounded-2xl border border-black/10 bg-white px-5 py-4 text-[12px] font-medium shadow-sm">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Mağaza Tasarımı hazırlanıyor…
        </div>
      </div>
    );
  }

  // Zeabur deployment marker: this admin source change intentionally refreshes the panel service.
  return (
    <div ref={editorShellRef} data-store-design-v2-admin data-store-design-version="2.2" data-physical-mobile={isMobileViewport ? "true" : "false"} data-device={device} data-interaction-mode={interactionMode} className="sd-editor-shell flex h-dvh min-h-0 flex-col overflow-hidden bg-[#f5f5f3] text-[#111]">
      <header className="sd-toolbar z-30 flex h-14 shrink-0 items-center justify-between gap-2 border-b px-2 sm:px-3">
        <div className="sd-toolbar-left flex min-w-0 items-center gap-1">
          <button type="button" onClick={requestEditorExit} className="sd-icon-button grid h-9 w-9 shrink-0 place-items-center rounded-md border" aria-label="Geri" title="Geri">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button type="button" onClick={toggleStructurePanel} aria-pressed={leftOpen} className="sd-icon-button grid h-9 w-9 shrink-0 place-items-center rounded-md border" aria-label="Yapıyı aç veya kapat" title="Yapı">
            <PanelLeft className="h-4 w-4" />
          </button>
          <div className="sd-toolbar-divider mx-1 h-6 w-px" />
          <div className="sd-page-switcher-shell min-w-0">
            <select
              aria-label="Düzenlenen sayfa"
              value={activePath}
              onChange={(event) => void changePage(event.target.value)}
              className="sd-field sd-page-switcher h-9 min-w-0 rounded-md border px-3 pr-8 text-[12px] font-semibold outline-none"
            >
              {groupedPages.map(([group, items]) => (
                <optgroup key={group} label={group}>
                  {items.map((item) => <option key={item.path} value={item.path}>{item.label}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
        </div>

        <div className="sd-toolbar-center flex items-center gap-1">
          <div className="sd-device-toggle flex items-center rounded-md border p-0.5">
            <button type="button" onClick={() => setDevice("desktop")} aria-pressed={device === "desktop"} className={device === "desktop" ? "sd-device-button is-active grid h-8 w-8 place-items-center rounded" : "sd-device-button grid h-8 w-8 place-items-center rounded"} title="Masaüstü">
              <Monitor className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => setDevice("mobile")} aria-pressed={device === "mobile"} className={device === "mobile" ? "sd-device-button is-active grid h-8 w-8 place-items-center rounded" : "sd-device-button grid h-8 w-8 place-items-center rounded"} title="Mobil">
              <Smartphone className="h-4 w-4" />
            </button>
          </div>
          <div className="sd-device-toggle flex items-center rounded-md border p-0.5">
            <button type="button" onClick={() => { setInteractionMode("edit"); setContextMenu(null); }} aria-pressed={interactionMode === "edit"} className={interactionMode === "edit" ? "sd-device-button is-active flex h-8 items-center gap-1.5 rounded px-2.5 text-[11px] font-semibold" : "sd-device-button flex h-8 items-center gap-1.5 rounded px-2.5 text-[11px] font-semibold"}>
              <SlidersHorizontal className="h-3.5 w-3.5" />Düzenle
            </button>
            <button type="button" onClick={() => { setInteractionMode("browse"); setContextMenu(null); setRightOpen(false); }} aria-pressed={interactionMode === "browse"} className={interactionMode === "browse" ? "sd-device-button is-active flex h-8 items-center gap-1.5 rounded px-2.5 text-[11px] font-semibold" : "sd-device-button flex h-8 items-center gap-1.5 rounded px-2.5 text-[11px] font-semibold"}>
              <Eye className="h-3.5 w-3.5" />Önizle
            </button>
          </div>
        </div>

        <div className="sd-toolbar-right flex items-center gap-1">
          <button type="button" disabled={!history.length || saving !== null} onClick={() => void undo()} className="sd-icon-button grid h-9 w-9 place-items-center rounded-md border disabled:opacity-30" aria-label="Geri al" title="Geri al">
            <Undo2 className="h-4 w-4" />
          </button>
          <button type="button" disabled={!future.length || saving !== null} onClick={() => void redo()} className="sd-icon-button grid h-9 w-9 place-items-center rounded-md border disabled:opacity-30" aria-label="Yinele" title="Yinele">
            <Redo2 className="h-4 w-4" />
          </button>
          <span className={saving ? "sd-save-status is-saving" : hasUnsavedChanges ? "sd-save-status is-dirty" : hasUnpublishedChanges ? "sd-save-status is-draft" : "sd-save-status is-live"} role="status" aria-live="polite">
            {saving ? "Kaydediliyor…" : hasUnsavedChanges ? "Kaydedilmemiş" : hasUnpublishedChanges ? "Taslak kaydedildi" : "Yayında"}
          </span>
          <button type="button" data-save-state={saving === "draft" ? "loading" : saveFeedback === "draft" ? "success" : "idle"} disabled={saving !== null} onClick={() => void save("draft")} className="sd-toolbar-button sd-save-draft flex h-9 items-center gap-1.5 rounded-md border px-3 text-[11px] font-semibold disabled:opacity-50">
            {saving === "draft" ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : saveFeedback === "draft" ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
            <span>Taslak</span>
          </button>
          <button type="button" data-save-state={saving === "publish" ? "loading" : saveFeedback === "publish" ? "success" : "idle"} disabled={saving !== null} onClick={() => void save("publish")} className="sd-primary-button sd-save-button flex h-9 items-center gap-1.5 rounded-md px-3 text-[11px] font-semibold disabled:opacity-50">
            {saving === "publish" ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : saveFeedback === "publish" ? <Check className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
            <span>Yayınla</span>
          </button>
          <div className="sd-more-tools relative">
            <button ref={mobileMoreButtonRef} type="button" onClick={() => setMobileMoreOpen((value) => !value)} aria-expanded={mobileMoreOpen} aria-haspopup="menu" className="sd-mobile-more-button sd-icon-button grid h-9 w-9 place-items-center rounded-md border" aria-label="Daha fazla araç" title="Daha fazla">
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {mobileMoreOpen ? (
              <div ref={mobileMoreMenuRef} role="menu" aria-label="Daha fazla araç" className="sd-mobile-more-menu absolute right-0 top-11 z-50 w-56 rounded-lg border p-1.5 shadow-2xl">
                <button role="menuitem" type="button" onClick={() => { setMobileMoreOpen(false); setQuickMediaEdit(null); setMediaOpen(true); }} className="sd-mobile-menu-row"><Images className="h-4 w-4" />Medya</button>
                <button role="menuitem" type="button" onClick={() => { setMobileMoreOpen(false); setPageManagerMode(managedPage ? "edit" : "create"); }} className="sd-mobile-menu-row"><FileText className="h-4 w-4" />Sayfalar</button>
                <button role="menuitem" type="button" onClick={() => { setMobileMoreOpen(false); setTemplateManagerOpen(true); }} className="sd-mobile-menu-row"><LayoutTemplate className="h-4 w-4" />Şablonlar</button>
                <button role="menuitem" type="button" onClick={() => { setMobileMoreOpen(false); setRedirectManagerOpen(true); }} className="sd-mobile-menu-row"><Link2 className="h-4 w-4" />Yönlendirmeler</button>
                <button role="menuitem" type="button" onClick={() => { setMobileMoreOpen(false); setSnapshotManagerOpen(true); }} className="sd-mobile-menu-row"><History className="h-4 w-4" />Geçmiş</button>
                <button role="menuitem" type="button" onClick={() => { setMobileMoreOpen(false); setLeftOpen(true); setSectionPickerSignal((value) => value + 1); }} className="sd-mobile-menu-row"><Plus className="h-4 w-4" />Bölüm ekle</button>
                <button role="menuitem" type="button" onClick={() => { setMobileMoreOpen(false); setLeftOpen(true); setPresetPickerSignal((value) => value + 1); }} className="sd-mobile-menu-row"><LayoutTemplate className="h-4 w-4" />Hazır düzenler</button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="sd-editor-workspace relative flex min-h-0 flex-1">
        <aside ref={structurePanelRef} tabIndex={-1} aria-label="Yapı" data-open={leftOpen ? "true" : "false"} aria-hidden={!leftOpen} className={leftOpen ? "sd-sidebar sd-sidebar-left is-open flex w-72 shrink-0 flex-col border-r" : "sd-sidebar sd-sidebar-left is-closed flex w-72 shrink-0 flex-col border-r"}>
          <header className="sd-structure-header flex items-center justify-between border-b px-4 py-3">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold">Yapı</p>
              <p className="mt-0.5 truncate text-[10px] opacity-60">{activePage?.label || "Sayfa"}</p>
            </div>
            <button type="button" onClick={() => setLeftOpen(false)} className="sd-icon-button grid h-8 w-8 place-items-center rounded-md border" aria-label="Yapıyı kapat">
              <X className="h-3.5 w-3.5" />
            </button>
          </header>

          <div className="sd-structure-scroll min-h-0 flex-1 overflow-y-auto p-2">
            <div className="sd-structure-group mb-3">
              <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] opacity-55">Global alanlar</div>
              <button type="button" onClick={() => selectPreviewTarget("global.header")} className="sd-global-row flex w-full items-center gap-2 rounded-md border px-3 py-2.5 text-left text-[12px] font-medium">
                <PanelLeft className="h-4 w-4 opacity-55" /><span>Üst Bilgi</span>
              </button>
              <button type="button" onClick={() => selectPreviewTarget("global.header.menu-trigger")} className="sd-global-row mt-1 flex w-full items-center gap-2 rounded-md border px-3 py-2.5 text-left text-[12px] font-medium">
                <LayoutTemplate className="h-4 w-4 opacity-55" /><span>Menü</span>
              </button>
              <button type="button" onClick={() => selectPreviewTarget("global.footer")} className="sd-global-row mt-1 flex w-full items-center gap-2 rounded-md border px-3 py-2.5 text-left text-[12px] font-medium">
                <PanelRight className="h-4 w-4 opacity-55" /><span>Alt Bilgi</span>
              </button>
            </div>

            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] opacity-55">Bölümler</span>
              <button type="button" onClick={() => setSectionPickerSignal((value) => value + 1)} className="sd-secondary-button flex h-7 items-center gap-1 rounded-md border px-2 text-[10px] font-semibold">
                <Plus className="h-3 w-3" />Ekle
              </button>
            </div>
            <StoreDesignSectionManager
              document={document}
              activePage={activePage}
              compatibility={activeCompatibility}
              openPickerSignal={sectionPickerSignal}
              openPresetSignal={presetPickerSignal}
              selectedSectionId={structureFocusSectionId || selectedSectionId}
              openEditorSectionId={sectionEditorTargetId}
              openEditorSignal={sectionEditorSignal}
              onApply={applyStructureDocument}
            />
          </div>
          <div className="sd-structure-footer grid grid-cols-2 gap-2 border-t p-3">
            <button type="button" onClick={() => setPageManagerMode(managedPage ? "edit" : "create")} className="sd-secondary-button h-9 rounded-md border px-2 text-[10px] font-semibold">Sayfa ayarları</button>
            <button type="button" onClick={() => setPresetPickerSignal((value) => value + 1)} className="sd-secondary-button h-9 rounded-md border px-2 text-[10px] font-semibold">Hazır düzenler</button>
          </div>
        </aside>

        <main ref={previewStageRef} className="sd-preview-stage relative flex min-w-0 flex-1 items-start justify-center overflow-auto p-2 md:p-3">
          {!connected ? (
            <div role="status" aria-live="polite" className="sd-preview-connection-chip absolute left-1/2 top-3 z-30 flex max-w-[calc(100%_-_24px)] -translate-x-1/2 items-center gap-2 rounded-full px-3 py-2 text-[11px] font-semibold shadow-lg">
              <RefreshCw className={`h-3.5 w-3.5 shrink-0 ${connectionStalled ? "" : "animate-spin"}`} />
              <span className="truncate">{connectionStalled ? "Önizleme yanıt vermiyor" : "Önizleme bağlanıyor…"}</span>
              {connectionStalled ? (
                <button
                  type="button"
                  onClick={() => void reconnectPreview()}
                  className="rounded-full border border-current/20 px-2.5 py-1 text-[10px] font-semibold"
                >
                  Yeniden bağlan
                </button>
              ) : null}
            </div>
          ) : null}
          {isMobileViewport && interactionMode === "edit" && !leftOpen && !rightOpen ? (
            <div className="sd-edit-mode-chip pointer-events-none absolute left-1/2 top-3 z-20 max-w-[calc(100vw_-_28px)] -translate-x-1/2 truncate rounded-full px-3 py-2 text-[11px] font-semibold shadow-lg">
              {selected ? `Seçili: ${selected.label} · Düzenle'den ayarları aç` : "Düzenleme açık · Bir öğeye dokun"}
            </div>
          ) : null}
          <div
            data-preview-viewport-width={device === "desktop" ? desktopPreviewViewport.width : undefined}
            data-preview-viewport-height={device === "desktop" ? desktopPreviewViewport.height : undefined}
            data-preview-scale={device === "desktop" ? desktopPreviewViewport.scale.toFixed(4) : undefined}
            className={`sd-preview-shell relative shrink-0 overflow-hidden bg-white shadow-[0_18px_60px_rgba(15,23,42,.14)] transition-[width,height,border-radius] duration-300 ${
              device === "mobile"
                ? isMobileViewport
                  ? "h-full w-full rounded-none border-0"
                  : "h-[780px] w-[390px] rounded-[44px] border-[9px] border-[#111]"
                : "sd-desktop-viewport-shell rounded-xl border border-black/10"
            }`}
            style={device === "desktop" && !isMobileViewport ? {
              width: `${Math.round(desktopPreviewViewport.width * desktopPreviewViewport.scale)}px`,
              height: `${Math.round(desktopPreviewViewport.height * desktopPreviewViewport.scale)}px`,
            } : undefined}
          >
            {device === "mobile" && !isMobileViewport ? <div className="sd-device-island pointer-events-none absolute left-1/2 top-3 z-10 h-7 w-28 -translate-x-1/2 rounded-full bg-[#111]" /> : null}
            <iframe
              ref={iframeRef}
              title="Mağaza tasarımı önizlemesi"
              src={initialSrcRef.current}
              className={`sd-preview-frame bg-white ${device === "mobile" && !isMobileViewport ? "h-full w-full rounded-[34px]" : device === "mobile" ? "h-full w-full" : "sd-desktop-viewport-frame"}`}
              style={device === "desktop" && !isMobileViewport ? {
                width: `${desktopPreviewViewport.width}px`,
                height: `${desktopPreviewViewport.height}px`,
                transform: `scale(${desktopPreviewViewport.scale})`,
                transformOrigin: "top left",
              } : undefined}
              onLoad={() => {
                setConnected(false);
                setConnectionStalled(false);
                setLastHeartbeat(Date.now());
              }}
            />
          </div>
        </main>

        <aside ref={inspectorPanelRef} tabIndex={-1} aria-label="Düzenleme paneli" data-open={rightOpen ? "true" : "false"} data-sheet-level={mobileSheetLevel} aria-hidden={!rightOpen} className={rightOpen ? "sd-sidebar sd-inspector is-open flex w-[400px] shrink-0 flex-col border-l" : "sd-sidebar sd-inspector is-closed flex w-[400px] shrink-0 flex-col border-l"}>
          <div
            className="sd-inspector-header border-b px-4 py-3"
            onTouchStart={(event) => { mobileSheetTouchStartRef.current = event.touches.item(0)?.clientY ?? null; }}
            onTouchEnd={(event) => {
              if (!isMobileViewport) return;
              const start = mobileSheetTouchStartRef.current;
              const end = event.changedTouches.item(0)?.clientY ?? null;
              mobileSheetTouchStartRef.current = null;
              if (start === null || end === null) return;
              const delta = end - start;
              if (Math.abs(delta) < 48) return;
              if (delta > 0) {
                if ((inspectorBodyRef.current?.scrollTop || 0) > 1) return;
                if (mobileSheetLevel === "full") setMobileSheetLevel("medium");
                else if (mobileSheetLevel === "medium") setMobileSheetLevel("peek");
                else setRightOpen(false);
              } else {
                if (mobileSheetLevel === "peek") setMobileSheetLevel("medium");
                else if (mobileSheetLevel === "medium") setMobileSheetLevel("full");
              }
            }}
          >
            <div className="sd-mobile-sheet-handle mx-auto mb-2 hidden h-1 w-10 rounded-full" />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] opacity-55">Düzenlenen öğe</p>
                {selected ? (
                  <>
                    <p className="mt-1 truncate text-[14px] font-semibold">{selected.label}</p>
                    <p className="sd-inspector-breadcrumb mt-1 truncate text-[10px] opacity-55">{selected.breadcrumb.map((item) => item.label).join(" › ")}</p>
                    <span className="sd-scope-chip mt-2 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold">{scopeLabel(scope)}</span>
                  </>
                ) : <p className="mt-1 text-[12px] opacity-55">Önizlemeden bir öğe seç</p>}
              </div>
              <button type="button" onClick={() => { setRightOpen(false); setMobileSheetLevel("peek"); }} className="sd-icon-button grid h-9 w-9 shrink-0 place-items-center rounded-md border" aria-label="Ayarları kapat">
                <X className="h-4 w-4" />
              </button>
            </div>
            {selected ? (
              <>
                <div role="group" className="sd-mobile-sheet-levels mt-3 hidden grid-cols-3 gap-1 rounded-lg p-1" aria-label="Ayar paneli görünümü">
                  {(["peek", "medium", "full"] as const).map((level) => (
                    <button key={level} type="button" aria-pressed={mobileSheetLevel === level} onClick={() => setMobileSheetLevel(level)} className={mobileSheetLevel === level ? "is-active rounded-md px-2 py-2 text-[10px] font-semibold" : "rounded-md px-2 py-2 text-[10px] font-semibold"}>
                      {level === "peek" ? "Özet" : level === "medium" ? "Ayarlar" : "Tam ekran"}
                    </button>
                  ))}
                </div>
                <div className="sd-mobile-peek-actions mt-3 hidden grid-cols-4 gap-1.5">
                  {selected.current.content ? (
                    <button type="button" onClick={() => setMobileSheetLevel("medium")} className="sd-mobile-quick-action"><FileText className="h-4 w-4" /><span>Düzenle</span></button>
                  ) : null}
                  {selected.current.link ? (
                    <button type="button" onClick={() => setDestinationTarget(selected)} className="sd-mobile-quick-action"><Link2 className="h-4 w-4" /><span>Hedef</span></button>
                  ) : null}
                  {selected.current.media ? (
                    <button type="button" onClick={openQuickMediaPicker} className="sd-mobile-quick-action"><Images className="h-4 w-4" /><span>Medya</span></button>
                  ) : null}
                  {selected.controlGroups.includes("layout") ? (
                    <button type="button" onClick={() => applyInspectorPatch("visible", selected.current.visible === false)} className="sd-mobile-quick-action">{selected.current.visible === false ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}<span>{selected.current.visible === false ? "Göster" : "Gizle"}</span></button>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>

          {selected ? (
            <div ref={inspectorBodyRef} className="sd-inspector-body min-h-0 flex-1 overflow-y-auto">
              {selectedSection && selectedSectionDefinition ? (
                <section className="sd-inspector-group border-b px-4 py-4">
                  <h3 className="sd-inspector-group-title">Bölüm ayarları</h3>
                  <p className="mt-1 text-[10px] leading-4 opacity-55">
                    {selectedSectionDefinition.label} için gerçek bölüm ayarları.
                  </p>
                  <div className="mt-3 grid gap-2">
                    {selectedSectionMediaKey ? (
                      <button
                        type="button"
                        onClick={() => setSectionMediaPicker({
                          sectionId: selectedSection.id,
                          key: selectedSectionMediaKey,
                          mediaType: selectedSectionMediaType,
                        })}
                        className="sd-secondary-button flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3 text-left"
                      >
                        <span className="min-w-0">
                          <small className="block text-[10px] opacity-55">Bölüm medyası</small>
                          <strong className="mt-1 block truncate text-[11px]">
                            {typeof selectedSection.settings[selectedSectionMediaKey] === "string" && selectedSection.settings[selectedSectionMediaKey]
                              ? "Medya seçildi · değiştirmek için tıkla"
                              : "Medya seçilmedi"}
                          </strong>
                        </span>
                        <span className="shrink-0 text-[10px] font-semibold">Seç / Değiştir</span>
                      </button>
                    ) : null}
                    {["image-text-split", "video-text-split"].includes(selectedSection.type) ? (
                      <>
                        <div className="grid gap-1.5">
                          <span className="text-[10px] font-semibold opacity-60">Yerleşim</span>
                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              type="button"
                              aria-pressed={(selectedSection.settings.side || "left") === "left"}
                              onClick={() => void applySelectedSectionSetting("side", "left", "Görsel sola alındı")}
                              className={(selectedSection.settings.side || "left") === "left"
                                ? "sd-primary-button h-9 rounded-md px-2 text-[10px] font-semibold"
                                : "sd-secondary-button h-9 rounded-md border px-2 text-[10px] font-semibold"}
                            >
                              Görsel solda
                            </button>
                            <button
                              type="button"
                              aria-pressed={selectedSection.settings.side === "right"}
                              onClick={() => void applySelectedSectionSetting("side", "right", "Görsel sağa alındı")}
                              className={selectedSection.settings.side === "right"
                                ? "sd-primary-button h-9 rounded-md px-2 text-[10px] font-semibold"
                                : "sd-secondary-button h-9 rounded-md border px-2 text-[10px] font-semibold"}
                            >
                              Görsel sağda
                            </button>
                          </div>
                        </div>
                        <label className="grid gap-1.5 text-[10px] font-semibold opacity-60">
                          Metin türü
                          <select
                            value={typeof selectedSection.settings.contentMode === "string" ? selectedSection.settings.contentMode : "both"}
                            onChange={(event) => void applySelectedSectionSetting("contentMode", event.target.value, "Metin türü güncellendi")}
                            className="sd-field h-10 rounded-md border px-3 text-[12px] font-medium outline-none"
                          >
                            <option value="both">Başlık + açıklama</option>
                            <option value="heading">Yalnız başlık</option>
                            <option value="body">Yalnız açıklama</option>
                          </select>
                        </label>
                      </>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        setSectionEditorTargetId(selectedSection.id);
                        setSectionEditorSignal((value) => value + 1);
                      }}
                      className="sd-primary-button flex h-10 items-center justify-center gap-2 rounded-md px-3 text-[11px] font-semibold"
                    >
                      <SlidersHorizontal className="h-4 w-4" />
                      Tüm bölüm ayarlarını aç
                    </button>
                  </div>
                </section>
              ) : null}
              {selected.current.content || selected.type === "consent-banner" ? (
                <section className="sd-inspector-group border-b px-4 py-4">
                  <h3 className="sd-inspector-group-title">İçerik</h3>
                  <div className="mt-3 grid gap-3">
                    {selected.current.content ? (
                      <label className="grid gap-1.5 text-[11px] opacity-70">
                        Metin / ad
                        <StableInspectorTextControl
                          key={`${selected.id}:content.text`}
                          value={selected.current.content.text || ""}
                          multiline={(selected.current.content.text || "").length > 100 || (selected.current.content.text || "").includes("\n")}
                          onEditingChange={(editing) => { inspectorEditingRef.current = editing; }}
                          onCommit={(value) => applyInspectorPatch("content.text", value)}
                          className={(selected.current.content.text || "").length > 100 || (selected.current.content.text || "").includes("\n")
                            ? "sd-field min-h-24 resize-y rounded-md border p-3 text-[16px] leading-5 outline-none"
                            : "sd-field h-10 rounded-md border px-3 text-[16px] outline-none"}
                        />
                      </label>
                    ) : null}
                    {selected.type === "consent-banner" ? (
                      <>
                        <label className="grid gap-1.5 text-[11px] opacity-70">Başlık<StableInspectorTextControl key="consent:title" value={String(consentSetting("title", "Çerezler"))} onEditingChange={(editing) => { inspectorEditingRef.current = editing; }} onCommit={(value) => applyInspectorPatch("title", value)} className="sd-field h-10 rounded-md border px-3 text-[16px] outline-none" maxLength={80} /></label>
                        <label className="grid gap-1.5 text-[11px] opacity-70">Açıklama<StableInspectorTextControl key="consent:intro" value={String(consentSetting("intro", "Deneyiminizi iyileştirmek ve site kullanımını anlamak için çerezlerden yararlanıyoruz."))} multiline onEditingChange={(editing) => { inspectorEditingRef.current = editing; }} onCommit={(value) => applyInspectorPatch("intro", value)} className="sd-field min-h-24 resize-y rounded-md border p-3 text-[16px] leading-5 outline-none" maxLength={360} /></label>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="grid gap-1.5 text-[11px] opacity-70">Kabul düğmesi<StableInspectorTextControl key="consent:accept" value={String(consentSetting("acceptLabel", "Kabul et"))} onEditingChange={(editing) => { inspectorEditingRef.current = editing; }} onCommit={(value) => applyInspectorPatch("acceptLabel", value)} className="sd-field h-10 rounded-md border px-3 text-[16px] outline-none" maxLength={40} /></label>
                          <label className="grid gap-1.5 text-[11px] opacity-70">Ret düğmesi<StableInspectorTextControl key="consent:reject" value={String(consentSetting("rejectLabel", "Reddet"))} onEditingChange={(editing) => { inspectorEditingRef.current = editing; }} onCommit={(value) => applyInspectorPatch("rejectLabel", value)} className="sd-field h-10 rounded-md border px-3 text-[16px] outline-none" maxLength={40} /></label>
                        </div>
                        <label className="grid gap-1.5 text-[11px] opacity-70">Gizlilik bağlantısı<StableInspectorTextControl key="consent:privacy" value={String(consentSetting("privacyLabel", "Gizlilik ve çerezler"))} onEditingChange={(editing) => { inspectorEditingRef.current = editing; }} onCommit={(value) => applyInspectorPatch("privacyLabel", value)} className="sd-field h-10 rounded-md border px-3 text-[16px] outline-none" maxLength={80} /></label>
                      </>
                    ) : null}
                    {selected.type === "menu-link" || selected.id.startsWith("global.header.menu.") ? (
                      <button
                        type="button"
                        onClick={() => void addMenuHeading()}
                        className="sd-secondary-button mt-1 flex h-10 items-center justify-center gap-2 rounded-md border px-3 text-[11px] font-semibold"
                      >
                        <Plus className="h-4 w-4" /> Yeni menü başlığı ekle
                      </button>
                    ) : null}
                  </div>
                </section>
              ) : null}

              {selected.current.link ? (
                <section className="sd-inspector-group border-b px-4 py-4">
                  <h3 className="sd-inspector-group-title">Bağlantı</h3>
                  <div className="mt-3 grid gap-3">
                    <button type="button" onClick={() => setDestinationTarget(selected)} className="sd-destination-summary flex min-h-12 items-center justify-between gap-3 rounded-lg border px-3 text-left">
                      <span className="min-w-0"><small className="block text-[10px] opacity-55">Gidilecek yer</small><strong className="mt-1 block truncate text-[12px]">{selected.current.link.href || "Bağlantı yok"}</strong></span>
                      <span className="shrink-0 text-[10px] font-semibold">Değiştir</span>
                    </button>
                    <label className="grid gap-1.5 text-[11px] opacity-70">
                      Açılış
                      <select value={selected.current.link.target || "_self"} onChange={(event) => applyInspectorPatch("link.target", event.target.value)} className="sd-field h-10 rounded-md border px-3 text-[12px] font-medium outline-none">
                        <option value="_self">Aynı sekme</option>
                        <option value="_blank">Yeni sekme</option>
                      </select>
                    </label>
                  </div>
                </section>
              ) : null}

              {selected.current.media ? (
                <section className="sd-inspector-group border-b px-4 py-4">
                  <h3 className="sd-inspector-group-title">Medya</h3>
                  <div className="mt-3 grid gap-3">
                    <button type="button" onClick={openQuickMediaPicker} className="sd-primary-button flex h-10 items-center justify-center gap-2 rounded-md px-3 text-[11px] font-semibold">
                      <Images className="h-4 w-4" />{selected.current.media.kind === "video" ? "Videoyu değiştir" : "Görseli değiştir"}
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="grid gap-1.5 text-[11px] opacity-70">Sığdırma<select value={selected.current.media.objectFit || "cover"} onChange={(event) => applyInspectorPatch("media.objectFit", event.target.value)} className="sd-field h-10 rounded-md border px-2.5 text-[12px] outline-none"><option value="cover">Kapla / kırp</option><option value="contain">Tamamını göster</option></select></label>
                      <label className="grid gap-1.5 text-[11px] opacity-70">Odak<select value={selected.current.media.objectPosition || "50% 50%"} onChange={(event) => applyInspectorPatch("media.objectPosition", event.target.value)} className="sd-field h-10 rounded-md border px-2.5 text-[12px] outline-none"><option value="50% 50%">Orta</option><option value="50% 0%">Üst</option><option value="50% 100%">Alt</option><option value="0% 50%">Sol</option><option value="100% 50%">Sağ</option></select></label>
                    </div>
                    {selected.current.media.kind === "image" ? (
                      <label className="grid gap-1.5 text-[11px] opacity-70">
                        Alternatif metin
                        <StableInspectorTextControl key={`${selected.id}:media.alt`} value={selected.current.media.alt || ""} onEditingChange={(editing) => { inspectorEditingRef.current = editing; }} onCommit={(value) => applyInspectorPatch("media.alt", value)} className="sd-field h-10 rounded-md border px-3 text-[16px] outline-none" placeholder="Görseli kısaca anlat" maxLength={240} />
                      </label>
                    ) : null}
                  </div>
                </section>
              ) : null}

              {selected.controlGroups.includes("typography") || selected.controlGroups.includes("layout") || selected.controlGroups.includes("card") || selected.type === "consent-banner" ? (
                <section className="sd-inspector-group border-b px-4 py-4">
                  <h3 className="sd-inspector-group-title">Görünüm</h3>
                  <div className="mt-3 grid gap-3">
                    {selected.controlGroups.includes("typography") ? (
                      <label className="grid gap-1.5 text-[11px] opacity-70">Hizalama<select value={selected.current.textAlign || "left"} onChange={(event) => applyInspectorPatch("textAlign", event.target.value)} className="sd-field h-10 rounded-md border px-3 text-[12px] outline-none"><option value="left">Sol</option><option value="center">Orta</option><option value="right">Sağ</option></select></label>
                    ) : null}
                    {selected.controlGroups.includes("layout") && selected.type !== "consent-banner" ? (
                      <label className="sd-toggle-row flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3 text-[12px] font-medium"><span>Görünür</span><input type="checkbox" checked={selected.current.visible !== false} onChange={(event) => applyInspectorPatch("visible", event.target.checked)} /></label>
                    ) : null}
                    {(selected.controlGroups.includes("card") || selected.controlGroups.includes("layout")) && selected.type !== "consent-banner" && selected.type !== "product-card" ? (
                      <label className="grid gap-1.5 text-[11px] opacity-70">Köşe yuvarlaklığı<select value={String(Math.round(selected.current.borderRadius || 0))} onChange={(event) => applyInspectorPatch("borderRadius", Number(event.target.value))} className="sd-field h-10 rounded-md border px-3 text-[12px] outline-none">{[0,4,8,12,16,24,32].map((value) => <option key={value} value={value}>{value === 0 ? "Düz" : value + "px"}</option>)}</select></label>
                    ) : null}
                    {selected.type === "product-card" ? (
                      <>
                        <label className="grid gap-1.5 text-[11px] opacity-70">Yoğunluk<select value={selected.current.card?.density || "m"} onChange={(event) => applyInspectorPatch("card.density", event.target.value)} className="sd-field h-10 rounded-md border px-3 text-[12px] outline-none"><option value="s">Kompakt</option><option value="m">Dengeli</option><option value="l">Ferah</option></select></label>
                        <label className="grid gap-1.5 text-[11px] opacity-70">Görsel oranı<select value={selected.current.card?.imageRatio || "3/4"} onChange={(event) => applyInspectorPatch("card.imageRatio", event.target.value)} className="sd-field h-10 rounded-md border px-3 text-[12px] outline-none"><option value="1/1">1:1</option><option value="4/5">4:5</option><option value="3/4">3:4</option></select></label>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="sd-toggle-row flex min-h-11 items-center justify-between gap-2 rounded-lg border px-3 text-[11px] font-medium"><span>Fiyat</span><input type="checkbox" checked={selected.current.card?.showPrice !== false} onChange={(event) => applyInspectorPatch("card.showPrice", event.target.checked)} /></label>
                          <label className="sd-toggle-row flex min-h-11 items-center justify-between gap-2 rounded-lg border px-3 text-[11px] font-medium"><span>Hızlı ekle</span><input type="checkbox" checked={selected.current.card?.showQuickAdd !== false} onChange={(event) => applyInspectorPatch("card.showQuickAdd", event.target.checked)} /></label>
                        </div>
                      </>
                    ) : null}
                    {selected.type === "consent-banner" ? (
                      <div className="grid grid-cols-2 gap-2">
                        <label className="grid gap-1.5 text-[11px] opacity-70">Konum<select value={consentSetting("position", "bottom-center")} onChange={(event) => applyInspectorPatch("position", event.target.value)} className="sd-field h-10 rounded-md border px-2 text-[11px] outline-none"><option value="bottom-center">Alt orta</option><option value="bottom-left">Alt sol</option><option value="bottom-right">Alt sağ</option></select></label>
                        <label className="grid gap-1.5 text-[11px] opacity-70">Genişlik<select value={consentSetting("widthPreset", "standard")} onChange={(event) => applyInspectorPatch("widthPreset", event.target.value)} className="sd-field h-10 rounded-md border px-2 text-[11px] outline-none"><option value="compact">Dar</option><option value="standard">Standart</option><option value="wide">Geniş</option></select></label>
                      </div>
                    ) : null}
                  </div>
                </section>
              ) : null}

              {selected.type === "product-grid" ? (
                <section className="sd-inspector-group border-b px-4 py-4">
                  <h3 className="sd-inspector-group-title">Düzen</h3>
                  <div className="mt-3 grid gap-3">
                    <label className="grid gap-1.5 text-[11px] opacity-70">Sütun sayısı<select value={String(selected.current.grid?.columns ?? (device === "mobile" ? 2 : 3))} onChange={(event) => applyInspectorPatch("grid.columns", Number(event.target.value))} className="sd-field h-10 rounded-md border px-3 text-[12px] outline-none">{(device === "mobile" ? [1,2] : [2,3,4,5,6]).map((value) => <option key={value} value={value}>{value} sütun</option>)}</select></label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="grid gap-1.5 text-[11px] opacity-70">Yatay aralık<select value={String(Math.round(selected.current.grid?.gapX ?? 20))} onChange={(event) => applyInspectorPatch("grid.gapX", Number(event.target.value))} className="sd-field h-10 rounded-md border px-2 text-[11px] outline-none">{[0,8,12,16,20,24,32,40,48,64].map((value) => <option key={value} value={value}>{value}px</option>)}</select></label>
                      <label className="grid gap-1.5 text-[11px] opacity-70">Dikey aralık<select value={String(Math.round(selected.current.grid?.gapY ?? 48))} onChange={(event) => applyInspectorPatch("grid.gapY", Number(event.target.value))} className="sd-field h-10 rounded-md border px-2 text-[11px] outline-none">{[0,8,12,16,20,24,32,40,48,64,80,96].map((value) => <option key={value} value={value}>{value}px</option>)}</select></label>
                    </div>
                    <label className="grid gap-1.5 text-[11px] opacity-70">En fazla genişlik<select value={selected.current.grid?.maxWidth || "none"} onChange={(event) => applyInspectorPatch("grid.maxWidth", event.target.value)} className="sd-field h-10 rounded-md border px-3 text-[12px] outline-none"><option value="none">Kullanılabilir alanı doldur</option><option value="1200px">1200px</option><option value="1280px">1280px</option><option value="1440px">1440px</option><option value="1600px">1600px</option></select></label>
                  </div>
                </section>
              ) : null}

              {selected.controlGroups.includes("responsive") || selected.type === "product-card" || selected.type === "product-grid" ? (
                <section className="sd-inspector-group border-b px-4 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="sd-inspector-group-title">Mobil</h3>
                    <span className={hasMobileOverrides ? "sd-responsive-badge is-override rounded-full border px-2 py-1 text-[9px] font-semibold" : "sd-responsive-badge rounded-full border px-2 py-1 text-[9px] font-semibold"}>{hasMobileOverrides ? "Mobil için farklı" : "Masaüstü ayarı"}</span>
                  </div>
                  <p className="mt-2 text-[10px] leading-4 opacity-55">Mobil için farklı bir değer seçmezsen masaüstü ayarı kullanılır.</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => applyMobileResponsiveAction("copy-desktop")} className="sd-secondary-button min-h-10 rounded-md border px-2 text-[10px] font-semibold">Masaüstünü kopyala</button>
                    <button type="button" disabled={!hasMobileOverrides} onClick={() => applyMobileResponsiveAction("inherit")} className="sd-secondary-button min-h-10 rounded-md border px-2 text-[10px] font-semibold disabled:opacity-35">Masaüstünü kullan</button>
                  </div>
                </section>
              ) : null}

              <details className="sd-inspector-group sd-advanced-details border-b">
                <summary className="cursor-pointer list-none px-4 py-4 text-[12px] font-semibold">Gelişmiş</summary>
                <div className="grid gap-3 px-4 pb-4">
                  <label className="grid gap-1.5 text-[11px] opacity-70">
                    Uygulama alanı
                    <select aria-label="Uygulama alanı" value={scope} onChange={(event) => setScope(event.target.value as EditorScope)} className="sd-field h-10 rounded-md border px-3 text-[12px] font-medium outline-none">
                      {selected.allowedScopes.map((item) => <option key={item} value={item}>{scopeLabel(item)}</option>)}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="sd-state-card rounded-lg border p-2.5"><span className="opacity-55">Boyut</span><strong className="mt-1 block">{selected.current.width || 0} × {selected.current.height || 0}</strong></div>
                    <div className="sd-state-card rounded-lg border p-2.5"><span className="opacity-55">Saydamlık</span><strong className="mt-1 block">{selected.current.opacity ?? 1}</strong></div>
                  </div>
                  {selected.protectedFields.length ? <p className="sd-protected-note rounded-lg border p-3 text-[10px] leading-4">Bu öğenin bazı işlevleri burada değiştirilemez.</p> : null}
                </div>
              </details>
            </div>
          ) : null}

          <footer className="sd-inspector-footer border-t px-4 py-3">
            <p className="text-[10px] opacity-55">{hasUnsavedChanges ? "Kaydedilmemiş değişiklikler var." : hasUnpublishedChanges ? "Taslak kaydedildi; henüz yayınlanmadı." : "Yayınlanan sürüm güncel."}</p>
          </footer>
        </aside>

      </div>

      {contextMenu ? (
        <div
          ref={contextMenuRef}
          data-store-design-context-menu
          tabIndex={-1}
          className="sd-context-menu fixed z-[2147483560] w-[340px] max-w-[calc(100vw_-_24px)] overflow-hidden rounded-xl border shadow-2xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="dialog"
          aria-label={contextMenu.target.label + " hızlı düzenleme"}
        >
          <header className="sd-context-header flex items-start justify-between gap-3 border-b px-3.5 py-3">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold">{contextMenu.target.label}</p>
              <p className="mt-1 truncate text-[10px] opacity-55">{contextMenu.target.breadcrumb.map((item) => item.label).join(" › ")}</p>
            </div>
            <button type="button" onClick={() => setContextMenu(null)} className="sd-icon-button grid h-8 w-8 shrink-0 place-items-center rounded-md border" aria-label="Kapat">
              <X className="h-3.5 w-3.5" />
            </button>
          </header>

          <div className="sd-context-menu-body max-h-[520px] overflow-y-auto p-2.5">
            <div className="sd-context-task-list grid gap-1">
              {contextMenu.target.current.content ? (
                <button
                  type="button"
                  onClick={() => window.requestAnimationFrame(() => contextTextInputRef.current?.focus({ preventScroll: true }))}
                  className="sd-context-task"
                >
                  <span className="sd-context-task-icon"><FileText className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1 text-left"><strong>Metni düzenle</strong><small>Görünen yazıyı değiştir</small></span>
                </button>
              ) : null}
              {contextMenu.target.current.link ? (
                <button
                  type="button"
                  onClick={() => { setDestinationTarget(contextMenu.target); setContextMenu(null); }}
                  className="sd-context-task"
                >
                  <span className="sd-context-task-icon"><Link2 className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1 text-left"><strong>Hedefi değiştir</strong><small>{contextMenu.target.current.link.href || "Bağlantı yok"}</small></span>
                </button>
              ) : null}
              {contextMenu.target.current.media ? (
                <button
                  type="button"
                  onClick={() => openQuickMediaPickerForTarget(contextMenu.target)}
                  className="sd-context-task"
                >
                  <span className="sd-context-task-icon"><Images className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1 text-left"><strong>{contextMenu.target.current.media.kind === "video" ? "Videoyu değiştir" : "Görseli değiştir"}</strong><small>Medya arşivinden seç</small></span>
                </button>
              ) : null}
              {contextMenu.target.controlGroups.includes("layout") ? (
                <button
                  type="button"
                  onClick={() => applyContextPatch(contextMenu.target, "visible", contextMenu.target.current.visible === false)}
                  className="sd-context-task"
                >
                  <span className="sd-context-task-icon">{contextMenu.target.current.visible === false ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</span>
                  <span className="min-w-0 flex-1 text-left"><strong>{contextMenu.target.current.visible === false ? "Göster" : "Gizle"}</strong><small>Bu öğenin görünürlüğünü değiştir</small></span>
                </button>
              ) : null}
              {contextMenu.target.type === "menu-link" ? (
                <div className="grid grid-cols-2 gap-1.5">
                  <button type="button" onClick={() => applyContextPatch(contextMenu.target, "order", (contextMenu.target.current.order || 0) - 1)} className="sd-context-task justify-center">
                    <ArrowUp className="h-4 w-4" /><strong>Yukarı taşı</strong>
                  </button>
                  <button type="button" onClick={() => applyContextPatch(contextMenu.target, "order", (contextMenu.target.current.order || 0) + 1)} className="sd-context-task justify-center">
                    <ArrowDown className="h-4 w-4" /><strong>Aşağı taşı</strong>
                  </button>
                </div>
              ) : null}
              {contextMenu.target.controlGroups.includes("responsive") ? (
                <button
                  type="button"
                  onClick={() => { setSelected(contextMenu.target); setDevice("mobile"); setContextMenu(null); setLeftOpen(false); setMobileSheetLevel("medium"); setRightOpen(true); }}
                  className="sd-context-task"
                >
                  <span className="sd-context-task-icon"><Smartphone className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1 text-left"><strong>Mobil ayarlar</strong><small>Mobil görünümü ayrı düzenle</small></span>
                </button>
              ) : null}
            </div>

            {contextMenu.target.current.content ? (
              <section className="sd-context-editor mt-2.5 rounded-lg border p-3">
                <label className="grid gap-1.5 text-[10px] font-semibold opacity-65">
                  Metin / ad
                  <input
                    ref={contextTextInputRef}
                    key={contextMenu.target.id + ":" + (contextMenu.target.current.content.text || "")}
                    defaultValue={contextMenu.target.current.content.text || ""}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                      if (event.key === "Escape") {
                        event.currentTarget.value = contextMenu.target.current.content?.text || "";
                        event.currentTarget.blur();
                      }
                    }}
                    onBlur={(event) => {
                      const next = event.currentTarget.value;
                      if (next !== (contextMenu.target.current.content?.text || "")) applyContextPatch(contextMenu.target, "content.text", next);
                    }}
                    className="sd-field h-10 rounded-md border px-3 text-[12px] font-medium outline-none"
                  />
                </label>
              </section>
            ) : null}

            {contextMenu.target.current.link ? (
              <section className="sd-context-editor mt-2.5 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold opacity-60">Bağlantı</p>
                    <p className="mt-1 truncate text-[11px] font-medium">{contextMenu.target.current.link.href || "Bağlantı yok"}</p>
                  </div>
                  <button type="button" onClick={() => { setDestinationTarget(contextMenu.target); setContextMenu(null); }} className="sd-secondary-button h-8 shrink-0 rounded-md border px-2.5 text-[10px] font-semibold">Değiştir</button>
                </div>
                <button
                  type="button"
                  onClick={() => applyContextPatch(contextMenu.target, "link.target", contextMenu.target.current.link?.target === "_blank" ? "_self" : "_blank")}
                  className="sd-secondary-button mt-2 flex h-9 w-full items-center justify-between rounded-md border px-3 text-[10px] font-semibold"
                >
                  <span>{contextMenu.target.current.link?.target === "_blank" ? "Yeni sekmede açılıyor" : "Aynı sekmede açılıyor"}</span>
                  <span className="opacity-55">Değiştir</span>
                </button>
              </section>
            ) : null}

            {contextMenu.target.current.media ? (
              <section className="sd-context-editor mt-2.5 grid gap-2 rounded-lg border p-3">
                <label className="grid gap-1 text-[10px] opacity-65">
                  Sığdırma
                  <select value={contextMenu.target.current.media.objectFit || "cover"} onChange={(event) => applyContextPatch(contextMenu.target, "media.objectFit", event.target.value)} className="sd-field h-9 rounded-md border px-2.5 text-[11px] font-medium outline-none">
                    <option value="cover">Kapla / kırp</option>
                    <option value="contain">Tamamını göster</option>
                  </select>
                </label>
                <label className="grid gap-1 text-[10px] opacity-65">
                  Odak noktası
                  <select value={contextMenu.target.current.media.objectPosition || "50% 50%"} onChange={(event) => applyContextPatch(contextMenu.target, "media.objectPosition", event.target.value)} className="sd-field h-9 rounded-md border px-2.5 text-[11px] font-medium outline-none">
                    <option value="50% 50%">Orta</option>
                    <option value="50% 0%">Üst</option>
                    <option value="50% 100%">Alt</option>
                    <option value="0% 50%">Sol</option>
                    <option value="100% 50%">Sağ</option>
                  </select>
                </label>
              </section>
            ) : null}

            {contextMenu.target.type === "product-card" ? (
              <section className="sd-context-editor mt-2.5 grid grid-cols-2 gap-2 rounded-lg border p-3">
                <button type="button" onClick={() => applyContextPatch(contextMenu.target, "card.showPrice", contextMenu.target.current.card?.showPrice === false)} className="sd-secondary-button h-9 rounded-md border px-2 text-[10px] font-semibold">
                  {contextMenu.target.current.card?.showPrice === false ? "Fiyatı göster" : "Fiyatı gizle"}
                </button>
                <button type="button" onClick={() => applyContextPatch(contextMenu.target, "card.showQuickAdd", contextMenu.target.current.card?.showQuickAdd === false)} className="sd-secondary-button h-9 rounded-md border px-2 text-[10px] font-semibold">
                  {contextMenu.target.current.card?.showQuickAdd === false ? "Hızlı ekleyi aç" : "Hızlı ekleyi kapat"}
                </button>
              </section>
            ) : null}

            {contextSection && contextSectionTemplate && contextMenu.target.protectedFields.length === 0 ? (
              <section className="mt-2.5 border-t pt-2.5" aria-label="Bölüm işlemleri">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold opacity-60">{contextTargetsWholeSection ? "Bölüm işlemleri" : "Üst bölüm"}</p>
                  {contextSectionReferenceCount > 1 ? <span className="sd-warning-chip rounded-full border px-2 py-1 text-[9px] font-semibold">{contextSectionReferenceCount} sayfada</span> : null}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button type="button" disabled={contextSectionIndex <= 0} onClick={() => void applyContextSectionAction("up")} className="sd-secondary-button flex h-9 items-center justify-center gap-1.5 rounded-md border px-2 text-[10px] font-semibold disabled:opacity-35"><ArrowUp className="h-3.5 w-3.5" />Yukarı</button>
                  <button type="button" disabled={contextSectionIndex < 0 || contextSectionIndex >= contextSectionTemplate.sectionIds.length - 1} onClick={() => void applyContextSectionAction("down")} className="sd-secondary-button flex h-9 items-center justify-center gap-1.5 rounded-md border px-2 text-[10px] font-semibold disabled:opacity-35"><ArrowDown className="h-3.5 w-3.5" />Aşağı</button>
                  <button type="button" onClick={() => void applyContextSectionAction("duplicate")} className="sd-secondary-button flex h-9 items-center justify-center gap-1.5 rounded-md border px-2 text-[10px] font-semibold"><Copy className="h-3.5 w-3.5" />Çoğalt</button>
                  <button type="button" onClick={() => void applyContextSectionAction("delete")} className="sd-danger-button flex h-9 items-center justify-center gap-1.5 rounded-md border px-2 text-[10px] font-semibold"><Trash2 className="h-3.5 w-3.5" />Kaldır</button>
                </div>
                {contextSectionReferenceCount > 1 ? <p className="mt-2 text-[9px] leading-4 opacity-55">Bu bölüm birden fazla sayfada kullanılıyor. Görünüm değişiklikleri bağlı yerleri etkileyebilir.</p> : null}
              </section>
            ) : null}

            {contextMenu.target.protectedFields.length ? (
              <p className="sd-protected-note mt-2.5 rounded-lg border p-3 text-[10px] leading-4">Bu öğenin bazı işlevleri burada değiştirilemez. Güvenli düzenleme seçenekleri gösteriliyor.</p>
            ) : null}
          </div>

          <footer className="border-t p-2.5">
            <button
              type="button"
              onClick={() => {
                if (contextSectionRegistration) {
                  setSectionEditorTargetId(contextSectionRegistration.id);
                  setSectionEditorSignal((value) => value + 1);
                  setContextMenu(null);
                  return;
                }
                setSelected(contextMenu.target);
                setContextMenu(null);
                setLeftOpen(false);
                setMobileSheetLevel("medium");
                setRightOpen(true);
              }}
              className="sd-primary-button h-10 w-full rounded-md px-3 text-[11px] font-semibold"
            >
              Tüm ayarları aç
            </button>
          </footer>
        </div>
      ) : null}

      <StoreDesignDestinationPicker
        open={Boolean(destinationTarget)}
        document={document}
        pages={editorPages}
        activePath={activePath}
        targetLabel={destinationTarget?.label || "Bağlantı"}
        currentHref={destinationTarget?.current.link?.href || ""}
        currentTarget={destinationTarget?.current.link?.target || "_self"}
        onApply={(href, target) => applyDestination(href, target)}
        onClose={() => setDestinationTarget(null)}
      />

      {publishIssues !== null ? (
        <StoreDesignPublishReport
          issues={publishIssues}
          publishing={saving === "publish"}
          onCancel={() => setPublishIssues(null)}
          onPublish={() => void save("publish", true)}
          onFixIssue={(issue) => void fixPublishIssue(issue)}
        />
      ) : null}

      {snapshotManagerOpen ? (
        <StoreDesignSnapshotManager
          currentPublishedRevision={published.revision}
          onRestore={applyRestoredSnapshot}
          onClose={() => setSnapshotManagerOpen(false)}
        />
      ) : null}

      {redirectManagerOpen ? (
        <StoreDesignRedirectManager
          document={document}
          onApply={applyMetadataDocument}
          onClose={() => setRedirectManagerOpen(false)}
        />
      ) : null}

      {templateManagerOpen ? (
        <StoreDesignTemplateManager
          document={document}
          activePath={activePath}
          activeLabel={activePage?.label || activePath}
          compatibility={activeCompatibility}
          onApply={applyStructureDocument}
          onClose={() => setTemplateManagerOpen(false)}
        />
      ) : null}

      {mediaOpen ? (
        <StoreDesignMediaLibrary
          document={document}
          onApply={applyMediaDocument}
          onClose={() => { setMediaOpen(false); setQuickMediaEdit(null); }}
          mediaType={quickMediaEdit?.mediaType || "any"}
          onSelect={quickMediaEdit ? (_assetId, asset) => {
            if (asset?.url) applyQuickMediaSource(asset.url);
          } : undefined}
        />
      ) : null}

      {sectionMediaPicker ? (
        <StoreDesignMediaLibrary
          document={document}
          onApply={applyMediaDocument}
          onClose={() => setSectionMediaPicker(null)}
          mediaType={sectionMediaPicker.mediaType}
          selectedAssetId={typeof document.sections[sectionMediaPicker.sectionId]?.settings?.[sectionMediaPicker.key] === "string"
            ? String(document.sections[sectionMediaPicker.sectionId]?.settings?.[sectionMediaPicker.key])
            : undefined}
          onSelect={(assetId, asset) => {
            const section = document.sections[sectionMediaPicker.sectionId];
            if (!section) {
              setSectionMediaPicker(null);
              return;
            }
            const next = structuredClone(document) as ThemeDocument;
            if (asset && !next.media[assetId]) next.media[assetId] = asset;
            next.sections[section.id] = {
              ...section,
              settings: {
                ...section.settings,
                [sectionMediaPicker.key]: assetId,
              },
            };
            const label = SECTION_LIBRARY_BY_TYPE[section.type]?.label || "Bölüm";
            setSectionMediaPicker(null);
            void applyStructureDocument(next, `${label} medyası güncellendi`);
          }}
        />
      ) : null}

      {pageManagerMode ? (
        <StoreDesignPageManager
          document={document}
          activePath={activePath}
          mode={pageManagerMode}
          onClose={() => setPageManagerMode(null)}
          onApply={applyPageDocument}
        />
      ) : null}

      <StoreDesignMobileDockV22
        mode={interactionMode}
        structureOpen={leftOpen}
        inspectorOpen={rightOpen}
        hasSelection={Boolean(selected)}
        structureButtonRef={mobileStructureButtonRef}
        editButtonRef={mobileEditButtonRef}
        onPreview={() => {
          setInteractionMode("browse");
          setContextMenu(null);
          setLeftOpen(false);
          setRightOpen(false);
        }}
        onStructure={() => {
          setInteractionMode("edit");
          setContextMenu(null);
          setRightOpen(false);
          setLeftOpen((value) => !value);
        }}
        onAdd={() => {
          if (selected && (selected.type.includes("menu") || selected.id.startsWith("global.header.menu."))) {
            void addMenuHeading();
            return;
          }
          setInteractionMode("edit");
          setContextMenu(null);
          setRightOpen(false);
          setLeftOpen(true);
          setSectionPickerSignal((value) => value + 1);
        }}
        onEdit={() => {
          setInteractionMode("edit");
          setContextMenu(null);
          setLeftOpen(false);
          setMobileSheetLevel(selected ? "medium" : "peek");
          setRightOpen(true);
        }}
        onOpenMedia={() => { setQuickMediaEdit(null); setMediaOpen(true); }}
        onOpenTemplates={() => setTemplateManagerOpen(true)}
        onOpenRedirects={() => setRedirectManagerOpen(true)}
        onOpenPages={() => setPageManagerMode(managedPage ? "edit" : "create")}
        onOpenHistory={() => setSnapshotManagerOpen(true)}
      />
    </div>
  );
}
