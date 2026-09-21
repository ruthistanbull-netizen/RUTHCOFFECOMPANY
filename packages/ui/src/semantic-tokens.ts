export const ruthSemanticTokenNames = {
  color: {
    canvas: "--ruth-color-canvas",
    surface: "--ruth-color-surface",
    surfaceMuted: "--ruth-color-surface-muted",
    textPrimary: "--ruth-color-text-primary",
    textMuted: "--ruth-color-text-muted",
    textInverse: "--ruth-color-text-inverse",
    accent: "--ruth-color-accent",
    accentSoft: "--ruth-color-accent-soft",
    accentStrong: "--ruth-color-accent-strong",
    accentWash: "--ruth-color-accent-wash",
    borderSubtle: "--ruth-color-border-subtle",
    borderStrong: "--ruth-color-border-strong",
    focus: "--ruth-color-focus",
    overlay: "--ruth-color-overlay",
    success: "--ruth-color-success",
    warning: "--ruth-color-warning",
    danger: "--ruth-color-danger",
    info: "--ruth-color-info",
  },
  font: {
    display: "--ruth-font-display",
    body: "--ruth-font-body",
  },
} as const;

export const ruthSemanticDefaults = {
  color: {
    canvas: "#FAF7F2",
    surface: "#FFFFFF",
    surfaceMuted: "#F5EFE7",
    textPrimary: "#171512",
    textMuted: "#6A6056",
    textInverse: "#FFFFFF",
    accent: "#B8976A",
    accentSoft: "#D4B896",
    accentStrong: "#765A37",
    accentWash: "rgba(184, 151, 106, 0.18)",
    borderSubtle: "#E7DED2",
    borderStrong: "#CDBEAC",
    focus: "#765A37",
    overlay: "rgba(23, 21, 18, 0.46)",
    success: "#2F6B4F",
    warning: "#80500F",
    danger: "#9B3A36",
    info: "#355C7D",
  },
  font: {
    display: '"Cinzel", Georgia, serif',
    body: '"Montserrat", Arial, sans-serif',
  },
} as const;

export type RuthSemanticTokenNames = typeof ruthSemanticTokenNames;
export type RuthSemanticDefaults = typeof ruthSemanticDefaults;
