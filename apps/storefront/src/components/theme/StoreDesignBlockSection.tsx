import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { ThemeSection } from "@ruth-commerce/commerce-core/theme-sections";
import { StoreDesignCountdown } from "@/components/theme/StoreDesignCountdown";
import { StoreDesignBeforeAfter } from "@/components/theme/StoreDesignBeforeAfter";
import { StoreDesignSlideshow } from "@/components/theme/StoreDesignSlideshow";

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
              <details key={block.id} defaultOpen={index === 0} data-editor-id={`block:${block.id}`} data-editor-type={blockSemanticType(block.type)} data-editor-label={text(block.settings.label) || "Sekme"}>
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
    const mediaNode = section.imageSrc
      ? section.v2MediaType === "video"
        ? <video src={section.imageSrc} poster={section.v2PosterUrl} className="h-full w-full object-cover" muted playsInline loop autoPlay />
        : <img src={section.imageSrc} alt={heading} className="h-full w-full object-cover" />
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
          <div className={side === "right" ? "md:order-2" : ""} style={{ ["--split-media-width" as string]: mediaWidth, flexBasis: "var(--split-media-width)" }}>{mediaNode}</div>
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
    const maxWidth = text(settings.maxWidth) || (type === "manifesto" ? "900px" : "1100px");

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
          {title ? <h2 className="font-heading text-[clamp(1.7rem,4vw,4rem)] leading-tight">{title}</h2> : null}
          {body ? (
            type === "quote"
              ? <blockquote className="mt-5 font-heading text-[clamp(1.35rem,2.8vw,2.5rem)] leading-snug">“{body}”</blockquote>
              : <p className="mt-5 whitespace-pre-wrap text-sm leading-7 opacity-72">{body}</p>
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
    const width = text(settings.width) || "100%";
    const thickness = number(settings.thickness, 1, 1, 12);
    return (
      <section
        data-theme-section-id={section.id}
        data-editor-id={`section:${section.id}`}
        data-editor-type="divider"
        data-editor-label="Divider"
        className="px-5 md:px-8"
        style={{ paddingTop: paddingY, paddingBottom: paddingY }}
      >
        <div className="mx-auto border-t border-current/20" style={{ width, borderTopWidth: thickness }} />
      </section>
    );
  }

  if (type === "anchor") {
    const anchorId = text(settings.anchorId).replace(/[^a-zA-Z0-9_-]/g, "-") || `section-${section.id}`;
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
