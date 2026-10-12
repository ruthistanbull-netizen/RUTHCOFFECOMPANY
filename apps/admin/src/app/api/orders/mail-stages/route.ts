import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Native order cards request mail status in batches. Never infer "sent" from
// order status: only email_logs and review_request_emails are authoritative.
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const raw = request.nextUrl.searchParams.get("ids") || "";
  const ids = [...new Set(raw.split(",").map(v => v.trim()).filter(Boolean))];
  if (!ids.length || ids.length > 40 ||
      ids.some(id => !/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(id))) {
    return NextResponse.json({ ok: false, error: "1-40 geçerli sipariş ID'si gerekli." }, { status: 400 });
  }
  const [emailResult, reviewResult] = await Promise.all([
    auth.supabase.from("email_logs")
      .select("order_id,template_key,status,sent_at,error_message,created_at")
      .in("order_id", ids).order("created_at", { ascending: true }),
    auth.supabase.from("review_request_emails")
      .select("order_id,status,sent_at,error_message")
      .in("order_id", ids)
  ]);
  if (emailResult.error || reviewResult.error) {
    return NextResponse.json({
      ok: false,
      error: emailResult.error?.message || reviewResult.error?.message || "E-posta kayıtları alınamadı."
    }, { status: 500 });
  }

  const records = ids.map(orderId => {
    const logs = (emailResult.data || []).filter(row => String(row.order_id) === orderId)
      .map(({ template_key, status, sent_at, error_message }) =>
        ({ template_key, status, sent_at, error_message }));
    const review = (reviewResult.data || []).find(row => String(row.order_id) === orderId);
    return {
      orderId, emailLogs: logs,
      reviewStatus: review?.status || "",
      reviewSentAt: review?.sent_at || "",
      reviewError: review?.error_message || ""
    };
  });

  return NextResponse.json({ ok: true, records },
    { headers: { "Cache-Control": "private, no-store" } });
}
