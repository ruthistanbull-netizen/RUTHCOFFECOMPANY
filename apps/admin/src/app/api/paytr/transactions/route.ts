import { NextResponse } from "next/server";
import { queryPaytrTransactions } from "@ruth-commerce/commerce-core";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function credentials() {
  return {
    merchantId: process.env.PAYTR_MERCHANT_ID || "",
    merchantKey: process.env.PAYTR_MERCHANT_KEY || "",
    merchantSalt: process.env.PAYTR_MERCHANT_SALT || "",
  };
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const startDate = String(body.start_date || "").trim();
    const endDate = String(body.end_date || "").trim();
    const dummy = Number(body.dummy) === 1 ? 1 : 0;
    const result = await queryPaytrTransactions({ ...credentials(), startDate, endDate, dummy });

    await auth.supabase.from("commerce_audit_logs").insert({
      action: "paytr.transaction_report_queried",
      entity_type: "payment_report",
      entity_id: `${startDate}:${endDate}`,
      actor_type: "user",
      actor_id: auth.user.id,
      metadata: {
        provider: "paytr",
        start_date: startDate,
        end_date: endDate,
        dummy,
        response_status: result.status || null,
        err_no: result.err_no || null,
      },
    });

    return NextResponse.json({ ok: result.status === "success", result }, {
      status: result.status === "success" ? 200 : 400,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "PayTR işlem dökümü alınamadı." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
