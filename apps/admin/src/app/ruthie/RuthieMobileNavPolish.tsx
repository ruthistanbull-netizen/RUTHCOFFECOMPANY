"use client";

export function RuthieMobileNavPolish() {
  return (
    <style>{`
      @media (max-width: 860px) {
        nav[aria-label="ROSTA Insight AI menüsü"] {
          position: fixed !important;
          left: auto !important;
          right: 10px !important;
          top: calc(env(safe-area-inset-top) + 64px) !important;
          bottom: auto !important;
          z-index: 46 !important;
          transform: none !important;
          display: grid !important;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important;
          align-items: stretch !important;
          gap: 3px !important;
          width: 184px !important;
          height: 44px !important;
          padding: 4px !important;
          box-sizing: border-box !important;
          border: 1px solid color-mix(in srgb, var(--rosta-kraft, #C8A77D) 18%, transparent) !important;
          border-radius: 16px !important;
          background: color-mix(in srgb, var(--rosta-carbon, #111111) 80%, transparent) !important;
          box-shadow:
            0 14px 40px rgba(0, 0, 0, .34),
            inset 0 1px 0 rgba(255, 255, 255, .055) !important;
          backdrop-filter: blur(24px) saturate(1.22) !important;
          -webkit-backdrop-filter: blur(24px) saturate(1.22) !important;
          overflow: hidden !important;
          isolation: isolate !important;
        }

        nav[aria-label="ROSTA Insight AI menüsü"]::before,
        nav[aria-label="ROSTA Insight AI menüsü"]::after {
          content: none !important;
          display: none !important;
        }

        nav[aria-label="ROSTA Insight AI menüsü"] > a {
          position: relative !important;
          inset: auto !important;
          z-index: 1 !important;
          width: 100% !important;
          min-width: 0 !important;
          height: 34px !important;
          min-height: 0 !important;
          margin: 0 !important;
          padding: 0 8px !important;
          box-sizing: border-box !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 6px !important;
          border: 1px solid transparent !important;
          border-radius: 11px !important;
          background: transparent !important;
          box-shadow: none !important;
          color: color-mix(in srgb, var(--rosta-cream, #FBF3E6) 56%, transparent) !important;
          font-size: 9px !important;
          font-weight: 600 !important;
          line-height: 1 !important;
          text-decoration: none !important;
          overflow: hidden !important;
          transform: none !important;
          transition:
            color .2s ease,
            background .24s ease,
            border-color .24s ease,
            box-shadow .24s ease !important;
        }

        nav[aria-label="ROSTA Insight AI menüsü"] > a::before,
        nav[aria-label="ROSTA Insight AI menüsü"] > a::after {
          content: none !important;
          display: none !important;
        }

        nav[aria-label="ROSTA Insight AI menüsü"] > a svg {
          flex: 0 0 auto !important;
          width: 14px !important;
          height: 14px !important;
        }

        nav[aria-label="ROSTA Insight AI menüsü"] > a[data-active="true"] {
          color: var(--rosta-action-text, #FFFFFF) !important;
          border-color: color-mix(in srgb, var(--rosta-kraft, #C8A77D) 24%, transparent) !important;
          background:
            radial-gradient(circle at 50% 120%, color-mix(in srgb, var(--rosta-brick-b, #C94A40) 22%, transparent), transparent 72%),
            rgba(255, 255, 255, .065) !important;
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, .07),
            0 5px 16px color-mix(in srgb, var(--rosta-espresso, #38251C) 22%, transparent) !important;
        }

        nav[aria-label="ROSTA Insight AI menüsü"] > a:active {
          background: rgba(255, 255, 255, .075) !important;
        }
      }

      @media (max-width: 430px) {
        nav[aria-label="ROSTA Insight AI menüsü"] {
          right: 8px !important;
          top: calc(env(safe-area-inset-top) + 61px) !important;
          width: 170px !important;
          height: 42px !important;
          padding: 4px !important;
          border-radius: 15px !important;
        }

        nav[aria-label="ROSTA Insight AI menüsü"] > a {
          height: 32px !important;
          border-radius: 10px !important;
          font-size: 8px !important;
        }
      }
    `}</style>
  );
}
