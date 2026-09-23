"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { attemptClientRuntimeRecovery } from "@/lib/clientTelemetry";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [autoRepairing, setAutoRepairing] = useState(false);

  useEffect(() => {
    console.error("ROSTA Coffee Co. admin error", error);
    const started = attemptClientRuntimeRecovery(error, "next-error-boundary");
    setAutoRepairing(started);
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
