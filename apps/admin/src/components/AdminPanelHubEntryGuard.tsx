"use client";

import { usePathname } from "next/navigation";
import { type ReactNode, useLayoutEffect, useState } from "react";
import { hasRostaWorkspaceAccess, prepareRRHubWorkspaceForDocument } from "@/lib/rrHubRuntime";

export function AdminPanelHubEntryGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [allowed, setAllowed] = useState(false);

  useLayoutEffect(() => {
    if (pathname === "/profiles") {
      setAllowed(true);
      return;
    }

    prepareRRHubWorkspaceForDocument();
    const entered = hasRostaWorkspaceAccess();

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
        className="fixed inset-0 z-[2147483647] bg-[#111111]"
      >
        <div className="absolute left-5 top-[max(1.25rem,env(safe-area-inset-top))] text-[16px] font-black tracking-[0.035em] text-[#FBF3E6]/78 sm:left-8">
          RR HUB
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
