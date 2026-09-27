import Link from "next/link";

export type StoreDesignBreadcrumbItem = {
  label: string;
  href?: string;
};

type Props = {
  sectionId: string;
  settings?: Record<string, unknown>;
  items: StoreDesignBreadcrumbItem[];
  className?: string;
};

function text(settings: Record<string, unknown>, key: string, fallback: string) {
  const value = settings[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function number(settings: Record<string, unknown>, key: string, fallback: number, min: number, max: number) {
  const parsed = Number(settings[key]);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export function StoreDesignBreadcrumb({
  sectionId,
  settings = {},
  items,
  className = "",
}: Props) {
  if (settings.visible === false || items.length < 2) return null;

  const separatorPreset = text(settings, "separator", "chevron");
  const separator = separatorPreset === "slash" ? "/" : separatorPreset === "dot" ? "·" : "›";
  const typography = text(settings, "typography", "compact") === "default" ? "default" : "compact";
  const paddingY = number(settings, "paddingY", 12, 0, 64);
  const textClass = typography === "default"
    ? "text-[11px] tracking-[0.04em]"
    : "text-[9px] uppercase tracking-[0.14em]";

  return (
    <nav
      data-theme-section-id={sectionId}
      data-editor-id={`section:${sectionId}`}
      data-editor-type="breadcrumb"
      data-editor-label="Breadcrumb"
      aria-label="Breadcrumb"
      className={`w-full ${className}`}
      style={{ paddingTop: paddingY, paddingBottom: paddingY }}
    >
      <ol className={`flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 ${textClass}`}>
        {items.map((item, index) => {
          const current = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-2">
              {index > 0 ? <span aria-hidden="true" className="opacity-35">{separator}</span> : null}
              {current || !item.href ? (
                <span aria-current={current ? "page" : undefined} className="max-w-[48ch] truncate font-medium opacity-85">
                  {item.label}
                </span>
              ) : (
                <Link href={item.href} className="max-w-[36ch] truncate opacity-55 transition-opacity hover:opacity-100">
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
