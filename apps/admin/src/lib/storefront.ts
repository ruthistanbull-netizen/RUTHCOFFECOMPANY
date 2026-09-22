import { ROSTA_STORE_URL } from "@/lib/platform";

export function storefrontUrl(path = "/") {
  const base = ROSTA_STORE_URL.replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function revalidateStorefront(source: string, scope: "all" | "catalog" | "theme" = "all") {
  const explicit = String(process.env.WEBSITE_REVALIDATE_URL || "").trim();
  const base = explicit || `${ROSTA_STORE_URL.replace(/\/$/, "")}/api/revalidate`;
  const secret = String(process.env.WEBSITE_REVALIDATE_SECRET || process.env.REVALIDATE_SECRET || "").trim();
  if (!secret) return { ok: false, skipped: true, reason: "missing-secret" };

  const target = base.includes("/api/revalidate") ? base : `${base.replace(/\/$/, "")}/api/revalidate`;
  try {
    const response = await fetch(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-revalidate-secret": secret,
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ source, scope, at: new Date().toISOString() }),
      cache: "no-store",
    });
    return { ok: response.ok, status: response.status, target };
  } catch (error) {
    return { ok: false, target, error: error instanceof Error ? error.message : "unknown" };
  }
}
