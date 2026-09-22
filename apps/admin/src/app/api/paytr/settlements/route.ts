import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { loadPaytrSettlementReport } from "@/lib/paytrSettlementReport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function credentials() {
  return {
    merchantId: process.env.PAYTR_MERCHANT_ID || "",
    merchantKey: process.env.PAYTR_MERCHANT_KEY || "",
    merchantSalt: process.env.PAYTR_MERCHANT_SALT || "",
  };
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);

  try {
    const report = await loadPaytrSettlementReport({
      ...credentials(),
      startDate: url.searchParams.get("start"),
      endDate: url.searchParams.get("end"),
    });

    await auth.supabase.from("commerce_audit_logs").insert({
      action: "paytr.payment_summary_queried",
      entity_type: "payment_report",
      entity_id: `${report.range.startDate}:${report.range.endDate}`,
      actor_type: "user",
      actor_id: auth.user.id,
      metadata: {
        provider: "paytr",
        start_date: report.range.startDate,
        end_date: report.range.endDate,
        response_status: report.providerStatus,
        row_count: report.rows.length,
        future_count: report.summary.futureCount,
        provider_future_data_seen: report.diagnostics.providerFutureDataSeen,
        provider_future_block_count: report.diagnostics.providerFutureBlockCount,
        parser_mismatch: report.diagnostics.parserMismatch,
        queried_windows: report.diagnostics.queriedWindows,
        failed_window_count: report.diagnostics.failedWindowCount,
      },
    });

    return NextResponse.json({ ok: true, ...report }, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "PayTR hakedişleri alınamadı." },
      { status: 400, headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
    );
  }
}
