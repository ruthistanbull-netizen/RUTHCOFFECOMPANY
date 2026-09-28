"use client";

import {
  ArrowDown,
  ArrowUp,
  BookmarkPlus,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Layers3,
  Library,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type TouchEvent as ReactTouchEvent } from "react";
import {
  BLOCK_LIBRARY_BY_TYPE,
  SECTION_LIBRARY,
  SECTION_LIBRARY_BY_TYPE,
  STORE_DESIGN_SCHEMA_VERSION,
  normalizePageSlug,
  type BlockInstance,
  type PageCompatibility,
  type PageKind,
  type PageRecord,
  type SectionDefinition,
  type SectionInstance,
  type ThemeDocument,
} from "@ruth-commerce/commerce-core/store-design-v2";
import { useExactToast } from "@/components/base44-exact/primitives";
import {
  StoreDesignSectionEditor,
  canEditStoreDesignSection,
} from "@/components/theme/StoreDesignSectionEditor";
import { StoreDesignBlockSectionEditor } from "@/components/theme/StoreDesignBlockSectionEditor";
import { StoreDesignPresetLibrary } from "@/components/theme/StoreDesignPresetLibrary";
import { useStoreDesignDialogExit } from "@/components/theme/useStoreDesignDialogExit";

type ActivePage = {
  path: string;
  label: string;
  template?: boolean;
};

type Props = {
  document: ThemeDocument;
  activePage: ActivePage | null;
  compatibility: PageCompatibility;
  openPickerSignal?: number;
  selectedSectionId?: string | null;
  onApply: (next: ThemeDocument, label: string) => Promise<void>;
};

const SECTION_TYPE_LABELS: Record<string, string> = {
  "hero": "Ana Görsel",
  "scroll-story": "Kaydırmalı Hikâye",
  "featured-products": "Öne Çıkan Ürünler",
  "product-slider": "Ürün Kaydırıcısı",
  "product-grid": "Ürün Izgarası",
  "product-spotlight": "Ürün Vitrini",
  "featured-collection": "Öne Çıkan Koleksiyon",
  "category-cards": "Kategori Kartları",
  "product-comparison": "Ürün Karşılaştırma",
  "new-arrivals": "Yeni Gelenler",
  "best-sellers": "Çok Satanlar",
  "recommendations": "Önerilen Ürünler",
  "recently-viewed": "Son Görüntülenenler",
  "bundle": "Ürün Paketi",
  "cross-sell": "Tamamlayıcı Ürünler",
  "sale-products": "İndirimli Ürünler",
  "video-hero": "Video Ana Görsel",
  "image-banner": "Görsel Afiş",
  "video-banner": "Video Afiş",
  "background-media": "Arka Plan Medyası",
  "rich-text": "Metin Alanı",
  "brand-story": "Marka Hikâyesi",
  "collection-cards": "Koleksiyon Kartları",
  "trust-badges": "Güven Bilgileri",
  "faq": "Sık Sorulan Sorular",
  "slideshow": "Görsel Slayt",
  "gallery-grid": "Galeri Izgarası",
  "masonry-gallery": "Serbest Galeri",
  "collage": "Kolaj",
  "image-text-split": "Görsel ve Metin",
  "video-text-split": "Video ve Metin",
  "social-grid": "Sosyal Medya Izgarası",
  "before-after": "Öncesi ve Sonrası",
  "hotspot-lookbook": "Etkileşimli Görsel",
  "logo-cloud": "Logo Listesi",
  "text-columns": "Metin Sütunları",
  "stats": "İstatistikler",
  "timeline": "Zaman Çizelgesi",
  "feature-grid": "Özellik Izgarası",
  "testimonials": "Müşteri Yorumları",
  "review-highlights": "Yorum Öne Çıkanları",
  "tabs": "Sekmeler",
  "press-awards": "Basın ve Ödüller",
  "team": "Ekip",
  "announcement-bar": "Duyuru Çubuğu",
  "marquee": "Kayan Yazı",
  "heading-subtext": "Başlık ve Açıklama",
  "manifesto": "Marka Bildirisi",
  "quote": "Alıntı",
  "promo-banner": "Kampanya Afişi",
  "countdown": "Geri Sayım",
  "shipping-returns-cta": "Kargo ve İade Bilgisi",
  "newsletter": "E-posta Bülteni",
  "contact-form": "İletişim Formu",
  "custom-form": "Özel Form",
  "map-locator": "Konumlar",
  "rewards-promo": "Avantaj Tanıtımı",
  "spacer": "Boşluk",
  "divider": "Ayırıcı",
  "anchor": "Sayfa Bağlantı Noktası",
  "breadcrumb": "Sayfa Yolu",
  "grid-stack-builder": "Izgara Düzeni",
  "collections": "Koleksiyonlar",
  "trust": "Güven ve Kargo",
};

function sectionTypeLabel(type: string, fallback?: string) {
  return SECTION_TYPE_LABELS[type] || fallback || type.replace(/-/g, " ");
}

const RENDERABLE_SECTION_TYPES = new Set([
  "hero",
  "scroll-story",
  "featured-products",
  "product-slider",
  "product-grid",
  "product-spotlight",
  "featured-collection",
  "category-cards",
  "product-comparison",
  "new-arrivals",
  "best-sellers",
  "recommendations",
  "recently-viewed",
  "bundle",
  "cross-sell",
  "sale-products",
  "video-hero",
  "image-banner",
  "video-banner",
  "background-media",
  "rich-text",
  "brand-story",
  "collection-cards",
  "trust-badges",
  "faq",
  "slideshow",
  "gallery-grid",
  "masonry-gallery",
  "collage",
  "image-text-split",
  "video-text-split",
  "social-grid",
  "before-after",
  "hotspot-lookbook",
  "logo-cloud",
  "text-columns",
  "stats",
  "timeline",
  "feature-grid",
  "testimonials",
  "review-highlights",
  "tabs",
  "press-awards",
  "team",
  "announcement-bar",
  "marquee",
  "heading-subtext",
  "manifesto",
  "quote",
  "promo-banner",
  "countdown",
  "shipping-returns-cta",
  "newsletter",
  "contact-form",
  "custom-form",
  "map-locator",
  "rewards-promo",
  "spacer",
  "divider",
  "anchor",
  "breadcrumb",
  "grid-stack-builder",
]);

function uid(prefix: string) {
  const random = globalThis.crypto?.randomUUID?.().replace(/-/g, "") || Math.random().toString(36).slice(2);
  return `${prefix}-${random}`.slice(0, 160);
}

function pageRecord(document: ThemeDocument, path: string) {
  return document.pages[path] || Object.values(document.pages).find((page) => page.route === path) || null;
}

function pageKind(path: string, compatibility: PageCompatibility): PageKind {
  if (path === "/") return "system";
  if (compatibility === "product" || compatibility === "category" || compatibility === "collection") return "catalog";
  if (compatibility === "checkout" || compatibility === "account") return "protected";
  if (compatibility === "search" || compatibility === "utility" || compatibility === "cart") return "utility";
  if (path.startsWith("/pages/")) return "merchant";
  return "managed-static";
}

function safeKey(path: string) {
  const normalized = path === "/" ? "home" : path.replace(/^\/+/, "").replace(/[^a-zA-Z0-9_-]+/g, "-");
  return normalized || "page";
}

function defaultSettings(type: string): Record<string, unknown> {
  if (type === "hero") {
    return { imageAssetId: "", posterAssetId: "", heightPreset: "viewport", fit: "cover", playbackPreset: "ambient", title: "", body: "", linkLabel: "", linkHref: "", align: "center", overlayOpacity: 24, contrastMode: "adaptive" };
  }
  if (type === "scroll-story") {
    return { scrollLengthPreset: "standard", transitionPreset: "fade-scale", cueVisibility: true };
  }
  if (type === "collection-cards") {
    return { title: "Koleksiyonlar", eyebrow: "Keşfet", source: "catalog", limit: 4, columns: 2, gap: 20, ratio: "16/10", titlePlacement: "overlay", paddingY: 80 };
  }
  if (type === "brand-story") {
    return { imageAssetId: "", title: "Marka Hikayesi", eyebrow: "", body: "", linkLabel: "", linkHref: "", side: "left", contentWidth: "50%", playbackPreset: "ambient", paddingY: 96 };
  }
  if (type === "featured-products") {
    return { productSource: "featured", productLimit: 8, desktopItems: 4, mobileItems: 2, gap: 12, paddingY: 64 };
  }
  if (type === "product-slider") {
    return { title: "Ürünler", productSource: "featured", productLimit: 12, desktopItems: 4, mobileItems: 2, gap: 12, paddingY: 64, showArrows: true, autoplay: false };
  }
  if (type === "product-grid") {
    return { title: "Ürünler", productSource: "featured", productLimit: 12, desktopItems: 3, mobileItems: 2, gap: 20, maxWidth: "none", paddingY: 64 };
  }
  if (type === "product-spotlight") {
    return { productId: "", mediaPosition: "left", infoBlocks: ["description", "stock", "compare-price"], linkLabel: "Ürünü İncele", paddingY: 80 };
  }
  if (type === "featured-collection") {
    return { collectionId: "", layout: "slider", limit: 8, desktopColumns: 4, mobileColumns: 2, gap: 12, heading: "", linkLabel: "Koleksiyonu Gör", paddingY: 72 };
  }
  if (type === "category-cards") {
    return { title: "Kategoriler", eyebrow: "Keşfet", source: "catalog", limit: 6, columns: 3, gap: 20, ratio: "4/5", titlePlacement: "overlay", paddingY: 80 };
  }
  if (type === "product-comparison") {
    return { productIds: [], fields: ["price", "stock", "description"], layout: "table", title: "Ürünleri Karşılaştır", paddingY: 80 };
  }
  if (type === "new-arrivals") {
    return { title: "Yeni Gelenler", productLimit: 12, desktopItems: 4, mobileItems: 2, gap: 12, paddingY: 64, layout: "slider", showArrows: true };
  }
  if (type === "best-sellers") {
    return { title: "Çok Satanlar", window: "30d", limit: 12, layout: "slider", paddingY: 64 };
  }
  if (type === "recommendations") {
    return { title: "Bunları da beğenebilirsin", eyebrow: "Seçki", algorithm: "related", limit: 6, layout: "grid", paddingY: 58 };
  }
  if (type === "recently-viewed") {
    return { title: "Son Görüntülenenler", limit: 8, layout: "slider", paddingY: 58 };
  }
  if (type === "bundle") {
    return { source: "related", layout: "grid", cta: "Paketi İncele" };
  }
  if (type === "cross-sell") {
    return { source: "related", limit: 4, position: "after-items", density: "standard" };
  }
  if (type === "sale-products") {
    return { title: "İndirimdekiler", productLimit: 12, desktopItems: 4, mobileItems: 2, gap: 12, paddingY: 64, layout: "slider", showArrows: true, badgeStyle: "pill" };
  }
  if (type === "video-hero") {
    return { imageAssetId: "", posterAssetId: "", heightPreset: "viewport", fit: "cover", playbackPreset: "ambient", title: "Video Ana Görsel", body: "", linkLabel: "", linkHref: "", align: "center", overlayOpacity: 32, contrastMode: "light" };
  }
  if (type === "video-banner") {
    return { imageAssetId: "", posterAssetId: "", heightPreset: "medium", fit: "cover", playbackPreset: "ambient", title: "Video Afiş", body: "", linkLabel: "", linkHref: "", align: "center", overlayOpacity: 28, contrastMode: "light" };
  }
  if (type === "background-media") {
    return { imageAssetId: "", posterAssetId: "", minHeightPreset: "medium", fit: "cover", playbackPreset: "ambient", overlayOpacity: 36, contrastMode: "light" };
  }
  if (type === "image-banner") {
    return { title: "Yeni Bölüm", desktopHeight: 520, mobileHeight: 360, paddingY: 0, borderRadius: 0 };
  }
  if (type === "rich-text") {
    return { title: "Başlık", body: "Metninizi buraya ekleyin.", paddingY: 64 };
  }
  if (type === "faq") {
    return { title: "Sık Sorulan Sorular", paddingY: 64 };
  }
  if (type === "slideshow") return { title: "Slideshow", gap: 16, paddingY: 64, autoplay: false };
  if (type === "gallery-grid") return { title: "Galeri", columns: 3, gap: 16, paddingY: 64 };
  if (type === "masonry-gallery") return { title: "Masonry Galeri", columns: 3, gap: 16, paddingY: 64 };
  if (type === "collage") return { title: "Collage", columns: 3, gap: 16, paddingY: 64 };
  if (type === "social-grid") return { title: "Sosyal Medya", columns: 4, gap: 12, paddingY: 64, source: "manual" };
  if (type === "before-after") return { title: "Önce / Sonra", beforeAssetId: "", afterAssetId: "", beforeLabel: "Önce", afterLabel: "Sonra", divider: 50, paddingY: 64 };
  if (type === "hotspot-lookbook") return { title: "Ürün Görünümü", imageAssetId: "", paddingY: 64 };
  if (type === "image-text-split") return { title: "Görsel + Metin", imageAssetId: "", side: "left", contentWidth: "50%", paddingY: 64 };
  if (type === "video-text-split") return { title: "Video + Metin", imageAssetId: "", side: "left", contentWidth: "50%", paddingY: 64 };
  if (type === "logo-cloud") return { title: "Markalar", columns: 5, gap: 24, paddingY: 64 };
  if (type === "text-columns") return { title: "Metin Kolonları", columns: 3, gap: 24, paddingY: 64 };
  if (type === "stats") return { title: "Rakamlarla", columns: 4, gap: 24, paddingY: 64 };
  if (type === "timeline") return { title: "Hikayemiz", orientation: "vertical", paddingY: 64 };
  if (type === "feature-grid") return { title: "Özellikler", columns: 3, gap: 16, paddingY: 64 };
  if (type === "trust-badges") return { title: "Neden Biz", columns: 3, gap: 16, paddingY: 64 };
  if (type === "testimonials") return { title: "Yorumlar", columns: 3, gap: 16, paddingY: 64 };
  if (type === "review-highlights") return { title: "Müşteri Yorumları", body: "", productId: "", limit: 6, ratingDisplay: true, paddingY: 72 };
  if (type === "tabs") return { title: "Detaylar", paddingY: 64 };
  if (type === "press-awards") return { title: "Basın / Ödüller", columns: 4, gap: 20, paddingY: 64 };
  if (type === "team") return { title: "Ekibimiz", columns: 4, gap: 20, paddingY: 64 };
  if (type === "announcement-bar") return { paddingY: 0 };
  if (type === "marquee") return { paddingY: 0, speed: 24, pause: false };
  if (type === "heading-subtext") return { title: "Başlık", body: "Alt metin", role: "h2", size: "lg", align: "center", maxWidth: "900px", paddingY: 64 };
  if (type === "manifesto") return { title: "Manifesto", body: "Marka anlatınızı buraya ekleyin.", typography: "display", align: "center", maxWidth: "900px", paddingY: 80 };
  if (type === "quote") return { quote: "Alıntı", attribution: "", align: "center", paddingY: 72 };
  if (type === "promo-banner") return { title: "Kampanya", body: "", linkLabel: "Keşfet", linkHref: "/", align: "center", paddingY: 56 };
  if (type === "countdown") return { title: "Geri Sayım", targetTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), completedState: "Tamamlandı", style: "cards", paddingY: 64 };
  if (type === "shipping-returns-cta") return { icon: "•", title: "Kargo & İade", body: "", linkLabel: "Detaylar", linkHref: "/", align: "center", paddingY: 48 };
  if (type === "newsletter") return {
    heading: "Bültene Katıl",
    body: "Yeni ürünler, içerikler ve duyurular için e-posta listemize katıl.",
    fieldLabel: "E-posta",
    consent: "Kampanya ve duyurular için e-posta almak istiyorum.",
    buttonLabel: "Kaydol",
    successCopy: "Kaydın alındı. Teşekkür ederiz.",
    paddingY: 64,
  };
  if (type === "custom-form") return {
    title: "Form",
    body: "",
    action: "store",
    buttonLabel: "Gönder",
    successCopy: "Formunuz alındı. Teşekkür ederiz.",
    paddingY: 64,
  };
  if (type === "map-locator") return {
    title: "Bizi Bulun",
    body: "",
    layout: "cards",
    showMapLinks: true,
    mapLinkLabel: "Haritada Aç",
    paddingY: 72,
  };
  if (type === "contact-form") return {
    title: "Bize Ulaşın",
    body: "",
    phoneVisible: true,
    nameLabel: "Ad Soyad",
    emailLabel: "E-posta",
    phoneLabel: "Telefon",
    messageLabel: "Mesaj",
    namePlaceholder: "Adınız Soyadınız",
    emailPlaceholder: "ornek@mail.com",
    phonePlaceholder: "05xx xxx xx xx",
    messagePlaceholder: "Mesajınızı yazın.",
    buttonLabel: "Mesajı Gönder",
    successCopy: "Mesajınız alındı. En kısa sürede size dönüş yapacağız.",
    paddingY: 72,
  };
  if (type === "rewards-promo") return {
    imageAssetId: "",
    title: "Points Ayrıcalıkları",
    body: "Alışverişlerinden puan kazan, hesabındaki puanları sonraki siparişlerinde kullan.",
    linkLabel: "Programa Katıl",
    linkHref: "/register?redirect=/account",
    layout: "split",
    showSignupPoints: true,
    showEarnRate: true,
    paddingY: 72,
  };
  if (type === "spacer") return { desktopHeight: 64, mobileHeight: 40, paddingY: 0 };
  if (type === "divider") return { width: "100%", thickness: 1, colorToken: "subtle", paddingY: 24 };
  if (type === "anchor") return { anchorId: "bolum", labelVisibility: false, title: "" };
  if (type === "breadcrumb") return { visible: true, separator: "chevron", typography: "compact", paddingY: 12 };
  if (type === "grid-stack-builder") return { columns: 2, gap: 20, alignment: "stretch", responsiveStack: true };
  return {};
}

function ensurePageContext(document: ThemeDocument, activePage: ActivePage, compatibility: PageCompatibility) {
  const next = structuredClone(document) as ThemeDocument;

  if (activePage.template) {
    const templateId = next.templateBindings[activePage.path] || activePage.path;
    if (!next.templates[templateId]) {
      next.templates[templateId] = {
        id: templateId,
        label: activePage.label || "Şablon",
        description: `${activePage.label || activePage.path} için mağaza şablonu`,
        pageType: compatibility,
        compatibility: [compatibility],
        sectionIds: [],
        componentSettings: {},
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        schemaVersion: STORE_DESIGN_SCHEMA_VERSION,
      };
    }
    next.templateBindings[activePage.path] = templateId;
    return { next, page: null, template: next.templates[templateId] };
  }

  let page = pageRecord(next, activePage.path);

  if (!page) {
    const key = safeKey(activePage.path);
    const kind = pageKind(activePage.path, compatibility);
    const pageId = `page:${key}`;
    const templateId = `template:${key}`;
    const seoId = `seo:${key}`;
    const slug = normalizePageSlug(activePage.path.split("/").filter(Boolean).at(-1) || activePage.label || key) || key;

    page = {
      id: pageId,
      name: activePage.label || activePage.path,
      slug,
      route: activePage.path,
      kind,
      type: kind,
      templateId,
      status: "published",
      seoId,
      reserved: kind === "system" || kind === "catalog" || kind === "protected" || kind === "utility",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      publishedAt: new Date().toISOString(),
      schemaVersion: STORE_DESIGN_SCHEMA_VERSION,
    };
    next.pages[activePage.path] = page;
    next.seo[seoId] ||= {
      title: "",
      description: "",
      robots: compatibility === "search" || compatibility === "account" || compatibility === "checkout" ? "noindex,follow" : "index,follow",
      robotsPreset: compatibility === "search" || compatibility === "account" || compatibility === "checkout" ? "noindex,follow" : "index,follow",
      structuredDataPolicy: "inherit",
    };
  }

  if (!next.templates[page.templateId]) {
    next.templates[page.templateId] = {
      id: page.templateId,
      label: `${page.name} Şablonu`,
      compatibility: [compatibility],
      sectionIds: [],
      componentSettings: {},
      schemaVersion: STORE_DESIGN_SCHEMA_VERSION,
    };
  }

  return { next, page, template: next.templates[page.templateId] };
}

function sectionLabel(section: SectionInstance) {
  return sectionTypeLabel(section.type, SECTION_LIBRARY_BY_TYPE[section.type]?.label);
}

function canRenderDefinition(definition: SectionDefinition) {
  return definition.implemented && RENDERABLE_SECTION_TYPES.has(definition.type);
}

const GENERIC_V2_SECTION_TYPES = new Set([
  "hero",
  "product-spotlight",
  "featured-collection",
  "category-cards",
  "product-comparison",
  "best-sellers",
  "recommendations",
  "recently-viewed",
  "bundle",
  "cross-sell",
  "newsletter",
  "contact-form",
  "custom-form",
  "review-highlights",
  "rewards-promo",
  "collection-cards",
  "brand-story",
  "video-hero",
  "video-banner",
  "before-after",
  "heading-subtext",
  "manifesto",
  "quote",
  "promo-banner",
  "countdown",
  "shipping-returns-cta",
  "spacer",
  "divider",
  "anchor",
  "breadcrumb",
]);

function isBlockDrivenSection(type: string) {
  const definition = SECTION_LIBRARY_BY_TYPE[type];
  return Boolean(definition?.implemented && definition.allowedBlocks.length > 0);
}

function isGenericV2Section(type: string) {
  return GENERIC_V2_SECTION_TYPES.has(type);
}

function canEditSection(type: string) {
  return canEditStoreDesignSection(type) || isBlockDrivenSection(type) || isGenericV2Section(type);
}

function SectionPicker({
  compatibility,
  onAdd,
  onClose,
}: {
  compatibility: PageCompatibility;
  onAdd: (definition: SectionDefinition) => void;
  onClose: () => void;
}) {
  const { closing, requestClose } = useStoreDesignDialogExit(onClose);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | SectionDefinition["category"]>("all");
  const definitions = useMemo(() => SECTION_LIBRARY.filter((definition) => {
    if (!definition.compatiblePages.includes(compatibility)) return false;
    if (category !== "all" && definition.category !== category) return false;
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    return !needle || sectionTypeLabel(definition.type, definition.label).toLocaleLowerCase("tr-TR").includes(needle) || definition.type.includes(needle);
  }), [category, compatibility, query]);

  return (
    <div data-closing={closing ? "true" : "false"} className="sd-modal-backdrop fixed inset-0 z-[2147483590] grid place-items-center bg-black/30 p-3 backdrop-blur-sm">
      <div className="sd-modal-card flex max-h-[82dvh] w-full max-w-[660px] flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-black/10 px-4">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold">Bölüm Ekle</p>
            <p className="mt-0.5 text-[11px] text-black/40">Bu sayfada kullanabileceğin bölümler gösterilir.</p>
          </div>
          <button type="button" onClick={requestClose} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-black/[0.04]" aria-label="Kapat"><X className="h-4 w-4" /></button>
        </header>

        <div className="flex shrink-0 gap-2 border-b border-black/[0.07] p-3">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-black/30" />
            <input data-dialog-initial-focus="true" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Bölüm ara…" className="sd-field h-9 w-full rounded-lg border border-black/10 pl-9 pr-3 text-[12px] outline-none focus:border-black/25" />
          </label>
          <select value={category} onChange={(event) => setCategory(event.target.value as typeof category)} className="sd-field h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[12px] font-medium outline-none">
            <option value="all">Tümü</option>
            <option value="commerce">Satış</option>
            <option value="media">Medya</option>
            <option value="content">İçerik</option>
            <option value="marketing">Pazarlama</option>
          </select>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {definitions.map((definition) => {
              const available = canRenderDefinition(definition);
              const securityLocked = definition.type === "integration-block" || definition.type === "developer-embed";
              return (
                <button
                  key={definition.type}
                  type="button"
                  disabled={!available}
                  onClick={() => onAdd(definition)}
                  className="sd-library-card min-h-[82px] rounded-xl border border-black/[0.08] p-3 text-left hover:bg-black/[0.02] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <div className="flex items-start gap-2">
                    <span className="min-w-0 flex-1 text-[13px] font-semibold">{sectionTypeLabel(definition.type, definition.label)}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[7px] font-semibold ${available ? "bg-emerald-50 text-emerald-700" : "bg-black/[0.04] text-black/40"}`}>
                      {available ? "Hazır" : securityLocked ? "Güvenlik kilidi" : "Altyapı bekliyor"}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-3 text-[11px] leading-4 text-black/38">
                    {available
                      ? "Bu sayfada kullanıma hazır."
                      : securityLocked
                        ? "Bu bölüm güvenlik nedeniyle kullanıma kapalı."
                        : "Bu bölüm şu anda kullanıma hazır değil."}
                  </p>
                </button>
              );
            })}
          </div>
          {!definitions.length ? <p className="py-8 text-center text-[12px] text-black/35">Bu filtreyle uyumlu bölüm bulunamadı.</p> : null}
        </div>
      </div>
    </div>
  );
}

export function StoreDesignSectionManager({ document, activePage, compatibility, openPickerSignal = 0, selectedSectionId = null, onApply }: Props) {
  const toast = useExactToast();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [presetOpen, setPresetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [mobileActionsId, setMobileActionsId] = useState<string | null>(null);
  const [expandedSectionIds, setExpandedSectionIds] = useState<Set<string>>(() => new Set());
  const [touchReorderId, setTouchReorderId] = useState<string | null>(null);
  const [touchOverId, setTouchOverId] = useState<string | null>(null);
  const touchReorderIdRef = useRef<string | null>(null);
  const touchOverIdRef = useRef<string | null>(null);
  const touchReorderTimerRef = useRef<number | null>(null);
  const touchReorderStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (openPickerSignal > 0) setPickerOpen(true);
  }, [openPickerSignal]);

  useEffect(() => () => {
    if (touchReorderTimerRef.current !== null) window.clearTimeout(touchReorderTimerRef.current);
  }, []);

  useEffect(() => {
    if (!mobileActionsId) return;
    const escapedId = CSS.escape(mobileActionsId);
    const row = window.document.querySelector<HTMLElement>(`[data-section-id="${escapedId}"]`);
    const menu = row?.querySelector<HTMLElement>(".sd-section-action-menu") || null;
    const trigger = row?.querySelector<HTMLButtonElement>("[data-section-actions-trigger]") || null;

    const focusFrame = window.requestAnimationFrame(() => {
      menu?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus({ preventScroll: true });
    });

    const closeOutside = (event: PointerEvent) => {
      const element = event.target instanceof Element ? event.target : null;
      if (element?.closest(".sd-section-mobile-actions")) return;
      setMobileActionsId(null);
    };

    const onMenuKeyDown = (event: KeyboardEvent) => {
      if (!menu) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setMobileActionsId(null);
        window.requestAnimationFrame(() => trigger?.focus({ preventScroll: true }));
        return;
      }

      const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
      if (!items.length) return;
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

    window.document.addEventListener("pointerdown", closeOutside, true);
    window.document.addEventListener("keydown", onMenuKeyDown, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.document.removeEventListener("pointerdown", closeOutside, true);
      window.document.removeEventListener("keydown", onMenuKeyDown, true);
    };
  }, [mobileActionsId]);

  const page = activePage && !activePage.template ? pageRecord(document, activePage.path) : null;
  const templateId = activePage?.template
    ? (document.templateBindings[activePage.path] || activePage.path)
    : page?.templateId;
  const template = templateId ? document.templates[templateId] : null;
  const sectionIds = template?.sectionIds || [];
  const sections = sectionIds.map((id) => document.sections[id]).filter((section): section is SectionInstance => Boolean(section));

  const commit = async (next: ThemeDocument, label: string) => {
    if (busy) return;
    setBusy(true);
    try {
      next.revision = Math.max(next.revision, document.revision) + 1;
      await onApply(next, label);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bölüm işlemi uygulanamadı.");
    } finally {
      setBusy(false);
    }
  };

  const addSection = async (definition: SectionDefinition) => {
    if (!activePage || !canRenderDefinition(definition)) return;
    const { next, template: nextTemplate } = ensurePageContext(document, activePage, compatibility);
    const sectionId = uid(`section-${definition.type}`);
    next.sections[sectionId] = {
      id: sectionId,
      type: definition.type,
      schemaVersion: definition.schemaVersion,
      enabled: true,
      settings: defaultSettings(definition.type),
      blockIds: [],
    };
    nextTemplate.sectionIds = [...nextTemplate.sectionIds, sectionId];
    setPickerOpen(false);
    await commit(next, `${definition.label} eklendi`);
  };

  const saveSectionPreset = async (sectionId: string) => {
    const section = document.sections[sectionId];
    if (!section) return;
    const definition = SECTION_LIBRARY_BY_TYPE[section.type];
    if (!definition?.implemented) return toast.error("Bu bölüm hazır düzen olarak kaydedilemiyor.");

    const next = structuredClone(document) as ThemeDocument;
    const presetId = uid(`preset-${section.type}`);
    const sameTypeCount = Object.values(next.presets).filter((preset) => preset.sectionType === section.type).length;
    const now = new Date().toISOString();
    next.presets[presetId] = {
      id: presetId,
      label: `${sectionTypeLabel(section.type, definition.label)} Hazır Düzen ${sameTypeCount + 1}`,
      sectionType: section.type,
      settings: structuredClone(section.settings || {}),
      blocks: (section.blockIds || [])
        .map((blockId) => document.blocks[blockId])
        .filter((block): block is BlockInstance => Boolean(block))
        .map((block) => ({ type: block.type, settings: structuredClone(block.settings || {}) })),
      createdAt: now,
      updatedAt: now,
      schemaVersion: STORE_DESIGN_SCHEMA_VERSION,
    };
    await commit(next, `${sectionTypeLabel(section.type, definition.label)} hazır düzen olarak kaydedildi`);
  };

  const insertPreset = async (presetId: string) => {
    if (!activePage) return;
    const preset = document.presets[presetId];
    const definition = preset ? SECTION_LIBRARY_BY_TYPE[preset.sectionType] : undefined;
    if (!preset || !definition?.implemented || !definition.compatiblePages.includes(compatibility)) {
      return toast.error("Hazır düzen bu sayfa türüyle uyumlu değil.");
    }

    const { next, template: nextTemplate } = ensurePageContext(document, activePage, compatibility);
    const sectionId = uid(`section-${preset.sectionType}`);
    const blockIds: string[] = [];
    for (const blockTemplate of preset.blocks) {
      const blockDefinition = BLOCK_LIBRARY_BY_TYPE[blockTemplate.type];
      if (!blockDefinition?.implemented || !definition.allowedBlocks.includes(blockTemplate.type)) continue;
      const blockId = uid(`block-${blockTemplate.type}`);
      next.blocks[blockId] = {
        id: blockId,
        type: blockTemplate.type,
        schemaVersion: STORE_DESIGN_SCHEMA_VERSION,
        settings: structuredClone(blockTemplate.settings || {}),
      };
      blockIds.push(blockId);
    }

    next.sections[sectionId] = {
      id: sectionId,
      type: preset.sectionType,
      schemaVersion: STORE_DESIGN_SCHEMA_VERSION,
      enabled: true,
      settings: structuredClone(preset.settings || {}),
      blockIds,
    };
    nextTemplate.sectionIds = [...nextTemplate.sectionIds, sectionId];
    setPresetOpen(false);
    await commit(next, `${preset.label} eklendi`);
  };

  const deletePreset = async (presetId: string) => {
    const preset = document.presets[presetId];
    if (!preset) return;
    const next = structuredClone(document) as ThemeDocument;
    delete next.presets[presetId];
    await commit(next, `${preset.label} hazır düzen silindi`);
  };

  const mutateSection = async (sectionId: string, action: "up" | "down" | "toggle" | "duplicate" | "delete") => {
    if (!activePage) return;
    const { next, template: nextTemplate } = ensurePageContext(document, activePage, compatibility);
    const index = nextTemplate.sectionIds.indexOf(sectionId);
    const section = next.sections[sectionId];
    if (index < 0 || !section) return;

    if (action === "up" && index > 0) {
      [nextTemplate.sectionIds[index - 1], nextTemplate.sectionIds[index]] = [nextTemplate.sectionIds[index], nextTemplate.sectionIds[index - 1]];
    } else if (action === "down" && index < nextTemplate.sectionIds.length - 1) {
      [nextTemplate.sectionIds[index + 1], nextTemplate.sectionIds[index]] = [nextTemplate.sectionIds[index], nextTemplate.sectionIds[index + 1]];
    } else if (action === "toggle") {
      next.sections[sectionId] = { ...section, enabled: !section.enabled };
    } else if (action === "duplicate") {
      const copyId = uid(`section-${section.type}`);
      const blockIds: string[] = [];
      for (const blockId of section.blockIds || []) {
        const block = next.blocks[blockId];
        if (!block) continue;
        const newBlockId = uid(`block-${block.type}`);
        next.blocks[newBlockId] = structuredClone({ ...block, id: newBlockId });
        blockIds.push(newBlockId);
      }
      next.sections[copyId] = structuredClone({ ...section, id: copyId, blockIds });
      nextTemplate.sectionIds.splice(index + 1, 0, copyId);
    } else if (action === "delete") {
      for (const blockId of section.blockIds || []) delete next.blocks[blockId];
      delete next.sections[sectionId];
      nextTemplate.sectionIds.splice(index, 1);
    } else {
      return;
    }

    await commit(next, action === "delete" ? "Bölüm silindi" : action === "duplicate" ? "Bölüm çoğaltıldı" : action === "toggle" ? "Bölüm görünürlüğü değişti" : "Bölüm sırası değişti");
  };

  const reorderTo = async (sourceId: string, targetId: string) => {
    if (!activePage || sourceId === targetId) return;
    const { next, template: nextTemplate } = ensurePageContext(document, activePage, compatibility);
    const sourceIndex = nextTemplate.sectionIds.indexOf(sourceId);
    const targetIndex = nextTemplate.sectionIds.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [moved] = nextTemplate.sectionIds.splice(sourceIndex, 1);
    nextTemplate.sectionIds.splice(targetIndex, 0, moved);
    setDraggedId(null);
    await commit(next, "Bölüm sırası değişti");
  };

  const clearTouchReorderTimer = () => {
    if (touchReorderTimerRef.current !== null) {
      window.clearTimeout(touchReorderTimerRef.current);
      touchReorderTimerRef.current = null;
    }
  };

  const resetTouchReorder = () => {
    clearTouchReorderTimer();
    touchReorderIdRef.current = null;
    touchOverIdRef.current = null;
    touchReorderStartRef.current = null;
    setTouchReorderId(null);
    setTouchOverId(null);
  };

  const startTouchReorder = (sectionId: string, event: ReactTouchEvent<HTMLButtonElement>) => {
    if (busy || event.touches.length !== 1) return;
    const touch = event.touches.item(0);
    if (!touch) return;
    clearTouchReorderTimer();
    touchReorderStartRef.current = { x: touch.clientX, y: touch.clientY };
    touchReorderTimerRef.current = window.setTimeout(() => {
      touchReorderTimerRef.current = null;
      touchReorderIdRef.current = sectionId;
      touchOverIdRef.current = sectionId;
      setTouchReorderId(sectionId);
      setTouchOverId(sectionId);
      setMobileActionsId(null);
    }, 420);
  };

  const moveTouchReorder = (event: ReactTouchEvent<HTMLButtonElement>) => {
    const sourceId = touchReorderIdRef.current;
    const touch = event.touches.item(0);
    if (!touch) return;

    if (!sourceId) {
      const start = touchReorderStartRef.current;
      if (start && Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > 14) {
        clearTouchReorderTimer();
        touchReorderStartRef.current = null;
      }
      return;
    }

    event.preventDefault();
    const row = window.document.elementFromPoint(touch.clientX, touch.clientY)?.closest<HTMLElement>("[data-section-id]");
    const targetId = row?.dataset.sectionId || null;
    if (targetId && targetId !== touchOverIdRef.current) {
      touchOverIdRef.current = targetId;
      setTouchOverId(targetId);
    }

    const scrollSurface = window.document.querySelector<HTMLElement>(".sd-structure-scroll");
    if (!scrollSurface) return;
    const bounds = scrollSurface.getBoundingClientRect();
    const edge = 64;
    if (touch.clientY < bounds.top + edge) scrollSurface.scrollBy({ top: -18, behavior: "auto" });
    else if (touch.clientY > bounds.bottom - edge) scrollSurface.scrollBy({ top: 18, behavior: "auto" });
  };

  const endTouchReorder = () => {
    clearTouchReorderTimer();
    const sourceId = touchReorderIdRef.current;
    const targetId = touchOverIdRef.current;
    resetTouchReorder();
    if (sourceId && targetId && sourceId !== targetId) void reorderTo(sourceId, targetId);
  };

  const cancelTouchReorder = () => resetTouchReorder();

  const toggleSectionChildren = (sectionId: string) => {
    setExpandedSectionIds((current) => {
      const next = new Set(current);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };

  return (
    <>
      <section className="sd-structure-panel border-b border-black/[0.07] p-3">
        <div className="flex items-center gap-2 text-[13px] font-semibold"><Layers3 className="h-3.5 w-3.5" /> Sayfa Yapısı</div>
        <div className="sd-global-row mt-2 rounded-lg bg-black/[0.025] px-2.5 py-2 text-[12px] font-medium">
          <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-black/30" />Üst Bilgi <span className="ml-auto text-[10px] text-black/40">Tüm site</span></div>
        </div>

        <div className="mt-1.5 space-y-1">
          {sections.map((section, index) => {
            const childBlockIds = section.blockIds || [];
            const childrenOpen = expandedSectionIds.has(section.id);
            return (
            <div key={section.id} className="sd-section-tree-item">
            <div
              data-section-id={section.id}
              draggable={!busy}
              onDragStart={() => setDraggedId(section.id)}
              onDragEnd={() => setDraggedId(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (draggedId) void reorderTo(draggedId, section.id);
              }}
              data-selected={selectedSectionId === section.id || editingSectionId === section.id ? "true" : "false"}
              className={`sd-section-row group relative flex min-h-10 items-center gap-1 rounded-lg border px-1.5 transition ${draggedId === section.id ? "is-dragging border-black/20 bg-black/[0.04] opacity-60" : "border-black/[0.07] bg-white"} ${selectedSectionId === section.id || editingSectionId === section.id ? "is-selected" : ""} ${touchReorderId === section.id ? "is-touch-dragging" : ""} ${touchOverId === section.id && touchReorderId !== section.id ? "is-touch-over" : ""}`}
            >
              <GripVertical className="sd-section-desktop-grip h-3.5 w-3.5 shrink-0 cursor-grab text-black/20" />
              <button
                type="button"
                disabled={busy}
                className="sd-section-mobile-drag hidden h-11 w-11 shrink-0 place-items-center rounded-xl"
                aria-label="Sıralamak için basılı tut ve sürükle"
                onTouchStart={(event) => startTouchReorder(section.id, event)}
                onTouchMove={moveTouchReorder}
                onTouchEnd={endTouchReorder}
                onTouchCancel={cancelTouchReorder}
              >
                <GripVertical className="h-4 w-4" />
              </button>
              <button
                type="button"
                disabled={!canEditSection(section.type)}
                onClick={() => setEditingSectionId(section.id)}
                aria-current={selectedSectionId === section.id || editingSectionId === section.id ? "true" : undefined}
                className="sd-section-main min-w-0 flex-1 py-2 text-left disabled:cursor-default"
                title={canEditSection(section.type) ? "Bölüm ayarlarını aç" : "Bu bölüm için ayrıntılı ayarlar henüz hazır değil"}
              >
                <p className={`truncate text-[12px] font-semibold ${section.enabled ? "" : "text-black/35"}`}>{sectionLabel(section)}</p>
                <p className="mt-0.5 truncate text-[11px] text-black/40">
                  {section.enabled ? "Görünür" : "Gizli"}{childBlockIds.length ? ` · ${childBlockIds.length} içerik öğesi` : ""}
                </p>
              </button>
              {childBlockIds.length ? (
                <button
                  type="button"
                  onClick={() => toggleSectionChildren(section.id)}
                  className="sd-section-expand grid h-9 w-9 shrink-0 place-items-center rounded-lg hover:bg-black/[0.04]"
                  aria-expanded={childrenOpen}
                  aria-controls={`section-children-${section.id}`}
                  aria-label={childrenOpen ? "İçerik öğelerini gizle" : "İçerik öğelerini göster"}
                >
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${childrenOpen ? "rotate-180" : ""}`} />
                </button>
              ) : null}
              <div className="sd-section-desktop-actions flex items-center gap-1">
                <button type="button" disabled={busy || !SECTION_LIBRARY_BY_TYPE[section.type]?.implemented} onClick={() => void saveSectionPreset(section.id)} className="sd-row-action grid h-7 w-7 place-items-center rounded-md hover:bg-black/[0.04] disabled:opacity-20" aria-label="Hazır düzen olarak kaydet">
                  <BookmarkPlus className="h-3 w-3" />
                </button>
                <button type="button" disabled={busy || index === 0} onClick={() => void mutateSection(section.id, "up")} className="sd-row-action grid h-7 w-7 place-items-center rounded-md hover:bg-black/[0.04] disabled:opacity-20" aria-label="Yukarı taşı"><ArrowUp className="h-3 w-3" /></button>
                <button type="button" disabled={busy || index === sections.length - 1} onClick={() => void mutateSection(section.id, "down")} className="sd-row-action grid h-7 w-7 place-items-center rounded-md hover:bg-black/[0.04] disabled:opacity-20" aria-label="Aşağı taşı"><ArrowDown className="h-3 w-3" /></button>
                <button type="button" disabled={busy} onClick={() => void mutateSection(section.id, "toggle")} className="sd-row-action grid h-7 w-7 place-items-center rounded-md hover:bg-black/[0.04]" aria-label={section.enabled ? "Gizle" : "Göster"}>{section.enabled ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}</button>
                <button type="button" disabled={busy} onClick={() => void mutateSection(section.id, "duplicate")} className="sd-row-action grid h-7 w-7 place-items-center rounded-md hover:bg-black/[0.04]" aria-label="Çoğalt"><Copy className="h-3 w-3" /></button>
                <button type="button" disabled={busy} onClick={() => void mutateSection(section.id, "delete")} className="sd-row-action sd-row-action-danger grid h-7 w-7 place-items-center rounded-md text-red-600 hover:bg-red-50" aria-label="Sil"><Trash2 className="h-3 w-3" /></button>
              </div>

              <div className="sd-section-mobile-actions hidden">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setMobileActionsId((current) => current === section.id ? null : section.id)}
                  data-section-actions-trigger={section.id}
                  className="sd-row-action grid h-10 w-10 place-items-center rounded-xl"
                  aria-label="Bölüm işlemleri"
                  aria-haspopup="menu"
                  aria-expanded={mobileActionsId === section.id}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
                {mobileActionsId === section.id ? (
                  <div role="menu" aria-label={`${sectionLabel(section)} işlemleri`} className="sd-section-action-menu absolute right-1 top-[calc(100%-2px)] z-30 w-52 rounded-2xl border border-black/10 bg-white p-1.5 shadow-2xl">
                    {canEditSection(section.type) ? (
                      <button role="menuitem" type="button" onClick={() => { setMobileActionsId(null); setEditingSectionId(section.id); }}><Settings2 className="h-4 w-4" />Ayarları aç</button>
                    ) : null}
                    <button role="menuitem" type="button" disabled={!SECTION_LIBRARY_BY_TYPE[section.type]?.implemented} onClick={() => { setMobileActionsId(null); void saveSectionPreset(section.id); }}><BookmarkPlus className="h-4 w-4" />Hazır düzen olarak kaydet</button>
                    <button role="menuitem" type="button" disabled={index === 0} onClick={() => { setMobileActionsId(null); void mutateSection(section.id, "up"); }}><ArrowUp className="h-4 w-4" />Yukarı taşı</button>
                    <button role="menuitem" type="button" disabled={index === sections.length - 1} onClick={() => { setMobileActionsId(null); void mutateSection(section.id, "down"); }}><ArrowDown className="h-4 w-4" />Aşağı taşı</button>
                    <button role="menuitem" type="button" onClick={() => { setMobileActionsId(null); void mutateSection(section.id, "toggle"); }}>{section.enabled ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{section.enabled ? "Gizle" : "Göster"}</button>
                    <button role="menuitem" type="button" onClick={() => { setMobileActionsId(null); void mutateSection(section.id, "duplicate"); }}><Copy className="h-4 w-4" />Çoğalt</button>
                    <button role="menuitem" type="button" className="is-danger" onClick={() => { setMobileActionsId(null); void mutateSection(section.id, "delete"); }}><Trash2 className="h-4 w-4" />Sil</button>
                  </div>
                ) : null}
              </div>
            </div>
            {childrenOpen && childBlockIds.length ? (
              <div id={`section-children-${section.id}`} className="sd-section-children ml-7 mt-1 space-y-1 pb-1">
                {childBlockIds.map((blockId, blockIndex) => {
                  const block = document.blocks[blockId];
                  if (!block) return null;
                  const blockLabel = BLOCK_LIBRARY_BY_TYPE[block.type]?.label || "İçerik öğesi";
                  return (
                    <button
                      key={blockId}
                      type="button"
                      onClick={() => setEditingSectionId(section.id)}
                      className="sd-block-row flex min-h-12 w-full items-center gap-2 rounded-lg border border-black/[0.06] bg-black/[0.02] px-3 text-left hover:bg-black/[0.035]"
                      aria-label={`${blockLabel} ayarlarını aç`}
                    >
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-black/[0.04] text-[10px] font-semibold text-black/40">{blockIndex + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{blockLabel}</span>
                      <span className="text-[10px] text-black/35">Ayarlar</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
            </div>
          );
          })}

          {!sections.length ? (
            <div className="rounded-lg border border-dashed border-black/10 px-3 py-4 text-center text-[11px] leading-4 text-black/35">
              Bu sayfada henüz bölüm yok. Başlamak için yeni bir bölüm ekle.
            </div>
          ) : null}
        </div>

        <button type="button" disabled={!activePage || busy} onClick={() => setPickerOpen(true)} className="sd-structure-add sd-secondary-button mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-black/10 bg-white text-[12px] font-semibold hover:bg-black/[0.03] disabled:opacity-40">
          <Plus className="h-3.5 w-3.5" />Bölüm Ekle
        </button>
        <button type="button" disabled={!activePage || busy} onClick={() => setPresetOpen(true)} className="sd-structure-presets sd-secondary-button mt-1.5 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-black/10 bg-white text-[12px] font-semibold hover:bg-black/[0.03] disabled:opacity-40">
          <Library className="h-3.5 w-3.5" />Hazır Düzenler ({Object.keys(document.presets).length})
        </button>

        <div className="sd-global-row mt-1.5 rounded-lg bg-black/[0.025] px-2.5 py-2 text-[12px] font-medium">
          <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-black/30" />Alt Bilgi <span className="ml-auto text-[10px] text-black/40">Tüm site</span></div>
        </div>
      </section>

      {pickerOpen ? <SectionPicker compatibility={compatibility} onAdd={(definition) => void addSection(definition)} onClose={() => setPickerOpen(false)} /> : null}
      {presetOpen ? (
        <StoreDesignPresetLibrary
          presets={Object.values(document.presets)}
          compatibility={compatibility}
          onInsert={(presetId) => void insertPreset(presetId)}
          onDelete={(presetId) => void deletePreset(presetId)}
          onClose={() => setPresetOpen(false)}
        />
      ) : null}
      {editingSectionId && document.sections[editingSectionId] ? (
        (isBlockDrivenSection(document.sections[editingSectionId]!.type) || isGenericV2Section(document.sections[editingSectionId]!.type)) && document.sections[editingSectionId]!.type !== "faq" ? (
          <StoreDesignBlockSectionEditor
            document={document}
            section={document.sections[editingSectionId]!}
            onApply={onApply}
            onClose={() => setEditingSectionId(null)}
          />
        ) : (
          <StoreDesignSectionEditor
            document={document}
            section={document.sections[editingSectionId]!}
            onApply={onApply}
            onClose={() => setEditingSectionId(null)}
          />
        )
      ) : null}
    </>
  );
}
