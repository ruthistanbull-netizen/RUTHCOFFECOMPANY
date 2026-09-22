import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  inspectMetaMarketingConnection,
  MetaMarketingError,
} from "@/lib/integrations/metaMarketing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
};

type AuditContext = {
  // Supabase's PostgREST builder is generic and PromiseLike; the route only needs
  // the narrow runtime capability below and never exposes the client to ROSTA Insight.
  supabase: any;
  user: { id: string };
};

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const correlationId = request.headers.get("x-correlation-id")?.trim() || crypto.randomUUID();

  try {
    const report = await inspectMetaMarketingConnection();
    const auditError = await writeAudit(auth, {
      action: "meta.connection_checked",
      entityId: report.resources.adAccount.data?.id,
      correlationId,
      metadata: {
        graph_version: report.graphVersion,
        reporting_ready: report.readiness.reporting,
        management_ready: report.readiness.management,
        catalog_ads_ready: report.readiness.catalogAds,
        permission_states: {
          ads_read: report.permissions.adsRead,
          ads_management: report.permissions.adsManagement,
          business_management: report.permissions.businessManagement,
          catalog_management: report.permissions.catalogManagement,
        },
        resource_states: Object.fromEntries(
          Object.entries(report.resources).map(([key, value]) => [key, value.state]),
        ),
      },
    });

    const warnings = auditError
      ? [...report.warnings, "Bağlantı sonucu döndü ancak audit kaydı yazılamadı."]
      : report.warnings;

    return NextResponse.json(
      { ...report, warnings, correlationId },
      {
        status: report.ok ? 200 : 502,
        headers: NO_STORE_HEADERS,
      },
    );
  } catch (error) {
    const normalized = error instanceof MetaMarketingError
      ? error
      : new MetaMarketingError({
        code: "META_CONNECTION_CHECK_FAILED",
        message: "Meta bağlantı testi tamamlanamadı.",
        status: 500,
      });

    await writeAudit(auth, {
      action: "meta.connection_check_failed",
      correlationId,
      metadata: {
        code: normalized.code,
        status: normalized.status,
        retryable: normalized.retryable,
        provider_code: normalized.providerCode || null,
        provider_subcode: normalized.providerSubcode || null,
        trace_id: normalized.traceId || null,
      },
    });

    return NextResponse.json(
      {
        ok: false,
        correlationId,
        error: {
          code: normalized.code,
          message: normalized.message,
          retryable: normalized.retryable,
          providerCode: normalized.providerCode,
          providerSubcode: normalized.providerSubcode,
          traceId: normalized.traceId,
        },
      },
      {
        status: normalized.status,
        headers: NO_STORE_HEADERS,
      },
    );
  }
}

async function writeAudit(
  auth: AuditContext,
  input: {
    action: string;
    entityId?: unknown;
    correlationId: string;
    metadata: Record<string, unknown>;
  },
): Promise<string | null> {
  try {
    const { error } = await auth.supabase.from("commerce_audit_logs").insert({
      action: input.action,
      entity_type: "meta_integration",
      entity_id: typeof input.entityId === "string" ? input.entityId : null,
      actor_type: "user",
      actor_id: auth.user.id,
      metadata: {
        ...input.metadata,
        correlation_id: input.correlationId,
      },
    });
    return error?.message || null;
  } catch (error) {
    return error instanceof Error ? error.message : "audit_failed";
  }
}
