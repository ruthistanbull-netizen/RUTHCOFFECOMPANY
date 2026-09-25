"use client";

import { useLayoutEffect } from "react";

const ROSTA_ENTERED_KEY = "rosta_panel_hub_entered_v1";

export default function PanelHubEntryPage() {
  useLayoutEffect(() => {
    let entered = false;
    try {
      entered = window.sessionStorage.getItem(ROSTA_ENTERED_KEY) === "1";
    } catch {}
    window.location.replace(entered ? "/dashboard" : "/profiles");
  }, []);

  return (
    <main className="fixed inset-0 bg-[#141414]" aria-label="RR HUB açılıyor">
      <span className="sr-only">RR HUB açılıyor</span>
    </main>
  );
}
