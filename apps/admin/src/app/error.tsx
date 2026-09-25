"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { attemptClientRuntimeRecovery } from "@/lib/clientTelemetry";
import { navigateRostaPanelDocument } from "@/lib/rrHubRuntime";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [autoRepairing, setAutoRepairing] = useState(false);

  useEffect(() => {
    console.error("ROSTA Coffee Co. admin error", error);

    const started = attemptClientRuntimeRecovery(error, "next-error-boundary");
    if (started) {
      setAutoRepairing(true);
      return;
    }

    // Route-level failures are recovered with one clean document request. This
    // avoids leaving the user inside Next.js' failed RSC navigation state.
    const route = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const key = `rosta_admin_route_boundary_recovery_v1:${route}`;
    const now = Date.now();
    let previousAt = 0;
    try {
      previousAt = Number(window.sessionStorage.getItem(key) || 0);
    } catch {}

    if (!previousAt || now - previousAt > 15_000) {
      setAutoRepairing(true);
      try {
        window.sessionStorage.setItem(key, String(now));
      } catch {}
      const timer = window.setTimeout(() => {
        navigateRostaPanelDocument(route, { replace: true });
      }, 120);
      return () => window.clearTimeout(timer);
    }

    setAutoRepairing(false);
  }, [error]);

  return (
    <section className="cr-fatal-state">
      <span><AlertTriangle /></span>
      <div>
        <small>{autoRepairing ? "Otomatik onarım" : "Beklenmeyen hata"}</small>
        <h1>{autoRepairing ? "Bu ekran otomatik kurtarılıyor" : "Bu ekran yüklenemedi"}</h1>
        <p>{autoRepairing ? "Geçici DOM senkronizasyon sorunu algılandı. Ekran güvenli biçimde yeniden yükleniyor." : error.message || "İşlem sırasında beklenmeyen bir sorun oluştu."}</p>
      </div>
      <button className="cr-button cr-button--primary" type="button" onClick={reset}><RefreshCw /> {autoRepairing ? "Şimdi tekrar dene" : "Tekrar dene"}</button>
    </section>
  );
}
