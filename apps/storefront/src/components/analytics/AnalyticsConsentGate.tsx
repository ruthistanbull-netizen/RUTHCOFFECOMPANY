"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SiteAnalytics } from "@/components/analytics/SiteAnalytics";
import {
  SEMANTIC_RUNTIME_PATCH_EVENT,
  STORE_DESIGN_CONSENT_SETTINGS_EVENT,
  type SemanticRuntimePatch,
} from "@/components/theme/SemanticThemeRuntimeProvider";

type Consent = "accepted" | "rejected" | null;
type ConsentBannerSettings = Record<string, unknown>;

const CONSENT_KEY = "ruth_analytics_consent_v1";

function settingText(settings: ConsentBannerSettings | undefined, key: string, fallback: string, max: number) {
  const value = settings?.[key];
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;
}

function settingPreset<T extends string>(
  settings: ConsentBannerSettings | undefined,
  key: string,
  allowed: readonly T[],
  fallback: T,
) {
  const value = settings?.[key];
  return typeof value === "string" && allowed.includes(value as T) ? value as T : fallback;
}

export function AnalyticsConsentGate({
  desktopSettings,
  mobileSettings,
}: {
  desktopSettings?: ConsentBannerSettings;
  mobileSettings?: ConsentBannerSettings;
}) {
  const [consent, setConsent] = useState<Consent>(null);
  const [ready, setReady] = useState(false);
  const [editorPreview, setEditorPreview] = useState(false);
  const [mobileViewport, setMobileViewport] = useState(false);
  const [runtimeDesktop, setRuntimeDesktop] = useState<ConsentBannerSettings>({});
  const [runtimeMobile, setRuntimeMobile] = useState<ConsentBannerSettings>({});
  const bannerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(CONSENT_KEY);
      setConsent(saved === "accepted" || saved === "rejected" ? saved : null);
    } catch {
      setConsent(null);
    }
    const params = new URLSearchParams(window.location.search);
    setEditorPreview(params.get("themeEditor") === "1" && params.get("storeDesignV2") === "1");
    setReady(true);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const sync = () => setMobileViewport(media.matches);
    sync();
    media.addEventListener?.("change", sync);
    return () => media.removeEventListener?.("change", sync);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const open = ready && (consent === null || editorPreview);
    root.classList.toggle("ruth-cookie-consent-open", open);

    let observer: ResizeObserver | undefined;
    const banner = bannerRef.current;
    if (open && banner) {
      // Pages can reserve space for the owned banner without scanning its DOM.
      const publishHeight = () => {
        root.style.setProperty("--ruth-cookie-consent-height", `${Math.ceil(banner.getBoundingClientRect().height)}px`);
      };
      publishHeight();
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(publishHeight);
        observer.observe(banner);
      }
    } else {
      root.style.removeProperty("--ruth-cookie-consent-height");
    }

    return () => {
      observer?.disconnect();
      root.classList.remove("ruth-cookie-consent-open");
      root.style.removeProperty("--ruth-cookie-consent-height");
    };
  }, [consent, editorPreview, ready]);

  useEffect(() => {
    const onDocumentSettings = (event: Event) => {
      const detail = (event as CustomEvent<{ desktop?: ConsentBannerSettings; mobile?: ConsentBannerSettings }>).detail;
      if (!detail) return;
      setRuntimeDesktop(detail.desktop && typeof detail.desktop === "object" ? detail.desktop : {});
      setRuntimeMobile(detail.mobile && typeof detail.mobile === "object" ? detail.mobile : {});
    };

    window.addEventListener(STORE_DESIGN_CONSENT_SETTINGS_EVENT, onDocumentSettings as EventListener);
    return () => window.removeEventListener(STORE_DESIGN_CONSENT_SETTINGS_EVENT, onDocumentSettings as EventListener);
  }, []);

  useEffect(() => {
    const onRuntimePatch = (event: Event) => {
      const detail = (event as CustomEvent<SemanticRuntimePatch>).detail;
      if (
        !detail
        || detail.scope !== "global"
        || detail.selectorMode !== "type"
        || detail.selectorValue !== "consent-banner"
        || !["title", "intro", "acceptLabel", "rejectLabel", "privacyLabel", "position", "widthPreset", "radiusPreset"].includes(detail.path)
      ) {
        return;
      }

      const setter = detail.device === "mobile" ? setRuntimeMobile : setRuntimeDesktop;
      setter((current) => {
        const next = { ...current };
        if (detail.value === null || detail.value === undefined || detail.value === "") delete next[detail.path];
        else next[detail.path] = detail.value;
        return next;
      });
    };

    window.addEventListener(SEMANTIC_RUNTIME_PATCH_EVENT, onRuntimePatch as EventListener);
    return () => window.removeEventListener(SEMANTIC_RUNTIME_PATCH_EVENT, onRuntimePatch as EventListener);
  }, []);

  const activeSettings = useMemo(() => {
    const desktop = { ...(desktopSettings || {}), ...runtimeDesktop };
    const mobile = { ...(mobileSettings || {}), ...runtimeMobile };
    return mobileViewport ? { ...desktop, ...mobile } : desktop;
  }, [desktopSettings, mobileSettings, mobileViewport, runtimeDesktop, runtimeMobile]);

  const choose = (value: Exclude<Consent, null>) => {
    if (editorPreview) return;
    try {
      window.localStorage.setItem(CONSENT_KEY, value);
    } catch {
      // Keep the in-memory choice even if storage is unavailable.
    }
    setConsent(value);
    window.dispatchEvent(new CustomEvent("ruth:analytics-consent", { detail: value }));
  };

  const title = settingText(activeSettings, "title", "Çerezler", 80);
  const intro = settingText(
    activeSettings,
    "intro",
    "Deneyiminizi iyileştirmek ve site kullanımını anlamak için çerezlerden yararlanıyoruz.",
    360,
  );
  const acceptLabel = settingText(activeSettings, "acceptLabel", "Kabul et", 40);
  const rejectLabel = settingText(activeSettings, "rejectLabel", "Reddet", 40);
  const privacyLabel = settingText(activeSettings, "privacyLabel", "Gizlilik ve çerezler", 80);
  const position = settingPreset(activeSettings, "position", ["bottom-center", "bottom-left", "bottom-right"] as const, "bottom-center");
  const widthPreset = settingPreset(activeSettings, "widthPreset", ["compact", "standard", "wide"] as const, "standard");
  const radiusPreset = settingPreset(activeSettings, "radiusPreset", ["soft", "rounded", "pill"] as const, "rounded");

  const positionClass =
    position === "bottom-left"
      ? "left-3 right-auto translate-x-0 md:left-5"
      : position === "bottom-right"
        ? "left-auto right-3 translate-x-0 md:right-5"
        : "left-1/2 -translate-x-1/2";
  const widthClass =
    widthPreset === "compact"
      ? "max-w-[380px]"
      : widthPreset === "wide"
        ? "max-w-[560px]"
        : "max-w-[460px]";
  const radiusClass =
    radiusPreset === "soft"
      ? "rounded-[10px]"
      : radiusPreset === "pill"
        ? "rounded-[28px]"
        : "rounded-[18px]";

  const banner =
    ready && (consent === null || editorPreview) && typeof document !== "undefined"
      ? createPortal(
          <aside
            ref={bannerRef}
            data-editor-id="consent-banner"
            data-editor-type="consent-banner"
            data-editor-label="Çerez / Onay"
            aria-labelledby="analytics-consent-title"
            aria-describedby="analytics-consent-description"
            data-ruth-cookie-consent
            className={`fixed w-[calc(100%_-_24px)] border border-kraft/40 bg-carbon-soft px-4 py-3.5 text-cream shadow-[0_18px_60px_color-mix(in_srgb,var(--rosta-carbon)_62%,transparent)] md:px-5 md:py-4 ${positionClass} ${widthClass} ${radiusClass}`}
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
              {title}
            </h2>
            <p
              id="analytics-consent-description"
              className="mt-1.5 text-[12.5px] leading-[1.55] text-cream/70 md:text-[13px]"
            >
              {intro} Gerekli çerezler her zaman aktiftir; diğer çerezleri kabul edebilir veya reddedebilirsiniz.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                className="min-h-10 flex-1 rounded-full bg-brick px-4 text-[10px] font-medium uppercase tracking-[.14em] text-white active:bg-espresso focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brick"
                onClick={() => choose("accepted")}
              >
                {acceptLabel}
              </button>
              <button
                type="button"
                className="min-h-10 flex-1 rounded-full border border-kraft/45 bg-transparent px-4 text-[10px] font-medium uppercase tracking-[.14em] text-cream active:border-espresso active:bg-espresso focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brick"
                onClick={() => choose("rejected")}
              >
                {rejectLabel}
              </button>
            </div>
            <Link
              href="/privacy-policy"
              className="mt-2.5 inline-block text-[10.5px] text-cream/65 underline decoration-kraft/45 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brick"
            >
              {privacyLabel}
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
