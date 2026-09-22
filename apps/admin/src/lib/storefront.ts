export function storefrontUrl(path = "/") {
  const base = String(
    process.env.NEXT_PUBLIC_STORE_URL ||
    process.env.STORE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function revalidateStorefront(source: string, scope: "all" | "catalog" | "theme" = "all") {
  const base = String(
    process.env.WEBSITE_REVALIDATE_URL ||
    process.env.STORE_URL ||
    process.env.NEXT_PUBLIC_STORE_URL ||
    ""
  ).replace(/\/$/, "");
  const secret = String(process.env.WEBSITE_REVALIDATE_SECRET || "").trim();
  if (!base || !secret) return { ok: false, skipped: true };

  const target = base.includes("/api/revalidate") ? base : `${base}/api/revalidate`;
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
    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false };
  }
}
