import { after, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { invokeRuthieAdminAction } from "@/lib/ruthieAdminGateway";
import { verifyRuthieConfirmationToken } from "@/lib/ruthieActionConfirmation";
import { createRuthieProductFast, RuthieProductCreateError } from "@/lib/ruthieProductFastPath";
import { noStoreHeaders, revalidateWebsite } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json().catch(() => null) as { token?: unknown } | null;
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    if (!token) return NextResponse.json({ ok: false, error: { message: "ROSTA Insight işlem onayı gerekli." } }, { status: 400, headers: noStoreHeaders() });

    const confirmed = verifyRuthieConfirmationToken({ token, actorId: String(auth.profile.id) });
    const action = text(confirmed.arguments.action);

    if (action === "products.create") {
      const created = await createRuthieProductFast(auth.supabase, record(confirmed.arguments.payload));
      after(async () => {
        await revalidateWebsite({
          source: "ruthie-product-create-fast",
          productIds: [created.product.id],
        });
      });

      return NextResponse.json({
        ok: true,
        result: {
          ok: true,
          action,
          title: "Ürün oluştur",
          status: 201,
          data: {
            product: created.product,
            counts: created.counts,
            durationMs: created.durationMs,
            revalidate: { queued: true },
          },
        },
        executedAt: new Date().toISOString(),
      }, { status: 200, headers: noStoreHeaders() });
    }

    const result = await invokeRuthieAdminAction({
      request,
      actorId: String(auth.profile.id),
      arguments: confirmed.arguments,
      confirmed: true,
    });

    return NextResponse.json({
      ok: result.ok,
      result,
      executedAt: new Date().toISOString(),
    }, { status: result.ok ? 200 : Math.max(400, result.status), headers: noStoreHeaders() });
  } catch (error) {
    const status = error instanceof RuthieProductCreateError ? error.status : 400;
    return NextResponse.json({
      ok: false,
      error: { message: error instanceof Error ? error.message : "ROSTA Insight işlemi doğrulanamadı." },
    }, { status, headers: noStoreHeaders() });
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}
