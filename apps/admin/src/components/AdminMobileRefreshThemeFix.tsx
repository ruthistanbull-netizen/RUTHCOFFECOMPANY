"use client";

export function AdminMobileRefreshThemeFix() {
  return (
    <style>{`
      @media (max-width:1023px) {
        #admin-character-ptr {
          background:hsl(var(--app-background)) !important;
          color:var(--rosta-cream) !important;
        }

        #admin-character-ptr [data-ruthie-refresh-logo] {
          color:var(--rosta-cream) !important;
          filter:drop-shadow(0 4px 12px color-mix(in srgb,var(--rosta-carbon) 52%,transparent)) !important;
        }
      }

      [aria-label="Net satışı oluşturan siparişleri aç"] > article {
        box-shadow:
          0 7px 20px color-mix(in srgb,var(--rosta-espresso) 18%,transparent),
          0 2px 7px color-mix(in srgb,var(--rosta-cocoa) 12%,transparent) !important;
      }
    `}</style>
  );
}
