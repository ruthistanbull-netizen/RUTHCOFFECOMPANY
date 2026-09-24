const PANEL = "[data-theme-sections-panel]";
const CUSTOMIZER = "[data-theme-customizer-v4]";

export function ThemeEditorIkasPolish() {
  return (
    <style>{`
      ${CUSTOMIZER} input[type="range"],
      ${CUSTOMIZER} input[type="checkbox"] {
        accent-color: var(--rosta-brick-b) !important;
      }

      ${CUSTOMIZER} [class*="bg-[#7c3aed]"] {
        background-color: var(--rosta-brick-b) !important;
        color: var(--rosta-action-text) !important;
      }

      ${CUSTOMIZER} [class*="bg-[#f1ecff]"] {
        background-color: color-mix(in srgb, var(--rosta-brick-b) 14%, var(--rosta-carbon-soft)) !important;
      }

      ${CUSTOMIZER} [class*="text-[#6d35e8]"],
      ${CUSTOMIZER} [class*="text-[#5f2bd1]"] {
        color: var(--rosta-brick-b) !important;
      }

      ${PANEL} {
        width: 364px !important;
        background: var(--rosta-carbon-soft) !important;
        box-shadow: 10px 0 30px color-mix(in srgb, var(--rosta-carbon) 42%, transparent);
      }

      ${PANEL} button[aria-label="Kopyala"],
      ${PANEL} button:has(.lucide-arrow-up),
      ${PANEL} button:has(.lucide-arrow-down) {
        display: none !important;
      }

      ${PANEL} [draggable="true"] {
        min-height: 52px !important;
        gap: 4px !important;
        border-color: color-mix(in srgb, var(--rosta-kraft) 32%, transparent) !important;
        border-radius: 10px !important;
        padding: 3px 6px !important;
        box-shadow: 0 1px 2px color-mix(in srgb, var(--rosta-carbon) 28%, transparent);
      }


      ${PANEL} [draggable="true"] > span:first-child {
        width: 24px !important;
        color: color-mix(in srgb, var(--rosta-cream) 38%, transparent) !important;
      }

      ${PANEL} [draggable="true"] > button[aria-label="Gizle"],
      ${PANEL} [draggable="true"] > button[aria-label="Göster"] {
        width: 34px !important;
        color: color-mix(in srgb, var(--rosta-cream) 58%, transparent) !important;
      }

      ${PANEL} [draggable="true"] > button[aria-label="Sil"] {
        width: 34px !important;
        opacity: 0;
        transition: opacity .15s ease;
      }

      ${PANEL} [draggable="true"]:focus-within > button[aria-label="Sil"] {
        opacity: 1;
      }

      ${PANEL} header {
        min-height: 58px !important;
      }

      ${PANEL} footer > div:first-child button {
        width: calc(100% - 24px) !important;
        justify-content: center !important;
        border-radius: 9px !important;
      }

      ${PANEL} select,
      ${PANEL} input:not([type="range"]):not([type="color"]),
      ${PANEL} textarea {
        border-radius: 9px !important;
      }

      ${PANEL} section > h3 {
        font-size: 12px !important;
        letter-spacing: -.01em !important;
      }

      @media (hover: hover) and (pointer: fine) {
        ${PANEL} [draggable="true"]:hover {
          border-color: color-mix(in srgb, var(--rosta-brick-b) 38%, transparent) !important;
          background: color-mix(in srgb, var(--rosta-brick-b) 8%, var(--rosta-carbon-soft)) !important;
        }

        ${PANEL} [draggable="true"]:hover > button[aria-label="Sil"] {
          opacity: 1;
        }
      }

      ${PANEL} [draggable="true"]:focus-within {
        border-color: var(--rosta-brick-b) !important;
        outline: 2px solid var(--rosta-brick-b);
        outline-offset: 2px;
      }

      @media (forced-colors: active) {
        ${PANEL} [draggable="true"]:focus-within { outline-color: Highlight; }
      }

      @media (max-width: 767px) {
        ${PANEL} {
          width: 100% !important;
          box-shadow: 0 -10px 30px color-mix(in srgb, var(--rosta-carbon) 48%, transparent);
        }
      }
    `}</style>
  );
}