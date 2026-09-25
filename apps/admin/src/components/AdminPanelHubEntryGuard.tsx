"use client";

import { usePathname } from "next/navigation";
import { type ReactNode, useLayoutEffect, useState } from "react";

const ROSTA_ENTERED_KEY = "rosta_panel_hub_entered_v1";

export function AdminPanelHubEntryGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [allowed, setAllowed] = useState(false);

  useLayoutEffect(() => {
    if (pathname === "/profiles") {
      setAllowed(true);
      return;
    }

    let entered = false;
    try {
      entered = window.sessionStorage.getItem(ROSTA_ENTERED_KEY) === "1";
    } catch {}

    if (pathname === "/") {
      window.location.replace(entered ? "/dashboard" : "/profiles");
      return;
    }

    if (!entered) {
      window.location.replace("/profiles");
      return;
    }

    setAllowed(true);
  }, [pathname]);

  if (!allowed) {
    return (
      <div
        aria-label="RR HUB açılıyor"
        className="fixed inset-0 z-[2147483647] bg-[#141414]"
      >
        <div className="absolute left-5 top-[max(1.25rem,env(safe-area-inset-top))] text-[16px] font-black tracking-[0.035em] text-white/72 sm:left-8">
          RR HUB
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
