import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { ThemeSection } from "@ruth-commerce/commerce-core/theme-sections";

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
          <div className="border-l border-current/15 pl-5 md:pl-8">
            {blocks.map((block) => (
              <article key={block.id} data-editor-id={`block:${block.id}`} data-editor-type={blockSemanticType(block.type)} data-editor-label={text(block.settings.heading) || text(block.settings.date) || "Timeline Öğesi"} className="relative pb-10 last:pb-0">
                <span className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full bg-current md:-left-[37px]" />
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
              <details key={block.id} open={index === 0} data-editor-id={`block:${block.id}`} data-editor-type={blockSemanticType(block.type)} data-editor-label={text(block.settings.label) || "Sekme"}>
                <summary className="cursor-pointer list-none py-4 text-sm font-medium">{text(block.settings.label) || `Sekme ${index + 1}`}</summary>
                {text(block.settings.body) ? <p className="pb-5 whitespace-pre-wrap text-sm leading-7 opacity-70">{text(block.settings.body)}</p> : null}
              </details>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (type === "gallery-grid" || type === "logo-cloud" || type === "press-awards" || type === "team") {
    return (
      <section data-theme-section-id={section.id} data-editor-id={`section:${section.id}`} data-editor-type={type} data-editor-label={title || type.replace(/-/g, " ")} className="px-5 md:px-8" style={style}>
        <div className="mx-auto max-w-[1440px]">
          {heading}
          <div className="v2-media-grid">
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
        <style>{`.v2-media-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--v2-gap)}@media(min-width:768px){.v2-media-grid{grid-template-columns:repeat(var(--v2-columns),minmax(0,1fr))}}`}</style>
      </section>
    );
  }

  if (type === "slideshow") {
    return (
      <section data-theme-section-id={section.id} data-editor-id={`section:${section.id}`} data-editor-type="slideshow" data-editor-label={title || "Slideshow"} className="overflow-hidden px-5 md:px-8" style={style}>
        <div className="mx-auto max-w-[1600px]">
          {heading}
          <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3">
            {blocks.map((block) => (
              <article key={block.id} data-editor-id={`block:${block.id}`} data-editor-type={blockSemanticType(block.type)} data-editor-label={text(block.settings.title) || "Slayt"} className="relative min-w-[86%] snap-center overflow-hidden rounded-2xl md:min-w-[60%]">
                {media(block, "aspect-[16/10] w-full object-cover")}
                {(text(block.settings.title) || text(block.settings.body)) ? (
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-6 text-white">
                    {text(block.settings.title) ? <h3 className="font-heading text-2xl">{text(block.settings.title)}</h3> : null}
                    {text(block.settings.body) ? <p className="mt-2 max-w-xl text-sm leading-6 text-white/80">{text(block.settings.body)}</p> : null}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (type === "announcement-bar" || type === "marquee") {
    return (
      <section data-theme-section-id={section.id} data-editor-id={`section:${section.id}`} data-editor-type={type} data-editor-label={title || (type === "marquee" ? "Marquee" : "Announcement Bar")} className="overflow-hidden border-y border-current/10 py-3" style={{ background: section.backgroundColor || "transparent", color: section.textColor || "inherit" }}>
        <div className="flex min-w-max items-center gap-10 px-5">
          {blocks.map((block) => {
            const label = text(block.settings.text);
            return (
              <BlockLink key={block.id} value={block.settings.linkHref || block.settings.link} className="text-[11px] uppercase tracking-[0.12em]">
                <span data-editor-id={`block:${block.id}`} data-editor-type={blockSemanticType(block.type)} data-editor-label={label || "Duyuru"}>{label}{text(block.settings.linkLabel) ? ` · ${text(block.settings.linkLabel)}` : ""}</span>
              </BlockLink>
            );
          })}
        </div>
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
