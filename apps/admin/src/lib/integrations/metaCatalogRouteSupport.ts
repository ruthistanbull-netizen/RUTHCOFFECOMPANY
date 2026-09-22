import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { MetaMarketingError } from "@/lib/integrations/metaMarketing";

export const META_CATALOG_NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
};

type AuditAuth = {
  supabase: any;
  user: { id: string };
};

export function metaCatalogCorrelationId(request: Request) {
  const candidate = request.headers.get("x-correlation-id")?.trim() || "";
  return /^[A-Za-z0-9._:-]{1,128}$/.test(candidate) ? candidate : crypto.randomUUID();
}

export function normalizeMetaCatalogError(error: unknown, code: string, message: string) {
  return error instanceof MetaMarketingError
    ? error
    : new MetaMarketingError({ code, message, status: 502, retryable: true });
}

export function metaCatalogErrorResponse(
  error: unknown,
  code: string,
  message: string,
  correlationId?: string,
) {
  const normalized = normalizeMetaCatalogError(error, code, message);
  return NextResponse.json({
    ok: false,
    ...(correlationId ? { correlationId } : {}),
    error: {
      code: normalized.code,
      message: normalized.message,
      retryable: normalized.retryable,
      providerCode: normalized.providerCode,
      providerSubcode: normalized.providerSubcode,
      traceId: normalized.traceId,
    },
  }, {
    status: normalized.status,
    headers: {
      ...META_CATALOG_NO_STORE_HEADERS,
      ...(correlationId ? { "X-Correlation-Id": correlationId } : {}),
    },
  });
}

export function safeMetaCatalogErrorMetadata(error: MetaMarketingError) {
  return {
    code: error.code,
    status: error.status,
    retryable: error.retryable,
    provider_code: error.providerCode || null,
    provider_subcode: error.providerSubcode || null,
    trace_id: error.traceId || null,
  };
}

export async function writeMetaCatalogAudit(
  auth: AuditAuth,
  input: {
    action: string;
    entityId?: string;
    correlationId: string;
    metadata: Record<string, unknown>;
  },
) {
  try {
    const { error } = await auth.supabase.from("commerce_audit_logs").insert({
      action: input.action,
      entity_type: "meta_catalog",
      entity_id: input.entityId || null,
      actor_type: "user",
      actor_id: auth.user.id,
      metadata: { ...input.metadata, correlation_id: input.correlationId },
    });
    return error?.message || null;
  } catch (error) {
    return error instanceof Error ? error.message : "audit_failed";
  }
}
