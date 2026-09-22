import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  createMetaCatalog,
  listMetaCatalogs,
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

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  try {
    const config = requireMetaConnectionConfig();
    const result = await listMetaCatalogs(config);
    return NextResponse.json({
      ok: true,
      fetchedAt: new Date().toISOString(),
      businessId: config.businessId,
      configuredCatalogId: config.catalogId || null,
      ...result,
    }, { headers: META_CATALOG_NO_STORE_HEADERS });
  } catch (error) {
    return metaCatalogErrorResponse(error, "META_CATALOG_LIST_FAILED", "Meta katalogları alınamadı.");
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const correlationId = metaCatalogCorrelationId(request);

  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const config = requireMetaConnectionConfig();
    const catalog = await createMetaCatalog(config, {
      name: typeof body.name === "string" ? body.name : "",
      vertical: typeof body.vertical === "string" ? body.vertical : "commerce",
    });

    const auditError = await writeMetaCatalogAudit(auth, {
      action: "meta.catalog_created",
      entityId: catalog.id,
      correlationId,
      metadata: {
        catalog_name: catalog.name,
        vertical: catalog.vertical,
        business_id: config.businessId,
      },
    });

    return NextResponse.json({
      ok: true,
      catalog,
      correlationId,
      warning: auditError ? "Katalog oluşturuldu ancak audit kaydı yazılamadı." : null,
    }, {
      status: 201,
      headers: {
        ...META_CATALOG_NO_STORE_HEADERS,
        "X-Correlation-Id": correlationId,
      },
    });
  } catch (error) {
    const normalized = normalizeMetaCatalogError(
      error,
      "META_CATALOG_CREATE_FAILED",
      "Meta kataloğu oluşturulamadı.",
    );
    await writeMetaCatalogAudit(auth, {
      action: "meta.catalog_create_failed",
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
