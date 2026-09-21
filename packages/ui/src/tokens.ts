import { ruthSemanticDefaults } from "./semantic-tokens";

export const ruthTokens = {
  color: {
    ink: ruthSemanticDefaults.color.textPrimary,
    inkMuted: ruthSemanticDefaults.color.textMuted,
    paper: ruthSemanticDefaults.color.canvas,
    surface: ruthSemanticDefaults.color.surface,
    gold: ruthSemanticDefaults.color.accent,
    goldLight: ruthSemanticDefaults.color.accentSoft,
    goldDark: ruthSemanticDefaults.color.accentStrong,
    border: ruthSemanticDefaults.color.borderSubtle,
    success: ruthSemanticDefaults.color.success,
    warning: ruthSemanticDefaults.color.warning,
    danger: ruthSemanticDefaults.color.danger,
    info: ruthSemanticDefaults.color.info,
  },
  font: {
    display: ruthSemanticDefaults.font.display,
    body: ruthSemanticDefaults.font.body,
  },
  typography: {
    hero: {
      mobile: "clamp(2rem, 9vw, 2.25rem)",
      desktop: "clamp(3.25rem, 6vw, 5.75rem)",
      lineHeight: "0.98",
      letterSpacing: "-0.035em",
    },
    pageTitle: {
      mobile: "1.75rem",
      desktop: "2.75rem",
      lineHeight: "1.08",
      letterSpacing: "-0.025em",
    },
    sectionTitle: {
      mobile: "1.375rem",
      desktop: "2rem",
      lineHeight: "1.15",
      letterSpacing: "-0.018em",
    },
    cardTitle: {
      mobile: "1.0625rem",
      desktop: "1.125rem",
      lineHeight: "1.3",
      letterSpacing: "-0.01em",
    },
    body: {
      mobile: "0.9375rem",
      desktop: "1rem",
      lineHeight: "1.65",
    },
    bodySmall: {
      mobile: "0.875rem",
      desktop: "0.9375rem",
      lineHeight: "1.6",
    },
    caption: {
      mobile: "0.75rem",
      desktop: "0.8125rem",
      lineHeight: "1.45",
      letterSpacing: "0.01em",
    },
    eyebrow: {
      mobile: "0.6875rem",
      desktop: "0.75rem",
      lineHeight: "1.4",
      letterSpacing: "0.18em",
    },
  },
  radius: {
    xs: "6px",
    sm: "10px",
    md: "16px",
    lg: "24px",
    pill: "999px",
  },
  shadow: {
    soft: "0 12px 36px rgba(23, 21, 18, 0.08)",
    elevated: "0 24px 64px rgba(23, 21, 18, 0.14)",
  },
  space: {
    1: "4px",
    2: "8px",
    3: "12px",
    4: "16px",
    5: "24px",
    6: "32px",
    7: "48px",
    8: "64px",
  },
  control: {
    small: "36px",
    medium: "44px",
    large: "52px",
    icon: "34px",
    iconTouch: "40px",
    input: "46px",
  },
  card: {
    compact: {
      padding: "16px",
      gap: "10px",
      radius: "10px",
      media: "44px",
    },
    standard: {
      padding: "20px",
      gap: "16px",
      radius: "16px",
      media: "52px",
    },
    detailed: {
      padding: "24px",
      gap: "20px",
      radius: "16px",
      media: "64px",
    },
  },
  motion: {
    fast: "120ms",
    normal: "220ms",
    slow: "380ms",
    easing: "cubic-bezier(0.22, 1, 0.36, 1)",
  },
  layer: {
    header: 100,
    dropdown: 500,
    modal: 1000,
    toast: 1200,
  },
} as const;

export type RuthTokens = typeof ruthTokens;
