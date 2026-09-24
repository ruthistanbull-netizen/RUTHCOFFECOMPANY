"use client";

export function AdminDesktopBrandScaleV2() {
  return (
    <style>{`
      @media (min-width: 1024px) {
        aside[class*="z-sidebar"] > div:first-child {
          height: 78px !important;
          min-height: 78px !important;
          padding-left: 14px !important;
          padding-right: 14px !important;
        }

        aside[class*="z-sidebar"] a[href="/"] > div:has(img[src*="ruth-r-mark"]) {
          width: 48px !important;
          height: 48px !important;
          border-radius: 14px !important;
        }

        aside[class*="z-sidebar"] img[src*="ruth-r-mark"] {
          width: 44px !important;
          height: 44px !important;
        }

        aside[class*="z-sidebar"] a[href="/"] > div + div > p:first-child {
          font-size: 16px !important;
          line-height: 1.05 !important;
          letter-spacing: -0.02em !important;
        }

        aside[class*="z-sidebar"] a[href="/"] > div + div > p:last-child {
          margin-top: 3px !important;
          font-size: 11px !important;
        }
      }
    `}</style>
  );
}
