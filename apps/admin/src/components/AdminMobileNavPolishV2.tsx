"use client";

export function AdminMobileNavPolishV2() {
  return (
    <style>{`
      @media (max-width:1023px) {
        [data-ruth-mobile-quarter-menu="true"] text[class*="featuredLabel"],
        [data-ruth-mobile-quarter-menu="true"] [data-quarter-submenu-label="true"] {
          font-family:var(--font-body);
          font-weight:760;
          letter-spacing:-.025em;
          text-anchor:middle;
          dominant-baseline:middle;
          pointer-events:none;
        }

        [data-ruth-mobile-quarter-menu="true"] text[class*="featuredLabel"] {
          font-size:8.6px;
        }

        [data-ruth-mobile-quarter-menu="true"] [data-quarter-submenu-label="true"] {
          fill:var(--quarter-menu-white) !important;
        }

        [data-ruth-mobile-quarter-menu="true"] svg[class*="featuredIcon"] {
          stroke-width:2.2;
        }
      }
    `}</style>
  );
}
