import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { invokeRuthieAdminAction } from "@/lib/ruthieAdminGateway";
import { noStoreHeaders } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const normalized = text(value);
    if (normalized) return normalized;
  }
  return "";
}

function normalizeArguments(input: Record<string, unknown>) {
  const action = text(input.action);
  const query = { ...record(input.query) };
  const reason = text(input.reason).toLocaleLowerCase("tr-TR");

  const customerSearch = firstText(
    query.q,
    query.search,
    query.customer,
    query.customerName,
    query.customer_name,
    query.name,
    input.q,
    input.search,
    input.customer,
    input.customerName,
    input.customer_name,
    input.name,
  );

  const customerActionActuallyRequestsOrders = action === "customers.search"
    && Boolean(customerSearch)
    && /sipariş|order|alışveriş/.test(reason);

  if (action === "orders.search" || customerActionActuallyRequestsOrders) {
    if (customerSearch) query.q = customerSearch;
    if (!text(query.payment)) query.payment = "all";
    if (!text(query.range)) query.range = "all";

    return {
      ...input,
      action: "orders.search",
      query,
    };
  }

  return input;
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json().catch(() => null) as { arguments?: unknown } | null;
    const rawArgs = body?.arguments && typeof body.arguments === "object" && !Array.isArray(body.arguments)
      ? body.arguments as Record<string, unknown>
      : {};
    const args = normalizeArguments(rawArgs);
    const result = await invokeRuthieAdminAction({
      request,
      actorId: String(auth.profile.id),
      arguments: args,
    });
    return NextResponse.json({ ok: true, result }, { status: result.pendingAction ? 202 : 200, headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: { message: error instanceof Error ? error.message : "ROSTA Insight admin aracı çalıştırılamadı." },
    }, { status: 400, headers: noStoreHeaders() });
  }
}
