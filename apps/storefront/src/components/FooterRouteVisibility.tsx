"use client";

import { usePathname } from "next/navigation";

export function FooterRouteVisibility({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/studio") return null;
  return <>{children}</>;
}
