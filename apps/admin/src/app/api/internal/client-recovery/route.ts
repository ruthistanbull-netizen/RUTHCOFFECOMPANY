import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PHASES = new Set(["detected", "recovered", "suppressed"]);
const KINDS = new Set(["dom_reconciliation"]);

function cleanText(value: unknown, max: number) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanRoute(value: unknown) {
  const route = cleanText(value, 240).split("?")[0] || "/";
  return route.startsWith("/") && !route.startsWith("//") ? route : "/";
}

function cleanFingerprint(value: unknown) {
  const fingerprint = cleanText(value, 100).replace(/[^a-zA-Z0-9:_-]/g, "");
  return fingerprint || "unknown";
}

function recoveryStatus(phase: string) {
  if (phase === "recovered") return "recovered";
  if (phase === "suppressed") return "manual_review";
  return "repairing";
}

function healthState(phase: string) {
  if (phase === "recovered") {
    return {
      status: "healthy",
      detail: "Tarayıcı DOM senkronizasyon hatası otomatik olarak kurtarıldı.",
    };
  }
  if (phase === "suppressed") {
    return {
      status: "degraded",
      detail: "Aynı tarayıcı DOM hatası kısa sürede tekrarlandı; otomatik yenileme döngüsü engellendi ve inceleme bekliyor.",
    };
  }
  return {
    status: "degraded",
    detail: "Tarayıcı DOM senkronizasyon hatası algılandı; güvenli otomatik ekran kurtarma başlatıldı.",
  };
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  let body: Record<string, unknown> = {};
  try {
    const parsed = await request.json();
    body = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz client recovery payload." }, { status: 400 });
  }

  const phase = cleanText(body.phase, 24).toLowerCase();
  const kind = cleanText(body.kind, 40).toLowerCase();
  if (!PHASES.has(phase) || !KINDS.has(kind)) {
    return NextResponse.json({ ok: false, error: "Desteklenmeyen client recovery olayı." }, { status: 400 });
  }

  const route = cleanRoute(body.route);
  const fingerprint = cleanFingerprint(body.fingerprint);
  const message = cleanText(body.message, 700);
  const source = cleanText(body.source, 80) || "admin-browser";
  const stack = cleanText(body.stack, 2400);
  const now = new Date().toISOString();
  const state = healthState(phase);

  const metadata = {
    route,
    fingerprint,
    kind,
    phase,
    source,
    stack: stack || null,
    adminProfileId: String(auth.profile.id),
    browserRecovery: true,
  };

  const [eventResult, healthResult] = await Promise.all([
    auth.supabase.from("commerce_recovery_events").insert({
      engine_key: "client-runtime",
      action: `${kind}:${phase}`,
      status: recoveryStatus(phase),
      item_count: 1,
      detail: message || state.detail,
      metadata,
      occurred_at: now,
    }),
    auth.supabase.from("panel_service_health_state").upsert({
      service_key: "client-runtime",
      status: state.status,
      detail: state.detail,
      first_seen_at: now,
      last_seen_at: now,
      recovered_at: phase === "recovered" ? now : null,
      metadata,
      updated_at: now,
    }, { onConflict: "service_key" }),
  ]);

  const missingRecoveryTables = [eventResult.error, healthResult.error]
    .filter(Boolean)
    .every((error) => /does not exist|not found|schema cache/i.test(String(error?.message || "")));

  if ((eventResult.error || healthResult.error) && !missingRecoveryTables) {
    return NextResponse.json({
      ok: false,
      error: eventResult.error?.message || healthResult.error?.message || "Client recovery kaydı oluşturulamadı.",
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json({ ok: true, phase, kind, fingerprint }, {
    status: 202,
    headers: { "Cache-Control": "no-store" },
  });
}
