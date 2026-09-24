"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { exactCurrentItem } from "@/components/base44-exact/nav-config";

const HUB_ROUTES = new Set([
  "/",
  "/login",
  "/profiles",
  "/forgot-password",
  "/reset-password",
  "/auth/login",
  "/auth/forgot-password",
  "/auth/reset-password",
]);

function titleForPath(pathname: string) {
  if (HUB_ROUTES.has(pathname)) return "RR HUB";

  const item = exactCurrentItem(pathname);
  if (item?.label) return `${item.label} · ROSTA`;

  if (pathname === "/dashboard") return "Genel Bakış · ROSTA";
  if (pathname.startsWith("/rosta-insight") || pathname.startsWith("/ruthie")) return "ROSTA Insight · ROSTA";

  return "ROSTA";
}

export function AdminDocumentTitle() {
  const pathname = usePathname();

  useEffect(() => {
    document.title = titleForPath(pathname);
  }, [pathname]);

  return null;
}
