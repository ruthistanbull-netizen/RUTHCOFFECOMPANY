"use client";

export function AdminProductMediaMobileStackV2() {
  return (
    <style>{`
      @media (max-width:520px) {
        [data-ruth-product-media-preview="off"][data-sortable-axis="horizontal"] {
          display:grid !important;
          grid-template-columns:repeat(2,minmax(0,168px)) !important;
          justify-content:start !important;
          align-items:start !important;
          gap:10px !important;
          width:100% !important;
          max-width:100% !important;
          margin:0 !important;
          padding:4px 0 10px !important;
          overflow:visible !important;
          overscroll-behavior:auto !important;
        }

        [data-ruth-product-media-preview="off"][data-sortable-axis="horizontal"] > [data-sortable-media-index] {
          width:100% !important;
          max-width:168px !important;
          flex:0 0 auto !important;
          min-width:0 !important;
          touch-action:pan-y !important;
        }

        [data-ruth-product-media-preview="off"][data-sortable-axis="horizontal"] > [data-sortable-media-index] > div:first-child {
          width:100% !important;
        }

        [data-ruth-product-media-preview="off"][data-sortable-axis="horizontal"] [class*="handle"] svg {
          transform:none !important;
        }
      }
    `}</style>
  );
}
