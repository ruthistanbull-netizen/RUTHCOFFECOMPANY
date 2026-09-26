import Link from "next/link";
import Hero from "@/components/home/Hero";
import ScrollStory from "@/components/home/ScrollStory";
import CollectionCards from "@/components/home/CollectionCards";
import FeaturedProducts from "@/components/home/FeaturedProducts";
import BrandStory from "@/components/home/BrandStory";
import TrustSection from "@/components/home/TrustSection";
import { ThemeProductSlider } from "@/components/theme/ThemeProductSlider";
import ProductCard from "@/components/ProductCard";
import { StoreDesignResponsiveImage } from "@/components/theme/StoreDesignResponsiveImage";
import { StoreDesignBlockSection } from "@/components/theme/StoreDesignBlockSection";
import type { Collection, Product } from "@/types/site";
import type { HomepageHeroImages } from "@/lib/themeMedia";
import type { ThemeCustomizerSettings } from "@/lib/themeCustomizer";
import type { ThemeSection } from "@ruth-commerce/commerce-core/theme-sections";
const SEMANTIC_SECTION_TYPE: Record<ThemeSection["type"], string> = {
  hero: "hero-section",
  "scroll-story": "scroll-story",
  collections: "collections-section",
  "featured-products": "featured-products",
  "brand-story": "brand-story",
  trust: "trust-section",
  "product-slider": "product-slider",
  "product-grid": "product-grid",
  "new-arrivals": "new-arrivals",
  "sale-products": "sale-products",
  "image-banner": "image-banner",
  "rich-text": "rich-text",
  faq: "faq-accordion",
};

function semanticSectionType(section: ThemeSection) {
  return SEMANTIC_SECTION_TYPE[section.type];
}

function semanticSectionLabel(section: ThemeSection) {
  return section.title || section.type.replace(/-/g, " ");
}

function settingText(settings: Record<string, unknown> | undefined, key: string) {
  const value = settings?.[key];
  return typeof value === "string" ? value : "";
}

function settingNumber(settings: Record<string, unknown> | undefined, key: string, fallback: number, min: number, max: number) {
  const value = Number(settings?.[key]);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function isVideoSource(value: string) {
  return /\.(mp4|m4v|mov|webm)(?:$|[?#])/i.test(value || "");
}

function safeSectionHref(value: string) {
  const raw = value.trim();
  if (!raw) return "";
  if (raw.startsWith("/") || raw.startsWith("#")) return raw;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function heroPlayback(settings: Record<string, unknown> | undefined) {
  const preset = ["ambient", "once", "controls"].includes(settingText(settings, "playbackPreset"))
    ? settingText(settings, "playbackPreset")
    : "ambient";
  return {
    autoPlay: preset !== "controls",
    muted: preset !== "controls",
    loop: preset === "ambient",
    controls: preset === "controls",
  };
}

import { ROSTA_PALETTE, sanitizeRostaPaletteColor } from "@/lib/rostaDesignSystem";

function hasProductSectionCustomization(section: ThemeSection) {
  return section.title !== undefined ||
    section.eyebrow !== undefined ||
    section.productLimit !== undefined ||
    section.desktopItems !== undefined ||
    section.mobileItems !== undefined ||
    section.productSource !== undefined ||
    section.productSourceId !== undefined ||
    section.gap !== undefined ||
    section.paddingY !== undefined ||
    section.desktopHeight !== undefined ||
    section.mobileHeight !== undefined ||
    section.backgroundColor !== undefined ||
    section.textColor !== undefined ||
    section.linkLabel !== undefined ||
    section.linkHref !== undefined ||
    section.showArrows !== undefined;
}

function productHasDiscount(product: Product) {
  const price = Number(product.price || 0);
  const compareAt = Number(product.compare_at_price || 0);
  return Number.isFinite(price) && Number.isFinite(compareAt) && price > 0 && compareAt > price;
}

function productsForSection(section: ThemeSection, featuredProducts: Product[], allProducts: Product[]) {
  const sourceId = section.productSourceId;

  if (section.type === "new-arrivals") {
    return allProducts
      .filter((product) => product.is_new === true)
      .sort((left, right) => String(right.created_at || "").localeCompare(String(left.created_at || "")));
  }

  if (section.type === "sale-products") {
    return allProducts.filter(productHasDiscount);
  }

  if (section.productSource === "all") return allProducts;

  if (section.productSource === "collection" && sourceId) {
    return allProducts.filter((product) =>
      product.collection_id === sourceId || product.collection_ids?.includes(sourceId),
    );
  }

  if (section.productSource === "category" && sourceId) {
    return allProducts.filter((product) => product.category_ids?.includes(sourceId));
  }

  return featuredProducts;
}

function saleBadgeVars(section: ThemeSection): Record<string, string> {
  if (section.type !== "sale-products") return {};
  if (section.badgeStyle === "outline") {
    return {
      "--theme-sale-badge-bg": "transparent",
      "--theme-sale-badge-border": "1px solid currentColor",
      "--theme-sale-badge-radius": "999px",
      "--theme-sale-badge-padding": "3px 7px",
      "--theme-sale-badge-padding-compact": "2px 5px",
    };
  }
  if (section.badgeStyle === "minimal") {
    return {
      "--theme-sale-badge-bg": "transparent",
      "--theme-sale-badge-border": "0",
      "--theme-sale-badge-radius": "0",
      "--theme-sale-badge-padding": "0",
      "--theme-sale-badge-padding-compact": "0",
    };
  }
  return {};
}

export function HomeSectionRenderer({
  section,
  featuredProducts,
  allProducts,
  collections,
  heroImages,
  editorialVideo = "/home/rosta-under-hero-video.mp4",
  editorialImage = "/home/rosta-under-hero-photo.jpg",
  scrollImages,
  themeSettings,
  freeShippingThreshold,
}: {
  section: ThemeSection;
  featuredProducts: Product[];
  allProducts: Product[];
  collections: Collection[];
  heroImages: HomepageHeroImages;
  editorialVideo?: string;
  editorialImage?: string;
  scrollImages: string[];
  themeSettings: ThemeCustomizerSettings;
  freeShippingThreshold: number;
}) {
  if (!section.enabled) return null;
  if (section.v2Type) return <StoreDesignBlockSection section={section} />;

  const heroV2Settings = section.type === "hero" ? section.v2Settings : undefined;
  const customHero = section.type === "hero" && Boolean(
    section.imageSrc
    || settingText(heroV2Settings, "title")
    || settingText(heroV2Settings, "body")
    || settingText(heroV2Settings, "linkLabel")
    || settingText(heroV2Settings, "linkHref"),
  );
  if (section.type === "hero" && customHero) {
    const desktopSrc = section.imageSrc || heroImages.desktop;
    const mobileSrc = section.mobileImageSrc || heroImages.mobile || desktopSrc;
    const desktopVideo = section.imageSrc ? section.v2MediaType === "video" : isVideoSource(desktopSrc);
    const mobileVideo = section.mobileImageSrc ? section.v2MediaType === "video" : isVideoSource(mobileSrc);
    const playback = heroPlayback(heroV2Settings);
    const fit = settingText(heroV2Settings, "fit") === "contain" ? "contain" : "cover";
    const heightPreset = settingText(heroV2Settings, "heightPreset") || "viewport";
    const minHeight = heightPreset === "medium" ? "620px" : heightPreset === "tall" ? "760px" : "100svh";
    const align = ["left", "right"].includes(settingText(heroV2Settings, "align")) ? settingText(heroV2Settings, "align") : "center";
    const contrast = ["light", "dark", "adaptive"].includes(settingText(heroV2Settings, "contrastMode"))
      ? settingText(heroV2Settings, "contrastMode")
      : "adaptive";
    const overlay = settingNumber(heroV2Settings, "overlayOpacity", 24, 0, 80) / 100;
    const poster = section.v2Assets?.posterAssetId?.url || section.v2PosterUrl;
    const title = settingText(heroV2Settings, "title");
    const body = settingText(heroV2Settings, "body");
    const linkLabel = settingText(heroV2Settings, "linkLabel");
    const linkHref = safeSectionHref(settingText(heroV2Settings, "linkHref"));
    const contentAlignClass = align === "left"
      ? "items-start text-left"
      : align === "right"
        ? "items-end text-right"
        : "items-center text-center";
    const contentColor = contrast === "light"
      ? "#FBF3E6"
      : contrast === "dark"
        ? "#111111"
        : "var(--ruth-home-header-ink, #FBF3E6)";
    const overlayBackground = contrast === "light"
      ? `rgba(0,0,0,${overlay})`
      : contrast === "dark"
        ? `rgba(255,255,255,${overlay})`
        : `rgba(0,0,0,${overlay * 0.25})`;
    const mediaStyle = (position: string | undefined) => ({
      objectFit: fit,
      objectPosition: position || "50% 50%",
    } as const);

    return (
      <section
        data-theme-section-id={section.id}
        data-editor-id={`section:${section.id}`}
        data-editor-type={semanticSectionType(section)}
        data-editor-label={semanticSectionLabel(section)}
        className="relative isolate overflow-hidden bg-black"
        style={{ minHeight, color: contentColor }}
      >
        {mobileVideo ? (
          <video
            src={mobileSrc}
            poster={poster}
            className="absolute inset-0 h-full w-full md:hidden"
            style={mediaStyle(section.mobileImageObjectPosition)}
            autoPlay={playback.autoPlay}
            muted={playback.muted}
            loop={playback.loop}
            controls={playback.controls}
            playsInline
            preload="metadata"
            data-home-editorial-media
          />
        ) : (
          <img
            src={mobileSrc}
            alt=""
            className="absolute inset-0 h-full w-full md:hidden"
            style={mediaStyle(section.mobileImageObjectPosition)}
            fetchPriority="high"
            data-home-editorial-media
          />
        )}
        {desktopVideo ? (
          <video
            src={desktopSrc}
            poster={poster}
            className="absolute inset-0 hidden h-full w-full md:block"
            style={mediaStyle(section.imageObjectPosition)}
            autoPlay={playback.autoPlay}
            muted={playback.muted}
            loop={playback.loop}
            controls={playback.controls}
            playsInline
            preload="metadata"
            data-home-editorial-media
          />
        ) : (
          <img
            src={desktopSrc}
            alt=""
            className="absolute inset-0 hidden h-full w-full md:block"
            style={mediaStyle(section.imageObjectPosition)}
            fetchPriority="high"
            data-home-editorial-media
          />
        )}
        <div className="pointer-events-none absolute inset-0" style={{ background: overlayBackground }} />
        <div className={`relative z-10 mx-auto flex w-full max-w-[1600px] flex-col justify-center px-6 py-14 md:px-10 ${contentAlignClass}`} style={{ minHeight }}>
          <div className="max-w-3xl">
            {title ? <h2 className="font-heading text-[clamp(2rem,6vw,6rem)] leading-[0.94] tracking-[-0.025em]">{title}</h2> : null}
            {body ? <p className="mt-5 whitespace-pre-wrap text-sm leading-7 opacity-90 md:text-base">{body}</p> : null}
            {linkLabel && linkHref ? (
              <Link href={linkHref} className="mt-7 inline-flex min-h-11 items-center justify-center border border-current px-5 text-[10px] uppercase tracking-[0.14em]">
                {linkLabel}
              </Link>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  if (section.type === "hero") return <div data-theme-section-id={section.id} data-editor-id={`section:${section.id}`} data-editor-type={semanticSectionType(section)} data-editor-label={semanticSectionLabel(section)}><Hero heroImages={heroImages} editorialVideo={editorialVideo} editorialImage={editorialImage} themeSettings={themeSettings} /></div>;
  if (section.type === "scroll-story") return <div data-theme-section-id={section.id} data-editor-id={`section:${section.id}`} data-editor-type={semanticSectionType(section)} data-editor-label={semanticSectionLabel(section)}><ScrollStory images={scrollImages} themeSettings={themeSettings} /></div>;

  const collectionV2Settings = section.type === "collections" ? section.v2Settings : undefined;
  const customCollectionCards = section.type === "collections" && collectionV2Settings && Object.keys(collectionV2Settings).length > 0;
  if (section.type === "collections" && customCollectionCards) {
    const limit = Math.round(settingNumber(collectionV2Settings, "limit", 4, 1, 12));
    const columns = Math.round(settingNumber(collectionV2Settings, "columns", 2, 1, 4));
    const gap = settingNumber(collectionV2Settings, "gap", 20, 0, 64);
    const paddingY = settingNumber(collectionV2Settings, "paddingY", 80, 0, 240);
    const ratio = ["16/10", "4/5", "1/1"].includes(settingText(collectionV2Settings, "ratio"))
      ? settingText(collectionV2Settings, "ratio")
      : "16/10";
    const titlePlacement = settingText(collectionV2Settings, "titlePlacement") === "below" ? "below" : "overlay";
    const title = settingText(collectionV2Settings, "title") || "Koleksiyonlar";
    const eyebrow = settingText(collectionV2Settings, "eyebrow") || "Keşfet";
    const visibleCollections = [...collections]
      .filter((collection) => collection.status === "active")
      .sort((left, right) => (left.sort_order ?? 9999) - (right.sort_order ?? 9999) || left.name.localeCompare(right.name, "tr"))
      .slice(0, limit);
    const ratioStyle = ratio === "4/5" ? "4 / 5" : ratio === "1/1" ? "1 / 1" : "16 / 10";

    if (!visibleCollections.length) return null;

    return (
      <section
        data-theme-section-id={section.id}
        data-editor-id={`section:${section.id}`}
        data-editor-type={semanticSectionType(section)}
        data-editor-label={title}
        className="bg-carbon px-4 text-cream md:px-8"
        style={{ paddingTop: paddingY, paddingBottom: paddingY }}
      >
        <div className="mx-auto max-w-[1440px]">
          {(eyebrow || title) ? (
            <div className="mb-10 text-center md:mb-14">
              {eyebrow ? <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.22em] text-brick">{eyebrow}</p> : null}
              {title ? <h2 className="font-heading font-editorial text-[clamp(1.9rem,4vw,3.2rem)] font-normal">{title}</h2> : null}
            </div>
          ) : null}
          <div
            className="v2-collection-card-grid"
            style={{
              ["--collection-columns" as string]: String(columns),
              ["--collection-gap" as string]: `${gap}px`,
            }}
          >
            {visibleCollections.map((collection) => (
              <Link
                key={collection.id}
                href={`/collections/${collection.slug}`}
                className="group block min-w-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brick"
              >
                <div className="overflow-hidden">
                  <div className="relative overflow-hidden rounded-[22px] bg-cream" style={{ aspectRatio: ratioStyle }}>
                    {collection.cover_image_url ? (
                      <img src={collection.cover_image_url} alt={collection.name} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.025]" />
                    ) : (
                      <div className="ruth-card-gradient h-full w-full" />
                    )}
                    {titlePlacement === "overlay" ? (
                      <>
                        <div className="absolute inset-0 bg-gradient-to-t from-ink/55 via-ink/5 to-transparent" />
                        <div className="absolute inset-x-0 bottom-0 p-5 md:p-6">
                          <p className="mb-1 text-[9px] font-medium uppercase tracking-[0.18em] text-cream/80">Koleksiyon</p>
                          <h3 className="font-heading font-editorial text-xl font-normal text-cream md:text-2xl">{collection.name}</h3>
                        </div>
                      </>
                    ) : null}
                  </div>
                  {titlePlacement === "below" ? (
                    <div className="pt-4">
                      <p className="text-[9px] font-medium uppercase tracking-[0.18em] text-brick">Koleksiyon</p>
                      <h3 className="mt-1 font-heading font-editorial text-xl font-normal text-cream md:text-2xl">{collection.name}</h3>
                    </div>
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        </div>
        <style>{`.v2-collection-card-grid{display:grid;grid-template-columns:1fr;gap:var(--collection-gap)}@media(min-width:640px){.v2-collection-card-grid{grid-template-columns:repeat(min(2,var(--collection-columns)),minmax(0,1fr))}}@media(min-width:768px){.v2-collection-card-grid{grid-template-columns:repeat(var(--collection-columns),minmax(0,1fr))}}`}</style>
      </section>
    );
  }

  if (section.type === "collections") return <div data-theme-section-id={section.id} data-editor-id={`section:${section.id}`} data-editor-type={semanticSectionType(section)} data-editor-label={semanticSectionLabel(section)}><CollectionCards collections={collections} /></div>;
  if (section.type === "featured-products" && !hasProductSectionCustomization(section)) return <div data-theme-section-id={section.id} data-editor-id={`section:${section.id}`} data-editor-type={semanticSectionType(section)} data-editor-label={semanticSectionLabel(section)}><FeaturedProducts products={featuredProducts} /></div>;

  const brandV2Settings = section.type === "brand-story" ? section.v2Settings : undefined;
  const customBrandStory = section.type === "brand-story" && brandV2Settings && Object.keys(brandV2Settings).length > 0;
  if (section.type === "brand-story" && customBrandStory) {
    const side = settingText(brandV2Settings, "side") === "right" ? "right" : "left";
    const contentWidthValue = settingText(brandV2Settings, "contentWidth");
    const contentWidth = ["40%", "50%", "60%"].includes(contentWidthValue) ? contentWidthValue : "50%";
    const mediaWidth = contentWidth === "40%" ? "60%" : contentWidth === "60%" ? "40%" : "50%";
    const paddingY = settingNumber(brandV2Settings, "paddingY", 96, 0, 240);
    const title = settingText(brandV2Settings, "title") || "Marka Hikayesi";
    const eyebrow = settingText(brandV2Settings, "eyebrow");
    const body = settingText(brandV2Settings, "body");
    const linkLabel = settingText(brandV2Settings, "linkLabel");
    const linkHref = safeSectionHref(settingText(brandV2Settings, "linkHref"));
    const mediaSrc = section.imageSrc || "/home/rosta-under-hero-photo.jpg";
    const mobileMediaSrc = section.mobileImageSrc || mediaSrc;
    const mediaIsVideo = section.imageSrc ? section.v2MediaType === "video" : isVideoSource(mediaSrc);
    const playback = heroPlayback(brandV2Settings);
    const poster = section.v2PosterUrl;
    const mediaOrderClass = side === "right" ? "md:order-2" : "";
    const contentOrderClass = side === "right" ? "md:order-1" : "";

    return (
      <section
        data-theme-section-id={section.id}
        data-editor-id={`section:${section.id}`}
        data-editor-type={semanticSectionType(section)}
        data-editor-label={title}
        className="bg-carbon-soft px-4 text-cream md:px-8"
        style={{ paddingTop: paddingY, paddingBottom: paddingY }}
      >
        <div className="mx-auto flex max-w-7xl flex-col items-stretch gap-10 md:flex-row md:gap-16">
          <div className={`min-w-0 overflow-hidden rounded-2xl ${mediaOrderClass}`} style={{ flexBasis: mediaWidth }}>
            {mediaIsVideo ? (
              <video
                className="h-full min-h-[360px] w-full object-cover"
                poster={poster}
                autoPlay={playback.autoPlay}
                muted={playback.muted}
                loop={playback.loop}
                controls={playback.controls}
                playsInline
                preload="metadata"
                style={{ objectPosition: section.imageObjectPosition || "50% 50%" }}
              >
                {section.mobileImageSrc ? <source media="(max-width: 767px)" src={mobileMediaSrc} /> : null}
                <source src={mediaSrc} />
              </video>
            ) : (
              <picture className="block h-full min-h-[360px]">
                {section.mobileImageSrc ? <source media="(max-width: 767px)" srcSet={mobileMediaSrc} /> : null}
                <img src={mediaSrc} alt="" className="h-full min-h-[360px] w-full object-cover" style={{ objectPosition: section.imageObjectPosition || "50% 50%" }} />
              </picture>
            )}
          </div>
          <div className={`flex min-w-0 items-center ${contentOrderClass}`} style={{ flexBasis: contentWidth }}>
            <div className="max-w-2xl">
              {eyebrow ? <p className="mb-4 text-xs uppercase tracking-wide-luxe text-brick">{eyebrow}</p> : null}
              {title ? <h2 className="font-heading font-editorial text-[clamp(2rem,5vw,4rem)] leading-tight">{title}</h2> : null}
              {body ? <p className="mt-6 whitespace-pre-wrap leading-8 text-cream/75">{body}</p> : null}
              {linkLabel && linkHref ? (
                <Link href={linkHref} className="mt-8 inline-flex rounded-full border border-kraft/45 px-7 py-3 text-[10px] uppercase tracking-[0.14em] text-cream">
                  {linkLabel}
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (section.type === "brand-story") return <div data-theme-section-id={section.id} data-editor-id={`section:${section.id}`} data-editor-type={semanticSectionType(section)} data-editor-label={semanticSectionLabel(section)}><BrandStory /></div>;
  if (section.type === "trust") return <div data-theme-section-id={section.id} data-editor-id={`section:${section.id}`} data-editor-type={semanticSectionType(section)} data-editor-label={semanticSectionLabel(section)}><TrustSection freeShippingThreshold={freeShippingThreshold} /></div>;

  if (section.type === "product-grid" || ((section.type === "new-arrivals" || section.type === "sale-products") && section.layout === "grid")) {
    const products = productsForSection(section, featuredProducts, allProducts).slice(0, section.productLimit || 12);
    const desktopItems = Math.max(2, Math.min(6, Math.round(section.desktopItems || 3)));
    const mobileItems = Math.max(1, Math.min(2, Math.round(section.mobileItems || 2)));
    const gap = Math.max(0, Math.min(100, Number(section.gap ?? 20)));
    const maxWidth = section.maxWidth && section.maxWidth !== "none" ? section.maxWidth : undefined;

    return (
      <section
        data-theme-section-id={section.id}
        data-editor-id={`section:${section.id}`}
        data-editor-type={semanticSectionType(section)}
        data-editor-label={semanticSectionLabel(section)}
        className="overflow-hidden"
        style={{
          ...saleBadgeVars(section),
          background: section.backgroundColor || "transparent",
          color: section.textColor || "inherit",
          paddingTop: section.paddingY ?? 64,
          paddingBottom: section.paddingY ?? 64,
        }}
      >
        <div className="mx-auto px-4 md:px-8" style={{ maxWidth: maxWidth || "1600px" }}>
          {(section.eyebrow || section.title || section.linkLabel) ? (
            <div className="mb-7 flex items-end justify-between gap-4 md:mb-10">
              <div>
                {section.eyebrow ? <p className="mb-2 text-[9px] uppercase tracking-[0.16em] opacity-60">{section.eyebrow}</p> : null}
                {section.title ? <h2 className="font-heading text-[clamp(1.4rem,2.6vw,2.6rem)] leading-tight">{section.title}</h2> : null}
              </div>
              {section.linkLabel && section.linkHref ? <Link href={section.linkHref} className="text-[9px] uppercase tracking-[0.12em]">{section.linkLabel}</Link> : null}
            </div>
          ) : null}
          <div
            data-editor-id={`product-grid:${section.id}`}
            data-editor-type="product-grid"
            data-editor-label="Ürün Grid'i"
            className="theme-v2-section-product-grid"
            style={{
              ["--section-grid-mobile" as string]: mobileItems,
              ["--section-grid-desktop" as string]: desktopItems,
              ["--section-grid-gap-x" as string]: `${gap}px`,
              ["--section-grid-gap-y" as string]: `${gap}px`,
              ["--section-grid-max-width" as string]: maxWidth || "none",
            }}
          >
            {products.map((product, index) => (
              <ProductCard key={product.id} product={product} index={index} showShortDescription={false} />
            ))}
          </div>
        </div>
        <style>{`.theme-v2-section-product-grid{display:grid;width:100%;max-width:var(--theme-product-grid-max-width,var(--section-grid-max-width));margin-inline:auto;grid-template-columns:repeat(var(--theme-product-grid-columns,var(--section-grid-mobile)),minmax(0,1fr));column-gap:var(--theme-product-grid-gap-x,var(--section-grid-gap-x));row-gap:var(--theme-product-grid-gap-y,var(--section-grid-gap-y))}@media(min-width:768px){.theme-v2-section-product-grid{grid-template-columns:repeat(var(--theme-product-grid-columns,var(--section-grid-desktop)),minmax(0,1fr))}}`}</style>
      </section>
    );
  }

  if (
    section.type === "product-slider"
    || section.type === "featured-products"
    || ((section.type === "new-arrivals" || section.type === "sale-products") && section.layout !== "grid")
  ) {
    const products = productsForSection(section, featuredProducts, allProducts).slice(0, section.productLimit || 12);
    const desktopItems = Math.max(1, Math.round(section.desktopItems || 4));
    const mobileItems = Math.max(1, Math.round(section.mobileItems || 2));
    const gap = section.gap ?? 12;
    const sectionBackground = sanitizeRostaPaletteColor(section.backgroundColor, ROSTA_PALETTE.carbon);
    const darkBackground = sectionBackground === ROSTA_PALETTE.carbon || sectionBackground === ROSTA_PALETTE.carbonSoft || sectionBackground === ROSTA_PALETTE.espresso || sectionBackground === ROSTA_PALETTE.cocoa;
    const sectionText = sanitizeRostaPaletteColor(
      section.textColor,
      darkBackground ? ROSTA_PALETTE.cream : ROSTA_PALETTE.carbon,
    );
    const textVars = section.textColor ? {
      ["--ink" as string]: sectionText,
      ["--gold-dark" as string]: sectionText,
      ["--muted-foreground" as string]: sectionText,
      ["--ruth-color-text-primary" as string]: sectionText,
      ["--ruth-color-text-muted" as string]: sectionText,
    } : {};

    return (
      <section
        data-theme-section-id={section.id} data-editor-id={`section:${section.id}`} data-editor-type={semanticSectionType(section)} data-editor-label={semanticSectionLabel(section)}
        className="theme-config-product-section overflow-hidden"
        style={{
          ...textVars,
          ...saleBadgeVars(section),
          background: sectionBackground,
          color: sectionText,
          paddingTop: section.paddingY ?? 64,
          paddingBottom: section.paddingY ?? 64,
          ["--slider-mobile-height" as string]: `${section.mobileHeight || 0}px`,
          ["--slider-desktop-height" as string]: `${section.desktopHeight || 0}px`,
        }}
      >
        <div className="mx-auto max-w-[1600px]">
          {(section.eyebrow || section.title || section.linkLabel) ? (
            <div className="mb-7 flex items-end justify-between gap-4 px-4 md:mb-10 md:px-8">
              <div>
                {section.eyebrow ? <p data-theme-section-eyebrow className="mb-2 whitespace-pre-wrap text-[9px] uppercase tracking-[0.16em]" style={{ color: section.textColor ? sectionText : ROSTA_PALETTE.brickB }}>{section.eyebrow}</p> : null}
                {section.title ? <h2 data-theme-section-title className="whitespace-pre-wrap font-heading text-[clamp(1.4rem,2.6vw,2.6rem)] leading-tight">{section.title}</h2> : null}
              </div>
              {section.linkLabel && section.linkHref ? <Link data-theme-section-link href={section.linkHref} className="whitespace-pre-wrap text-[9px] uppercase tracking-[0.12em]">{section.linkLabel}</Link> : null}
            </div>
          ) : null}
          <ThemeProductSlider
            products={products}
            desktopItems={desktopItems}
            mobileItems={mobileItems}
            gap={gap}
            showArrows={section.showArrows !== false}
          />
        </div>
        <style>{`.theme-config-product-section{min-height:var(--slider-mobile-height)}@media(min-width:768px){.theme-config-product-section{min-height:var(--slider-desktop-height)}}`}</style>
      </section>
    );
  }

  if (section.type === "image-banner") {
    const sectionBackground = sanitizeRostaPaletteColor(section.backgroundColor, ROSTA_PALETTE.carbon);
    const darkBackground = sectionBackground === ROSTA_PALETTE.carbon || sectionBackground === ROSTA_PALETTE.carbonSoft || sectionBackground === ROSTA_PALETTE.espresso || sectionBackground === ROSTA_PALETTE.cocoa;
    const sectionText = sanitizeRostaPaletteColor(
      section.textColor,
      darkBackground ? ROSTA_PALETTE.cream : ROSTA_PALETTE.carbon,
    );
    return (
      <section
        data-theme-section-id={section.id} data-editor-id={`section:${section.id}`} data-editor-type={semanticSectionType(section)} data-editor-label={semanticSectionLabel(section)}
        className="theme-config-banner relative overflow-hidden"
        style={{
          background: sectionBackground,
          borderRadius: section.borderRadius || 0,
          ["--banner-mobile-height" as string]: `${section.mobileHeight || 360}px`,
          ["--banner-desktop-height" as string]: `${section.desktopHeight || 520}px`,
        }}
      >
        {section.imageSrc ? (
          <StoreDesignResponsiveImage
            assetId={section.imageAssetId}
            src={section.imageSrc}
            mobileAssetId={section.mobileImageAssetId}
            mobileSrc={section.mobileImageSrc}
            objectPosition={section.imageObjectPosition}
            mobileObjectPosition={section.mobileImageObjectPosition}
            alt={section.title || ""}
            className="store-design-responsive-media"
          />
        ) : null}
        <div className="relative z-10 flex h-full items-center justify-center p-8 text-center" style={{ color: sectionText }}>
          <div>
            {section.eyebrow ? <p data-theme-section-eyebrow className="mb-2 whitespace-pre-wrap text-[10px] uppercase tracking-[0.16em]">{section.eyebrow}</p> : null}
            {section.title ? <h2 data-theme-section-title className="whitespace-pre-wrap font-heading font-editorial text-[clamp(1.8rem,4vw,4rem)]">{section.title}</h2> : null}
            {section.body ? <p data-theme-section-body className="mx-auto mt-4 max-w-xl whitespace-pre-wrap text-sm leading-relaxed">{section.body}</p> : null}
            {section.linkLabel && section.linkHref ? <Link data-theme-section-link href={section.linkHref} className="mt-6 inline-flex whitespace-pre-wrap rounded-full border border-current px-5 py-3 text-[10px] uppercase tracking-[0.12em]">{section.linkLabel}</Link> : null}
          </div>
        </div>
        <style>{`.theme-config-banner{height:var(--banner-mobile-height)}@media(min-width:768px){.theme-config-banner{height:var(--banner-desktop-height)}}`}</style>
      </section>
    );
  }

  if (section.type === "rich-text") {
    const sectionBackground = sanitizeRostaPaletteColor(section.backgroundColor, ROSTA_PALETTE.carbon);
    const darkBackground = sectionBackground === ROSTA_PALETTE.carbon || sectionBackground === ROSTA_PALETTE.carbonSoft || sectionBackground === ROSTA_PALETTE.espresso || sectionBackground === ROSTA_PALETTE.cocoa;
    const sectionText = sanitizeRostaPaletteColor(
      section.textColor,
      darkBackground ? ROSTA_PALETTE.cream : ROSTA_PALETTE.carbon,
    );
    return (
      <section
        data-theme-section-id={section.id} data-editor-id={`section:${section.id}`} data-editor-type={semanticSectionType(section)} data-editor-label={semanticSectionLabel(section)}
        className="px-5 text-center md:px-8"
        style={{
          background: sectionBackground,
          color: sectionText,
          paddingTop: section.paddingY ?? 64,
          paddingBottom: section.paddingY ?? 64,
        }}
      >
        <div className="mx-auto max-w-3xl">
          {section.eyebrow ? <p data-theme-section-eyebrow className="mb-3 whitespace-pre-wrap text-[10px] uppercase tracking-[0.16em]">{section.eyebrow}</p> : null}
          {section.title ? <h2 data-theme-section-title className="whitespace-pre-wrap font-heading font-editorial text-[clamp(1.7rem,3vw,3.2rem)]">{section.title}</h2> : null}
          {section.body ? <p data-theme-section-body className="mt-5 whitespace-pre-wrap text-sm leading-7 opacity-80">{section.body}</p> : null}
          {section.linkLabel && section.linkHref ? <Link data-theme-section-link href={section.linkHref} className="mt-6 inline-block whitespace-pre-wrap text-[10px] uppercase tracking-[0.12em] underline underline-offset-4">{section.linkLabel}</Link> : null}
        </div>
      </section>
    );
  }

  if (section.type === "faq") {
    const items = section.faqItems || [];
    return (
      <section
        data-theme-section-id={section.id}
        data-editor-id={`section:${section.id}`}
        data-editor-type={semanticSectionType(section)}
        data-editor-label={semanticSectionLabel(section)}
        className="px-5 md:px-8"
        style={{
          background: section.backgroundColor || "transparent",
          color: section.textColor || "inherit",
          paddingTop: section.paddingY ?? 64,
          paddingBottom: section.paddingY ?? 64,
        }}
      >
        <div className="mx-auto max-w-3xl">
          {section.eyebrow ? <p className="mb-3 text-[10px] uppercase tracking-[0.16em] opacity-60">{section.eyebrow}</p> : null}
          {section.title ? <h2 className="font-heading font-editorial text-[clamp(1.7rem,3vw,3.2rem)]">{section.title}</h2> : null}
          <div className="mt-6 divide-y divide-current/10 border-y border-current/10">
            {items.map((item) => (
              <details
                key={item.id}
                data-editor-id={`block:${item.id}`}
                data-editor-type="faq-item"
                data-editor-label={item.question || "FAQ Öğesi"}
                className="group py-1"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-[13px] font-medium">
                  <span>{item.question}</span>
                  <span aria-hidden="true" className="text-lg font-light transition-transform group-open:rotate-45">+</span>
                </summary>
                {item.answer ? <p className="pb-5 pr-8 text-[12px] leading-6 opacity-65">{item.answer}</p> : null}
              </details>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return null;
}
