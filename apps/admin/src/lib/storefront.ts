import { ROSTA_STORE_URL } from "@/lib/platform";
import { revalidateWebsite } from "@/lib/websiteRevalidate";

export function storefrontUrl(path = "/") {
  const base = ROSTA_STORE_URL.replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function revalidateStorefront(source: string, scope: "all" | "catalog" | "theme" = "all") {
  return revalidateWebsite({ source, scope });
}
