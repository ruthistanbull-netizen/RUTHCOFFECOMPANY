"use client";

import {
  AlertCircle,
  Check,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import {
  FeedbackProvider,
  LoadingIndicator,
  Picker,
  Pressable,
  Skeleton,
  useFeedback,
  useOverlayBehavior,
  type OverlayDismissalPolicy,
} from "@ruth-commerce/ui";
import {
  Children,
  forwardRef,
  isValidElement,
  type ButtonHTMLAttributes,
  type ChangeEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  normalizeProductMaterial,
  productMaterialOptions,
} from "@/lib/productMaterials";
import { ExactLargePopup } from "./ExactLargePopup";

export function exactCx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

type ExactButtonVariant = "primary" | "secondary" | "tertiary" | "destructive" | "ghost";
type ExactButtonSize = "sm" | "md" | "lg" | "icon" | "icon-sm";

const buttonVariantClasses: Record<ExactButtonVariant, string> = {
  primary: "bg-accent text-accent-foreground hover:bg-[hsl(var(--accent-hover))] shadow-sm",
  secondary: "bg-surface-secondary text-main hover:bg-surface-tertiary border border-border-subtle",
  tertiary: "bg-transparent text-main hover:bg-surface-secondary",
  destructive: "bg-danger text-white hover:bg-[hsl(var(--danger)/0.9)] shadow-sm",
  ghost: "bg-transparent text-muted hover:bg-surface-secondary hover:text-main",
};

const buttonSizeClasses: Record<ExactButtonSize, string> = {
  sm: "h-11 px-3 gap-1.5 radius-small md:h-8",
  md: "h-11 px-4 gap-2 radius-control md:h-9",
  lg: "h-11 px-5 gap-2 radius-control",
  icon: "h-11 w-11 radius-control md:h-9 md:w-9",
  "icon-sm": "h-11 w-11 radius-small md:h-8 md:w-8",
};

const buttonBase = "ruth-type-control inline-flex items-center justify-center whitespace-nowrap ease-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 disabled:pointer-events-none select-none";

export type ExactButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ExactButtonVariant;
  size?: ExactButtonSize;
  loading?: boolean;
  success?: boolean;
};

export const ExactButton = forwardRef<HTMLButtonElement, ExactButtonProps>(function ExactButton(
  { className, variant = "primary", size = "md", loading, success, children, disabled, ...props },
  ref,
) {
  return (
    <Pressable
      ref={ref}
      pressStrength="standard"
      className={exactCx(buttonBase, buttonVariantClasses[variant], buttonSizeClasses[size], success && "bg-success text-white", className)}
      disabled={loading || success || disabled}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <LoadingIndicator size="sm" /> : null}
      {success && !loading ? <Check className="h-4 w-4" /> : null}
      {children}
    </Pressable>
  );
});

export function ExactIconButton({
  icon: Icon,
  label,
  loading,
  size = "icon",
  variant = "tertiary",
  className,
  ...props
}: ExactButtonProps & { icon: LucideIcon; label: string }) {
  return (
    <ExactButton
      variant={variant}
      size={size}
      loading={loading}
      className={exactCx("!px-0", className)}
      aria-label={label}
      {...props}
    >
      {!loading ? <Icon className={size === "icon-sm" ? "h-4 w-4" : "h-[18px] w-[18px]"} /> : null}
    </ExactButton>
  );
}

export function ExactPageHeader({
  title,
  subtitle,
  actions,
  breadcrumbs,
  className,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  breadcrumbs?: string[];
  className?: string;
}) {
  return (
    <div className={exactCx("flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-4", className)}>
      <div className="min-w-0">
        {breadcrumbs ? (
          <div className="ruth-type-caption flex items-center gap-1.5 text-subtle mb-1">
            {breadcrumbs.map((breadcrumb, index) => (
              <span key={`${breadcrumb}-${index}`} className="contents">
                {index > 0 ? <span className="text-border-strong">/</span> : null}
                <span className={index === breadcrumbs.length - 1 ? "text-muted font-medium" : ""}>{breadcrumb}</span>
              </span>
            ))}
          </div>
        ) : null}
        <h1 className="ruth-type-page-title text-main">{title}</h1>
        {subtitle ? <p className="ruth-type-body text-muted mt-0.5">{subtitle}</p> : null}
      </div>
      {actions ? <div className="ruth-type-control flex items-center gap-2 shrink-0">{actions}</div> : null}
    </div>
  );
}

export function ExactSearchInput({
  value,
  onChange,
  placeholder = "Ara...",
  className,
  onClear,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  onClear?: () => void;
  autoFocus?: boolean;
}) {
  return (
    <div className={exactCx("relative flex items-center", className)}>
      <Search className="absolute left-3 h-4 w-4 text-subtle pointer-events-none z-10" />
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="ruth-type-control w-full h-11 pl-9 pr-12 bg-surface-primary border border-border-subtle radius-control text-main placeholder:text-subtle transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent hover:border-border-strong md:h-9 md:pr-10"
      />
      {value ? (
        <Pressable
          type="button"
          pressStrength="icon"
          onClick={(event) => {
            onChange("");
            onClear?.();
            window.requestAnimationFrame(() => {
              event.currentTarget.parentElement?.querySelector<HTMLInputElement>("input")?.focus();
            });
          }}
          className="absolute right-0 h-11 w-11 flex items-center justify-center rounded-full text-subtle hover:text-main hover:bg-surface-tertiary transition-colors md:right-1 md:h-7 md:w-7"
          aria-label="Aramayı temizle"
        >
          <X className="h-3.5 w-3.5" />
        </Pressable>
      ) : null}
    </div>
  );
}

export type ExactFilterOption = { label: string; value: string } | string;

export function ExactFilterChip({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ExactFilterOption[];
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const normalizedOptions = [
    { value: "", label },
    ...options.map((option) => typeof option === "string" ? { label: option, value: option } : option),
  ];
  const selected = value || "";

  return (
    <Picker
      value={selected}
      label={label}
      placeholder={label}
      options={normalizedOptions}
      onValueChange={(next) => onChange(next || null)}
      className={exactCx(
        "ruth-type-control h-11 px-3 radius-control border transition-all cursor-pointer md:h-9",
        value ? "bg-accent-soft text-accent border-transparent" : "bg-surface-primary text-muted border-border-subtle hover:border-border-strong hover:text-main",
      )}
    />
  );
}

export function ExactFilterBar({
  chips,
  onChipChange,
  className,
}: {
  chips: Array<{ key: string; label: string; options: ExactFilterOption[]; value: string | null }>;
  onChipChange: (key: string, value: string | null) => void;
  className?: string;
}) {
  return (
    <div className={exactCx("ruth-type-control flex items-center gap-2 overflow-x-auto no-scrollbar py-1", className)}>
      {chips.map((chip) => (
        <ExactFilterChip
          key={chip.key}
          label={chip.label}
          options={chip.options}
          value={chip.value}
          onChange={(next) => onChipChange(chip.key, next)}
        />
      ))}
    </div>
  );
}

export function ExactSegmentedControl({
  options,
  value,
  onChange,
  size = "md",
  className,
}: {
  options: Array<{ value: string; label: string; icon?: LucideIcon }>;
  value: string;
  onChange: (value: string) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div className={exactCx("ruth-type-control inline-flex items-center bg-surface-secondary radius-control p-0.5 gap-0.5", className)}>
      {options.map((option) => {
        const Icon = option.icon;
        return (
          <Pressable
            type="button"
            pressStrength="subtle"
            key={option.value}
            onClick={() => onChange(option.value)}
            className={exactCx(
              "px-3 radius-small transition-colors duration-150 flex items-center gap-1.5 whitespace-nowrap",
              size === "sm" ? "h-11 md:h-7" : "h-11 md:h-9",
              value === option.value ? "bg-surface-primary text-main shadow-card" : "text-subtle hover:text-muted",
            )}
          >
            {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
            {option.label}
          </Pressable>
        );
      })}
    </div>
  );
}

const toneConfig = {
  success: { bg: "bg-success-soft", text: "text-success-foreground", dot: "bg-success" },
  warning: { bg: "bg-warning-soft", text: "text-warning-foreground", dot: "bg-warning" },
  danger: { bg: "bg-danger-soft", text: "text-danger-foreground", dot: "bg-danger" },
  info: { bg: "bg-info-soft", text: "text-info-foreground", dot: "bg-info" },
  accent: { bg: "bg-accent-soft", text: "text-accent", dot: "bg-accent" },
  neutral: { bg: "bg-neutral-soft", text: "text-neutral-foreground", dot: "bg-neutral" },
} as const;

export type ExactTone = keyof typeof toneConfig;

const toneMap: Record<string, ExactTone> = {
  paid: "success",
  succeeded: "success",
  success: "success",
  pending: "warning",
  refunded: "danger",
  preparing: "info",
  in_production: "warning",
  ready_packing: "accent",
  ready_to_ship: "accent",
  shipped: "accent",
  delivered: "success",
  return_requested: "danger",
  cancelled: "neutral",
  canceled: "neutral",
  in_transit: "info",
  active: "success",
  draft: "neutral",
  archived: "neutral",
  in_stock: "success",
  out_of_stock: "danger",
};

const statusLabels: Record<string, string> = {
  paid: "Ödendi",
  pending: "Bekliyor",
  refunded: "İade edildi",
  preparing: "Hazırlanıyor",
  in_production: "Üretimde",
  ready_packing: "Paketlemeye hazır",
  ready_to_ship: "Kargoya hazır",
  shipped: "Gönderildi",
  delivered: "Teslim edildi",
  cancelled: "İptal",
  canceled: "İptal",
  active: "Aktif",
  draft: "Taslak",
  archived: "Arşiv",
  in_stock: "Stokta",
  out_of_stock: "Stok yok",
};

export function ExactStatusBadge({
  status,
  tone,
  label,
  dot = true,
  size = "md",
  className,
}: {
  status: string;
  tone?: ExactTone;
  label?: string;
  dot?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const normalized = String(status || "").toLowerCase();
  const resolvedTone = tone || toneMap[normalized] || "neutral";
  const config = toneConfig[resolvedTone];
  return (
    <span
      className={exactCx(
        "ruth-type-caption inline-flex items-center gap-1.5 font-medium rounded-full whitespace-nowrap",
        size === "sm" ? "px-2 py-0.5" : "px-2.5 py-1",
        config.bg,
        config.text,
        className,
      )}
    >
      {dot ? <span className={exactCx("h-1.5 w-1.5 rounded-full", config.dot)} /> : null}
      {label || statusLabels[normalized] || status}
    </span>
  );
}

export function ExactSkeleton({ className }: { className?: string }) {
  return <Skeleton className={exactCx("skeleton rounded-lg", className)} />;
}

export function ExactFormModal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = "md",
  dismissalPolicy = "explicit-dismiss",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  dismissalPolicy?: OverlayDismissalPolicy;
}) {
  return (
    <ExactLargePopup
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      size={size}
      dismissalPolicy={dismissalPolicy}
      footer={footer ? <div className="flex items-center justify-end gap-2">{footer}</div> : undefined}
      bodyClassName="py-4"
    >
      {children}
    </ExactLargePopup>
  );
}

export function ExactDetailDrawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 520,
  dismissalPolicy = "light-dismiss",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  dismissalPolicy?: OverlayDismissalPolicy;
}) {
  const overlay = useOverlayBehavior({ active: open, onClose, dismissalPolicy });
  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={overlay.onBackdropClick}
            className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-drawer"
            data-dismissal-policy={overlay.dismissalPolicy}
          />
          <motion.aside
            ref={overlay.containerRef}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
            className="fixed top-0 right-0 bottom-0 z-drawer bg-surface-primary shadow-overlay flex flex-col w-full max-w-[100vw]"
            style={{ width: `min(100vw, ${width}px)` }}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            data-overlay-owner="canonical"
          >
            <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border-subtle shrink-0">
              <div className="min-w-0">
                <h2 className="ruth-type-section-title text-main truncate">{title}</h2>
                {subtitle ? <p className="ruth-type-caption text-muted mt-0.5 truncate">{subtitle}</p> : null}
              </div>
              <ExactIconButton data-autofocus icon={X} label="Kapat" onClick={onClose} size="icon-sm" />
            </header>
            <div className="ruth-type-body flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer ? <footer className="ruth-type-control px-5 py-3.5 border-t border-border-subtle bg-surface-secondary shrink-0">{footer}</footer> : null}
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

export function ExactToastProvider({ children }: { children: ReactNode }) {
  return (
    <FeedbackProvider
      durationMs={4200}
      maxVisible={4}
      renderStack={(notices) => (
        <div className="fixed right-3 bottom-20 lg:bottom-4 z-toast flex flex-col gap-2 w-[min(360px,calc(100vw-24px))]" aria-label="Bildirimler">
          <AnimatePresence initial={false}>
            {notices.map((notice) => (
              <motion.div
                key={notice.id}
                role={notice.tone === "danger" ? "alert" : "status"}
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
                className={exactCx(
                  "ruth-type-caption bg-surface-primary text-main border radius-control shadow-floating px-3.5 py-3 flex items-start gap-2.5",
                  notice.tone === "success"
                    ? "border-success/20"
                    : notice.tone === "danger"
                      ? "border-danger/20"
                      : notice.tone === "warning"
                        ? "border-warning/20"
                        : "border-info/20",
                )}
              >
                <AlertCircle
                  className={exactCx(
                    "h-4 w-4 mt-0.5",
                    notice.tone === "success"
                      ? "text-success"
                      : notice.tone === "danger"
                        ? "text-danger"
                        : notice.tone === "warning"
                          ? "text-warning"
                          : "text-info",
                  )}
                />
                <span className="flex-1">{notice.message}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    >
      {children}
    </FeedbackProvider>
  );
}

export function useExactToast() {
  return useFeedback();
}

type ExactControlledSelectProps = {
  value?: string | number | readonly string[];
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
  disabled?: boolean;
  multiple?: boolean;
  size?: number;
  className?: string;
  name?: string;
  id?: string;
  children?: ReactNode;
  "aria-describedby"?: string;
  "data-native-select"?: boolean | string;
};

function selectOptionText(children: ReactNode, fallback: string) {
  const parts: string[] = [];
  Children.forEach(children, (child) => {
    if (typeof child === "string" || typeof child === "number") parts.push(String(child));
  });
  return parts.join("").trim() || fallback;
}

function pickerOptionsFromSelect(children: ReactNode, group = "") {
  const options: Array<{ value: string; label: string; disabled?: boolean; group?: string }> = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === "option") {
      const props = child.props as {
        value?: string | number;
        disabled?: boolean;
        hidden?: boolean;
        children?: ReactNode;
      };
      if (props.hidden) return;
      const value = props.value == null ? selectOptionText(props.children, "") : String(props.value);
      options.push({
        value,
        label: selectOptionText(props.children, value),
        disabled: Boolean(props.disabled),
        group: group || undefined,
      });
      return;
    }
    if (child.type === "optgroup") {
      const props = child.props as { label?: string; disabled?: boolean; children?: ReactNode };
      const nested = pickerOptionsFromSelect(props.children, String(props.label || ""));
      options.push(...nested.map((option) => ({
        ...option,
        disabled: Boolean(props.disabled || option.disabled),
      })));
    }
  });
  return options;
}

function exactFieldControl(label: string, children: ReactNode) {
  if (Children.count(children) !== 1) return children;
  const child = Children.toArray(children)[0];
  if (!isValidElement(child) || child.type !== "select") return children;

  const select = child as ReactElement<ExactControlledSelectProps>;
  const props = select.props;
  const controlled = props.value !== undefined && typeof props.onChange === "function";
  const explicitlyNative = props["data-native-select"] === true || props["data-native-select"] === "true";
  if (!controlled || explicitlyNative || props.multiple || Number(props.size || 0) > 1) return children;

  const rawValue = Array.isArray(props.value) ? String(props.value[0] || "") : String(props.value ?? "");
  const sourceOptions = pickerOptionsFromSelect(props.children);
  const normalizedLabel = label.trim().toLocaleLowerCase("tr-TR");
  const isProductMaterial = ["materyal", "çekirdek türü", "çekirdek / içerik"].includes(normalizedLabel);
  const options = isProductMaterial
    ? productMaterialOptions(sourceOptions.map((option) => option.value)).map((value) => ({ value, label: value }))
    : sourceOptions;
  const value = isProductMaterial ? (normalizeProductMaterial(rawValue) || "") : rawValue;

  return (
    <Picker
      value={value}
      label={label}
      placeholder={sourceOptions.find((option) => option.value === "")?.label || label}
      options={options}
      disabled={props.disabled}
      className={props.className}
      name={props.name}
      id={props.id}
      aria-describedby={props["aria-describedby"]}
      onValueChange={(next) => {
        const target = { value: next } as HTMLSelectElement;
        props.onChange?.({ target, currentTarget: target } as ChangeEvent<HTMLSelectElement>);
      }}
    />
  );
}

export function ExactField({
  label,
  required,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="ruth-type-label block text-muted mb-1.5">
        {label}
        {required ? <span className="text-danger ml-0.5">*</span> : null}
      </label>
      {exactFieldControl(label, children)}
    </div>
  );
}

export const exactFormInputClass = "ruth-type-control form-input";