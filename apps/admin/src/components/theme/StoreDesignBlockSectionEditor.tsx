"use client";

import { ArrowDown, ArrowUp, Plus, Save, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  BLOCK_LIBRARY_BY_TYPE,
  SECTION_LIBRARY_BY_TYPE,
  STORE_DESIGN_SCHEMA_VERSION,
  normalizeStoreDesignAnchorId,
  type BlockDefinition,
  type BlockInstance,
  type SectionInstance,
  type ThemeDocument,
} from "@ruth-commerce/commerce-core/store-design-v2";
import { useExactToast } from "@/components/base44-exact/primitives";
import { StoreDesignMediaLibrary } from "@/components/theme/StoreDesignMediaLibrary";

type Props = {
  document: ThemeDocument;
  section: SectionInstance;
  onApply: (next: ThemeDocument, label: string) => Promise<void>;
  onClose: () => void;
};

type DraftBlock = {
  id: string;
  type: string;
  settings: Record<string, unknown>;
};

type CatalogProductOption = {
  id: string;
  name: string;
  slug: string;
  price?: number | string | null;
  main_image_url?: string | null;
  status?: string | null;
};

type CatalogGroupOption = {
  id: string;
  name: string;
  slug: string;
  status?: string | null;
};

function uid(prefix: string) {
  const random = globalThis.crypto?.randomUUID?.().replace(/-/g, "") || Math.random().toString(36).slice(2);
  return `${prefix}-${random}`.slice(0, 160);
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function blockDefaults(type: string): Record<string, unknown> {
  if (type === "text-column") return { heading: "Yeni başlık", body: "" };
  if (type === "stat") return { value: "100", label: "Değer" };
  if (type === "timeline-item") return { date: "2026", heading: "Başlık", body: "" };
  if (type === "feature" || type === "trust-item") return { icon: "•", heading: "Başlık", body: "" };
  if (type === "testimonial") return { quote: "Yorum", name: "İsim", meta: "" };
  if (type === "tab") return { label: "Sekme", body: "" };
  if (type === "announcement") return { text: "Yeni duyuru", linkLabel: "", linkHref: "" };
  if (type === "ticker-item") return { text: "Yeni metin", link: "" };
  if (type === "slide") return { media: "", title: "Slayt", body: "", cta: "" };
  if (type === "scroll-story-slide") return { assetId: "", title: "Scroll Story Slide", body: "", href: "/products" };
  if (type === "media") return { assetId: "", alt: "", link: "" };
  if (type === "logo") return { assetId: "", alt: "", link: "" };
  if (type === "award") return { assetId: "", label: "Ödül", link: "" };
  if (type === "member") return { assetId: "", name: "İsim", role: "", bio: "" };
  if (type === "faq-item") return { question: "Yeni soru", answer: "" };
  if (type === "hotspot") return { x: 50, y: 50, targetType: "link", targetId: "#" };
  if (type === "content") return { eyebrow: "", heading: "Başlık", body: "", linkLabel: "", linkHref: "", align: "center", maxWidth: "800px" };
  if (type === "field") return { name: "field", label: "Alan", type: "text", required: false, placeholder: "", options: "" };
  if (type === "location") return { name: "Yeni Konum", address: "", city: "", phone: "", hours: "" };
  return {};
}

function fieldLabel(key: string) {
  const labels: Record<string, string> = {
    assetId: "Medya",
    media: "Medya",
    alt: "Alt metin",
    link: "Bağlantı",
    linkHref: "Bağlantı",
    href: "Bağlantı",
    linkLabel: "Bağlantı metni",
    cta: "CTA bağlantısı",
    heading: "Başlık",
    title: "Başlık",
    body: "Metin",
    value: "Değer",
    label: "Etiket",
    date: "Tarih",
    icon: "İkon / sembol",
    quote: "Yorum",
    name: "İsim",
    meta: "Meta",
    role: "Rol",
    bio: "Biyografi",
    text: "Metin",
    question: "Soru",
    answer: "Cevap",
    x: "X konumu (%)",
    y: "Y konumu (%)",
    targetType: "Hedef tipi",
    targetId: "Hedef",
    eyebrow: "Eyebrow",
    align: "Hizalama",
    maxWidth: "Max genişlik",
    placeholder: "Placeholder",
    options: "Seçenekler",
    required: "Zorunlu",
    type: "Alan tipi",
    address: "Adres",
    city: "Şehir / ilçe",
    phone: "Telefon",
    hours: "Çalışma saatleri",
  };
  return labels[key] || key;
}

function blockTitle(block: DraftBlock) {
  return text(block.settings.heading || block.settings.title || block.settings.label || block.settings.name || block.settings.question || block.settings.text) || BLOCK_LIBRARY_BY_TYPE[block.type]?.label || block.type;
}

function isLongField(key: string) {
  return ["body", "bio", "quote", "answer", "address", "hours"].includes(key);
}

function isMediaField(key: string) {
  return key === "assetId" || key === "media";
}

export function StoreDesignBlockSectionEditor({ document, section, onApply, onClose }: Props) {
  const toast = useExactToast();
  const definition = SECTION_LIBRARY_BY_TYPE[section.type];
  const allowedDefinitions = useMemo(() => (definition?.allowedBlocks || [])
    .map((type) => BLOCK_LIBRARY_BY_TYPE[type])
    .filter((item): item is BlockDefinition => Boolean(item?.implemented)), [definition]);
  const [settings, setSettings] = useState<Record<string, unknown>>(() => structuredClone(section.settings || {}));
  const [blocks, setBlocks] = useState<DraftBlock[]>(() => (section.blockIds || [])
    .map((blockId) => document.blocks[blockId])
    .filter((block): block is BlockInstance => Boolean(block))
    .map((block) => ({ id: block.id, type: block.type, settings: structuredClone(block.settings || {}) })));
  const [blockType, setBlockType] = useState(allowedDefinitions[0]?.type || "");
  const [busy, setBusy] = useState(false);
  const [catalogProducts, setCatalogProducts] = useState<CatalogProductOption[]>([]);
  const [catalogCollections, setCatalogCollections] = useState<CatalogGroupOption[]>([]);
  const [catalogCategories, setCatalogCategories] = useState<CatalogGroupOption[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [mediaPicker, setMediaPicker] = useState<
    | { target: "section"; key: "imageAssetId" | "posterAssetId"; mediaType: "image" | "video" | "any" }
    | { target: "block"; blockId: string; key: string; mediaType: "image" | "video" | "any" }
    | null
  >(null);

  const mediaAssets = useMemo(() => Object.values(document.media), [document.media]);
  const maxBlocks = definition?.allowedBlocks.length ? (definition.maxBlocks || 50) : 0;
  const needsCommerceCatalog = ["product-spotlight", "featured-collection", "category-cards", "product-comparison", "review-highlights"].includes(section.type);

  useEffect(() => {
    if (!needsCommerceCatalog) return;
    const controller = new AbortController();
    let active = true;

    setCatalogLoading(true);
    setCatalogError("");

    void Promise.all([
      fetch("/api/catalog-groups?type=collection", { cache: "no-store", signal: controller.signal }).then((response) => response.json()),
      fetch("/api/catalog-groups?type=category", { cache: "no-store", signal: controller.signal }).then((response) => response.json()),
      fetch("/api/products", { cache: "no-store", signal: controller.signal }).then((response) => response.json()),
    ]).then(([collections, categories, products]) => {
      if (!active) return;
      if (!collections?.ok) throw new Error(collections?.error || "Koleksiyonlar alınamadı.");
      if (!categories?.ok) throw new Error(categories?.error || "Kategoriler alınamadı.");
      if (!products?.ok) throw new Error(products?.error || "Ürün kataloğu alınamadı.");

      const productRows = Array.isArray(products.products) ? products.products : [];
      const collectionRows = Array.isArray(collections.items) ? collections.items : [];
      const categoryRows = Array.isArray(categories.items) ? categories.items : [];

      setCatalogProducts(productRows
        .filter((item: CatalogProductOption) => !item.status || item.status === "active")
        .map((item: CatalogProductOption) => ({
          id: String(item.id || ""),
          name: String(item.name || ""),
          slug: String(item.slug || ""),
          price: item.price,
          main_image_url: item.main_image_url || null,
          status: item.status || null,
        }))
        .filter((item: CatalogProductOption) => item.id && item.name));

      setCatalogCollections(collectionRows
        .filter((item: CatalogGroupOption) => !item.status || item.status === "active")
        .map((item: CatalogGroupOption) => ({ id: String(item.id || ""), name: String(item.name || ""), slug: String(item.slug || ""), status: item.status || null }))
        .filter((item: CatalogGroupOption) => item.id && item.name));

      setCatalogCategories(categoryRows
        .filter((item: CatalogGroupOption) => !item.status || item.status === "active")
        .map((item: CatalogGroupOption) => ({ id: String(item.id || ""), name: String(item.name || ""), slug: String(item.slug || ""), status: item.status || null }))
        .filter((item: CatalogGroupOption) => item.id && item.name));
    }).catch((error) => {
      if (!active || error?.name === "AbortError") return;
      setCatalogError(error instanceof Error ? error.message : "Katalog seçenekleri alınamadı.");
    }).finally(() => {
      if (active) setCatalogLoading(false);
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [needsCommerceCatalog]);

  const updateSetting = (key: string, value: unknown) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const updateBlock = (id: string, key: string, value: unknown) => {
    setBlocks((items) => items.map((item) => item.id === id
      ? { ...item, settings: { ...item.settings, [key]: value } }
      : item));
  };

  const addBlock = () => {
    const selected = allowedDefinitions.find((item) => item.type === blockType) || allowedDefinitions[0];
    if (!selected) return toast.error("Bu section için eklenebilir hazır block yok.");
    if (blocks.length >= maxBlocks) return toast.error(`Bu bölüm en fazla ${maxBlocks} block kabul eder.`);
    setBlocks((items) => {
      const defaults = blockDefaults(selected.type);
      if (selected.type === "field") {
        const index = items.filter((item) => item.type === "field").length + 1;
        defaults.name = `field${index}`;
        defaults.label = `Alan ${index}`;
      }
      return [...items, {
        id: uid(`block-${selected.type}`),
        type: selected.type,
        settings: defaults,
      }];
    });
  };

  const save = async () => {
    if (busy) return;
    if (blocks.length > maxBlocks) return toast.error(`Block sayısı maxBlocks sınırını aşıyor (${maxBlocks}).`);

    if (section.type === "product-spotlight" && !text(settings.productId)) {
      return toast.error("Tek Ürün Spotlight için katalogdan bir ürün seç.");
    }
    if (section.type === "product-comparison") {
      const productIds = Array.isArray(settings.productIds) ? settings.productIds.filter((item): item is string => typeof item === "string" && Boolean(item)) : [];
      if (productIds.length < 2 || productIds.length > 4) return toast.error("Ürün Karşılaştırma için 2-4 ürün seç.");
    }
    if (section.type === "featured-collection" && !text(settings.collectionId)) {
      return toast.error("Featured Collection için katalogdan bir koleksiyon seç.");
    }

    if (section.type === "map-locator") {
      const layout = text(settings.layout) || "cards";
      if (!["cards", "list"].includes(layout)) return toast.error("Store Locator layout geçersiz.");
      for (const block of blocks.filter((item) => item.type === "location")) {
        if (!text(block.settings.name).trim()) return toast.error("Konum adı boş olamaz.");
        if (!text(block.settings.address).trim()) return toast.error(`${text(block.settings.name) || "Konum"} için adres gerekli.`);
      }
    }

    if (section.type === "newsletter") {
      if (!text(settings.heading).trim()) return toast.error("Newsletter başlığı boş olamaz.");
      if (!text(settings.fieldLabel).trim()) return toast.error("Newsletter alan etiketi boş olamaz.");
      if (!text(settings.consent).trim()) return toast.error("Newsletter consent metni boş olamaz.");
      if (!text(settings.successCopy).trim()) return toast.error("Newsletter başarı mesajı boş olamaz.");
    }

    if (section.type === "custom-form") {
      if ((text(settings.action) || "store") !== "store") return toast.error("Custom Form action whitelist dışında.");
      const names = new Set<string>();
      const allowedTypes = new Set(["text", "email", "tel", "textarea", "select", "checkbox"]);
      for (const block of blocks) {
        const name = text(block.settings.name).trim();
        const label = text(block.settings.label).trim();
        const fieldType = text(block.settings.type) || "text";
        if (!/^[a-z][a-z0-9_-]{0,39}$/.test(name)) return toast.error(`Geçersiz alan adı: ${name || "boş"}`);
        if (names.has(name)) return toast.error(`Alan adları benzersiz olmalı: ${name}`);
        names.add(name);
        if (!label) return toast.error(`${name}: alan etiketi boş olamaz.`);
        if (!allowedTypes.has(fieldType)) return toast.error(`${name}: desteklenmeyen alan tipi.`);
        if (fieldType === "select") {
          const options = text(block.settings.options).split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
          if (!options.length) return toast.error(`${name}: select alanında en az bir seçenek olmalı.`);
        }
      }
    }

    if (section.type === "hero") {
      const mediaId = text(settings.imageAssetId);
      const asset = mediaId ? document.media[mediaId] : undefined;
      if (mediaId && !asset) return toast.error("Hero medya referansı bulunamadı.");
      const posterId = text(settings.posterAssetId);
      if (posterId && document.media[posterId]?.type !== "image") return toast.error("Hero video poster yalnız görsel asset olabilir.");
      if (posterId && asset?.type !== "video") return toast.error("Poster override yalnız video hero medyasında kullanılabilir.");
    }

    if (["video-hero", "video-banner", "background-media"].includes(section.type)) {
      const mediaId = text(settings.imageAssetId);
      const asset = mediaId ? document.media[mediaId] : undefined;
      if (!mediaId || !asset) return toast.error("Bu bölüm için Media Library'den bir medya seç.");
      if ((section.type === "video-hero" || section.type === "video-banner") && asset.type !== "video") {
        return toast.error("Bu bölüm yalnız video asset kabul eder.");
      }
      const posterId = text(settings.posterAssetId);
      if (posterId && document.media[posterId]?.type !== "image") return toast.error("Video poster yalnız görsel asset olabilir.");
    }

    if (section.type === "anchor") {
      const anchorId = normalizeStoreDesignAnchorId(text(settings.anchorId));
      if (!anchorId) return toast.error("Anchor ID boş olamaz.");
      const duplicate = Object.values(document.sections).find((item) =>
        item.id !== section.id
        && item.type === "anchor"
        && normalizeStoreDesignAnchorId(text(item.settings?.anchorId)) === anchorId);
      if (duplicate) return toast.error(`Bu Anchor ID zaten kullanılıyor: ${anchorId}`);
      settings.anchorId = anchorId;
    }

    setBusy(true);
    try {
      const next = structuredClone(document) as ThemeDocument;
      const owned = new Set(section.blockIds || []);
      for (const blockId of owned) delete next.blocks[blockId];

      for (const block of blocks) {
        const blockDefinition = BLOCK_LIBRARY_BY_TYPE[block.type];
        if (!blockDefinition?.implemented || !definition?.allowedBlocks.includes(block.type)) {
          throw new Error(`${block.type} bu bölüm için izinli değil.`);
        }
        next.blocks[block.id] = {
          id: block.id,
          type: block.type,
          schemaVersion: STORE_DESIGN_SCHEMA_VERSION,
          settings: structuredClone(block.settings),
        };
      }

      next.sections[section.id] = {
        ...section,
        settings: {
          ...section.settings,
          ...settings,
        },
        blockIds: blocks.map((block) => block.id),
        schemaVersion: STORE_DESIGN_SCHEMA_VERSION,
      };

      await onApply(next, `${definition?.label || section.type} ${showBlockComposer ? "blokları " : ""}güncellendi`);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bölüm kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const hasColumns = ["gallery-grid", "masonry-gallery", "collage", "social-grid", "logo-cloud", "text-columns", "stats", "feature-grid", "trust-badges", "testimonials", "press-awards", "team"].includes(section.type);
  const hasGap = hasColumns || section.type === "slideshow";
  const mediaNarrative = ["hero", "video-hero", "video-banner", "background-media"].includes(section.type);
  const brandStory = section.type === "brand-story";
  const productSpotlight = section.type === "product-spotlight";
  const featuredCollection = section.type === "featured-collection";
  const productComparison = section.type === "product-comparison";
  const bestSellers = section.type === "best-sellers";
  const recommendations = section.type === "recommendations";
  const recentlyViewed = section.type === "recently-viewed";
  const bundle = section.type === "bundle";
  const crossSell = section.type === "cross-sell";
  const breadcrumb = section.type === "breadcrumb";
  const newsletter = section.type === "newsletter";
  const contactForm = section.type === "contact-form";
  const customForm = section.type === "custom-form";
  const mapLocator = section.type === "map-locator";
  const reviewHighlights = section.type === "review-highlights";
  const rewardsPromo = section.type === "rewards-promo";
  const gridStack = section.type === "grid-stack-builder";
  const collectionCards = section.type === "collection-cards" || section.type === "category-cards";
  const categoryCards = section.type === "category-cards";
  const genericZeroBlock = ["hero", "product-comparison", "best-sellers", "recently-viewed", "bundle", "cross-sell", "breadcrumb", "newsletter", "contact-form", "custom-form", "map-locator", "review-highlights", "rewards-promo", "grid-stack-builder", "video-hero", "video-banner", "heading-subtext", "manifesto", "quote", "promo-banner", "shipping-returns-cta", "spacer", "divider", "anchor"].includes(section.type);
  const hasGenericBody = ["hero", "video-hero", "video-banner", "brand-story", "contact-form", "custom-form", "map-locator", "review-highlights", "rewards-promo", "heading-subtext", "manifesto", "promo-banner", "shipping-returns-cta"].includes(section.type);
  const hasAlign = ["hero", "video-hero", "video-banner", "heading-subtext", "manifesto", "quote", "promo-banner", "shipping-returns-cta"].includes(section.type);
  const hasLink = ["hero", "video-hero", "video-banner", "brand-story", "rewards-promo", "promo-banner", "shipping-returns-cta"].includes(section.type);
  const showTitle = !["product-spotlight", "featured-collection", "scroll-story", "background-media", "bundle", "cross-sell", "breadcrumb", "newsletter", "grid-stack-builder", "quote", "spacer", "divider", "anchor"].includes(section.type);
  const showEyebrow = !genericZeroBlock && !["product-spotlight", "featured-collection", "scroll-story", "background-media"].includes(section.type);
  const showPadding = !["hero", "scroll-story", "video-hero", "video-banner", "background-media", "bundle", "cross-sell", "breadcrumb", "grid-stack-builder", "spacer", "anchor"].includes(section.type);
  const primaryMedia = mediaNarrative && text(settings.imageAssetId) ? document.media[text(settings.imageAssetId)] : undefined;
  const brandStoryMedia = brandStory && text(settings.imageAssetId) ? document.media[text(settings.imageAssetId)] : undefined;
  const showBlockComposer = allowedDefinitions.length > 0;

  return (
    <div className="fixed inset-0 z-[2147483607] grid place-items-center bg-black/35 p-3 backdrop-blur-sm">
      <div className="flex max-h-[92dvh] w-full max-w-[760px] flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-black/10 px-4">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold">{definition?.label || section.type}</p>
            <p className="mt-0.5 truncate text-[8px] text-black/40">{section.id} · {blocks.length}/{maxBlocks} block</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-black/[0.04]" aria-label="Kapat"><X className="h-4 w-4" /></button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {!["announcement-bar", "marquee"].includes(section.type) ? (
            <div className="grid gap-3 rounded-xl border border-black/[0.08] bg-[#fafafa] p-3 md:grid-cols-2">
              {showTitle ? (
                <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                  Bölüm başlığı
                  <input value={text(settings.title)} onChange={(event) => updateSetting("title", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
                </label>
              ) : null}
              {showEyebrow ? (
                <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                  Eyebrow
                  <input value={text(settings.eyebrow)} onChange={(event) => updateSetting("eyebrow", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
                </label>
              ) : null}
              {hasGenericBody ? (
                <label className="grid gap-1.5 text-[8px] font-semibold text-black/45 md:col-span-2">
                  Metin
                  <textarea value={text(settings.body)} onChange={(event) => updateSetting("body", event.target.value)} className="min-h-24 resize-y rounded-lg border border-black/10 bg-white p-2.5 text-[9px] leading-5 outline-none" />
                </label>
              ) : null}
              {mediaNarrative ? (
                <>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45 md:col-span-2">
                    {section.type === "background-media" ? "Arka plan medyası" : "Video asset"}
                    <div className="flex gap-2">
                      <select
                        value={text(settings.imageAssetId)}
                        onChange={(event) => {
                          updateSetting("imageAssetId", event.target.value);
                          const nextAsset = event.target.value ? document.media[event.target.value] : undefined;
                          if (nextAsset?.type !== "video") updateSetting("posterAssetId", "");
                        }}
                        className="h-9 min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none"
                      >
                        <option value="">{section.type === "hero" ? "Mevcut editorial hero medyasını kullan" : "Medya seçilmedi"}</option>
                        {mediaAssets
                          .filter((asset) => section.type === "background-media" || section.type === "hero" || asset.type === "video")
                          .map((asset) => <option key={asset.assetId} value={asset.assetId}>{asset.type} · {asset.assetId} · v{asset.version || 1}</option>)}
                      </select>
                      <button type="button" onClick={() => setMediaPicker({ target: "section", key: "imageAssetId", mediaType: section.type === "background-media" || section.type === "hero" ? "any" : "video" })} className="h-9 rounded-lg border border-black/10 bg-white px-3 text-[8px] font-semibold hover:bg-black/[0.03]">
                        Media Library
                      </button>
                    </div>
                    <span className="text-[7px] font-normal leading-4 text-black/35">
                      {section.type === "hero" && !text(settings.imageAssetId)
                        ? "Medya seçmezsen mevcut editorial hero korunur. V2 media seçildiğinde mobil varyant ve focal point Media Library kaydından gelir."
                        : "Mobil varyant ve focal point seçili asset'in Media Library kaydından gelir."}
                    </span>
                  </label>

                  {(primaryMedia?.type === "video" || section.type === "video-hero" || section.type === "video-banner") ? (
                    <>
                      <label className="grid gap-1.5 text-[8px] font-semibold text-black/45 md:col-span-2">
                        Poster override
                        <div className="flex gap-2">
                          <select value={text(settings.posterAssetId)} onChange={(event) => updateSetting("posterAssetId", event.target.value)} className="h-9 min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                            <option value="">Video asset posterini kullan</option>
                            {mediaAssets.filter((asset) => asset.type === "image").map((asset) => <option key={asset.assetId} value={asset.assetId}>{asset.assetId} · v{asset.version || 1}</option>)}
                          </select>
                          <button type="button" onClick={() => setMediaPicker({ target: "section", key: "posterAssetId", mediaType: "image" })} className="h-9 rounded-lg border border-black/10 bg-white px-3 text-[8px] font-semibold hover:bg-black/[0.03]">
                            Media Library
                          </button>
                        </div>
                      </label>
                      <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                        Oynatma politikası
                        <select value={text(settings.playbackPreset) || "ambient"} onChange={(event) => updateSetting("playbackPreset", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                          <option value="ambient">Autoplay · sessiz · loop</option>
                          <option value="once">Autoplay · sessiz · tek oynatım</option>
                          <option value="controls">Kontrollü oynatıcı</option>
                        </select>
                      </label>
                    </>
                  ) : null}

                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Media fit
                    <select value={text(settings.fit) || "cover"} onChange={(event) => updateSetting("fit", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="cover">Cover</option>
                      <option value="contain">Contain</option>
                    </select>
                  </label>

                  {section.type === "hero" || section.type === "video-hero" ? (
                    <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                      Hero yüksekliği
                      <select value={text(settings.heightPreset) || "viewport"} onChange={(event) => updateSetting("heightPreset", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                        <option value="medium">Orta · 620px</option>
                        <option value="tall">Uzun · 760px</option>
                        <option value="viewport">Ekran · 100svh</option>
                      </select>
                    </label>
                  ) : section.type === "video-banner" ? (
                    <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                      Banner yüksekliği
                      <select value={text(settings.heightPreset) || "medium"} onChange={(event) => updateSetting("heightPreset", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                        <option value="compact">Kompakt · 360px</option>
                        <option value="medium">Orta · 480px</option>
                        <option value="tall">Uzun · 620px</option>
                      </select>
                    </label>
                  ) : (
                    <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                      Minimum yükseklik
                      <select value={text(settings.minHeightPreset) || "medium"} onChange={(event) => updateSetting("minHeightPreset", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                        <option value="compact">Kompakt · 360px</option>
                        <option value="medium">Orta · 520px</option>
                        <option value="tall">Uzun · 680px</option>
                        <option value="viewport">Ekran · 100svh</option>
                      </select>
                    </label>
                  )}

                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Overlay · %{Math.round(numberValue(settings.overlayOpacity, section.type === "background-media" ? 36 : 30))}
                    <input type="range" min={0} max={80} step={4} value={numberValue(settings.overlayOpacity, section.type === "background-media" ? 36 : 30)} onChange={(event) => updateSetting("overlayOpacity", Number(event.target.value))} />
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Metin kontrastı
                    <select value={text(settings.contrastMode) || (section.type === "hero" ? "adaptive" : "light")} onChange={(event) => updateSetting("contrastMode", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      {section.type === "hero" ? <option value="adaptive">Adaptive · medyaya göre</option> : null}
                      <option value="light">Açık metin</option>
                      <option value="dark">Koyu metin</option>
                    </select>
                  </label>
                </>
              ) : null}

              {productSpotlight ? (
                <>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45 md:col-span-2">
                    Ürün
                    <select value={text(settings.productId)} onChange={(event) => updateSetting("productId", event.target.value)} disabled={catalogLoading} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none disabled:opacity-50">
                      <option value="">{catalogLoading ? "Ürünler yükleniyor…" : "Ürün seç"}</option>
                      {catalogProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                    </select>
                    {catalogError ? <span className="text-[7px] font-normal text-red-600">{catalogError}</span> : <span className="text-[7px] font-normal leading-4 text-black/35">Fiyat, stok ve ürün metni katalogdan read-only gelir.</span>}
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Medya konumu
                    <select value={text(settings.mediaPosition) || "left"} onChange={(event) => updateSetting("mediaPosition", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="left">Sol</option>
                      <option value="right">Sağ</option>
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    CTA metni
                    <input value={text(settings.linkLabel) || "Ürünü İncele"} onChange={(event) => updateSetting("linkLabel", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
                  </label>
                  <div className="grid gap-2 rounded-lg border border-black/10 bg-white p-2.5 md:col-span-2">
                    <p className="text-[8px] font-semibold text-black/45">Bilgi blokları</p>
                    {[
                      ["description", "Açıklama"],
                      ["stock", "Stok durumu"],
                      ["compare-price", "Karşılaştırma fiyatı"],
                    ].map(([value, label]) => {
                      const current = Array.isArray(settings.infoBlocks) ? settings.infoBlocks.filter((item): item is string => typeof item === "string") : ["description", "stock", "compare-price"];
                      return (
                        <label key={value} className="flex items-center justify-between gap-3 text-[8px] text-black/55">
                          {label}
                          <input
                            type="checkbox"
                            checked={current.includes(value)}
                            onChange={(event) => updateSetting("infoBlocks", event.target.checked ? [...new Set([...current, value])] : current.filter((item) => item !== value))}
                          />
                        </label>
                      );
                    })}
                  </div>
                </>
              ) : null}

              {breadcrumb ? (
                <>
                  <label className="flex items-center justify-between gap-3 rounded-lg border border-black/10 bg-white p-2.5 text-[8px] font-semibold text-black/45 md:col-span-2">
                    Breadcrumb göster
                    <input type="checkbox" checked={settings.visible !== false} onChange={(event) => updateSetting("visible", event.target.checked)} />
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Ayırıcı
                    <select value={text(settings.separator) || "chevron"} onChange={(event) => updateSetting("separator", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="chevron">Chevron · ›</option>
                      <option value="slash">Slash · /</option>
                      <option value="dot">Nokta · ·</option>
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Tipografi
                    <select value={text(settings.typography) || "compact"} onChange={(event) => updateSetting("typography", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="compact">Compact</option>
                      <option value="default">Default</option>
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45 md:col-span-2">
                    Dikey boşluk
                    <input type="number" min={0} max={64} value={numberValue(settings.paddingY, 12)} onChange={(event) => updateSetting("paddingY", Number(event.target.value))} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
                  </label>
                  <div className="rounded-lg border border-black/10 bg-black/[0.025] p-2.5 text-[7px] leading-4 text-black/45 md:col-span-2">
                    Breadcrumb yolu route/template tarafından read-only üretilir; tema editörü URL veya path generation mantığını değiştiremez.
                  </div>
                </>
              ) : null}

              {crossSell ? (
                <>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45 md:col-span-2">
                    Öneri kaynağı
                    <select value={text(settings.source) || "related"} onChange={(event) => updateSetting("source", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="related">İlişkili ürünler</option>
                      <option value="best-sellers">Çok satanlar</option>
                      <option value="new-arrivals">Yeni gelenler</option>
                    </select>
                    <span className="text-[7px] font-normal leading-4 text-black/35">Ürün seçimi storefront recommendation servisi tarafından read-only hesaplanır; fiyat, indirim ve sepet state'i tema editöründen değiştirilemez.</span>
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Ürün limiti
                    <input type="number" min={2} max={8} value={numberValue(settings.limit, 4)} onChange={(event) => updateSetting("limit", Number(event.target.value))} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Konum
                    <select value={text(settings.position) || "after-items"} onChange={(event) => updateSetting("position", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="after-items">Ürünlerden sonra</option>
                      <option value="before-totals">Toplamlardan önce</option>
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45 md:col-span-2">
                    Kart yoğunluğu
                    <select value={text(settings.density) || "standard"} onChange={(event) => updateSetting("density", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="compact">Compact</option>
                      <option value="standard">Standard</option>
                      <option value="comfortable">Comfortable</option>
                    </select>
                  </label>
                </>
              ) : null}

              {bundle ? (
                <>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45 md:col-span-2">
                    Bundle veri kaynağı
                    <select value={text(settings.source) || "related"} onChange={(event) => updateSetting("source", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="related">Bu ürünü içeren gerçek paketler</option>
                      <option value="all">Tüm aktif paket ürünleri</option>
                    </select>
                    <span className="text-[7px] font-normal leading-4 text-black/35">Paket ilişkisi katalogdaki is_bundle / product_type / bundle_items alanlarından read-only çözülür. Paket içeriği ve fiyat tema editöründen değiştirilemez.</span>
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Yerleşim
                    <select value={text(settings.layout) || "grid"} onChange={(event) => updateSetting("layout", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="grid">Grid</option><option value="slider">Yatay slider</option>
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    CTA metni
                    <input maxLength={80} value={text(settings.cta) || "Paketi İncele"} onChange={(event) => updateSetting("cta", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
                  </label>
                </>
              ) : null}

              {recentlyViewed ? (
                <>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45 md:col-span-2">
                    Geçmiş politikası
                    <div className="flex h-9 items-center rounded-lg border border-black/10 bg-black/[0.025] px-2.5 text-[8px] font-medium text-black/55">
                      Analytics consent kabul edilirse cihazda local history
                    </div>
                    <span className="text-[7px] font-normal leading-4 text-black/35">Reddedilirse geçmiş tutulmaz ve mevcut local history temizlenir. Bu politika tema editöründen değiştirilemez.</span>
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Ürün limiti
                    <input type="number" min={2} max={12} value={numberValue(settings.limit, 8)} onChange={(event) => updateSetting("limit", Number(event.target.value))} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Yerleşim
                    <select value={text(settings.layout) || "slider"} onChange={(event) => updateSetting("layout", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="slider">Yatay slider</option>
                      <option value="grid">Grid</option>
                    </select>
                  </label>
                </>
              ) : null}

              {recommendations ? (
                <>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45 md:col-span-2">
                    Öneri algoritması
                    <div className="flex h-9 items-center rounded-lg border border-black/10 bg-black/[0.025] px-2.5 text-[8px] font-medium text-black/55">
                      Related · koleksiyon / kategori / materyal ilişkisi
                    </div>
                    <span className="text-[7px] font-normal leading-4 text-black/35">Öneri sıralaması storefront recommendation servisi tarafından read-only hesaplanır.</span>
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Ürün limiti
                    <input type="number" min={2} max={12} value={numberValue(settings.limit, 6)} onChange={(event) => updateSetting("limit", Number(event.target.value))} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Yerleşim
                    <select value={text(settings.layout) || "grid"} onChange={(event) => updateSetting("layout", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="grid">Grid</option>
                      <option value="slider">Yatay slider</option>
                    </select>
                  </label>
                </>
              ) : null}

              {bestSellers ? (
                <>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45 md:col-span-2">
                    Veri kaynağı
                    <div className="flex h-9 items-center rounded-lg border border-black/10 bg-black/[0.025] px-2.5 text-[8px] font-medium text-black/55">
                      Otomatik · ödenmiş sipariş miktarları
                    </div>
                    <span className="text-[7px] font-normal leading-4 text-black/35">Sipariş/analytics verisi read-only hesaplanır; theme editor satış sırasını değiştiremez.</span>
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Tarih penceresi
                    <select value={text(settings.window) || "30d"} onChange={(event) => updateSetting("window", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="7d">Son 7 gün</option>
                      <option value="30d">Son 30 gün</option>
                      <option value="90d">Son 90 gün</option>
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Ürün limiti
                    <input type="number" min={1} max={24} value={numberValue(settings.limit, 12)} onChange={(event) => updateSetting("limit", Number(event.target.value))} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45 md:col-span-2">
                    Yerleşim
                    <select value={text(settings.layout) || "slider"} onChange={(event) => updateSetting("layout", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="slider">Slider</option>
                      <option value="grid">Grid</option>
                    </select>
                  </label>
                </>
              ) : null}

              {productComparison ? (
                <>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45 md:col-span-2">
                    Karşılaştırılacak ürünler · 2-4 seçim
                    <select
                      multiple
                      size={Math.min(8, Math.max(4, catalogProducts.length || 4))}
                      value={Array.isArray(settings.productIds) ? settings.productIds.filter((item): item is string => typeof item === "string") : []}
                      onChange={(event) => {
                        const selected = Array.from(event.currentTarget.selectedOptions).map((option) => option.value).slice(0, 4);
                        updateSetting("productIds", selected);
                      }}
                      disabled={catalogLoading}
                      className="min-h-28 rounded-lg border border-black/10 bg-white p-2.5 text-[9px] outline-none disabled:opacity-50"
                    >
                      {catalogProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                    </select>
                    {catalogError ? <span className="text-[7px] font-normal text-red-600">{catalogError}</span> : <span className="text-[7px] font-normal leading-4 text-black/35">Ctrl/Cmd ile birden fazla ürün seç. Fiyat, stok ve ürün alanları katalogdan read-only gelir.</span>}
                  </label>
                  <div className="grid gap-2 rounded-lg border border-black/10 bg-white p-2.5 md:col-span-2">
                    <p className="text-[8px] font-semibold text-black/45">Karşılaştırma alanları</p>
                    {[
                      ["price", "Fiyat"],
                      ["compare-price", "Karşılaştırma fiyatı"],
                      ["stock", "Stok"],
                      ["description", "Açıklama"],
                      ["material", "Materyal / ürün bilgisi"],
                    ].map(([value, label]) => {
                      const current = Array.isArray(settings.fields) ? settings.fields.filter((item): item is string => typeof item === "string") : ["price", "stock", "description"];
                      return (
                        <label key={value} className="flex items-center justify-between gap-3 text-[8px] text-black/55">
                          {label}
                          <input
                            type="checkbox"
                            checked={current.includes(value)}
                            onChange={(event) => updateSetting("fields", event.target.checked ? [...new Set([...current, value])] : current.filter((item) => item !== value))}
                          />
                        </label>
                      );
                    })}
                  </div>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45 md:col-span-2">
                    Layout
                    <div className="flex h-9 items-center rounded-lg border border-black/10 bg-black/[0.025] px-2.5 text-[8px] font-medium text-black/55">
                      Tablo · mobilde yatay kaydırma
                    </div>
                  </label>
                </>
              ) : null}

              {featuredCollection ? (
                <>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45 md:col-span-2">
                    Koleksiyon
                    <select value={text(settings.collectionId)} onChange={(event) => updateSetting("collectionId", event.target.value)} disabled={catalogLoading} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none disabled:opacity-50">
                      <option value="">{catalogLoading ? "Koleksiyonlar yükleniyor…" : "Koleksiyon seç"}</option>
                      {catalogCollections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
                    </select>
                    {catalogError ? <span className="text-[7px] font-normal text-red-600">{catalogError}</span> : <span className="text-[7px] font-normal leading-4 text-black/35">Koleksiyon üyeliği ve ürün verileri theme editor tarafından değiştirilmez.</span>}
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Başlık override
                    <input value={text(settings.heading)} onChange={(event) => updateSetting("heading", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" placeholder="Boşsa koleksiyon adı" />
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    CTA metni
                    <input value={text(settings.linkLabel) || "Koleksiyonu Gör"} onChange={(event) => updateSetting("linkLabel", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Yerleşim
                    <select value={text(settings.layout) || "slider"} onChange={(event) => updateSetting("layout", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="slider">Slider</option>
                      <option value="grid">Grid</option>
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Ürün limiti
                    <input type="number" min={1} max={24} value={numberValue(settings.limit, 8)} onChange={(event) => updateSetting("limit", Number(event.target.value))} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Masaüstü kolon
                    <input type="number" min={1} max={6} value={numberValue(settings.desktopColumns, 4)} onChange={(event) => updateSetting("desktopColumns", Number(event.target.value))} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Mobil kolon
                    <input type="number" min={1} max={3} value={numberValue(settings.mobileColumns, 2)} onChange={(event) => updateSetting("mobileColumns", Number(event.target.value))} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45 md:col-span-2">
                    Kart aralığı
                    <select value={String(numberValue(settings.gap, 12))} onChange={(event) => updateSetting("gap", Number(event.target.value))} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="8">Sıkı · 8px</option>
                      <option value="12">Dar · 12px</option>
                      <option value="20">Orta · 20px</option>
                      <option value="32">Geniş · 32px</option>
                    </select>
                  </label>
                </>
              ) : null}

              {collectionCards ? (
                <>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Veri kaynağı
                    <div className="flex h-9 items-center rounded-lg border border-black/10 bg-white px-2.5 text-[8px] font-medium text-black/55">
                      Katalog · {categoryCards ? `${catalogCategories.length} aktif kategori` : "aktif koleksiyonlar"}
                    </div>
                    <span className="text-[7px] font-normal leading-4 text-black/35">
                      {categoryCards ? "Kategori adı/slug/görseli" : "Koleksiyon üyeliği ve isim/slug verisi"} catalog servisinden read-only gelir.
                    </span>
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    {categoryCards ? "Kategori" : "Koleksiyon"} limiti
                    <input type="number" min={1} max={12} value={numberValue(settings.limit, categoryCards ? 6 : 4)} onChange={(event) => updateSetting("limit", Number(event.target.value))} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Masaüstü kolon
                    <select value={String(numberValue(settings.columns, 2))} onChange={(event) => updateSetting("columns", Number(event.target.value))} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="4">4</option>
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Kart aralığı
                    <select value={String(numberValue(settings.gap, 20))} onChange={(event) => updateSetting("gap", Number(event.target.value))} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="8">Sıkı · 8px</option>
                      <option value="12">Dar · 12px</option>
                      <option value="20">Orta · 20px</option>
                      <option value="32">Geniş · 32px</option>
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Kart oranı
                    <select value={text(settings.ratio) || "16/10"} onChange={(event) => updateSetting("ratio", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="16/10">Yatay · 16:10</option>
                      <option value="4/5">Dikey · 4:5</option>
                      <option value="1/1">Kare · 1:1</option>
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Başlık konumu
                    <select value={text(settings.titlePlacement) || "overlay"} onChange={(event) => updateSetting("titlePlacement", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="overlay">Görsel üzerinde</option>
                      <option value="below">Görsel altında</option>
                    </select>
                  </label>
                </>
              ) : null}

              {brandStory ? (
                <>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45 md:col-span-2">
                    Marka hikayesi medyası
                    <div className="flex gap-2">
                      <select value={text(settings.imageAssetId)} onChange={(event) => updateSetting("imageAssetId", event.target.value)} className="h-9 min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                        <option value="">Mevcut marka hikayesi görselini kullan</option>
                        {mediaAssets.map((asset) => <option key={asset.assetId} value={asset.assetId}>{asset.type} · {asset.assetId} · v{asset.version || 1}</option>)}
                      </select>
                      <button type="button" onClick={() => setMediaPicker({ target: "section", key: "imageAssetId", mediaType: "any" })} className="h-9 rounded-lg border border-black/10 bg-white px-3 text-[8px] font-semibold hover:bg-black/[0.03]">
                        Media Library
                      </button>
                    </div>
                    <span className="text-[7px] font-normal leading-4 text-black/35">Responsive varyant ve focal point Media Library asset kaydından gelir.</span>
                  </label>
                  {brandStoryMedia?.type === "video" ? (
                    <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                      Video politikası
                      <select value={text(settings.playbackPreset) || "ambient"} onChange={(event) => updateSetting("playbackPreset", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                        <option value="ambient">Autoplay · sessiz · loop</option>
                        <option value="once">Autoplay · sessiz · tek oynatım</option>
                        <option value="controls">Kontrollü oynatıcı</option>
                      </select>
                    </label>
                  ) : null}
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Medya konumu
                    <select value={text(settings.side) || "left"} onChange={(event) => updateSetting("side", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="left">Sol</option>
                      <option value="right">Sağ</option>
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    İçerik genişliği
                    <select value={text(settings.contentWidth) || "50%"} onChange={(event) => updateSetting("contentWidth", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="40%">40%</option>
                      <option value="50%">50%</option>
                      <option value="60%">60%</option>
                    </select>
                  </label>
                </>
              ) : null}

              {rewardsPromo ? (
                <>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45 md:col-span-2">
                    Promo medyası
                    <div className="flex gap-2">
                      <select value={text(settings.imageAssetId)} onChange={(event) => updateSetting("imageAssetId", event.target.value)} className="h-9 min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                        <option value="">Medya yok</option>
                        {mediaAssets.map((asset) => <option key={asset.assetId} value={asset.assetId}>{asset.type} · {asset.assetId} · v{asset.version || 1}</option>)}
                      </select>
                      <button type="button" onClick={() => setMediaPicker({ target: "section", key: "imageAssetId", mediaType: "any" })} className="h-9 rounded-lg border border-black/10 bg-white px-3 text-[8px] font-semibold hover:bg-black/[0.03]">
                        Media Library
                      </button>
                    </div>
                    <span className="text-[7px] font-normal leading-4 text-black/35">Responsive varyant ve focal point Media Library kaydından gelir.</span>
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Yerleşim
                    <select value={text(settings.layout) || "split"} onChange={(event) => updateSetting("layout", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="split">Split</option>
                      <option value="card">Kart</option>
                    </select>
                  </label>
                  <label className="flex items-center justify-between gap-3 rounded-lg border border-black/10 bg-white p-2.5 text-[8px] font-semibold text-black/45">
                    Kayıt puanını göster
                    <input type="checkbox" checked={settings.showSignupPoints !== false} onChange={(event) => updateSetting("showSignupPoints", event.target.checked)} />
                  </label>
                  <label className="flex items-center justify-between gap-3 rounded-lg border border-black/10 bg-white p-2.5 text-[8px] font-semibold text-black/45 md:col-span-2">
                    Kazanma oranını göster
                    <input type="checkbox" checked={settings.showEarnRate !== false} onChange={(event) => updateSetting("showEarnRate", event.target.checked)} />
                  </label>
                  <div className="rounded-lg border border-black/10 bg-black/[0.025] p-2.5 text-[7px] leading-4 text-black/45 md:col-span-2">
                    Puan miktarları ve kazanma oranı tema ayarı değildir; storefront rewards settings servisinden read-only gelir.
                  </div>
                </>
              ) : null}

              {reviewHighlights ? (
                <>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45 md:col-span-2">
                    Yorum kaynağı · ürün
                    <select value={text(settings.productId)} onChange={(event) => updateSetting("productId", event.target.value)} disabled={catalogLoading} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none disabled:opacity-50">
                      <option value="">{catalogLoading ? "Ürünler yükleniyor…" : "Ürün seç"}</option>
                      {catalogProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                    </select>
                    {catalogError ? <span className="text-[7px] font-normal text-red-600">{catalogError}</span> : <span className="text-[7px] font-normal leading-4 text-black/35">Yalnız onaylı yorumlar storefront review servisinden read-only gelir.</span>}
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Yorum limiti
                    <input type="number" min={1} max={12} value={numberValue(settings.limit, 6)} onChange={(event) => updateSetting("limit", Number(event.target.value))} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
                  </label>
                  <label className="flex items-center justify-between gap-3 rounded-lg border border-black/10 bg-white p-2.5 text-[8px] font-semibold text-black/45">
                    Puanı göster
                    <input type="checkbox" checked={settings.ratingDisplay !== false} onChange={(event) => updateSetting("ratingDisplay", event.target.checked)} />
                  </label>
                </>
              ) : null}

              {newsletter ? (
                <>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45 md:col-span-2">
                    Newsletter başlığı
                    <input value={text(settings.heading)} onChange={(event) => updateSetting("heading", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45 md:col-span-2">
                    Açıklama
                    <textarea value={text(settings.body)} onChange={(event) => updateSetting("body", event.target.value)} className="min-h-20 resize-y rounded-lg border border-black/10 bg-white p-2.5 text-[9px] leading-5 outline-none" />
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    E-posta alan etiketi
                    <input value={text(settings.fieldLabel) || "E-posta"} onChange={(event) => updateSetting("fieldLabel", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Buton metni
                    <input value={text(settings.buttonLabel) || "Kaydol"} onChange={(event) => updateSetting("buttonLabel", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45 md:col-span-2">
                    Consent metni
                    <textarea value={text(settings.consent)} onChange={(event) => updateSetting("consent", event.target.value)} className="min-h-20 resize-y rounded-lg border border-black/10 bg-white p-2.5 text-[9px] leading-5 outline-none" />
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45 md:col-span-2">
                    Başarı mesajı
                    <textarea value={text(settings.successCopy)} onChange={(event) => updateSetting("successCopy", event.target.value)} className="min-h-20 resize-y rounded-lg border border-black/10 bg-white p-2.5 text-[9px] leading-5 outline-none" />
                  </label>
                  <div className="rounded-lg border border-black/10 bg-black/[0.025] p-2.5 text-[7px] leading-4 text-black/45 md:col-span-2">
                    Subscription action korumalıdır. Endpoint, consent kaydı, rate limit ve subscriber state tema editöründen değiştirilemez.
                  </div>
                </>
              ) : null}

              {customForm ? (
                <>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Buton metni
                    <input value={text(settings.buttonLabel) || "Gönder"} onChange={(event) => updateSetting("buttonLabel", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Action whitelist
                    <select value={text(settings.action) || "store"} onChange={(event) => updateSetting("action", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="store">Korumalı kayıt · store</option>
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45 md:col-span-2">
                    Başarı mesajı
                    <textarea value={text(settings.successCopy) || "Formunuz alındı. Teşekkür ederiz."} onChange={(event) => updateSetting("successCopy", event.target.value)} className="min-h-20 resize-y rounded-lg border border-black/10 bg-white p-2.5 text-[9px] leading-5 outline-none" />
                  </label>
                  <div className="rounded-lg border border-black/10 bg-black/[0.025] p-2.5 text-[7px] leading-4 text-black/45 md:col-span-2">
                    Form şeması aşağıdaki alan bloklarından üretilir. Raw HTML/JS yoktur; action yalnız whitelist üzerinden çalışır. Anti-spam ve server validation korumalıdır.
                  </div>
                </>
              ) : null}

              {mapLocator ? (
                <>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Yerleşim
                    <select value={text(settings.layout) || "cards"} onChange={(event) => updateSetting("layout", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="cards">Kartlar</option>
                      <option value="list">Liste</option>
                    </select>
                  </label>
                  <label className="flex items-center justify-between gap-3 rounded-lg border border-black/10 bg-white p-2.5 text-[8px] font-semibold text-black/45">
                    Haritada aç bağlantıları
                    <input type="checkbox" checked={settings.showMapLinks !== false} onChange={(event) => updateSetting("showMapLinks", event.target.checked)} />
                  </label>
                  {settings.showMapLinks !== false ? (
                    <label className="grid gap-1.5 text-[8px] font-semibold text-black/45 md:col-span-2">
                      Harita bağlantısı metni
                      <input value={text(settings.mapLinkLabel) || "Haritada Aç"} onChange={(event) => updateSetting("mapLinkLabel", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
                    </label>
                  ) : null}
                  <div className="rounded-lg border border-black/10 bg-black/[0.025] p-2.5 text-[7px] leading-4 text-black/45 md:col-span-2">
                    Store Locator konum bloklarından çalışır. Otomatik geolocation, üçüncü taraf map scripti ve raw embed yüklenmez; “Haritada Aç” bağlantısı yalnız adres metninden güvenli şekilde üretilir.
                  </div>
                </>
              ) : null}

              {contactForm ? (
                <>
                  <label className="flex items-center justify-between gap-3 rounded-lg border border-black/10 bg-white p-2.5 text-[8px] font-semibold text-black/45 md:col-span-2">
                    Telefon alanını göster
                    <input type="checkbox" checked={settings.phoneVisible !== false} onChange={(event) => updateSetting("phoneVisible", event.target.checked)} />
                  </label>
                  {[
                    ["nameLabel", "Ad Soyad etiketi", "Ad Soyad"],
                    ["emailLabel", "E-posta etiketi", "E-posta"],
                    ["phoneLabel", "Telefon etiketi", "Telefon"],
                    ["messageLabel", "Mesaj etiketi", "Mesaj"],
                    ["namePlaceholder", "Ad Soyad placeholder", "Adınız Soyadınız"],
                    ["emailPlaceholder", "E-posta placeholder", "ornek@mail.com"],
                    ["phonePlaceholder", "Telefon placeholder", "05xx xxx xx xx"],
                    ["messagePlaceholder", "Mesaj placeholder", "Mesajınızı yazın."],
                    ["buttonLabel", "Buton metni", "Mesajı Gönder"],
                  ].map(([key, label, fallback]) => (
                    <label key={key} className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                      {label}
                      <input value={text(settings[key]) || fallback} onChange={(event) => updateSetting(key, event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
                    </label>
                  ))}
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45 md:col-span-2">
                    Başarı mesajı
                    <textarea value={text(settings.successCopy) || "Mesajınız alındı. En kısa sürede size dönüş yapacağız."} onChange={(event) => updateSetting("successCopy", event.target.value)} className="min-h-20 resize-y rounded-lg border border-black/10 bg-white p-2.5 text-[9px] leading-5 outline-none" />
                  </label>
                  <div className="rounded-lg border border-black/10 bg-black/[0.025] p-2.5 text-[7px] leading-4 text-black/45 md:col-span-2">
                    Ad Soyad, E-posta ve Mesaj alanları endpoint doğrulaması nedeniyle zorunludur. Anti-spam, rate limit ve gönderim endpoint'i tema editöründen değiştirilemez.
                  </div>
                </>
              ) : null}

              {section.type === "quote" ? (
                <>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45 md:col-span-2">
                    Alıntı
                    <textarea value={text(settings.quote)} onChange={(event) => updateSetting("quote", event.target.value)} className="min-h-24 resize-y rounded-lg border border-black/10 bg-white p-2.5 text-[9px] leading-5 outline-none" />
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45 md:col-span-2">
                    Atıf
                    <input value={text(settings.attribution)} onChange={(event) => updateSetting("attribution", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
                  </label>
                </>
              ) : null}
              {section.type === "countdown" ? (
                <>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45 md:col-span-2">
                    Hedef zaman
                    <input type="datetime-local" value={text(settings.targetTime).slice(0, 16)} onChange={(event) => updateSetting("targetTime", event.target.value ? new Date(event.target.value).toISOString() : "")} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Bitiş metni
                    <input value={text(settings.completedState)} onChange={(event) => updateSetting("completedState", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Stil
                    <select value={text(settings.style) || "cards"} onChange={(event) => updateSetting("style", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="cards">Kartlar</option>
                      <option value="inline">Inline</option>
                    </select>
                  </label>
                </>
              ) : null}
              {section.type === "shipping-returns-cta" ? (
                <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                  İkon / sembol
                  <input value={text(settings.icon)} onChange={(event) => updateSetting("icon", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
                </label>
              ) : null}
              {section.type === "heading-subtext" ? (
                <>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Başlık rolü
                    <select value={text(settings.role) || "h2"} onChange={(event) => updateSetting("role", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="h1">H1</option>
                      <option value="h2">H2</option>
                      <option value="h3">H3</option>
                      <option value="h4">H4</option>
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Boyut preset
                    <select value={text(settings.size) || "lg"} onChange={(event) => updateSetting("size", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="sm">S</option>
                      <option value="md">M</option>
                      <option value="lg">L</option>
                      <option value="xl">XL</option>
                    </select>
                  </label>
                </>
              ) : null}
              {section.type === "manifesto" ? (
                <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                  Tipografi preset
                  <select value={text(settings.typography) || "display"} onChange={(event) => updateSetting("typography", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                    <option value="display">Display</option>
                    <option value="editorial">Editorial</option>
                    <option value="compact">Compact</option>
                  </select>
                </label>
              ) : null}
              {hasAlign ? (
                <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                  Hizalama
                  <select value={text(settings.align) || "center"} onChange={(event) => updateSetting("align", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                    <option value="left">Sol</option>
                    <option value="center">Orta</option>
                    <option value="right">Sağ</option>
                  </select>
                </label>
              ) : null}
              {["heading-subtext", "manifesto"].includes(section.type) ? (
                <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                  Max genişlik preset
                  <select value={text(settings.maxWidth) || "900px"} onChange={(event) => updateSetting("maxWidth", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                    <option value="640px">Dar · 640</option>
                    <option value="800px">Orta · 800</option>
                    <option value="900px">Geniş · 900</option>
                    <option value="1100px">XL · 1100</option>
                  </select>
                </label>
              ) : null}
              {hasLink ? (
                <>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    CTA metni
                    <input value={text(settings.linkLabel)} onChange={(event) => updateSetting("linkLabel", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    CTA bağlantısı
                    <input value={text(settings.linkHref)} onChange={(event) => updateSetting("linkHref", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" placeholder="/pages/..." />
                  </label>
                </>
              ) : null}
              {section.type === "spacer" ? (
                <>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Masaüstü yükseklik preset
                    <select value={String(numberValue(settings.desktopHeight, 64))} onChange={(event) => updateSetting("desktopHeight", Number(event.target.value))} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      {[0, 16, 24, 32, 40, 48, 64, 80, 96, 120, 160, 200, 240].map((value) => <option key={value} value={value}>{value}px</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Mobil yükseklik preset
                    <select value={String(numberValue(settings.mobileHeight, 40))} onChange={(event) => updateSetting("mobileHeight", Number(event.target.value))} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      {[0, 16, 24, 32, 40, 48, 64, 80, 96, 120, 160].map((value) => <option key={value} value={value}>{value}px</option>)}
                    </select>
                  </label>
                </>
              ) : null}
              {section.type === "divider" ? (
                <>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Genişlik preset
                    <select value={text(settings.width) || "100%"} onChange={(event) => updateSetting("width", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="25%">25%</option>
                      <option value="50%">50%</option>
                      <option value="75%">75%</option>
                      <option value="100%">100%</option>
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Kalınlık preset
                    <select value={String(numberValue(settings.thickness, 1))} onChange={(event) => updateSetting("thickness", Number(event.target.value))} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="1">İnce · 1px</option>
                      <option value="2">Orta · 2px</option>
                      <option value="4">Kalın · 4px</option>
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45 md:col-span-2">
                    Renk tokenı
                    <select value={text(settings.colorToken) || "subtle"} onChange={(event) => updateSetting("colorToken", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="subtle">Subtle</option>
                      <option value="muted">Muted</option>
                      <option value="strong">Strong</option>
                      <option value="current">Current</option>
                    </select>
                  </label>
                </>
              ) : null}
              {section.type === "anchor" ? (
                <>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Anchor ID
                    <input value={text(settings.anchorId)} onChange={(event) => updateSetting("anchorId", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
                  </label>
                  <label className="flex items-center justify-between gap-3 rounded-lg border border-black/10 bg-white p-2.5 text-[8px] font-semibold text-black/45">
                    Etiketi erişilebilir içerikte tut
                    <input type="checkbox" checked={settings.labelVisibility === true} onChange={(event) => updateSetting("labelVisibility", event.target.checked)} />
                  </label>
                </>
              ) : null}
              {section.type === "before-after" ? (
                <>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Önce görseli
                    <select value={text(settings.beforeAssetId)} onChange={(event) => updateSetting("beforeAssetId", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="">Medya seçilmedi</option>
                      {mediaAssets.filter((asset) => asset.type === "image").map((asset) => <option key={asset.assetId} value={asset.assetId}>{asset.assetId} · v{asset.version || 1}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Sonra görseli
                    <select value={text(settings.afterAssetId)} onChange={(event) => updateSetting("afterAssetId", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="">Medya seçilmedi</option>
                      {mediaAssets.filter((asset) => asset.type === "image").map((asset) => <option key={asset.assetId} value={asset.assetId}>{asset.assetId} · v{asset.version || 1}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Önce etiketi
                    <input value={text(settings.beforeLabel)} onChange={(event) => updateSetting("beforeLabel", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Sonra etiketi
                    <input value={text(settings.afterLabel)} onChange={(event) => updateSetting("afterLabel", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45 md:col-span-2">
                    Başlangıç divider konumu
                    <input type="range" min={10} max={90} value={numberValue(settings.divider, 50)} onChange={(event) => updateSetting("divider", Number(event.target.value))} />
                  </label>
                </>
              ) : null}
              {section.type === "hotspot-lookbook" ? (
                <label className="grid gap-1.5 text-[8px] font-semibold text-black/45 md:col-span-2">
                  Lookbook görseli
                  <select value={text(settings.imageAssetId)} onChange={(event) => updateSetting("imageAssetId", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                    <option value="">Medya seçilmedi</option>
                    {mediaAssets.filter((asset) => asset.type === "image").map((asset) => <option key={asset.assetId} value={asset.assetId}>{asset.assetId} · v{asset.version || 1}</option>)}
                  </select>
                </label>
              ) : null}
              {["image-text-split", "video-text-split"].includes(section.type) ? (
                <>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45 md:col-span-2">
                    Bölüm medyası
                    <select value={text(settings.imageAssetId)} onChange={(event) => updateSetting("imageAssetId", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="">Medya seçilmedi</option>
                      {mediaAssets
                        .filter((asset) => section.type === "video-text-split" ? asset.type === "video" : asset.type === "image")
                        .map((asset) => <option key={asset.assetId} value={asset.assetId}>{asset.type} · {asset.assetId} · v{asset.version || 1}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Medya konumu
                    <select value={text(settings.side) || "left"} onChange={(event) => updateSetting("side", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="left">Sol</option>
                      <option value="right">Sağ</option>
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    İçerik genişliği
                    <select value={text(settings.contentWidth) || "50%"} onChange={(event) => updateSetting("contentWidth", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="40%">40%</option>
                      <option value="50%">50%</option>
                      <option value="60%">60%</option>
                    </select>
                  </label>
                </>
              ) : null}
              {gridStack ? (
                <>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Kolon
                    <select value={String(numberValue(settings.columns, 2))} onChange={(event) => updateSetting("columns", Number(event.target.value))} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="1">1 kolon</option>
                      <option value="2">2 kolon</option>
                      <option value="3">3 kolon</option>
                      <option value="4">4 kolon</option>
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Gap preset
                    <select value={String(numberValue(settings.gap, 20))} onChange={(event) => updateSetting("gap", Number(event.target.value))} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="0">Yok · 0px</option>
                      <option value="8">Sıkı · 8px</option>
                      <option value="12">Dar · 12px</option>
                      <option value="20">Orta · 20px</option>
                      <option value="32">Geniş · 32px</option>
                      <option value="48">Çok geniş · 48px</option>
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Dikey hizalama
                    <select value={text(settings.alignment) || "stretch"} onChange={(event) => updateSetting("alignment", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="start">Üst</option>
                      <option value="center">Orta</option>
                      <option value="stretch">Eşit yükseklik</option>
                    </select>
                  </label>
                  <label className="flex items-center justify-between gap-3 rounded-lg border border-black/10 bg-white p-2.5 text-[8px] font-semibold text-black/45">
                    Mobilde tek kolona stack
                    <input type="checkbox" checked={settings.responsiveStack !== false} onChange={(event) => updateSetting("responsiveStack", event.target.checked)} />
                  </label>
                  <div className="rounded-lg border border-black/10 bg-black/[0.025] p-2.5 text-[7px] leading-4 text-black/45 md:col-span-2">
                    Güvenli composition kullanılır: absolute free-canvas, raw CSS ve serbest pixel konumlandırma yoktur.
                  </div>
                </>
              ) : null}
              {hasColumns ? (
                <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                  Masaüstü kolon
                  <input type="number" min={1} max={6} value={numberValue(settings.columns, 3)} onChange={(event) => updateSetting("columns", Number(event.target.value))} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
                </label>
              ) : null}
              {hasGap ? (
                <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                  Gap
                  <input type="number" min={0} max={100} value={numberValue(settings.gap, 20)} onChange={(event) => updateSetting("gap", Number(event.target.value))} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
                </label>
              ) : null}
              {showPadding ? (
                <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                  Dikey boşluk
                  <input type="number" min={0} max={240} value={numberValue(settings.paddingY, 64)} onChange={(event) => updateSetting("paddingY", Number(event.target.value))} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
                </label>
              ) : null}
              {section.type === "scroll-story" ? (
                <>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Scroll uzunluğu
                    <select value={text(settings.scrollLengthPreset) || "standard"} onChange={(event) => updateSetting("scrollLengthPreset", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="compact">Kompakt · slide başına 75svh</option>
                      <option value="standard">Standart · slide başına 100svh</option>
                      <option value="long">Uzun · slide başına 125svh</option>
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Geçiş preset
                    <select value={text(settings.transitionPreset) || "fade-scale"} onChange={(event) => updateSetting("transitionPreset", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="fade-scale">Fade + Scale</option>
                      <option value="fade">Sadece Fade</option>
                    </select>
                  </label>
                  <label className="flex items-center justify-between gap-3 rounded-lg border border-black/10 bg-white p-2.5 text-[8px] font-semibold text-black/45 md:col-span-2">
                    KAYDIR cue göster
                    <input type="checkbox" checked={settings.cueVisibility !== false} onChange={(event) => updateSetting("cueVisibility", event.target.checked)} />
                  </label>
                </>
              ) : null}
              {section.type === "slideshow" ? (
                <>
                  <label className="flex items-center justify-between gap-3 rounded-lg border border-black/10 bg-white p-2.5 text-[8px] font-semibold text-black/45">
                    Autoplay
                    <input type="checkbox" checked={settings.autoplay === true} onChange={(event) => updateSetting("autoplay", event.target.checked)} />
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Geçiş
                    <select value={text(settings.transition) || "slide"} onChange={(event) => updateSetting("transition", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="slide">Slide</option>
                      <option value="fade">Fade</option>
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Autoplay süresi
                    <select value={String(numberValue(settings.intervalMs, 5000))} onChange={(event) => updateSetting("intervalMs", Number(event.target.value))} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="3000">3 sn</option>
                      <option value="5000">5 sn</option>
                      <option value="7000">7 sn</option>
                      <option value="10000">10 sn</option>
                    </select>
                  </label>
                </>
              ) : null}
              {section.type === "timeline" ? (
                <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                  Yön
                  <select value={text(settings.orientation) || "vertical"} onChange={(event) => updateSetting("orientation", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                    <option value="vertical">Dikey</option>
                    <option value="horizontal">Yatay</option>
                  </select>
                </label>
              ) : null}
            </div>
          ) : null}

          {showBlockComposer ? (
          <div className="mt-4 rounded-xl border border-black/[0.08]">
            <div className="flex flex-wrap items-center gap-2 border-b border-black/[0.07] bg-[#fafafa] p-3">
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-semibold">Bloklar</p>
                <p className="mt-1 text-[7px] text-black/35">Yalnız allowedBlocks + implemented=true kayıtları eklenebilir.</p>
              </div>
              {allowedDefinitions.length > 1 ? (
                <select value={blockType} onChange={(event) => setBlockType(event.target.value)} className="h-8 rounded-lg border border-black/10 bg-white px-2 text-[8px] font-medium outline-none">
                  {allowedDefinitions.map((item) => <option key={item.type} value={item.type}>{item.label}</option>)}
                </select>
              ) : null}
              <button type="button" disabled={!allowedDefinitions.length || blocks.length >= maxBlocks} onClick={addBlock} className="flex h-8 items-center gap-1 rounded-lg bg-[#111] px-2.5 text-[8px] font-semibold text-white disabled:opacity-35">
                <Plus className="h-3 w-3" />Blok Ekle
              </button>
            </div>

            <div className="space-y-2 p-3">
              {blocks.map((block, index) => {
                const blockDefinition = BLOCK_LIBRARY_BY_TYPE[block.type];
                return (
                  <div key={block.id} className="rounded-xl border border-black/[0.08] bg-white p-3">
                    <div className="flex items-center gap-1">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[8px] font-semibold">{index + 1}. {blockDefinition?.label || block.type}</p>
                        <p className="mt-0.5 truncate text-[7px] text-black/30">{block.id} · {blockTitle(block)}</p>
                      </div>
                      <button type="button" disabled={index === 0} onClick={() => setBlocks((items) => {
                        const next = [...items];
                        [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
                        return next;
                      })} className="grid h-7 w-7 place-items-center rounded-md hover:bg-black/[0.04] disabled:opacity-20" aria-label="Yukarı taşı"><ArrowUp className="h-3 w-3" /></button>
                      <button type="button" disabled={index === blocks.length - 1} onClick={() => setBlocks((items) => {
                        const next = [...items];
                        [next[index + 1], next[index]] = [next[index]!, next[index + 1]!];
                        return next;
                      })} className="grid h-7 w-7 place-items-center rounded-md hover:bg-black/[0.04] disabled:opacity-20" aria-label="Aşağı taşı"><ArrowDown className="h-3 w-3" /></button>
                      <button type="button" onClick={() => setBlocks((items) => items.filter((item) => item.id !== block.id))} className="grid h-7 w-7 place-items-center rounded-md text-red-600 hover:bg-red-50" aria-label="Sil"><Trash2 className="h-3 w-3" /></button>
                    </div>

                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {(blockDefinition?.settings || Object.keys(block.settings)).map((key) => {
                        const value = block.settings[key];
                        if (isMediaField(key)) {
                          return (
                            <label key={key} className="grid gap-1 text-[8px] font-semibold text-black/45 md:col-span-2">
                              {fieldLabel(key)}
                              <div className="flex gap-2">
                                <select value={text(value)} onChange={(event) => updateBlock(block.id, key, event.target.value)} className="h-9 min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                                  <option value="">Medya seçilmedi</option>
                                  {mediaAssets.map((asset) => <option key={asset.assetId} value={asset.assetId}>{asset.type} · {asset.assetId} · v{asset.version || 1}</option>)}
                                </select>
                                <button type="button" onClick={() => setMediaPicker({ target: "block", blockId: block.id, key, mediaType: "any" })} className="h-9 rounded-lg border border-black/10 bg-white px-3 text-[8px] font-semibold hover:bg-black/[0.03]">
                                  Media Library
                                </button>
                              </div>
                            </label>
                          );
                        }
                        if (isLongField(key)) {
                          return (
                            <label key={key} className="grid gap-1 text-[8px] font-semibold text-black/45 md:col-span-2">
                              {fieldLabel(key)}
                              <textarea value={text(value)} onChange={(event) => updateBlock(block.id, key, event.target.value)} className="min-h-20 resize-y rounded-lg border border-black/10 p-2.5 text-[9px] leading-5 outline-none" />
                            </label>
                          );
                        }
                        if ((key === "x" || key === "y") && block.type === "hotspot") {
                          return (
                            <label key={key} className="grid gap-1 text-[8px] font-semibold text-black/45">
                              {fieldLabel(key)}
                              <input type="number" min={0} max={100} value={numberValue(value, 50)} onChange={(event) => updateBlock(block.id, key, Number(event.target.value))} className="h-9 rounded-lg border border-black/10 px-2.5 text-[9px] outline-none" />
                            </label>
                          );
                        }
                        if (block.type === "field" && key === "type") {
                          return (
                            <label key={key} className="grid gap-1 text-[8px] font-semibold text-black/45">
                              {fieldLabel(key)}
                              <select value={text(value) || "text"} onChange={(event) => updateBlock(block.id, key, event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                                <option value="text">Metin</option>
                                <option value="email">E-posta</option>
                                <option value="tel">Telefon</option>
                                <option value="textarea">Uzun metin</option>
                                <option value="select">Seçim listesi</option>
                                <option value="checkbox">Onay kutusu</option>
                              </select>
                            </label>
                          );
                        }
                        if (block.type === "field" && key === "required") {
                          return (
                            <label key={key} className="flex items-center justify-between gap-3 rounded-lg border border-black/10 bg-white p-2.5 text-[8px] font-semibold text-black/45">
                              {fieldLabel(key)}
                              <input type="checkbox" checked={value === true} onChange={(event) => updateBlock(block.id, key, event.target.checked)} />
                            </label>
                          );
                        }
                        if (block.type === "field" && key === "options") {
                          return (
                            <label key={key} className="grid gap-1 text-[8px] font-semibold text-black/45 md:col-span-2">
                              {fieldLabel(key)} · virgül veya satır sonu
                              <textarea value={text(value)} onChange={(event) => updateBlock(block.id, key, event.target.value)} className="min-h-16 resize-y rounded-lg border border-black/10 p-2.5 text-[9px] leading-5 outline-none" />
                            </label>
                          );
                        }
                        if (key === "targetType" && block.type === "hotspot") {
                          return (
                            <label key={key} className="grid gap-1 text-[8px] font-semibold text-black/45">
                              {fieldLabel(key)}
                              <select value={text(value) || "link"} onChange={(event) => updateBlock(block.id, key, event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                                <option value="link">Bağlantı</option>
                                <option value="product">Ürün / ürün route'u</option>
                              </select>
                            </label>
                          );
                        }
                        if (key === "align" && block.type === "content") {
                          return (
                            <label key={key} className="grid gap-1 text-[8px] font-semibold text-black/45">
                              {fieldLabel(key)}
                              <select value={text(value) || "center"} onChange={(event) => updateBlock(block.id, key, event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                                <option value="left">Sol</option>
                                <option value="center">Orta</option>
                                <option value="right">Sağ</option>
                              </select>
                            </label>
                          );
                        }
                        if (key === "maxWidth" && block.type === "content") {
                          return (
                            <label key={key} className="grid gap-1 text-[8px] font-semibold text-black/45">
                              {fieldLabel(key)}
                              <select value={text(value) || "800px"} onChange={(event) => updateBlock(block.id, key, event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                                <option value="640px">Dar · 640</option>
                                <option value="800px">Orta · 800</option>
                                <option value="960px">Geniş · 960</option>
                              </select>
                            </label>
                          );
                        }
                        return (
                          <label key={key} className="grid gap-1 text-[8px] font-semibold text-black/45">
                            {fieldLabel(key)}
                            <input value={text(value)} onChange={(event) => updateBlock(block.id, key, event.target.value)} className="h-9 rounded-lg border border-black/10 px-2.5 text-[9px] outline-none" />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {!blocks.length ? <p className="py-7 text-center text-[8px] text-black/35">Henüz blok yok. “Blok Ekle” ile section içeriğini oluştur.</p> : null}
            </div>
          </div>
          ) : null}
        </div>

        {mediaPicker ? (
          <StoreDesignMediaLibrary
            document={document}
            onApply={onApply}
            onClose={() => setMediaPicker(null)}
            onSelect={(assetId) => {
              if (mediaPicker.target === "block") {
                updateBlock(mediaPicker.blockId, mediaPicker.key, assetId);
              } else {
                updateSetting(mediaPicker.key, assetId);
                if (mediaPicker.key === "imageAssetId" && document.media[assetId]?.type !== "video") updateSetting("posterAssetId", "");
              }
              setMediaPicker(null);
            }}
            selectedAssetId={mediaPicker.target === "block"
              ? text(blocks.find((block) => block.id === mediaPicker.blockId)?.settings[mediaPicker.key]) || undefined
              : text(settings[mediaPicker.key]) || undefined}
            mediaType={mediaPicker.mediaType}
          />
        ) : null}

        <footer className="flex shrink-0 items-center gap-2 border-t border-black/10 bg-[#fafafa] p-3">
          <p className="min-w-0 flex-1 truncate text-[8px] text-black/35">Stable block ID · max {maxBlocks} · schema {STORE_DESIGN_SCHEMA_VERSION}</p>
          <button type="button" disabled={busy} onClick={onClose} className="h-10 rounded-lg border border-black/10 bg-white px-4 text-[9px] font-semibold disabled:opacity-40">Vazgeç</button>
          <button type="button" disabled={busy} onClick={() => void save()} className="flex h-10 items-center gap-2 rounded-lg bg-[#111] px-4 text-[9px] font-semibold text-white disabled:opacity-40">
            <Save className="h-3.5 w-3.5" />{busy ? "Uygulanıyor…" : "Uygula"}
          </button>
        </footer>
      </div>
    </div>
  );
}
