import type { ThemeCustomizerSettings, ThemeDeviceStyle } from "@/lib/themeCustomizer";

export const ROSTA_PALETTE = {
  carbon: "#111111",
  carbonSoft: "#242424",
  cream: "#FBF3E6",
  espresso: "#38251C",
  brickB: "#C94A40",
  cocoa: "#6B4638",
  kraft: "#C8A77D",
  actionText: "#FFFFFF",
  // Compatibility aliases for copied Ruth-era naming.
  bone: "#FBF3E6",
  oxide: "#C94A40",
  olive: "#6B4638",
  steel: "#C8A77D",
} as const;

const ROSTA_CANONICAL_COLORS = new Map(
  Object.values(ROSTA_PALETTE).map((value) => [value.toLowerCase(), value]),
);

export function sanitizeRostaPaletteColor(
  value: string | null | undefined,
  fallback: string,
) {
  const mapped = mapRostaLegacyColor(value);
  if (!mapped) return fallback;
  return ROSTA_CANONICAL_COLORS.get(mapped.trim().toLowerCase()) || fallback;
}

export const ROSTA_LOGO_SRC = "/rosta-coffee-co.svg";

export const ROSTA_THEME_COLORS: ThemeCustomizerSettings["colors"] = {
  ivory: ROSTA_PALETTE.carbon,
  cream: ROSTA_PALETTE.carbonSoft,
  ink: ROSTA_PALETTE.cream,
  gold: ROSTA_PALETTE.brickB,
  goldDark: ROSTA_PALETTE.espresso,
  muted: ROSTA_PALETTE.cocoa,
};

const LEGACY_COLOR_MAP: Record<string, string> = {
  "#ffffff": ROSTA_PALETTE.actionText,
  "#fff": ROSTA_PALETTE.actionText,
  "#f4f0e8": ROSTA_PALETTE.cream,
  "#faf7f2": ROSTA_PALETTE.cream,
  "#faf7f1": ROSTA_PALETTE.cream,
  "#f6f0e7": ROSTA_PALETTE.cream,
  "#f5efe7": ROSTA_PALETTE.cream,
  "#f1eadf": ROSTA_PALETTE.cream,
  "#f0e6d8": ROSTA_PALETTE.cream,
  "#171512": ROSTA_PALETTE.carbon,
  "#211912": ROSTA_PALETTE.carbon,
  "#171717": ROSTA_PALETTE.carbon,
  "#000000": ROSTA_PALETTE.carbon,
  "#000": ROSTA_PALETTE.carbon,
  "#b9563d": ROSTA_PALETTE.brickB,
  "#b8976a": ROSTA_PALETTE.brickB,
  "#d4b896": ROSTA_PALETTE.brickB,
  "#2b1b16": ROSTA_PALETTE.espresso,
  "#8d704b": ROSTA_PALETTE.espresso,
  "#765a37": ROSTA_PALETTE.espresso,
  "#76552f": ROSTA_PALETTE.espresso,
  "#9a7b52": ROSTA_PALETTE.espresso,
  "#6f725b": ROSTA_PALETTE.cocoa,
  "#6f6a63": ROSTA_PALETTE.cocoa,
  "#6a6056": ROSTA_PALETTE.cocoa,
  "#66594d": ROSTA_PALETTE.cocoa,
  "#7a6d5f": ROSTA_PALETTE.cocoa,
  "#77716b": ROSTA_PALETTE.cocoa,
  "#aaa8a1": ROSTA_PALETTE.kraft,
  "#e7ded2": ROSTA_PALETTE.kraft,
  "#cdbeac": ROSTA_PALETTE.kraft,
  "#d8d2ca": ROSTA_PALETTE.kraft,
};

export function mapRostaLegacyColor(value: string | null | undefined) {
  if (!value) return value;
  return LEGACY_COLOR_MAP[value.trim().toLowerCase()] || value;
}

function sanitizeDeviceStyle(style: ThemeDeviceStyle | undefined): ThemeDeviceStyle | undefined {
  if (!style) return style;
  return {
    ...style,
    color: style.color
      ? sanitizeRostaPaletteColor(style.color, ROSTA_PALETTE.cream)
      : style.color,
    backgroundColor: style.backgroundColor
      ? sanitizeRostaPaletteColor(style.backgroundColor, ROSTA_PALETTE.carbonSoft)
      : style.backgroundColor,
  };
}

export function applyRostaStorefrontDesignSystem(
  settings: ThemeCustomizerSettings,
): ThemeCustomizerSettings {
  const pages = Object.fromEntries(
    Object.entries(settings.editor.pages).map(([path, page]) => [
      path,
      {
        ...page,
        overrides: page.overrides.map((override) => ({
          ...override,
          desktop: sanitizeDeviceStyle(override.desktop),
          mobile: sanitizeDeviceStyle(override.mobile),
        })),
      },
    ]),
  );

  return {
    ...settings,
    colors: { ...ROSTA_THEME_COLORS },
    logo: {
      ...settings.logo,
      src: ROSTA_LOGO_SRC,
    },
    editor: {
      ...settings.editor,
      pages,
    },
  };
}
