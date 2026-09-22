export type AdminPayloadSummary = {
  arraysSeen: number;
  arrayItems: number;
  meaningfulScalars: number;
};

export type AdminContinuityFallbackInput = {
  method: string;
  status?: number | null;
  hasLastGood: boolean;
  continuityProbe?: boolean;
  cacheBypass?: boolean;
  networkError?: boolean;
};

const IGNORED_KEYS = new Set([
  "ok",
  "status",
  "message",
  "generatedAt",
  "generated_at",
  "refreshedAt",
  "refreshed_at",
  "expiresAt",
  "expires_at",
  "updatedAt",
  "updated_at",
  "metadata",
  "meta",
]);

const TRANSIENT_READ_STATUSES = new Set([408, 425, 429]);

export function summarizeAdminPayload(value: unknown, depth = 0): AdminPayloadSummary {
  const summary: AdminPayloadSummary = { arraysSeen: 0, arrayItems: 0, meaningfulScalars: 0 };
  if (depth > 5 || value == null) return summary;

  if (Array.isArray(value)) {
    summary.arraysSeen += 1;
    summary.arrayItems += value.length;
    return summary;
  }

  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (key.startsWith("__") || IGNORED_KEYS.has(key)) continue;
      const nested = summarizeAdminPayload(child, depth + 1);
      summary.arraysSeen += nested.arraysSeen;
      summary.arrayItems += nested.arrayItems;
      summary.meaningfulScalars += nested.meaningfulScalars;
    }
    return summary;
  }

  if (typeof value === "string") {
    if (value.trim()) summary.meaningfulScalars += 1;
  } else if (typeof value === "number") {
    if (Number.isFinite(value) && value !== 0) summary.meaningfulScalars += 1;
  } else if (typeof value === "boolean" && value) {
    summary.meaningfulScalars += 1;
  }

  return summary;
}

export function validAdminPayload(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && (value as any).ok !== false);
}

export function meaningfulAdminPayload(value: unknown) {
  if (!validAdminPayload(value)) return false;
  const summary = summarizeAdminPayload(value);
  return summary.arrayItems > 0 || summary.meaningfulScalars > 0;
}

export function suspiciousAdminEmptyTransition(previous: unknown, next: unknown) {
  if (!meaningfulAdminPayload(previous) || !validAdminPayload(next)) return false;
  const before = summarizeAdminPayload(previous);
  const after = summarizeAdminPayload(next);

  if (before.arrayItems > 0 && after.arraysSeen > 0 && after.arrayItems === 0) return true;
  return (
    (before.arrayItems > 0 || before.meaningfulScalars > 0)
    && after.arrayItems === 0
    && after.meaningfulScalars === 0
  );
}

export function transientAdminReadStatus(status: unknown) {
  const value = Number(status);
  return Number.isFinite(value) && (TRANSIENT_READ_STATUSES.has(value) || (value >= 500 && value <= 599));
}

export function shouldServeAdminContinuityFallback(input: AdminContinuityFallbackInput) {
  if (String(input.method || "GET").toUpperCase() !== "GET") return false;
  if (!input.hasLastGood || input.continuityProbe || input.cacheBypass) return false;
  if (input.networkError) return true;
  return transientAdminReadStatus(input.status);
}

function finiteRevision(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function payloadRevision(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, any>;
  for (const candidate of [
    record.revision,
    record.__revision,
    record.dataRevision,
    record.data_revision,
    record.metadata?.revision,
    record.meta?.revision,
  ]) {
    const revision = finiteRevision(candidate);
    if (revision != null) return revision;
  }
  return null;
}

export const ADMIN_LAST_GOOD_PREFIX = "ruth_admin_last_good_v2:";

export function adminLastGoodStorageKey(path: string) {
  return `${ADMIN_LAST_GOOD_PREFIX}${encodeURIComponent(path)}`;
}
