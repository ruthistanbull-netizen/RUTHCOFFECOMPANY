import type { ThemeCustomizerSettings } from "@/lib/themeCustomizer";

export const ROSTA_PALETTE = {
  carbon: "#111111",
  bone: "#F4F0E8",
  espresso: "#2B1B16",
  oxide: "#B9563D",
  olive: "#6F725B",
  steel: "#AAA8A1",
} as const;

export const ROSTA_LOGO_SRC = "/rosta-design-system-logo.svg";

export const ROSTA_THEME_COLORS: ThemeCustomizerSettings["colors"] = {
  ivory: ROSTA_PALETTE.bone,
  cream: ROSTA_PALETTE.bone,
  ink: ROSTA_PALETTE.carbon,
  gold: ROSTA_PALETTE.oxide,
  goldDark: ROSTA_PALETTE.espresso,
  muted: ROSTA_PALETTE.olive,
};

export function applyRostaStorefrontDesignSystem(
  settings: ThemeCustomizerSettings,
): ThemeCustomizerSettings {
  return {
    ...settings,
    colors: { ...ROSTA_THEME_COLORS },
    logo: {
      ...settings.logo,
      src: ROSTA_LOGO_SRC,
    },
  };
}
