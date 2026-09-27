import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { normalizeThemeSectionSettings } from "@ruth-commerce/commerce-core/theme-sections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STOREFRONT_ORIGIN = (process.env.NEXT_PUBLIC_STOREFRONT_URL || process.env.STOREFRONT_ORIGIN || "https://rostacoffecompany.zeabur.app").replace(/\/$/, "");

const FALLBACK_PAGES = [
  "/",
  "/products",
  "/categories",
  "/collections",
  "/search",
  "/about",
  "/contact",
  "/faq",
  "/shipping-returns",
  "/warranty-care",
  "/siparis-takip",
  "/order-tracking",
  "/privacy-policy",
  "/kvkk",
  "/commercial-communication-consent",
  "/account",
] as const;

const exactLabels: Record<string, string> = {
  "/": "Ana Sayfa",
  "/products": "Tüm Ürünler",
  "/categories": "Kategoriler",
  "/collections": "Koleksiyonlar",
  "/search": "Arama",
  "/about": "Hakkımızda",
  "/contact": "İletişim",
  "/faq": "S.S.S.",
  "/shipping-returns": "Kargo / İade",
  "/warranty-care": "Garanti / Kullanım",
  "/siparis-takip": "Sipariş Takip",
  "/order-tracking": "Sipariş Takip",
  "/privacy-policy": "Gizlilik Politikası",
  "/kvkk": "KVKK",
  "/commercial-communication-consent": "Ticari İletişim İzni",
  "/account": "Hesabım",
};

type EditorPage = {
  path: string;
  label: string;
  group: string;
  previewPath?: string;
  template?: boolean;
};

function cleanPath(value: string) {
  try {
    const url = new URL(value, STOREFRONT_ORIGIN);
    if (url.origin !== new URL(STOREFRONT_ORIGIN).origin) return "";
    const path = url.pathname.replace(/\/{2,}/g, "/");
    return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  } catch {
    return "";
  }
}

function words(value: string) {
  try {
    return decodeURIComponent(value)
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toLocaleUpperCase("tr-TR"));
  } catch {
    return value.replace(/[-_]+/g, " ");
  }
}

function pageMeta(path: string) {
  if (exactLabels[path]) return { label: exactLabels[path], group: "Sayfalar" };
  const parts = path.split("/").filter(Boolean);
  const slug = parts.at(-1) || path;
  if (path.startsWith("/pages/")) return { label: `Sayfa · ${words(slug)}`, group: "Özel Sayfalar" };
  return { label: words(slug), group: "Diğer" };
}

function publicEditorPath(path: string) {
  if (!path || path.startsWith("/api/") || path.startsWith("/internal/")) return false;
  if (/^\/(checkout|login|register|reset-password|order-success|order-fail|order-failed)(\/|$)/.test(path)) return false;
  return true;
}

function dynamicTemplate(path: string) {
  if (/^\/products\/[^/]+$/.test(path)) return { key: "/products/[slug]", label: "Ürün Sayfası", group: "Şablonlar" };
  if (/^\/(category|categories)\/[^/]+$/.test(path)) return { key: "/category/[slug]", label: "Kategori Sayfası", group: "Şablonlar" };
  if (/^\/collections\/[^/]+$/.test(path)) return { key: "/collections/[slug]", label: "Koleksiyon Sayfası", group: "Şablonlar" };
  return null;
}

async function sitemapPaths() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4_500);
  try {
    const response = await fetch(`${STOREFRONT_ORIGIN}/sitemap.xml`, { cache: "no-store", signal: controller.signal });
    if (!response.ok) return [] as string[];
    const xml = await response.text();
    return [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((match) => cleanPath(match[1] || "")).filter(Boolean);
  } catch {
    return [] as string[];
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const [themeSetting, sitemap, productResult, categoryResult, collectionResult] = await Promise.all([
    auth.supabase.from("site_settings").select("setting_value").eq("setting_key", "theme_sections").maybeSingle(),
    sitemapPaths(),
    auth.supabase.from("products").select("slug").not("slug", "is", null).limit(1),
    auth.supabase.from("categories").select("slug").not("slug", "is", null).limit(1),
    auth.supabase.from("collections").select("slug").not("slug", "is", null).limit(1),
  ]);

  const productSlug = String(productResult.data?.[0]?.slug || "").trim();
  const categorySlug = String(categoryResult.data?.[0]?.slug || "").trim();
  const collectionSlug = String(collectionResult.data?.[0]?.slug || "").trim();
  const sectionSettings = normalizeThemeSectionSettings(themeSetting.data?.setting_value || undefined);
  const rawPaths = [...new Set<string>([...FALLBACK_PAGES, ...sitemap, ...Object.keys(sectionSettings.pages)])]
    .map(cleanPath)
    .filter((path): path is string => Boolean(path) && publicEditorPath(path));

  const templates = new Map<string, EditorPage>();
  const pages: EditorPage[] = [];

  for (const path of rawPaths) {
    const template = dynamicTemplate(path);
    if (template) {
      if (!templates.has(template.key)) {
        templates.set(template.key, {
          path: template.key,
          label: template.label,
          group: template.group,
          previewPath: path,
          template: true,
        });
      }
      continue;
    }
    pages.push({ path, ...pageMeta(path) });
  }

  const guaranteedTemplates: Array<[string, string, string]> = [
    ["/products/[slug]", "Ürün Sayfası", productSlug ? `/products/${productSlug}` : ""],
    ["/category/[slug]", "Kategori Sayfası", categorySlug ? `/category/${categorySlug}` : ""],
    ["/collections/[slug]", "Koleksiyon Sayfası", collectionSlug ? `/collections/${collectionSlug}` : ""],
  ];

  for (const [path, label, previewPath] of guaranteedTemplates) {
    const existing = templates.get(path);
    if (existing) {
      if (!existing.previewPath && previewPath) existing.previewPath = previewPath;
      continue;
    }
    templates.set(path, {
      path,
      label,
      group: "Şablonlar",
      previewPath: previewPath || undefined,
      template: true,
    });
  }

  pages.push(...templates.values());
  pages.sort((a, b) => {
    const order = ["Sayfalar", "Şablonlar", "Özel Sayfalar", "Diğer"];
    const group = order.indexOf(a.group) - order.indexOf(b.group);
    return group || a.label.localeCompare(b.label, "tr");
  });

  return NextResponse.json({ ok: true, pages }, { headers: { "Cache-Control": "no-store" } });
}
