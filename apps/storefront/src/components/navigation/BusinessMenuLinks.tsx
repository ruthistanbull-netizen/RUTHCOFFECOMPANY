"use client";

import Link from "next/link";
import type { ThemeNavItem } from "@/lib/themeCustomizer";

export function partitionMenuLinks<T extends ThemeNavItem>(items: T[]) {
  const primary: T[] = [];
  const business: T[] = [];

  for (const item of items) {
    const pathname = item.path.split(/[?#]/, 1)[0].replace(/\/+$/, "");
    (pathname === "/studio" ? business : primary).push(item);
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
        <Link
          key={item.id}
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
      ))}
    </section>
  );
}
