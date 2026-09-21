export const SITE_NAME = "Ruth Istanbul";
export const SITE_URL = "https://ruthistanbul.com";

export const DEFAULT_SEO_TITLE = "Ruth Istanbul | Tasarım Takı & 925 Ayar Gümüş";
export const DEFAULT_SEO_DESCRIPTION =
  "Ruth Istanbul tasarım kolye, yüzük, bileklik ve set koleksiyonlarını keşfet. 925 ayar gümüş ve özel tasarım takılarla stilini tamamla.";
export const DEFAULT_OG_IMAGE = "/home/sss-desktop.webp";

export const SOCIAL_PROFILES = [
  "https://www.instagram.com/theruthistanbul/",
  "https://www.tiktok.com/@theruthistanbul",
] as const;

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
