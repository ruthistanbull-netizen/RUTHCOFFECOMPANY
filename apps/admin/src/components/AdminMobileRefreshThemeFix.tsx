"use client";

export function AdminMobileRefreshThemeFix() {
  return (
    <style>{`
      @media (max-width:1023px) {
        #admin-character-ptr {
          background:hsl(var(--app-background)) !important;
          color:#111 !important;
        }

        #admin-character-ptr [data-ruthie-refresh-logo] {
          color:#111 !important;
          filter:drop-shadow(0 4px 12px rgba(0,0,0,.10)) !important;
        }
      }

      [aria-label="Net satışı oluşturan siparişleri aç"] > article {
        box-shadow:
          0 7px 20px rgba(113,67,45,.10),
          0 2px 7px rgba(113,67,45,.07) !important;
      }
    `}</style>
  );
}
