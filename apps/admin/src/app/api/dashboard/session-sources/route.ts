import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { applyRange } from "@/lib/ranges";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type AnalyticsEventRow = {
  session_id?: string | null;
  event_name?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
};

type SourceBucket = {
  key: string;
  name: string;
  value: number;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim().toLocaleLowerCase("tr-TR") : "";
}

function sourceBucket(metadata: Record<string, unknown> | null | undefined): Pick<SourceBucket, "key" | "name"> {
  const source = text(metadata?.source);
  const medium = text(metadata?.medium);
  const referrer = text(metadata?.referrer);

  if (source === "ig" || source.startsWith("ig_") || source.includes("instagram") || referrer.includes("instagram.com")) return { key: "instagram", name: "Instagram" };
  if (source === "fb" || source.startsWith("fb_") || source.includes("facebook") || source === "meta" || referrer.includes("facebook.com") || referrer.includes("fb.com")) return { key: "facebook", name: "Facebook" };
  if (source === "tt" || source.startsWith("tt_") || source.includes("tiktok") || referrer.includes("tiktok.com")) return { key: "tiktok", name: "TikTok" };
  if (source.includes("google") || source === "gads" || source === "adwords" || referrer.includes("google.") || referrer.includes("googleusercontent.com")) return { key: "google", name: "Google" };
  if (medium.includes("organic") && !medium.includes("social")) return { key: "organic", name: "Organik" };
  if (medium.includes("email") || medium.includes("newsletter") || source.includes("email") || source.includes("newsletter")) return { key: "email", name: "E-posta" };
  if (source === "direct" || medium === "direct" || (!source && !referrer)) return { key: "direct", name: "Doğrudan" };
  if (source === "referral" || medium === "referral" || Boolean(referrer)) return { key: "referral", name: "Yönlendirme" };
  return { key: "other", name: "Diğer" };
}

const SESSION_EVENT_NAMES = [
  "session_start",
  "page_view",
  "product_view",
  "cart_created",
  "cart_add",
  "cart_open",
  "checkout_view",
  "payment_start",
  "session_ping",
  "page_leave",
  "session_end",
];

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { supabase } = auth;
  const url = new URL(request.url);
  const range = url.searchParams.get("range") || "today";

  try {
    // Keep the Supabase query outside generic applyRange's type inference.
    // The generated Supabase types are deeply recursive and can make
    // TypeScript exceed its instantiation depth at the call site.
    const baseQuery: any = supabase
      .from("analytics_events")
      .select("session_id,event_name,metadata,created_at")
      .in("event_name", SESSION_EVENT_NAMES)
      .not("session_id", "is", null)
      .order("created_at", { ascending: true })
      .limit(10000);

    const query: any = applyRange(baseQuery, "created_at", range);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    // Match the main dashboard session metric: one unique session per
    // session_id across all tracked session activity, not just session_start.
    const sessions = new Map<string, AnalyticsEventRow>();
    for (const row of (data || []) as AnalyticsEventRow[]) {
      const sessionId = String(row.session_id || "").trim();
      if (!sessionId) continue;

      const existing = sessions.get(sessionId);
      if (!existing) {
        sessions.set(sessionId, row);
        continue;
      }

      // Prefer explicit session_start attribution when it exists.
      if (text(existing.event_name) !== "session_start" && text(row.event_name) === "session_start") {
        sessions.set(sessionId, row);
      }
    }

    const buckets = new Map<string, SourceBucket>();
    for (const row of sessions.values()) {
      const bucket = sourceBucket(row.metadata || null);
      const existing = buckets.get(bucket.key);
      if (existing) existing.value += 1;
      else buckets.set(bucket.key, { ...bucket, value: 1 });
    }

    const total = [...buckets.values()].reduce((sum, bucket) => sum + bucket.value, 0);
    const sources = [...buckets.values()]
      .sort((left, right) => right.value - left.value)
      .map((bucket) => ({
        ...bucket,
        percent: total > 0 ? Math.round((bucket.value / total) * 1000) / 10 : 0,
      }));

    return NextResponse.json({ ok: true, total, sources }, {
      headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" },
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Oturum kaynakları alınamadı.",
    }, {
      status: 500,
      headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" },
    });
  }
}
