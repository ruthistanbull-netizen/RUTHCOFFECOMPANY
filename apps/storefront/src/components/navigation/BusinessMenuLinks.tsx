"use client";

import Link from "next/link";
import type { ThemeNavItem } from "@/lib/themeCustomizer";
import { BUSINESS_EDITORIAL_ROUTES, isBusinessEditorialRoute } from "@/lib/businessEditorialRoutes";

export function partitionMenuLinks<T extends ThemeNavItem>(items: T[]) {
  const primary: T[] = [];
  const business: ThemeNavItem[] = [];

  for (const item of items) {
    const pathname = item.path.split(/[?#]/, 1)[0].replace(/\/+$/, "");
    if (isBusinessEditorialRoute(pathname)) business.push(item);
    else primary.push(item);
  }

  // Persisted menus from the old Supabase project may not contain new
  // editorial pages. Keep saved menu links intact, but always show ROSTA.Studio
  // and wholesale once, on mobile and desktop alike.
  if (!business.some((item) => item.path.split(/[?#]/, 1)[0].replace(/\/+$/, "") === BUSINESS_EDITORIAL_ROUTES.studio)) {
    business.push({
      id: "rosta-studio",
      label: "ROSTA.Studio",
      path: BUSINESS_EDITORIAL_ROUTES.studio,
      side: "left",
      children: [],
    });
  }

  if (!business.some((item) => item.path.split(/[?#]/, 1)[0].replace(/\/+$/, "") === BUSINESS_EDITORIAL_ROUTES.wholesale)) {
    business.push({
      id: "rosta-wholesale",
      label: "Toptan Kahve",
      path: BUSINESS_EDITORIAL_ROUTES.wholesale,
      side: "left",
      children: [],
    });
  }

  return { primary, business };
}

export function BusinessMenuLinks({
  items,
  onNavigate,
  linkClassName,
  className,
}: {
  items: ThemeNavItem[];
  onNavigate?: () => void;
  linkClassName: string;
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <section
      className={["ruth-menu-business", className].filter(Boolean).join(" ")}
      aria-label="İşletmeler için"
    >
      <h2 className="ruth-menu-business__heading">İŞLETMELER İÇİN</h2>
      {items.map((item) => (
        <div key={item.id} className="ruth-menu-business__row">
          <Link
            href={item.path}
            data-editor-id={`global.header.menu.link.${item.id}`}
            data-editor-type="menu-link"
            data-editor-label={item.label}
            data-editor-instance={item.id}
            data-store-design-editable-text="true"
            onClick={onNavigate}
            className={linkClassName}
          >
            {item.label}
          </Link>
          <Link
            href={`${item.path.split("#", 1)[0]}#business-inquiry`}
            aria-label={`${item.label} için randevu al`}
            data-editor-id={`global.header.menu.link.${item.id}.appointment`}
            data-editor-type="menu-link"
            data-editor-label={`${item.label} · Randevu al`}
            data-editor-instance={`${item.id}.appointment`}
            onClick={onNavigate}
            className="ruth-menu-business__appointment"
          >
            <span aria-hidden="true">—</span>
            Randevu al
          </Link>
        </div>
      ))}
    </section>
  );
}
