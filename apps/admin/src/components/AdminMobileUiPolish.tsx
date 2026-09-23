"use client";

export function AdminMobileUiPolish() {
  return (
    <style jsx global>{`
      header [aria-label="ROSTA Insight"] {
        display: none !important;
      }

      header button:has(kbd) {
        min-width: 0;
      }

      header button:has(kbd) > span {
        min-width: 0 !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
        font-size: 10.5px !important;
        line-height: 1.15 !important;
        font-weight: 550 !important;
        letter-spacing: -0.01em !important;
      }

      .ruth-picker-dialog {
        width: min(410px, calc(100vw - 48px));
      }

      select:not([multiple]) {
        -webkit-appearance: none !important;
        appearance: none !important;
        cursor: pointer;
        padding-right: 2rem !important;
        background-image:
          linear-gradient(45deg, transparent 50%, hsl(var(--text-subtle)) 50%),
          linear-gradient(135deg, hsl(var(--text-subtle)) 50%, transparent 50%) !important;
        background-position:
          calc(100% - 14px) 50%,
          calc(100% - 10px) 50% !important;
        background-size: 4px 4px, 4px 4px !important;
        background-repeat: no-repeat !important;
      }

      select:not([multiple]):focus {
        border-color: hsl(var(--accent)) !important;
        box-shadow: 0 0 0 2px hsl(var(--accent) / 0.12) !important;
        outline: none !important;
      }

      @media (max-width: 767px) {
        .ruth-picker-dialog {
          width: min(390px, calc(100vw - 20px));
        }

        [aria-label="Komut paleti"] {
          display: flex !important;
          max-height: min(72dvh, 620px) !important;
          flex-direction: column !important;
          overflow: hidden !important;
          -webkit-mask-image: linear-gradient(to bottom, #000 0%, #000 calc(100% - 24px), transparent 100%);
          mask-image: linear-gradient(to bottom, #000 0%, #000 calc(100% - 24px), transparent 100%);
        }

        [aria-label="Komut paleti"] > div:first-child input {
          font-size: 12px !important;
          line-height: 1.2 !important;
        }

        [aria-label="Komut paleti"] > div:last-child {
          min-height: 0 !important;
          max-height: none !important;
          flex: 1 1 auto !important;
          padding-bottom: 2rem !important;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
        }

        [data-exact-base44-page="customers"] .grid.grid-cols-3.gap-2.text-center .ruth-type-metric {
          font-size: 0.78rem !important;
          line-height: 1.1 !important;
          font-weight: 650 !important;
          letter-spacing: -0.01em !important;
        }

        [data-exact-base44-page="customers"] .grid.grid-cols-3.gap-2.text-center .ruth-type-label {
          margin-top: 0.2rem !important;
          font-size: 0.58rem !important;
          line-height: 1.15 !important;
        }
      }
    `}</style>
  );
}
