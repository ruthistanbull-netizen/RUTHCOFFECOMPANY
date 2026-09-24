"use client";

export function AdminPanelUiRules() {
  return (
    <style>{`
      /* Liste ekranlarındaki kullanılmayan Sütunlar kontrolünü panel genelinde gizle. */
      body button:has(.lucide-columns-3),
      body button:has(svg[class*="lucide-columns"]) {
        display: none !important;
      }

      /* Shared loading owner tarafından render edilen göstergeler her zaman hareketli kalsın. */
      @keyframes ruth-admin-forced-spin {
        to { transform: rotate(360deg); }
      }
      body .ruth-feedback-spinner,
      body svg.lucide-loader,
      body svg.lucide-loader-circle,
      body svg[class*="lucide-loader"],
      body svg.lucide-circle-dashed,
      body [aria-busy="true"] svg.lucide-refresh-cw,
      body [data-loading="true"] svg.lucide-refresh-cw {
        animation: ruth-admin-forced-spin 700ms linear infinite !important;
        transform-origin: center center !important;
      }
    `}</style>
  );
}
