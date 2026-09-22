const VOLATILE_ROOT_KEYS = new Set([
  "__fromCache",
  "__stale",
  "__revalidating",
  "__readModel",
  "__snapshotRefreshedAt",
  "revision",
  "__revision",
  "dataRevision",
  "data_revision",
  "generatedAt",
  "generated_at",
  "refreshedAt",
  "refreshed_at",
  "fetchedAt",
  "fetched_at",
  "checkedAt",
  "checked_at",
  "syncedAt",
  "synced_at",
  "servedAt",
  "served_at",
  "expiresAt",
  "expires_at",
  "requestId",
  "request_id",
  "serverTime",
  "server_time",
]);

/**
 * Returns a deterministic identity for page data while ignoring response-envelope
 * heartbeat/revision fields at the root. Nested entity timestamps are preserved,
 * so actual product/order/customer changes still produce a different identity.
 */
export function adminPayloadFingerprint(value: unknown) {
  if (value == null) return "null";
  try {
    let normalized = value;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const record = value as Record<string, unknown>;
      const stable: Record<string, unknown> = {};
      for (const key of Object.keys(record).sort()) {
        if (VOLATILE_ROOT_KEYS.has(key)) continue;
        stable[key] = record[key];
      }
      normalized = stable;
    }

    const serialized = JSON.stringify(normalized);
    let hash = 2166136261;
    for (let index = 0; index < serialized.length; index += 1) {
      hash ^= serialized.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `${serialized.length}:${hash >>> 0}`;
  } catch {
    return String(value);
  }
}

export function sameAdminPayload(left: unknown, right: unknown) {
  return adminPayloadFingerprint(left) === adminPayloadFingerprint(right);
}
