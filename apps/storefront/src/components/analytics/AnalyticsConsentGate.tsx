"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { SiteAnalytics } from "@/components/analytics/SiteAnalytics";

type Consent = "accepted" | "rejected" | null;
const CONSENT_KEY = "ruth_analytics_consent_v1";

export function AnalyticsConsentGate() {
  const [consent, setConsent] = useState<Consent>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(CONSENT_KEY);
      setConsent(saved === "accepted" || saved === "rejected" ? saved : null);
    } catch {
      setConsent(null);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    const open = ready && consent === null;
    document.documentElement.classList.toggle("ruth-cookie-consent-open", open);
    return () => document.documentElement.classList.remove("ruth-cookie-consent-open");
  }, [consent, ready]);

  const choose = (value: Exclude<Consent, null>) => {
    try {
      window.localStorage.setItem(CONSENT_KEY, value);
    } catch {
      // Keep the in-memory choice even if storage is unavailable.
    }
    setConsent(value);
    window.dispatchEvent(new CustomEvent("ruth:analytics-consent", { detail: value }));
  };

  const banner =
    ready && consent === null && typeof document !== "undefined"
      ? createPortal(
          <aside
            aria-labelledby="analytics-consent-title"
            aria-describedby="analytics-consent-description"
            data-ruth-cookie-consent
            className="fixed left-1/2 w-[calc(100%-24px)] max-w-[460px] -translate-x-1/2 rounded-[18px] border border-kraft/40 bg-carbon-soft px-4 py-3.5 text-cream shadow-[0_18px_60px_color-mix(in_srgb,var(--rosta-carbon)_62%,transparent)] md:px-5 md:py-4"
            style={{
              bottom: "max(12px, env(safe-area-inset-bottom))",
              zIndex: 2147483000,
              isolation: "isolate",
              pointerEvents: "auto",
            }}
          >
            <h2
              id="analytics-consent-title"
              className="font-heading text-[17px] font-normal leading-tight text-cream md:text-lg"
            >
              Çerezler
            </h2>
            <p
              id="analytics-consent-description"
              className="mt-1.5 text-[12.5px] leading-[1.55] text-cream/70 md:text-[13px]"
            >
              Deneyiminizi iyileştirmek ve site kullanımını anlamak için çerezlerden yararlanıyoruz.
              Gerekli çerezler her zaman aktiftir; diğer çerezleri kabul edebilir veya reddedebilirsiniz.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                className="min-h-10 flex-1 rounded-full bg-brick px-4 text-[10px] font-medium uppercase tracking-[.14em] text-white active:bg-espresso focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brick"
                onClick={() => choose("accepted")}
              >
                Kabul et
              </button>
              <button
                type="button"
                className="min-h-10 flex-1 rounded-full border border-kraft/45 bg-transparent px-4 text-[10px] font-medium uppercase tracking-[.14em] text-cream active:border-espresso active:bg-espresso focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brick"
                onClick={() => choose("rejected")}
              >
                Reddet
              </button>
            </div>
            <Link
              href="/privacy-policy"
              className="mt-2.5 inline-block text-[10.5px] text-cream/65 underline decoration-kraft/45 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brick"
            >
              Gizlilik ve çerezler
            </Link>
          </aside>,
          document.body,
        )
      : null;

  return (
    <>
      <SiteAnalytics />
      {banner}
    </>
  );
}
