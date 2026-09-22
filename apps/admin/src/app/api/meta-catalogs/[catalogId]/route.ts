import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  getMetaCatalogDetail,
  updateMetaCatalog,
} from "@/lib/integrations/metaCatalogs";
import {
  META_CATALOG_NO_STORE_HEADERS,
  metaCatalogCorrelationId,
  metaCatalogErrorResponse,
  normalizeMetaCatalogError,
  safeMetaCatalogErrorMetadata,
  writeMetaCatalogAudit,
} from "@/lib/integrations/metaCatalogRouteSupport";
import { requireMetaConnectionConfig } from "@/lib/integrations/metaMarketing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = { params: Promise<{ catalogId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  try {
    const { catalogId } = await context.params;
    const config = requireMetaConnectionConfig();
    const catalog = await getMetaCatalogDetail(config, catalogId);
    return NextResponse.json({
      ok: true,
      fetchedAt: new Date().toISOString(),
      catalog,
    }, { headers: META_CATALOG_NO_STORE_HEADERS });
  } catch (error) {
    return metaCatalogErrorResponse(
      error,
      "META_CATALOG_DETAIL_FAILED",
      "Meta katalog detayı alınamadı.",
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const correlationId = metaCatalogCorrelationId(request);

  try {
    const [{ catalogId }, body] = await Promise.all([
      context.params,
      request.json().catch(() => ({})) as Promise<Record<string, unknown>>,
    ]);
    const config = requireMetaConnectionConfig();
    const catalog = await updateMetaCatalog(config, catalogId, {
      name: typeof body.name === "string" ? body.name : "",
    });

    const auditError = await writeMetaCatalogAudit(auth, {
      action: "meta.catalog_updated",
      entityId: catalog.id,
      correlationId,
      metadata: {
        catalog_name: catalog.name,
        business_id: config.businessId,
      },
    });

    return NextResponse.json({
      ok: true,
      catalog,
      correlationId,
      warning: auditError ? "Katalog güncellendi ancak audit kaydı yazılamadı." : null,
    }, {
      headers: {
        ...META_CATALOG_NO_STORE_HEADERS,
        "X-Correlation-Id": correlationId,
      },
    });
  } catch (error) {
    const normalized = normalizeMetaCatalogError(
      error,
      "META_CATALOG_UPDATE_FAILED",
      "Meta kataloğu güncellenemedi.",
    );
    await writeMetaCatalogAudit(auth, {
      action: "meta.catalog_update_failed",
      correlationId,
      metadata: safeMetaCatalogErrorMetadata(normalized),
    });
    return metaCatalogErrorResponse(
      normalized,
      normalized.code,
      normalized.message,
      correlationId,
    );
  }
}
