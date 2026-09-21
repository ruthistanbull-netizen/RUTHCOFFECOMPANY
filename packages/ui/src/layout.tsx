import * as React from "react";

export type PageShellWidth = "narrow" | "standard" | "wide" | "full";
export type PageShellDensity = "compact" | "standard" | "spacious";

export interface PageShellProps extends React.HTMLAttributes<HTMLElement> {
  as?: "main" | "div" | "section";
  width?: PageShellWidth;
  density?: PageShellDensity;
}

export function PageShell({
  as: Component = "main",
  width = "wide",
  density = "standard",
  className = "",
  children,
  ...props
}: PageShellProps) {
  return (
    <Component
      className={`ruth-page-shell ruth-page-shell--width-${width} ruth-page-shell--density-${density} ${className}`.trim()}
      {...props}
    >
      {children}
    </Component>
  );
}

export interface PageHeaderProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  meta,
  actions,
  className = "",
  ...props
}: PageHeaderProps) {
  return (
    <header className={`ruth-page-header ${className}`.trim()} {...props}>
      <div className="ruth-page-header__copy">
        {eyebrow ? <p className="ruth-page-header__eyebrow ruth-type-label">{eyebrow}</p> : null}
        <h1 className="ruth-type-page-title">{title}</h1>
        {description ? <div className="ruth-page-header__description ruth-type-body">{description}</div> : null}
        {meta ? <div className="ruth-page-header__meta ruth-type-caption">{meta}</div> : null}
      </div>
      {actions ? <div className="ruth-page-header__actions ruth-type-control">{actions}</div> : null}
    </header>
  );
}

export type PageSectionSurface = "plain" | "surface" | "muted";
export type PageSectionDensity = "compact" | "standard" | "spacious";

export interface PageSectionProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  as?: "section" | "div" | "article";
  eyebrow?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  surface?: PageSectionSurface;
  density?: PageSectionDensity;
}

export function PageSection({
  as: Component = "section",
  eyebrow,
  title,
  description,
  actions,
  surface = "plain",
  density = "standard",
  className = "",
  children,
  ...props
}: PageSectionProps) {
  const hasHeader = Boolean(eyebrow || title || description || actions);

  return (
    <Component
      className={`ruth-page-section ruth-page-section--${surface} ruth-page-section--${density} ${className}`.trim()}
      {...props}
    >
      {hasHeader ? (
        <div className="ruth-page-section__header">
          <div className="ruth-page-section__copy">
            {eyebrow ? <p className="ruth-page-section__eyebrow ruth-type-label">{eyebrow}</p> : null}
            {title ? <h2 className="ruth-type-section-title">{title}</h2> : null}
            {description ? <div className="ruth-page-section__description ruth-type-body">{description}</div> : null}
          </div>
          {actions ? <div className="ruth-page-section__actions ruth-type-control">{actions}</div> : null}
        </div>
      ) : null}
      <div className="ruth-page-section__body">{children}</div>
    </Component>
  );
}

export type ToolbarDensity = "compact" | "standard";

export interface ToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  density?: ToolbarDensity;
  sticky?: boolean;
}

export function Toolbar({
  leading,
  trailing,
  density = "standard",
  sticky = false,
  className = "",
  children,
  ...props
}: ToolbarProps) {
  return (
    <div
      className={`ruth-toolbar ruth-toolbar--${density} ruth-type-control ${sticky ? "ruth-toolbar--sticky" : ""} ${className}`.trim()}
      {...props}
    >
      <div className="ruth-toolbar__leading">{leading ?? children}</div>
      {trailing ? <div className="ruth-toolbar__trailing">{trailing}</div> : null}
    </div>
  );
}

export interface FilterShellProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  open?: boolean;
}

export function FilterShell({
  title = "Filtreler",
  description,
  actions,
  open = true,
  className = "",
  children,
  ...props
}: FilterShellProps) {
  if (!open) return null;

  return (
    <section className={`ruth-filter-shell ${className}`.trim()} aria-label={typeof title === "string" ? title : "Filtreler"} {...props}>
      <div className="ruth-filter-shell__header">
        <div>
          <h2 className="ruth-type-section-title">{title}</h2>
          {description ? <div className="ruth-filter-shell__description ruth-type-body">{description}</div> : null}
        </div>
        {actions ? <div className="ruth-filter-shell__actions ruth-type-control">{actions}</div> : null}
      </div>
      <div className="ruth-filter-shell__body ruth-type-body">{children}</div>
    </section>
  );
}
