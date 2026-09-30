export const SOCIAL_MEDIA_PLATFORMS = [
  { key: "instagram", label: "Instagram", placeholder: "https://www.instagram.com/kullaniciadi" },
  { key: "tiktok", label: "TikTok", placeholder: "https://www.tiktok.com/@kullaniciadi" },
  { key: "facebook", label: "Facebook", placeholder: "https://www.facebook.com/sayfa" },
  { key: "youtube", label: "YouTube", placeholder: "https://www.youtube.com/@kanal" },
  { key: "x", label: "X", placeholder: "https://x.com/kullaniciadi" },
  { key: "linkedin", label: "LinkedIn", placeholder: "https://www.linkedin.com/company/marka" },
  { key: "whatsapp", label: "WhatsApp", placeholder: "https://wa.me/905xxxxxxxxx veya +905xxxxxxxxx" },
] as const;

export type SocialMediaPlatform = (typeof SOCIAL_MEDIA_PLATFORMS)[number]["key"];

export type SocialMediaSettings = Record<SocialMediaPlatform, string>;

export type ActiveSocialMediaLink = {
  platform: SocialMediaPlatform;
  label: string;
  href: string;
};

export const defaultSocialMediaSettings: SocialMediaSettings = {
  instagram: "",
  tiktok: "",
  facebook: "",
  youtube: "",
  x: "",
  linkedin: "",
  whatsapp: "",
};

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function normalizeSocialMediaUrl(
  value: unknown,
  platform: SocialMediaPlatform,
): string {
  let input = String(value || "").trim();
  if (!input) return "";

  if (platform === "whatsapp" && /^[+\d\s().-]+$/.test(input)) {
    const phone = input.replace(/\D/g, "");
    if (!phone) return "";
    input = `https://wa.me/${phone}`;
  } else if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) {
    input = `https://${input.replace(/^\/+/, "")}`;
  }

  try {
    const url = new URL(input);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

export function normalizeSocialMediaSettings(
  value: unknown,
  fallback: Partial<SocialMediaSettings> = {},
): SocialMediaSettings {
  const source = recordValue(value);
  const normalized = { ...defaultSocialMediaSettings };

  for (const platform of SOCIAL_MEDIA_PLATFORMS) {
    const candidate = source[platform.key] ?? fallback[platform.key] ?? "";
    normalized[platform.key] = normalizeSocialMediaUrl(candidate, platform.key);
  }

  return normalized;
}

export function activeSocialMediaLinks(
  settings: SocialMediaSettings,
): ActiveSocialMediaLink[] {
  return SOCIAL_MEDIA_PLATFORMS.flatMap((platform) => {
    const href = settings[platform.key];
    return href ? [{ platform: platform.key, label: platform.label, href }] : [];
  });
}

export function socialProfileUrls(settings: SocialMediaSettings): string[] {
  return activeSocialMediaLinks(settings)
    .filter((item) => item.platform !== "whatsapp")
    .map((item) => item.href);
}
