import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { applyRange } from "@/lib/ranges";
import {
  invokeRuthieAdminAction,
  type RuthieAdminInvocationResult,
} from "@/lib/ruthieAdminGateway";
import { buildRuthiePresentation } from "@/lib/ruthiePresentation";
import {
  resolveRuthiePresentationRequest,
  type RuthiePresentationRequest,
} from "@/lib/ruthiePresentationRequest";
import { noStoreHeaders } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AdminAuth = { supabase: any };

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.replace(/\s+/g, " ").trim().slice(0, 600) : "";
  if (!text) {
    return NextResponse.json({ ok: false, error: { message: "Görsel sonuç için bir istek gerekli." } }, {
      status: 400,
      headers: noStoreHeaders(),
    });
  }

  const resolved = resolveRuthiePresentationRequest(text);
  const fastResult = await fastPresentationResult(auth, resolved);
  const result = fastResult || await invokeRuthieAdminAction({
    request,
    actorId: String(auth.profile.id),
    arguments: resolved,
  });

  if (!result.ok) {
    return NextResponse.json({
      ok: false,
      error: { message: result.error || "ROSTA Insight görsel sonucu hazırlayamadı." },
      action: resolved.action,
    }, { status: result.status >= 400 ? result.status : 400, headers: noStoreHeaders() });
  }

  const requestedRows = numericLimit(resolved.query.limit ?? resolved.query.pageSize, 50);
  const presentation = buildRuthiePresentation(result, {
    userText: text,
    forceAutoOpen: true,
    maxRows: requestedRows,
  });

  return NextResponse.json({
    ok: true,
    action: resolved.action,
    presentation,
  }, { headers: noStoreHeaders() });
}

async function fastPresentationResult(
  auth: AdminAuth,
  resolved: RuthiePresentationRequest,
): Promise<RuthieAdminInvocationResult | null> {
  if (resolved.action !== "orders.search") return null;
  const view = String(resolved.query.view || "").toLocaleLowerCase("tr-TR");
  if (view.includes("payment")) return null;

  const limit = numericLimit(resolved.query.limit ?? resolved.query.pageSize, 10);
  const search = String(resolved.query.q || "").trim();
  const status = String(resolved.query.status || "").trim();
  const payment = String(resolved.query.payment || "all").trim();
  const range = String(resolved.query.range || "all").trim();

  let query = auth.supabase
    .from("orders")
    .select(`
      id,
      order_no,
      customer_name,
      customer_email,
      total_amount,
      currency,
      status,
      payment_status,
      cargo_company,
      cargo_tracking_no,
      shipping_provider,
      shipping_status,
      created_at,
      order_items (
        id,
        product_name,
        variant_name,
        quantity,
        image_url
      )
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  query = applyRange(query, "created_at", range);
  if (payment && payment !== "all") query = query.eq("payment_status", payment);
  if (status && status !== "all") query = query.eq("status", status);
  if (search) {
    const escaped = search.replace(/[,%()]/g, " ").replace(/\s+/g, " ").trim();
    if (escaped) {
      query = query.or(`order_no.ilike.%${escaped}%,customer_name.ilike.%${escaped}%,customer_email.ilike.%${escaped}%`);
    }
  }

  const { data, error } = await query;
  if (error) {
    return {
      ok: false,
      action: resolved.action,
      title: "Siparişleri getir",
      status: 400,
      error: error.message,
    };
  }

  return {
    ok: true,
    action: resolved.action,
    title: "Siparişleri getir",
    status: 200,
    data: {
      ok: true,
      orders: data || [],
      total: (data || []).length,
      fastPath: true,
    },
  };
}

function numericLimit(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(1, Math.min(50, Math.trunc(number))) : fallback;
}
