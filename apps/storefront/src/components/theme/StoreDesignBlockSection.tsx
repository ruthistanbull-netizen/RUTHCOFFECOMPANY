import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { ThemeSection } from "@ruth-commerce/commerce-core/theme-sections";
import { normalizeStoreDesignAnchorId } from "@ruth-commerce/commerce-core/store-design-v2";
import { StoreDesignCountdown } from "@/components/theme/StoreDesignCountdown";
import { StoreDesignBeforeAfter } from "@/components/theme/StoreDesignBeforeAfter";
import { StoreDesignSlideshow } from "@/components/theme/StoreDesignSlideshow";
import { StoreDesignContactForm } from "@/components/theme/StoreDesignContactForm";
import { StoreDesignNewsletter } from "@/components/theme/StoreDesignNewsletter";
import { StoreDesignCustomForm } from "@/components/theme/StoreDesignCustomForm";
import { StoreDesignReviewHighlights } from "@/components/theme/StoreDesignReviewHighlights";
import { StoreDesignRewardsPromo } from "@/components/theme/StoreDesignRewardsPromo";

type V2Block = NonNullable<ThemeSection["v2Blocks"]>[number];

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function number(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function href(value: unknown) {
  const raw = text(value).trim();
  if (!raw) return "";
  if (raw.startsWith("/") || raw.startsWith("#")) return raw;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function BlockLink({ value, children, className }: { value: unknown; children: ReactNode; className?: string }) {
  const target = href(value);
  if (!target) return <>{children}</>;
  return <Link href={target} className={className}>{children}</Link>;
}

function media(block: V2Block, className: string) {
  if (!block.assetUrl) return null;
  if (block.assetType === "video") {
    return (
      <video
        src={block.assetUrl}
        poster={block.posterUrl}
        className={className}
        muted
        playsInline
        loop
        autoPlay
      />
    );
  }
  return <img src={block.assetUrl} alt={text(block.settings.alt || block.settings.label || block.settings.name)} className={className} />;
}

function blockSemanticType(type: string) {
  return type;
}

function playbackPolicy(value: unknown) {
  const preset = ["ambient", "once", "controls"].includes(text(value)) ? text(value) : "ambient";
  return {
    preset,
    autoPlay: preset !== "controls",
    muted: preset !== "controls",
    loop: preset === "ambient",
    controls: preset === "controls",
  };
}

function mediaFit(value: unknown): "cover" | "contain" {
  return text(value) === "contain" ? "contain" : "cover";
}

function contentAlign(value: unknown): "left" | "center" | "right" {
  const align = text(value);
  return align === "left" || align === "right" ? align : "center";
}

function contrastMode(value: unknown): "light" | "dark" {
  return text(value) === "dark" ? "dark" : "light";
}

function storeMapHref(address: unknown, city: unknown) {
  const query = [text(address).trim(), text(city).trim()].filter(Boolean).join(", ");
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : "";
}

function storePhoneHref(value: unknown) {
  const normalized = text(value).trim().replace(/[^\d+]/g, "");
  return normalized ? `tel:${normalized}` : "";
}

export function StoreDesignBlockSection({ section }: { section: ThemeSection }) {
  const type = section.v2Type;
  if (!type) return null;

  const settings = section.v2Settings || {};
  const blocks = section.v2Blocks || [];
  const title = text(settings.title || section.title);
  const eyebrow = text(settings.eyebrow || section.eyebrow);
  const paddingY = number(settings.paddingY ?? section.paddingY, 64, 0, 240);
  const columns = Math.round(number(settings.columns, type === "stats" ? 4 : 3, 1, 6));
  const gap = number(settings.gap, 20, 0, 100);
  const style = {
    background: section.backgroundColor || "transparent",
    color: section.textColor || "inherit",
    paddingTop: paddingY,
    paddingBottom: paddingY,
    ["--v2-columns" as string]: String(columns),
    ["--v2-gap" as string]: `${gap}px`,
  } satisfies CSSProperties;

  const heading = title || eyebrow ? (
    <div className="mb-7 md:mb-10">
      {eyebrow ? <p className="mb-2 text-[9px] uppercase tracking-[0.16em] opacity-55">{eyebrow}</p> : null}
      {title ? <h2 className="font-heading text-[clamp(1.5rem,3vw,3rem)] leading-tight">{title}</h2> : null}
    </div>
  ) : null;

  if (type === "newsletter") {
    return (
      <StoreDesignNewsletter
        sectionId={section.id}
        settings={settings}
        backgroundColor={section.backgroundColor}
        textColor={section.textColor}
        paddingY={paddingY}
      />
    );
  }
  if (type === "custom-form") {
    return (
      <StoreDesignCustomForm
        sectionId={section.id}
        settings={settings}
        fields={blocks}
        backgroundColor={section.backgroundColor}
        textColor={section.textColor}
        paddingY={paddingY}
      />
    );
  }
  if (type === "map-locator") {
    const body = text(settings.body);
    const layout = text(settings.layout) === "list" ? "list" : "cards";
    const showMapLinks = settings.showMapLinks !== false;
    const mapLinkLabel = text(settings.mapLinkLabel) || "Haritada Aç";
    const locations = blocks.filter((block) => block.type === "location");
    const gridClass = layout === "list"
      ? "grid gap-3"
      : "grid gap-4 md:grid-cols-2 xl:grid-cols-3";

    return (
      <section
        data-theme-section-id={section.id}
        data-editor-id={`section:${section.id}`}
        data-editor-type="map-locator"
        data-editor-label={title || "Map / Store Locator"}
        className="px-5 md:px-8"
        style={style}
      >
        <div className="mx-auto max-w-[1440px]">
          <div className="mb-8 max-w-3xl md:mb-10">
            {title ? <h2 className="font-heading text-[clamp(1.8rem,4vw,4rem)] leading-[0.98]">{title}</h2> : null}
            {body ? <p className="mt-4 whitespace-pre-wrap text-sm leading-7 opacity-70">{body}</p> : null}
          </div>

          <div className={gridClass}>
            {locations.map((block) => {
              const name = text(block.settings.name);
              const address = text(block.settings.address);
              const city = text(block.settings.city);
              const phone = text(block.settings.phone);
              const hours = text(block.settings.hours);
              const mapHref = showMapLinks ? storeMapHref(address, city) : "";
              const phoneHref = storePhoneHref(phone);

              return (
                <article
                  key={block.id}
                  data-editor-id={`block:${block.id}`}
                  data-editor-type="location"
                  data-editor-label={name || "Konum"}
                  className={layout === "list"
                    ? "grid gap-4 border-b border-current/10 py-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end"
                    : "rounded-2xl border border-current/10 p-5 md:p-6"}
                >
                  <div className="min-w-0">
                    {name ? <h3 className="font-heading text-xl leading-tight">{name}</h3> : null}
                    {address || city ? (
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 opacity-72">
                        {[address, city].filter(Boolean).join(", ")}
                      </p>
                    ) : null}
                    {hours ? <p className="mt-3 whitespace-pre-wrap text-xs leading-5 opacity-58">{hours}</p> : null}
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2 md:mt-0">
                    {phone && phoneHref ? (
                      <a href={phoneHref} className="inline-flex min-h-10 items-center rounded-full border border-current/20 px-4 text-[9px] font-semibold uppercase tracking-[0.12em]">
                        {phone}
                      </a>
                    ) : null}
                    {mapHref ? (
                      <a
                        href={mapHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-10 items-center rounded-full border border-current/20 px-4 text-[9px] font-semibold uppercase tracking-[0.12em]"
                      >
                        {mapLinkLabel}
                      </a>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>

          {!locations.length ? (
            <p className="rounded-2xl border border-current/10 p-5 text-sm opacity-55">
              Henüz konum eklenmedi.
            </p>
          ) : null}
        </div>
      </section>
    );
  }
  if (type === "contact-form") {
    return (
      <StoreDesignContactForm
        sectionId={section.id}
        settings={settings}
        backgroundColor={section.backgroundColor}
        textColor={section.textColor}
        paddingY={paddingY}
      />
    );
  }
  if (type === "review-highlights") {
    return (
      <StoreDesignReviewHighlights
        sectionId={section.id}
        settings={settings}
        backgroundColor={section.backgroundColor}
        textColor={section.textColor}
        paddingY={paddingY}
      />
    );
  }
  if (type === "rewards-promo") {
    return (
      <StoreDesignRewardsPromo
        sectionId={section.id}
        settings={settings}
        desktopSrc={section.imageSrc}
        mobileSrc={section.mobileImageSrc}
        mediaType={section.v2MediaType}
        posterUrl={section.v2PosterUrl}
        desktopPosition={section.imageObjectPosition}
        mobilePosition={section.mobileImageObjectPosition}
        backgroundColor={section.backgroundColor}
        textColor={section.textColor}
        paddingY={paddingY}
      />
    );
  }



  if (type === "video-hero" || type === "video-banner") {
    if (!section.imageSrc || section.v2MediaType !== "video") return null;

    const playback = playbackPolicy(settings.playbackPreset);
    const fit = mediaFit(settings.fit);
    const align = contentAlign(settings.align);
    const contrast = contrastMode(settings.contrastMode);
    const overlay = number(settings.overlayOpacity, type === "video-hero" ? 32 : 28, 0, 80) / 100;
    const posterUrl = section.v2Assets?.posterAssetId?.url || section.v2PosterUrl;
    const body = text(settings.body);
    const ctaLabel = text(settings.linkLabel);
    const ctaHref = href(settings.linkHref);
    const heightPreset = text(settings.heightPreset);
    const height = type === "video-hero"
      ? heightPreset === "medium"
        ? "620px"
        : heightPreset === "tall"
          ? "760px"
          : "100svh"
      : heightPreset === "compact"
        ? "360px"
        : heightPreset === "tall"
          ? "620px"
          : "480px";
    const contentClass = align === "left"
      ? "items-start text-left"
      : align === "right"
        ? "items-end text-right"
        : "items-center text-center";

    return (
      <section
        data-theme-section-id={section.id}
        data-editor-id={`section:${section.id}`}
        data-editor-type={type}
        data-editor-label={title || (type === "video-hero" ? "Video Hero" : "Video Banner")}
        className="relative isolate overflow-hidden"
        style={{ minHeight: height, color: contrast === "light" ? "#fff" : "#111" }}
      >
        <video
          className="v2-media-narrative-media absolute inset-0 h-full w-full"
          poster={posterUrl}
          autoPlay={playback.autoPlay}
          muted={playback.muted}
          loop={playback.loop}
          controls={playback.controls}
          playsInline
          preload="metadata"
          style={{
            objectFit: fit,
            ["--v2-media-pos-desktop" as string]: section.imageObjectPosition || "50% 50%",
            ["--v2-media-pos-mobile" as string]: section.mobileImageObjectPosition || section.imageObjectPosition || "50% 50%",
          }}
        >
          {section.mobileImageSrc ? <source media="(max-width: 767px)" src={section.mobileImageSrc} /> : null}
          <source src={section.imageSrc} />
        </video>
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: contrast === "light" ? `rgba(0,0,0,${overlay})` : `rgba(255,255,255,${overlay})` }}
        />
        <div className={`relative z-10 mx-auto flex min-h-[inherit] w-full max-w-[1600px] flex-col justify-center px-6 py-12 md:px-10 ${contentClass}`}>
          <div className="max-w-3xl">
            {title ? <h2 className="font-heading text-[clamp(2rem,5vw,5.5rem)] leading-[0.98]">{title}</h2> : null}
            {body ? <p className="mt-5 whitespace-pre-wrap text-sm leading-7 opacity-90 md:text-base">{body}</p> : null}
            {ctaLabel && ctaHref ? (
              <Link href={ctaHref} className="mt-7 inline-flex min-h-11 items-center justify-center border border-current px-5 text-[10px] uppercase tracking-[0.14em]">
                {ctaLabel}
              </Link>
            ) : null}
          </div>
        </div>
        <style>{`.v2-media-narrative-media{object-position:var(--v2-media-pos-mobile)}@media(min-width:768px){.v2-media-narrative-media{object-position:var(--v2-media-pos-desktop)}}`}</style>
      </section>
    );
  }

  if (type === "background-media") {
    if (!section.imageSrc) return null;

    const block = blocks[0];
    const playback = playbackPolicy(settings.playbackPreset);
    const fit = mediaFit(settings.fit);
    const contrast = contrastMode(settings.contrastMode);
    const overlay = number(settings.overlayOpacity, 36, 0, 80) / 100;
    const heightPreset = text(settings.minHeightPreset);
    const minHeight = heightPreset === "compact"
      ? "360px"
      : heightPreset === "tall"
        ? "680px"
        : heightPreset === "viewport"
          ? "100svh"
          : "520px";
    const posterUrl = section.v2Assets?.posterAssetId?.url || section.v2PosterUrl;
    const blockAlign = contentAlign(block?.settings.align);
    const maxWidthValue = text(block?.settings.maxWidth);
    const maxWidth = ["640px", "800px", "960px"].includes(maxWidthValue) ? maxWidthValue : "800px";
    const blockHeading = text(block?.settings.heading);
    const blockEyebrow = text(block?.settings.eyebrow);
    const blockBody = text(block?.settings.body);
    const blockLinkLabel = text(block?.settings.linkLabel);
    const blockLinkHref = href(block?.settings.linkHref);
    const contentClass = blockAlign === "left"
      ? "items-start text-left"
      : blockAlign === "right"
        ? "items-end text-right"
        : "items-center text-center";

    return (
      <section
        data-theme-section-id={section.id}
        data-editor-id={`section:${section.id}`}
        data-editor-type="background-media"
        data-editor-label={blockHeading || "Background Media"}
        className="relative isolate overflow-hidden"
        style={{ minHeight, color: contrast === "light" ? "#fff" : "#111" }}
      >
        {section.v2MediaType === "video" ? (
          <video
            className="v2-media-narrative-media absolute inset-0 h-full w-full"
            poster={posterUrl}
            autoPlay={playback.autoPlay}
            muted={playback.muted}
            loop={playback.loop}
            controls={playback.controls}
            playsInline
            preload="metadata"
            style={{
              objectFit: fit,
              ["--v2-media-pos-desktop" as string]: section.imageObjectPosition || "50% 50%",
              ["--v2-media-pos-mobile" as string]: section.mobileImageObjectPosition || section.imageObjectPosition || "50% 50%",
            }}
          >
            {section.mobileImageSrc ? <source media="(max-width: 767px)" src={section.mobileImageSrc} /> : null}
            <source src={section.imageSrc} />
          </video>
        ) : (
          <picture>
            {section.mobileImageSrc ? <source media="(max-width: 767px)" srcSet={section.mobileImageSrc} /> : null}
            <img
              src={section.imageSrc}
              alt=""
              className="v2-media-narrative-media absolute inset-0 h-full w-full"
              style={{
                objectFit: fit,
                ["--v2-media-pos-desktop" as string]: section.imageObjectPosition || "50% 50%",
                ["--v2-media-pos-mobile" as string]: section.mobileImageObjectPosition || section.imageObjectPosition || "50% 50%",
              }}
            />
          </picture>
        )}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: contrast === "light" ? `rgba(0,0,0,${overlay})` : `rgba(255,255,255,${overlay})` }}
        />
        <div className={`relative z-10 mx-auto flex min-h-[inherit] w-full max-w-[1600px] flex-col justify-center px-6 py-12 md:px-10 ${contentClass}`}>
          {block ? (
            <div
              data-editor-id={`block:${block.id}`}
              data-editor-type="content"
              data-editor-label={blockHeading || "İçerik"}
              style={{ maxWidth }}
            >
              {blockEyebrow ? <p className="mb-3 text-[9px] uppercase tracking-[0.16em] opacity-75">{blockEyebrow}</p> : null}
              {blockHeading ? <h2 className="font-heading text-[clamp(1.9rem,4vw,4.5rem)] leading-tight">{blockHeading}</h2> : null}
              {blockBody ? <p className="mt-5 whitespace-pre-wrap text-sm leading-7 opacity-90 md:text-base">{blockBody}</p> : null}
              {blockLinkLabel && blockLinkHref ? (
                <Link href={blockLinkHref} className="mt-7 inline-flex min-h-11 items-center justify-center border border-current px-5 text-[10px] uppercase tracking-[0.14em]">
                  {blockLinkLabel}
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
        <style>{`.v2-media-narrative-media{object-position:var(--v2-media-pos-mobile)}@media(min-width:768px){.v2-media-narrative-media{object-position:var(--v2-media-pos-desktop)}}`}</style>
      </section>
    );
  }

  if (type === "grid-stack-builder") {
    const gridColumns = Math.round(number(settings.columns, 2, 1, 4));
    const gridGap = number(settings.gap, 20, 0, 64);
    const alignment = ["start", "center", "stretch"].includes(text(settings.alignment))
      ? text(settings.alignment)
      : "stretch";
    const responsiveStack = settings.responsiveStack !== false;
    const mobileColumns = responsiveStack ? 1 : Math.min(2, gridColumns);
    const alignItems = alignment === "start" ? "start" : alignment === "center" ? "center" : "stretch";

    return (
      <section
        data-theme-section-id={section.id}
        data-editor-id={`section:${section.id}`}
        data-editor-type="grid-stack-builder"
        data-editor-label="Grid / Stack Builder"
        className="px-5 md:px-8"
        style={{
          ...style,
          ["--v2-grid-columns" as string]: String(gridColumns),
          ["--v2-grid-mobile-columns" as string]: String(mobileColumns),
          ["--v2-grid-gap" as string]: `${gridGap}px`,
          ["--v2-grid-align" as string]: alignItems,
        }}
      >
        <div className="v2-safe-grid mx-auto max-w-[1440px]">
          {blocks.map((block) => {
            const blockHeading = text(block.settings.heading);
            const blockEyebrow = text(block.settings.eyebrow);
            const blockBody = text(block.settings.body);
            const blockLinkLabel = text(block.settings.linkLabel);
            const blockLinkHref = href(block.settings.linkHref);
            const blockAlign = contentAlign(block.settings.align);
            const maxWidthValue = text(block.settings.maxWidth);
            const maxWidth = ["640px", "800px", "960px"].includes(maxWidthValue) ? maxWidthValue : "800px";
            const textAlign = blockAlign === "left" ? "left" : blockAlign === "right" ? "right" : "center";

            return (
              <article
                key={block.id}
                data-editor-id={`block:${block.id}`}
                data-editor-type="content"
                data-editor-label={blockHeading || "İçerik"}
                className="min-w-0 rounded-2xl border border-current/10 p-5 md:p-6"
                style={{ textAlign }}
              >
                <div style={{ maxWidth, marginInline: blockAlign === "center" ? "auto" : undefined }}>
                  {blockEyebrow ? <p className="mb-3 text-[9px] uppercase tracking-[0.16em] opacity-55">{blockEyebrow}</p> : null}
                  {blockHeading ? <h3 className="font-heading text-[clamp(1.3rem,2.5vw,2.2rem)] leading-tight">{blockHeading}</h3> : null}
                  {blockBody ? <p className="mt-4 whitespace-pre-wrap text-sm leading-7 opacity-70">{blockBody}</p> : null}
                  {blockLinkLabel && blockLinkHref ? (
                    <Link href={blockLinkHref} className="mt-5 inline-flex min-h-10 items-center justify-center rounded-full border border-current/25 px-4 text-[9px] font-semibold uppercase tracking-[0.12em]">
                      {blockLinkLabel}
                    </Link>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
        <style>{`.v2-safe-grid{display:grid;grid-template-columns:repeat(var(--v2-grid-mobile-columns),minmax(0,1fr));gap:var(--v2-grid-gap);align-items:var(--v2-grid-align)}@media(min-width:768px){.v2-safe-grid{grid-template-columns:repeat(var(--v2-grid-columns),minmax(0,1fr))}}`}</style>
      </section>
    );
  }

  if (type === "text-columns") {
    return (
      <section data-theme-section-id={section.id} data-editor-id={`section:${section.id}`} data-editor-type="text-columns" data-editor-label={title || "Metin Kolonları"} className="px-5 md:px-8" style={style}>
        <div className="mx-auto max-w-[1440px]">
          {heading}
          <div className="v2-block-grid">
            {blocks.map((block) => (
              <article key={block.id} data-editor-id={`block:${block.id}`} data-editor-type={blockSemanticType(block.type)} data-editor-label={text(block.settings.heading) || "Metin Kolonu"} className="min-w-0">
                {text(block.settings.heading) ? <h3 className="font-heading text-lg">{text(block.settings.heading)}</h3> : null}
                {text(block.settings.body) ? <p className="mt-3 whitespace-pre-wrap text-sm leading-7 opacity-70">{text(block.settings.body)}</p> : null}
              </article>
            ))}
          </div>
        </div>
        <style>{`.v2-block-grid{display:grid;grid-template-columns:1fr;gap:var(--v2-gap)}@media(min-width:768px){.v2-block-grid{grid-template-columns:repeat(var(--v2-columns),minmax(0,1fr))}}`}</style>
      </section>
    );
  }

  if (type === "stats") {
    return (
      <section data-theme-section-id={section.id} data-editor-id={`section:${section.id}`} data-editor-type="stats" data-editor-label={title || "İstatistikler"} className="px-5 md:px-8" style={style}>
        <div className="mx-auto max-w-[1440px]">
          {heading}
          <div className="v2-block-grid">
            {blocks.map((block) => (
              <div key={block.id} data-editor-id={`block:${block.id}`} data-editor-type={blockSemanticType(block.type)} data-editor-label={text(block.settings.label) || "İstatistik"} className="border-t border-current/15 pt-4">
                <p className="font-heading text-[clamp(1.8rem,4vw,4rem)] leading-none">{text(block.settings.value)}</p>
                {text(block.settings.label) ? <p className="mt-3 text-xs uppercase tracking-[0.12em] opacity-55">{text(block.settings.label)}</p> : null}
              </div>
            ))}
          </div>
        </div>
        <style>{`.v2-block-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--v2-gap)}@media(min-width:768px){.v2-block-grid{grid-template-columns:repeat(var(--v2-columns),minmax(0,1fr))}}`}</style>
      </section>
    );
  }

  if (type === "timeline") {
    return (
      <section data-theme-section-id={section.id} data-editor-id={`section:${section.id}`} data-editor-type="timeline" data-editor-label={title || "Timeline"} className="px-5 md:px-8" style={style}>
        <div className="mx-auto max-w-4xl">
          {heading}
          <div className={text(settings.orientation) === "horizontal" ? "flex snap-x gap-5 overflow-x-auto pb-4" : "border-l border-current/15 pl-5 md:pl-8"}>
            {blocks.map((block) => (
              <article
                key={block.id}
                data-editor-id={`block:${block.id}`}
                data-editor-type={blockSemanticType(block.type)}
                data-editor-label={text(block.settings.heading) || text(block.settings.date) || "Timeline Öğesi"}
                className={text(settings.orientation) === "horizontal" ? "min-w-[78%] snap-start rounded-xl border border-current/10 p-5 md:min-w-[38%]" : "relative pb-10 last:pb-0"}
              >
                {text(settings.orientation) === "horizontal" ? null : <span className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full bg-current md:-left-[37px]" />}
                {text(block.settings.date) ? <p className="text-[9px] uppercase tracking-[0.14em] opacity-50">{text(block.settings.date)}</p> : null}
                {text(block.settings.heading) ? <h3 className="mt-2 font-heading text-xl">{text(block.settings.heading)}</h3> : null}
                {text(block.settings.body) ? <p className="mt-3 whitespace-pre-wrap text-sm leading-7 opacity-70">{text(block.settings.body)}</p> : null}
              </article>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (type === "feature-grid" || type === "trust-badges") {
    return (
      <section data-theme-section-id={section.id} data-editor-id={`section:${section.id}`} data-editor-type={type} data-editor-label={title || (type === "trust-badges" ? "Trust Badges" : "Feature Grid")} className="px-5 md:px-8" style={style}>
        <div className="mx-auto max-w-[1440px]">
          {heading}
          <div className="v2-block-grid">
            {blocks.map((block) => (
              <article key={block.id} data-editor-id={`block:${block.id}`} data-editor-type={blockSemanticType(block.type)} data-editor-label={text(block.settings.heading) || "Özellik"} className="rounded-2xl border border-current/10 p-5">
                {text(block.settings.icon) ? <div className="mb-4 text-xl" aria-hidden="true">{text(block.settings.icon)}</div> : null}
                {text(block.settings.heading) ? <h3 className="font-heading text-lg">{text(block.settings.heading)}</h3> : null}
                {text(block.settings.body) ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 opacity-65">{text(block.settings.body)}</p> : null}
              </article>
            ))}
          </div>
        </div>
        <style>{`.v2-block-grid{display:grid;grid-template-columns:1fr;gap:var(--v2-gap)}@media(min-width:640px){.v2-block-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(min-width:1024px){.v2-block-grid{grid-template-columns:repeat(var(--v2-columns),minmax(0,1fr))}}`}</style>
      </section>
    );
  }

  if (type === "testimonials") {
    return (
      <section data-theme-section-id={section.id} data-editor-id={`section:${section.id}`} data-editor-type="testimonials" data-editor-label={title || "Testimonials"} className="px-5 md:px-8" style={style}>
        <div className="mx-auto max-w-[1440px]">
          {heading}
          <div className="v2-block-grid">
            {blocks.map((block) => (
              <blockquote key={block.id} data-editor-id={`block:${block.id}`} data-editor-type={blockSemanticType(block.type)} data-editor-label={text(block.settings.name) || "Müşteri Yorumu"} className="rounded-2xl border border-current/10 p-6">
                <p className="font-heading text-lg leading-7">“{text(block.settings.quote)}”</p>
                {(text(block.settings.name) || text(block.settings.meta)) ? <footer className="mt-5 text-xs opacity-55">{text(block.settings.name)}{text(block.settings.meta) ? ` · ${text(block.settings.meta)}` : ""}</footer> : null}
              </blockquote>
            ))}
          </div>
        </div>
        <style>{`.v2-block-grid{display:grid;grid-template-columns:1fr;gap:var(--v2-gap)}@media(min-width:768px){.v2-block-grid{grid-template-columns:repeat(var(--v2-columns),minmax(0,1fr))}}`}</style>
      </section>
    );
  }

  if (type === "tabs") {
    return (
      <section data-theme-section-id={section.id} data-editor-id={`section:${section.id}`} data-editor-type="tabs" data-editor-label={title || "Sekmeler"} className="px-5 md:px-8" style={style}>
        <div className="mx-auto max-w-4xl">
          {heading}
          <div className="divide-y divide-current/10 border-y border-current/10">
            {blocks.map((block, index) => (
              <details key={block.id} open={index === 0 ? true : undefined} data-editor-id={`block:${block.id}`} data-editor-type={blockSemanticType(block.type)} data-editor-label={text(block.settings.label) || "Sekme"}>
                <summary className="cursor-pointer list-none py-4 text-sm font-medium">{text(block.settings.label) || `Sekme ${index + 1}`}</summary>
                {text(block.settings.body) ? <p className="pb-5 whitespace-pre-wrap text-sm leading-7 opacity-70">{text(block.settings.body)}</p> : null}
              </details>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (type === "gallery-grid" || type === "masonry-gallery" || type === "collage" || type === "social-grid" || type === "logo-cloud" || type === "press-awards" || type === "team") {
    return (
      <section data-theme-section-id={section.id} data-editor-id={`section:${section.id}`} data-editor-type={type} data-editor-label={title || type.replace(/-/g, " ")} className="px-5 md:px-8" style={style}>
        <div className="mx-auto max-w-[1440px]">
          {heading}
          <div className={type === "masonry-gallery" ? "v2-media-grid v2-masonry-grid" : type === "collage" ? "v2-media-grid v2-collage-grid" : "v2-media-grid"}>
            {blocks.map((block) => {
              const label = text(block.settings.label || block.settings.name || block.settings.alt);
              const content = (
                <article className="min-w-0">
                  {media(block, type === "logo-cloud" ? "h-20 w-full object-contain" : "aspect-[4/5] w-full rounded-xl object-cover")}
                  {label ? <h3 className="mt-3 font-heading text-base">{label}</h3> : null}
                  {text(block.settings.role) ? <p className="mt-1 text-xs opacity-55">{text(block.settings.role)}</p> : null}
                  {text(block.settings.bio) ? <p className="mt-2 text-sm leading-6 opacity-65">{text(block.settings.bio)}</p> : null}
                </article>
              );
              return (
                <div key={block.id} data-editor-id={`block:${block.id}`} data-editor-type={blockSemanticType(block.type)} data-editor-label={label || block.type}>
                  <BlockLink value={block.settings.link} className="block">{content}</BlockLink>
                </div>
              );
            })}
          </div>
        </div>
        <style>{`.v2-media-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--v2-gap)}.v2-collage-grid>*:first-child{grid-column:span 2}.v2-masonry-grid{display:block;columns:2;column-gap:var(--v2-gap)}.v2-masonry-grid>*{break-inside:avoid;margin-bottom:var(--v2-gap)}@media(min-width:768px){.v2-media-grid{grid-template-columns:repeat(var(--v2-columns),minmax(0,1fr))}.v2-masonry-grid{display:block;columns:var(--v2-columns)}}`}</style>
      </section>
    );
  }

  if (type === "before-after") {
    const before = section.v2Assets?.beforeAssetId;
    const after = section.v2Assets?.afterAssetId;
    if (!before?.url || !after?.url) return null;

    return (
      <section
        data-theme-section-id={section.id}
        data-editor-id={`section:${section.id}`}
        data-editor-type="before-after"
        data-editor-label={title || "Before / After"}
        className="px-5 md:px-8"
        style={style}
      >
        <div className="mx-auto max-w-[1200px]">
          {heading}
          <StoreDesignBeforeAfter
            beforeUrl={before.url}
            afterUrl={after.url}
            beforeLabel={text(settings.beforeLabel) || "Önce"}
            afterLabel={text(settings.afterLabel) || "Sonra"}
            initialPosition={number(settings.divider, 50, 10, 90)}
          />
        </div>
      </section>
    );
  }

  if (type === "hotspot-lookbook") {
    if (!section.imageSrc) return null;
    return (
      <section
        data-theme-section-id={section.id}
        data-editor-id={`section:${section.id}`}
        data-editor-type="hotspot-lookbook"
        data-editor-label={title || "Hotspot / Lookbook"}
        className="px-5 md:px-8"
        style={style}
      >
        <div className="mx-auto max-w-[1200px]">
          {heading}
          <div className="relative overflow-hidden rounded-2xl">
            <img src={section.imageSrc} alt={title || "Lookbook"} className="block h-auto w-full object-cover" />
            {blocks.map((block, index) => {
              const x = number(block.settings.x, 50, 0, 100);
              const y = number(block.settings.y, 50, 0, 100);
              const target = block.settings.targetId;
              const targetHref = href(target);
              const label = text(block.settings.label) || `Hotspot ${index + 1}`;
              const marker = (
                <span
                  data-editor-id={`block:${block.id}`}
                  data-editor-type="hotspot"
                  data-editor-label={label}
                  className="grid h-8 w-8 place-items-center rounded-full border border-white/70 bg-black/65 text-[10px] font-semibold text-white shadow-lg backdrop-blur-sm transition-transform hover:scale-110"
                  title={label}
                >
                  {index + 1}
                </span>
              );
              return (
                <div key={block.id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%` }}>
                  {targetHref ? <Link href={targetHref} aria-label={label}>{marker}</Link> : marker}
                </div>
              );
            })}
          </div>
        </div>
      </section>
    );
  }

  if (type === "image-text-split" || type === "video-text-split") {
    const block = blocks[0];
    const heading = block ? text(block.settings.heading) : title;
    const body = block ? text(block.settings.body) : text(settings.body);
    const ctaHref = block?.settings.cta || settings.linkHref;
    const ctaLabel = text(settings.ctaLabel || settings.linkLabel) || "Keşfet";
    const side = text(settings.side) === "right" ? "right" : "left";
    const contentWidth = ["40%", "50%", "60%"].includes(text(settings.contentWidth)) ? text(settings.contentWidth) : "50%";
    const mediaWidth = contentWidth === "40%" ? "60%" : contentWidth === "60%" ? "40%" : "50%";
    const ratio = ["1/1", "4/5", "3/4", "16/9", "auto"].includes(text(settings.ratio)) ? text(settings.ratio) : "4/5";
    const fit = text(settings.fit) === "contain" ? "contain" : "cover";
    const playback = ["ambient", "once", "controls"].includes(text(settings.playbackPreset)) ? text(settings.playbackPreset) : "ambient";
    const mediaStyle: CSSProperties = {
      objectFit: fit,
      objectPosition: section.imageObjectPosition || "50% 50%",
    };
    const mediaNode = section.imageSrc
      ? section.v2MediaType === "video"
        ? (
            <video
              src={section.imageSrc}
              poster={section.v2PosterUrl}
              className="h-full w-full"
              style={mediaStyle}
              muted={playback !== "controls"}
              playsInline
              loop={playback === "ambient"}
              autoPlay={playback !== "controls"}
              controls={playback === "controls"}
            />
          )
        : <img src={section.imageSrc} alt={heading} className="h-full w-full" style={mediaStyle} />
      : <div className="grid min-h-64 place-items-center bg-black/[0.04] text-[10px] opacity-40">Medya seçilmedi</div>;

    return (
      <section
        data-theme-section-id={section.id}
        data-editor-id={`section:${section.id}`}
        data-editor-type={type}
        data-editor-label={heading || type.replace(/-/g, " ")}
        className="px-5 md:px-8"
        style={style}
      >
        <div className="mx-auto flex max-w-[1440px] flex-col overflow-hidden rounded-2xl border border-current/10 md:flex-row">
          <div
            className={side === "right" ? "md:order-2" : ""}
            style={{
              ["--split-media-width" as string]: mediaWidth,
              flexBasis: "var(--split-media-width)",
              ...(ratio === "auto" ? {} : { aspectRatio: ratio.replace("/", " / ") }),
            }}
          >
            {mediaNode}
          </div>
          <div className={`flex flex-1 items-center p-7 md:p-12 ${side === "right" ? "md:order-1" : ""}`} style={{ ["--split-content-width" as string]: contentWidth, flexBasis: "var(--split-content-width)" }}>
            <div>
              {heading ? <h2 className="font-heading text-[clamp(1.7rem,3vw,3rem)] leading-tight">{heading}</h2> : null}
              {body ? <p className="mt-4 whitespace-pre-wrap text-sm leading-7 opacity-70">{body}</p> : null}
              {href(ctaHref) ? <Link href={href(ctaHref)} className="mt-6 inline-flex rounded-full border border-current px-5 py-3 text-[10px] uppercase tracking-[0.12em]">{ctaLabel}</Link> : null}
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (type === "slideshow") {
    const transition = text(settings.transition) === "fade" ? "fade" : "slide";
    const slides = blocks.map((block) => ({
      id: block.id,
      title: text(block.settings.title),
      body: text(block.settings.body),
      url: block.assetUrl,
      type: block.assetType,
      posterUrl: block.posterUrl,
      ctaHref: href(block.settings.cta),
      ctaLabel: text(block.settings.ctaLabel) || "Keşfet",
    }));
    return (
      <section
        data-theme-section-id={section.id}
        data-editor-id={`section:${section.id}`}
        data-editor-type="slideshow"
        data-editor-label={title || "Slideshow"}
        className="px-5 md:px-8"
        style={style}
      >
        <div className="mx-auto max-w-[1600px]">
          {heading}
          <StoreDesignSlideshow
            slides={slides}
            autoplay={settings.autoplay === true}
            transition={transition}
            intervalMs={number(settings.intervalMs, 5000, 2500, 15000)}
          />
        </div>
      </section>
    );
  }

  if (type === "announcement-bar" || type === "marquee") {
    return (
      <section data-theme-section-id={section.id} data-editor-id={`section:${section.id}`} data-editor-type={type === "announcement-bar" ? "announcement-section" : type} data-editor-label={title || (type === "marquee" ? "Marquee" : "Announcement Bar")} className="overflow-hidden border-y border-current/10 py-3" style={{ background: section.backgroundColor || "transparent", color: section.textColor || "inherit", ["--marquee-duration" as string]: `${Math.max(8, Math.min(80, number(settings.speed, 24, 8, 80)))}s` }}>
        <div className={type === "marquee" ? `v2-marquee-track flex min-w-max items-center gap-10 px-5 ${settings.pause === true ? "v2-marquee-paused" : ""}` : "flex min-w-max items-center gap-10 px-5"}>
          {blocks.map((block) => {
            const label = text(block.settings.text);
            return (
              <BlockLink key={block.id} value={block.settings.linkHref || block.settings.link} className="text-[11px] uppercase tracking-[0.12em]">
                <span data-editor-id={`block:${block.id}`} data-editor-type={blockSemanticType(block.type)} data-editor-label={label || "Duyuru"}>{label}{text(block.settings.linkLabel) ? ` · ${text(block.settings.linkLabel)}` : ""}</span>
              </BlockLink>
            );
          })}
        </div>
        {type === "marquee" ? <style>{`@keyframes v2MarqueeMove{from{transform:translateX(0)}to{transform:translateX(-25%)}}.v2-marquee-track{animation:v2MarqueeMove var(--marquee-duration) linear infinite}.v2-marquee-paused{animation-play-state:paused}@media(prefers-reduced-motion:reduce){.v2-marquee-track{animation:none}}`}</style> : null}
      </section>
    );
  }

  if (type === "heading-subtext" || type === "manifesto" || type === "quote" || type === "promo-banner" || type === "shipping-returns-cta") {
    const body = text(settings.body || settings.copy || settings.quote);
    const attribution = text(settings.attribution);
    const icon = text(settings.icon);
    const ctaLabel = text(settings.linkLabel || settings.ctaLabel);
    const ctaHref = settings.linkHref || settings.link || settings.cta;
    const align = ["left", "center", "right"].includes(text(settings.align)) ? text(settings.align) : "center";
    const allowedWidths = ["640px", "800px", "900px", "1100px"];
    const maxWidthValue = text(settings.maxWidth);
    const maxWidth = allowedWidths.includes(maxWidthValue) ? maxWidthValue : (type === "manifesto" ? "900px" : "1100px");
    const role = ["h1", "h2", "h3", "h4"].includes(text(settings.role)) ? text(settings.role) : "h2";
    const HeadingTag = role as "h1" | "h2" | "h3" | "h4";
    const size = ["sm", "md", "lg", "xl"].includes(text(settings.size)) ? text(settings.size) : "lg";
    const headingSizeClass = size === "sm"
      ? "text-[clamp(1.35rem,2.4vw,2.2rem)]"
      : size === "md"
        ? "text-[clamp(1.6rem,3vw,3rem)]"
        : size === "xl"
          ? "text-[clamp(2.2rem,6vw,6rem)]"
          : "text-[clamp(1.9rem,4vw,4rem)]";
    const typography = ["display", "editorial", "compact"].includes(text(settings.typography)) ? text(settings.typography) : "display";
    const manifestoTitleClass = typography === "compact"
      ? "text-[clamp(1.6rem,3vw,3rem)] leading-tight"
      : typography === "editorial"
        ? "text-[clamp(1.9rem,4.5vw,4.6rem)] leading-[1.02]"
        : "text-[clamp(2.2rem,6vw,6rem)] leading-[0.95] tracking-[-0.03em]";
    const titleClass = type === "heading-subtext"
      ? `font-heading ${headingSizeClass} leading-tight`
      : type === "manifesto"
        ? `font-heading ${manifestoTitleClass}`
        : "font-heading text-[clamp(1.7rem,4vw,4rem)] leading-tight";
    const bodyClass = type === "manifesto"
      ? "mt-6 whitespace-pre-wrap text-[clamp(1rem,1.8vw,1.35rem)] leading-8 opacity-78"
      : "mt-5 whitespace-pre-wrap text-sm leading-7 opacity-72";

    return (
      <section
        data-theme-section-id={section.id}
        data-editor-id={`section:${section.id}`}
        data-editor-type={type}
        data-editor-label={title || type.replace(/-/g, " ")}
        className="px-5 md:px-8"
        style={style}
      >
        <div className="mx-auto" style={{ maxWidth, textAlign: align as "left" | "center" | "right" }}>
          {icon ? <div className="mb-4 text-xl" aria-hidden="true">{icon}</div> : null}
          {eyebrow ? <p className="mb-3 text-[9px] uppercase tracking-[0.16em] opacity-55">{eyebrow}</p> : null}
          {title ? <HeadingTag className={titleClass}>{title}</HeadingTag> : null}
          {body ? (
            type === "quote"
              ? <blockquote className="mt-5 font-heading text-[clamp(1.35rem,2.8vw,2.5rem)] leading-snug">“{body}”</blockquote>
              : <p className={bodyClass}>{body}</p>
          ) : null}
          {attribution ? <p className="mt-4 text-[10px] uppercase tracking-[0.12em] opacity-50">{attribution}</p> : null}
          {ctaLabel && href(ctaHref) ? <Link href={href(ctaHref)} className="mt-6 inline-flex rounded-full border border-current px-5 py-3 text-[10px] uppercase tracking-[0.12em]">{ctaLabel}</Link> : null}
        </div>
      </section>
    );
  }

  if (type === "countdown") {
    const targetTime = text(settings.targetTime);
    const completedState = text(settings.completedState) || "Tamamlandı";
    const stylePreset = text(settings.style) || "cards";
    return (
      <section
        data-theme-section-id={section.id}
        data-editor-id={`section:${section.id}`}
        data-editor-type="countdown"
        data-editor-label={title || "Countdown"}
        className="px-5 md:px-8"
        style={style}
      >
        <div className="mx-auto max-w-4xl text-center">
          {eyebrow ? <p className="mb-3 text-[9px] uppercase tracking-[0.16em] opacity-55">{eyebrow}</p> : null}
          {title ? <h2 className="mb-7 font-heading text-[clamp(1.7rem,3vw,3rem)]">{title}</h2> : null}
          <StoreDesignCountdown targetTime={targetTime} completedState={completedState} stylePreset={stylePreset} />
        </div>
      </section>
    );
  }

  if (type === "spacer") {
    const desktopHeight = number(settings.desktopHeight, 64, 0, 400);
    const mobileHeight = number(settings.mobileHeight, 40, 0, 300);
    return (
      <div
        data-theme-section-id={section.id}
        data-editor-id={`section:${section.id}`}
        data-editor-type="spacer"
        data-editor-label="Spacer"
        className="v2-spacer"
        style={{ ["--v2-spacer-mobile" as string]: `${mobileHeight}px`, ["--v2-spacer-desktop" as string]: `${desktopHeight}px` }}
        aria-hidden="true"
      >
        <style>{`.v2-spacer{height:var(--v2-spacer-mobile)}@media(min-width:768px){.v2-spacer{height:var(--v2-spacer-desktop)}}`}</style>
      </div>
    );
  }

  if (type === "divider") {
    const widthValue = text(settings.width);
    const width = ["25%", "50%", "75%", "100%"].includes(widthValue) ? widthValue : "100%";
    const thicknessValue = Math.round(number(settings.thickness, 1, 1, 4));
    const thickness = [1, 2, 4].includes(thicknessValue) ? thicknessValue : 1;
    const colorToken = ["subtle", "muted", "strong", "current"].includes(text(settings.colorToken)) ? text(settings.colorToken) : "subtle";
    const dividerColor = colorToken === "current"
      ? "currentColor"
      : colorToken === "muted"
        ? "color-mix(in srgb, currentColor 12%, transparent)"
        : colorToken === "strong"
          ? "color-mix(in srgb, currentColor 48%, transparent)"
          : "color-mix(in srgb, currentColor 22%, transparent)";
    return (
      <section
        data-theme-section-id={section.id}
        data-editor-id={`section:${section.id}`}
        data-editor-type="divider"
        data-editor-label="Divider"
        className="px-5 md:px-8"
        style={{ paddingTop: paddingY, paddingBottom: paddingY }}
      >
        <div className="mx-auto border-t" style={{ width, borderTopWidth: thickness, borderTopColor: dividerColor }} />
      </section>
    );
  }

  if (type === "anchor") {
    const anchorId = normalizeStoreDesignAnchorId(text(settings.anchorId)) || `section-${section.id}`;
    const showLabel = settings.labelVisibility === true;
    return (
      <div
        id={anchorId}
        data-theme-section-id={section.id}
        data-editor-id={`section:${section.id}`}
        data-editor-type="anchor"
        data-editor-label={title || "Anchor"}
        className="scroll-mt-24"
      >
        {showLabel && title ? <span className="sr-only">{title}</span> : null}
      </div>
    );
  }

  return null;
}
