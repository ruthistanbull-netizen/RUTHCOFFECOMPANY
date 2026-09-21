import type { ThemeCustomizerSettings, ThemeDeviceStyle } from "@/lib/themeCustomizer";

export const ROSTA_PALETTE = {
  carbon: "#111111",
  bone: "#F4F0E8",
  espresso: "#2B1B16",
  oxide: "#B9563D",
  olive: "#6F725B",
  steel: "#AAA8A1",
} as const;

export const ROSTA_LOGO_SRC = "/rosta-coffee-co.svg";

export const ROSTA_THEME_COLORS: ThemeCustomizerSettings["colors"] = {
  ivory: ROSTA_PALETTE.bone,
  cream: ROSTA_PALETTE.bone,
  ink: ROSTA_PALETTE.carbon,
  gold: ROSTA_PALETTE.oxide,
  goldDark: ROSTA_PALETTE.espresso,
  muted: ROSTA_PALETTE.olive,
};

const LEGACY_COLOR_MAP: Record<string, string> = {
  "#ffffff": ROSTA_PALETTE.bone,
  "#fff": ROSTA_PALETTE.bone,
  "#faf7f2": ROSTA_PALETTE.bone,
  "#faf7f1": ROSTA_PALETTE.bone,
  "#f6f0e7": ROSTA_PALETTE.bone,
  "#f5efe7": ROSTA_PALETTE.bone,
  "#f1eadf": ROSTA_PALETTE.bone,
  "#f0e6d8": ROSTA_PALETTE.bone,
  "#171512": ROSTA_PALETTE.carbon,
  "#211912": ROSTA_PALETTE.carbon,
  "#171717": ROSTA_PALETTE.carbon,
  "#000000": ROSTA_PALETTE.carbon,
  "#000": ROSTA_PALETTE.carbon,
  "#b8976a": ROSTA_PALETTE.oxide,
  "#d4b896": ROSTA_PALETTE.oxide,
  "#8d704b": ROSTA_PALETTE.espresso,
  "#765a37": ROSTA_PALETTE.espresso,
  "#76552f": ROSTA_PALETTE.espresso,
  "#9a7b52": ROSTA_PALETTE.espresso,
  "#6f6a63": ROSTA_PALETTE.olive,
  "#6a6056": ROSTA_PALETTE.olive,
  "#66594d": ROSTA_PALETTE.olive,
  "#7a6d5f": ROSTA_PALETTE.olive,
  "#77716b": ROSTA_PALETTE.olive,
  "#e7ded2": ROSTA_PALETTE.steel,
  "#cdbeac": ROSTA_PALETTE.steel,
  "#d8d2ca": ROSTA_PALETTE.steel,
};

export function mapRostaLegacyColor(value: string | null | undefined) {
  if (!value) return value;
  return LEGACY_COLOR_MAP[value.trim().toLowerCase()] || value;
}

function sanitizeDeviceStyle(style: ThemeDeviceStyle | undefined): ThemeDeviceStyle | undefined {
  if (!style) return style;
  return {
    ...style,
    color: mapRostaLegacyColor(style.color) || style.color,
    backgroundColor: mapRostaLegacyColor(style.backgroundColor) || style.backgroundColor,
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
