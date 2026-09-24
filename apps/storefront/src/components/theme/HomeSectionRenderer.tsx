import Link from "next/link";
import Hero from "@/components/home/Hero";
import ScrollStory from "@/components/home/ScrollStory";
import CollectionCards from "@/components/home/CollectionCards";
import FeaturedProducts from "@/components/home/FeaturedProducts";
import BrandStory from "@/components/home/BrandStory";
import TrustSection from "@/components/home/TrustSection";
import { ThemeProductSlider } from "@/components/theme/ThemeProductSlider";
import type { Collection, Product } from "@/types/site";
import type { HomepageHeroImages } from "@/lib/themeMedia";
import type { ThemeSection } from "@ruth-commerce/commerce-core/theme-sections";
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

function productsForSection(section: ThemeSection, featuredProducts: Product[], allProducts: Product[]) {
  const sourceId = section.productSourceId;

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

export function HomeSectionRenderer({
  section,
  featuredProducts,
  allProducts,
  collections,
  heroImages,
  editorialVideo = "/home/rosta-under-hero-video.mp4",
  editorialImage = "/home/rosta-under-hero-photo.jpg",
  scrollImages,
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
  freeShippingThreshold: number;
}) {
  if (!section.enabled) return null;
  if (section.type === "hero") return <div data-theme-section-id={section.id}><Hero heroImages={heroImages} editorialVideo={editorialVideo} editorialImage={editorialImage} /></div>;
  if (section.type === "scroll-story") return <div data-theme-section-id={section.id}><ScrollStory images={scrollImages} /></div>;
  if (section.type === "collections") return <div data-theme-section-id={section.id}><CollectionCards collections={collections} /></div>;
  if (section.type === "featured-products" && !hasProductSectionCustomization(section)) return <div data-theme-section-id={section.id}><FeaturedProducts products={featuredProducts} /></div>;
  if (section.type === "brand-story") return <div data-theme-section-id={section.id}><BrandStory /></div>;
  if (section.type === "trust") return <div data-theme-section-id={section.id}><TrustSection freeShippingThreshold={freeShippingThreshold} /></div>;

  if (section.type === "product-slider" || section.type === "featured-products") {
    const products = productsForSection(section, featuredProducts, allProducts).slice(0, section.productLimit || 12);
    const desktopItems = Math.max(1, Math.round(section.desktopItems || 4));
    const mobileItems = Math.max(1, Math.round(section.mobileItems || 2));
    const gap = section.gap ?? 12;
    const sectionBackground = sanitizeRostaPaletteColor(section.backgroundColor, ROSTA_PALETTE.bone);
    const darkBackground = sectionBackground === ROSTA_PALETTE.carbon || sectionBackground === ROSTA_PALETTE.espresso;
    const sectionText = sanitizeRostaPaletteColor(
      section.textColor,
      darkBackground ? ROSTA_PALETTE.bone : ROSTA_PALETTE.carbon,
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
        data-theme-section-id={section.id}
        className="theme-config-product-section overflow-hidden"
        style={{
          ...textVars,
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
                {section.eyebrow ? <p data-theme-section-eyebrow className="mb-2 whitespace-pre-wrap text-[9px] uppercase tracking-[0.16em]" style={{ color: section.textColor ? sectionText : ROSTA_PALETTE.espresso }}>{section.eyebrow}</p> : null}
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
    const sectionBackground = sanitizeRostaPaletteColor(section.backgroundColor, ROSTA_PALETTE.bone);
    const darkBackground = sectionBackground === ROSTA_PALETTE.carbon || sectionBackground === ROSTA_PALETTE.espresso;
    const sectionText = sanitizeRostaPaletteColor(
      section.textColor,
      darkBackground ? ROSTA_PALETTE.bone : ROSTA_PALETTE.carbon,
    );
    return (
      <section
        data-theme-section-id={section.id}
        className="theme-config-banner relative overflow-hidden"
        style={{
          background: sectionBackground,
          borderRadius: section.borderRadius || 0,
          ["--banner-mobile-height" as string]: `${section.mobileHeight || 360}px`,
          ["--banner-desktop-height" as string]: `${section.desktopHeight || 520}px`,
        }}
      >
        {section.imageSrc ? <img src={section.imageSrc} alt={section.title || ""} className="absolute inset-0 h-full w-full object-cover" /> : null}
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
    const sectionBackground = sanitizeRostaPaletteColor(section.backgroundColor, ROSTA_PALETTE.bone);
    const darkBackground = sectionBackground === ROSTA_PALETTE.carbon || sectionBackground === ROSTA_PALETTE.espresso;
    const sectionText = sanitizeRostaPaletteColor(
      section.textColor,
      darkBackground ? ROSTA_PALETTE.bone : ROSTA_PALETTE.carbon,
    );
    return (
      <section
        data-theme-section-id={section.id}
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

  return null;
}
