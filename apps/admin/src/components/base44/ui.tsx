"use client";

import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { Check, type LucideIcon } from "lucide-react";
import { LoadingIndicator, Pressable, Skeleton } from "@ruth-commerce/ui";

export function base44Cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "tertiary" | "destructive" | "ghost";
type ButtonSize = "sm" | "md" | "lg" | "icon" | "icon-sm";

export type Base44ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  success?: boolean;
};

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-white hover:bg-[hsl(var(--accent-hover))] shadow-sm",
  secondary: "bg-surface-secondary text-main hover:bg-surface-tertiary border border-border-subtle",
  tertiary: "bg-transparent text-main hover:bg-surface-secondary",
  destructive: "bg-danger text-white hover:opacity-90 shadow-sm",
  ghost: "bg-transparent text-muted hover:bg-surface-secondary hover:text-main",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs gap-1.5 radius-small",
  md: "h-9 px-4 text-sm gap-2 radius-control",
  lg: "h-11 px-5 text-sm gap-2 radius-control",
  icon: "h-9 w-9 radius-control",
  "icon-sm": "h-8 w-8 radius-small",
};

export function Base44Button({
  className,
  variant = "primary",
  size = "md",
  loading = false,
  success = false,
  disabled,
  children,
  ...props
}: Base44ButtonProps) {
  return (
    <Pressable
      pressStrength="standard"
      className={base44Cx(
        "inline-flex items-center justify-center font-medium whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 disabled:pointer-events-none select-none",
        variants[variant],
        sizes[size],
        success && "bg-success text-white",
        className,
      )}
      disabled={disabled || loading || success}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <LoadingIndicator size="sm" /> : null}
      {success && !loading ? <Check className="h-4 w-4" /> : null}
      {children}
    </Pressable>
  );
}

export function Base44IconButton({
  icon: Icon,
  label,
  className,
  size = "icon",
  variant = "tertiary",
  ...props
}: Omit<Base44ButtonProps, "children"> & { icon: LucideIcon; label: string }) {
  return (
    <Base44Button
      aria-label={label}
      className={base44Cx("!px-0", className)}
      size={size}
      variant={variant}
      {...props}
    >
      <Icon className={size === "icon-sm" ? "h-4 w-4" : "h-[18px] w-[18px]"} />
    </Base44Button>
  );
}

export function Base44PageHeader({
  title,
  subtitle,
  actions,
  breadcrumbs,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: ReactNode[];
  className?: string;
}) {
  return (
    <div className={base44Cx("flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-4", className)}>
      <div className="min-w-0">
        {breadcrumbs?.length ? (
          <div className="flex items-center gap-1.5 text-[11px] text-subtle mb-1">
            {breadcrumbs.map((breadcrumb, index) => (
              <span className="contents" key={index}>
                {index > 0 ? <span className="text-border-strong">/</span> : null}
                <span className={index === breadcrumbs.length - 1 ? "text-muted font-medium" : ""}>{breadcrumb}</span>
              </span>
            ))}
          </div>
        ) : null}
        <h1 className="text-lg md:text-xl font-bold text-main tracking-tight">{title}</h1>
        {subtitle ? <p className="text-xs md:text-sm text-muted mt-0.5">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
    </div>
  );
}

export function Base44DataCard({
  title,
  action,
  children,
  className,
  bodyClassName,
  noPadding = false,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  noPadding?: boolean;
}) {
  return (
    <div className={base44Cx("bg-surface-primary radius-card shadow-card overflow-hidden", className)}>
      {title || action ? (
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border-subtle">
          {title ? <h3 className="text-sm font-semibold text-main">{title}</h3> : null}
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      <div className={base44Cx(noPadding ? "" : "p-4", bodyClassName)}>{children}</div>
    </div>
  );
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value || 0));
}

function compactCurrency(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(value || 0));
}

export function Base44MetricCard({
  label,
  value,
  change,
  trend,
  icon: Icon,
  format = "number",
  prefix,
  suffix,
  className,
  accent = false,
}: {
  label: ReactNode;
  value: number;
  change?: number | null;
  trend?: "up" | "down";
  icon?: LucideIcon;
  format?: "number" | "currency" | "percent";
  prefix?: string;
  suffix?: string;
  className?: string;
  accent?: boolean;
}) {
  const displayValue = format === "currency"
    ? compactCurrency(value)
    : format === "percent"
      ? `${Number(value || 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 })}%`
      : compactNumber(value);

  return (
    <div className={base44Cx(
      "relative overflow-hidden radius-card p-4 transition-all duration-200 hover:shadow-card",
      accent
        ? "bg-gradient-to-br from-[hsl(var(--accent))] to-[hsl(var(--accent-hover))] text-white shadow-floating"
        : "bg-surface-primary shadow-card",
      className,
    )}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className={base44Cx("text-[11px] font-medium", accent ? "text-white/80" : "text-muted")}>{label}</span>
        {Icon ? (
          <div className={base44Cx("flex items-center justify-center h-7 w-7 radius-small shrink-0", accent ? "bg-white/20" : "bg-accent-soft text-accent")}>
            <Icon className="h-3.5 w-3.5" />
          </div>
        ) : null}
      </div>
      <div className={base44Cx("text-2xl font-bold tracking-tight", accent ? "text-white" : "text-main")}>{prefix}{displayValue}{suffix}</div>
      {change != null ? (
        <div className="flex items-center gap-1 mt-2">
          <span className={base44Cx("text-[11px] font-medium", accent ? "text-white/90" : trend === "up" ? "text-success-foreground" : "text-danger-foreground")}>{trend === "up" ? "↑" : "↓"} {Math.abs(change)}%</span>
          <span className={base44Cx("text-[11px]", accent ? "text-white/60" : "text-subtle")}>önceki döneme göre</span>
        </div>
      ) : null}
    </div>
  );
}

export function Base44Skeleton({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <Skeleton className={base44Cx("skeleton rounded-lg", className)} {...props} />;
}

type StatusTone = "success" | "warning" | "danger" | "info" | "accent" | "neutral";
const statusTones: Record<StatusTone, { bg: string; text: string; dot: string }> = {
  success: { bg: "bg-success-soft", text: "text-success-foreground", dot: "bg-success" },
  warning: { bg: "bg-warning-soft", text: "text-warning-foreground", dot: "bg-warning" },
  danger: { bg: "bg-danger-soft", text: "text-danger-foreground", dot: "bg-danger" },
  info: { bg: "bg-info-soft", text: "text-info-foreground", dot: "bg-info" },
  accent: { bg: "bg-accent-soft", text: "text-accent", dot: "bg-accent" },
  neutral: { bg: "bg-neutral-soft", text: "text-neutral-foreground", dot: "bg-neutral" },
};

export function Base44StatusBadge({
  label,
  tone = "neutral",
  dot = true,
  size = "md",
  className,
}: {
  label: ReactNode;
  tone?: StatusTone;
  dot?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const config = statusTones[tone];
  return (
    <span className={base44Cx(
      "inline-flex items-center gap-1.5 font-medium rounded-full whitespace-nowrap",
      size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]",
      config.bg,
      config.text,
      className,
    )}>
      {dot ? <span className={base44Cx("h-1.5 w-1.5 rounded-full", config.dot)} /> : null}
      {label}
    </span>
  );
}

export function Base44EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={base44Cx("flex flex-col items-center justify-center text-center py-10 px-4", className)}>
      <p className="text-sm font-semibold text-main">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-xs text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Base44Section({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={base44Cx("space-y-3", className)}>
      {title || description || action ? (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? <h2 className="text-base font-semibold text-main">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Base44Surface({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={base44Cx("bg-surface-primary radius-card shadow-card", className)} />;
}
