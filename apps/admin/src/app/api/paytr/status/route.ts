import { NextResponse } from "next/server";
import { queryPaytrStatus } from "@ruth-commerce/commerce-core";
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

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  try {
    const merchantOid = new URL(request.url).searchParams.get("merchant_oid")?.trim() || "";
    const result = await queryPaytrStatus({ ...credentials(), merchantOid });

    await auth.supabase.from("commerce_audit_logs").insert({
      action: "paytr.status_queried",
      entity_type: "payment",
      entity_id: merchantOid,
      actor_type: "user",
      actor_id: auth.user.id,
      metadata: {
        provider: "paytr",
        response_status: result.status || null,
        err_no: result.err_no || null,
      },
    });

    return NextResponse.json({ ok: result.status === "success", result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "PayTR durum sorgusu başarısız." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
