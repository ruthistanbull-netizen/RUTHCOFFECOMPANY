"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { CreditCard, ShieldCheck } from "lucide-react";
import { LoadingIndicator } from "@ruth-commerce/ui";

declare global {
  interface Window {
    iFrameResize?: (
      options?: Record<string, unknown>,
      target?: string | HTMLIFrameElement,
    ) => unknown;
  }
}

export interface PaytrIframePaymentProps {
  iframeUrl: string;
  orderNo: string;
  testMode?: boolean;
}

export function PaytrIframePayment({
  iframeUrl,
  orderNo,
  testMode = false,
}: PaytrIframePaymentProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const [resizerReady, setResizerReady] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [resultTransitioning, setResultTransitioning] = useState(false);

  const promoteSameOriginResult = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return false;

    try {
      const location = iframe.contentWindow?.location;
      if (!location || location.origin !== window.location.origin) return false;
      if (location.pathname !== "/order-success" && location.pathname !== "/order-fail") return false;

      // PayTR can resolve merchant_ok_url / merchant_fail_url inside its iframe.
      // We never touch the PayTR document itself. Instead, cover our own shell
      // before promoting the same-origin result to the top-level storefront so
      // customers never interpret the short hand-off as a broken white screen.
      const destination = `${location.pathname}${location.search}${location.hash}`;
      setResultTransitioning(true);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => window.location.assign(destination));
      });
      return true;
    } catch {
      // Expected while the iframe is still on paytr.com (cross-origin).
      return false;
    }
  }, []);

  const handleIframeLoad = useCallback(() => {
    if (promoteSameOriginResult()) return;

    // A cross-origin iframe does not expose a reliable navigation-start event.
    // Keep our own ivory surface underneath it and briefly retain the loader
    // after every completed iframe navigation (including 3D Secure returns).
    setIframeLoaded(false);
    if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = window.setTimeout(() => {
      setIframeLoaded(true);
      settleTimerRef.current = null;
    }, 450);
  }, [promoteSameOriginResult]);

  useEffect(() => {
    setIframeLoaded(false);
    setResultTransitioning(false);
    if (settleTimerRef.current) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
  }, [iframeUrl]);

  useEffect(() => () => {
    if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
  }, []);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!resizerReady || !iframe || !iframeUrl || typeof window.iFrameResize !== "function") {
      return;
    }

    // PayTR iFrame V2'nin resmi entegrasyonundaki gibi iframe-resizer'ı
    // varsayılan ayarlarla başlat. 3D Secure yönlendirmeleri ve yükseklik
    // değişimleri PayTR tarafındaki child script tarafından yönetilir.
    window.iFrameResize({}, iframe);
  }, [iframeUrl, resizerReady]);

  const showLoader = !iframeLoaded || resultTransitioning;

  return (
    <section className="rounded-xl border border-kraft/35 bg-carbon-soft text-cream">
      <Script
        id="paytr-iframe-resizer-v2"
        src="https://www.paytr.com/js/iframeResizer.min.js?v2"
        strategy="afterInteractive"
        onLoad={() => setResizerReady(true)}
      />

      <header className="flex flex-wrap items-center justify-between gap-3 rounded-t-xl border-b border-kraft/25 bg-carbon-soft px-4 py-4 md:px-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-brick text-[var(--rosta-action-text)]">
            <CreditCard size={18} />
          </span>
          <div>
            <p className="font-heading text-base text-cream">PayTR Güvenli Ödeme</p>
            <p className="mt-1 text-[11px] leading-5 text-cream/70">
              Kart ve taksit seçenekleri PayTR tarafından güvenli biçimde gösterilir.
            </p>
          </div>
        </div>
        <span className="rounded-full border border-kraft/40 bg-carbon px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-cream/70">
          {orderNo}
        </span>
      </header>

      {testMode ? (
        <div className="border-b border-[var(--ruth-color-warning)]/40 bg-[var(--ruth-color-warning-soft)] px-4 py-3 text-xs leading-5 text-[var(--ruth-color-warning-text)]">
          PayTR test modu açık. Bu ekran gerçek tahsilat yapmadan test işlemi için kullanılır.
        </div>
      ) : null}

      <div className="flex items-center gap-2 border-b border-kraft/25 px-4 py-3 text-xs leading-5 text-cream/70 md:px-5">
        <ShieldCheck size={16} className="shrink-0 text-brick" />
        Kart numarası, son kullanma tarihi ve CVV ROSTA sunucularına gönderilmez.
      </div>

      <div
        className="relative min-h-[420px] overflow-hidden bg-cream"
        aria-busy={showLoader || undefined}
      >
        {showLoader ? (
          <div
            className={resultTransitioning
              ? "fixed inset-0 z-[100] grid place-items-center bg-carbon px-6 text-center text-cream"
              : "absolute inset-0 z-20 grid min-h-[420px] place-items-center bg-carbon-soft px-6 text-center text-cream"}
            role="status"
            aria-live="polite"
          >
            <div className="flex flex-col items-center">
              <LoadingIndicator size="lg" className="text-brick" />
              <p className="mt-5 font-heading text-lg text-cream">Lütfen bekleyiniz</p>
              <p className="mt-2 max-w-xs text-xs leading-6 text-cream/70">
                {resultTransitioning
                  ? "Ödemeniz tamamlanıyor ve sipariş sonucunuz hazırlanıyor."
                  : "Güvenli ödeme ekranı hazırlanıyor. Bu işlem birkaç saniye sürebilir."}
              </p>
            </div>
          </div>
        ) : null}
        <iframe
          ref={iframeRef}
          key={iframeUrl}
          id="paytriframe"
          src={iframeUrl}
          title={`PayTR güvenli ödeme ekranı - ${orderNo}`}
          allow="payment *"
          scrolling="no"
          frameBorder="0"
          onLoad={handleIframeLoad}
          className="block h-[760px] w-full border-0 bg-cream"
        />
      </div>
    </section>
  );
}
