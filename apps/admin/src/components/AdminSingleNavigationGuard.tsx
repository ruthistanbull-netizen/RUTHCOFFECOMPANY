"use client";

export function AdminSingleNavigationGuard() {
  return (
    <style>{`
      nav[aria-label="Mobil ana menü"],
      header.z-header button[aria-label="Menüyü aç"],
      [data-ruth-nav-header-controls="true"],
      [data-mobile-source-dock-v5="true"] {
        display: none !important;
      }

      [data-workspace-kind="product"]
      [data-exact-base44-page="product-studio"]
      > .grid
      > :first-child
      > :first-child {
        display: none !important;
      }

      @media (max-width: 1023px) {
        aside.z-sidebar,
        header.z-header button[aria-label="Kenar çubuğunu değiştir"] {
          display: none !important;
        }

        html.ruth-navigation-v4 main,
        main {
          margin-left: 0 !important;
          padding-bottom: 0 !important;
        }
      }
    `}</style>
  );
}
