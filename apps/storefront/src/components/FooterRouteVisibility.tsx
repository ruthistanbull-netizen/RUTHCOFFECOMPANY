"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function FooterRouteVisibility({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/studio") return null;
  return <>{children}</>;
}
