"use client";

export function ThemeEditorNonBlockingGuard() {
  return (
    <style>{`
      [data-theme-customizer-v4] > .absolute.inset-0.z-50,
      [data-theme-customizer-v4] [data-theme-loading-overlay] {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
    `}</style>
  );
}
