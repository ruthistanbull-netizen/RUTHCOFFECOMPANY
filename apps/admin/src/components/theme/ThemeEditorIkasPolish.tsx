const PANEL = "[data-theme-sections-panel]";
const CUSTOMIZER = "[data-theme-customizer-v4]";

export function ThemeEditorIkasPolish() {
  return (
    <style>{`
      ${CUSTOMIZER} input[type="range"],
      ${CUSTOMIZER} input[type="checkbox"] {
        accent-color: #C9A23A !important;
      }

      ${CUSTOMIZER} [class*="bg-[#7c3aed]"] {
        background-color: #C9A23A !important;
        color: #211a08 !important;
      }

      ${CUSTOMIZER} [class*="bg-[#f1ecff]"] {
        background-color: #f6edcf !important;
      }

      ${CUSTOMIZER} [class*="text-[#6d35e8]"],
      ${CUSTOMIZER} [class*="text-[#5f2bd1]"] {
        color: #8f6e1f !important;
      }

      ${PANEL} {
        width: 364px !important;
        background: #fff !important;
        box-shadow: 10px 0 30px rgba(17, 24, 39, .035);
      }

      ${PANEL} button[aria-label="Kopyala"],
      ${PANEL} button:has(.lucide-arrow-up),
      ${PANEL} button:has(.lucide-arrow-down) {
        display: none !important;
      }

      ${PANEL} [draggable="true"] {
        min-height: 52px !important;
        gap: 4px !important;
        border-color: rgba(15, 23, 42, .08) !important;
        border-radius: 10px !important;
        padding: 3px 6px !important;
        box-shadow: 0 1px 2px rgba(15, 23, 42, .02);
      }

      ${PANEL} [draggable="true"]:hover {
        border-color: rgba(201, 162, 58, .22) !important;
        background: #fffdf7 !important;
      }

      ${PANEL} [draggable="true"] > span:first-child {
        width: 24px !important;
        color: rgba(15, 23, 42, .28) !important;
      }

      ${PANEL} [draggable="true"] > button[aria-label="Gizle"],
      ${PANEL} [draggable="true"] > button[aria-label="Göster"] {
        width: 34px !important;
        color: rgba(15, 23, 42, .48) !important;
      }

      ${PANEL} [draggable="true"] > button[aria-label="Sil"] {
        width: 34px !important;
        opacity: 0;
        transition: opacity .15s ease;
      }

      ${PANEL} [draggable="true"]:hover > button[aria-label="Sil"] {
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

      @media (max-width: 767px) {
        ${PANEL} {
          width: 100% !important;
          box-shadow: 0 -10px 30px rgba(17, 24, 39, .05);
        }
      }
    `}</style>
  );
}