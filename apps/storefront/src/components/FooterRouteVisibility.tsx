"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { isBusinessEditorialRoute } from "@/lib/businessEditorialRoutes";

export function FooterRouteVisibility({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (isBusinessEditorialRoute(pathname)) return null;
  return <>{children}</>;
}
