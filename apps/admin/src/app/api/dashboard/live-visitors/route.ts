import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const LIVE_WINDOW_MS = 60_000;
const TERMINAL_EVENTS = new Set(["session_end"]);
const LIVE_EVENTS = [
  "session_start",
  "page_view",
  "product_view",
  "cart_created",
  "cart_add",
  "cart_open",
  "checkout_view",
  "payment_start",
  "session_ping",
  "session_end",
];

type ActivityRow = {
  session_id?: string | null;
  event_name?: string | null;
  created_at?: string | null;
};

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  try {
    const cutoff = new Date(Date.now() - LIVE_WINDOW_MS).toISOString();
    const result = await auth.supabase
      .from("analytics_events")
      .select("session_id,event_name,created_at")
      .in("event_name", LIVE_EVENTS)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(5000);

    if (result.error) throw new Error(result.error.message);

    const latestBySession = new Map<string, ActivityRow>();
    for (const row of (result.data || []) as ActivityRow[]) {
      const sessionId = String(row.session_id || "").trim();
      if (!sessionId || latestBySession.has(sessionId)) continue;
      latestBySession.set(sessionId, row);
    }

    let activeVisitors = 0;
    for (const row of latestBySession.values()) {
      if (!TERMINAL_EVENTS.has(String(row.event_name || ""))) activeVisitors += 1;
    }

    return NextResponse.json(
      {
        ok: true,
        activeVisitors,
        windowSeconds: Math.round(LIVE_WINDOW_MS / 1000),
        updatedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Anlık ziyaretçi sayısı alınamadı." },
      { status: 500, headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" } },
    );
  }
}
