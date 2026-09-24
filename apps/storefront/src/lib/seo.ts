export const SITE_NAME = "Rosta Coffee Co.";
export const SITE_URL = "https://rostacoffeecompany.zeabur.app";

export const DEFAULT_SEO_TITLE = "Rosta Coffee Co. | Kahve, Danışmanlık & Tedarik";
export const DEFAULT_SEO_DESCRIPTION =
  "Rosta Coffee Co. kahve, kahve danışmanlığı ve tedarik çözümleri.";
export const DEFAULT_OG_IMAGE = "/home/rosta-hero.webp";

export const SOCIAL_PROFILES = [] as const;

export function absoluteUrl(value: string | null | undefined) {
  const input = String(value || "").trim();
  if (!input) return SITE_URL;
  if (/^https?:\/\//i.test(input)) return input;
  if (input.startsWith("//")) return `https:${input}`;
  return new URL(input.startsWith("/") ? input : `/${input}`, `${SITE_URL}/`).toString();
}

export function cleanSeoText(
  value: unknown,
  fallback = "",
  maxLength = 160,
) {
  const clean = String(value || fallback || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (clean.length <= maxLength) return clean;
  const shortened = clean.slice(0, Math.max(1, maxLength - 1));
  const lastSpace = shortened.lastIndexOf(" ");
  return `${(lastSpace > maxLength * 0.65 ? shortened.slice(0, lastSpace) : shortened).trim()}…`;
}

export function titleContainsBrand(value: string) {
  return value.toLocaleLowerCase("tr-TR").includes(SITE_NAME.toLocaleLowerCase("tr-TR"));
}

export function jsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
