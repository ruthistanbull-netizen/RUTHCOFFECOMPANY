"use client";

import { useLayoutEffect } from "react";
import { hasRostaWorkspaceAccess, prepareRRHubWorkspaceForDocument } from "@/lib/rrHubRuntime";

export default function PanelHubEntryPage() {
  useLayoutEffect(() => {
    prepareRRHubWorkspaceForDocument();
    window.location.replace(hasRostaWorkspaceAccess() ? "/dashboard" : "/profiles");
  }, []);

  return (
    <main className="fixed inset-0 bg-[#141414]" aria-label="RR HUB açılıyor">
      <span className="sr-only">RR HUB açılıyor</span>
    </main>
  );
}
