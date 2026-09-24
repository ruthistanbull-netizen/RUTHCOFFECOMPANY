"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect } from "react";
import { adminRememberSessionEnabled } from "@/lib/supabaseBrowser";

const ROSTA_ENTERED_KEY = "rosta_panel_hub_entered_v1";

export function AdminPanelHubEntryGuard() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    if (pathname !== "/") return;
    if (!adminRememberSessionEnabled()) return;

    try {
      if (window.sessionStorage.getItem(ROSTA_ENTERED_KEY) === "1") return;
    } catch {}

    window.location.replace("/profiles");
  }, [pathname]);

  return null;
}
