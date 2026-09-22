"use client";

import { normalizePanelRoute, panelSnapshotEligible } from "@/lib/panelSyncRegistry";

type StableSeedOptions = {
  revision?: number | null;
  status?: string | null;
};

// Compatibility cleanup only. The former v1 implementation wrapped window.fetch
// and became a second cache owner above adminApi. That meant even an explicit
// hard refresh could be answered from sessionStorage instead of reaching the DB.
// adminApi is now the only GET cache/read-model owner; this module only keeps the
// monotonic revision guard used by the realtime panel_read_models subscription.
const LEGACY_STABLE_PREFIX = "ruth_admin_stable_resource_v1:";
const revisions = new Map<string, number>();
let installed = false;

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

function meaningful(value: unknown, depth = 0): boolean {
  if (depth > 5 || value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return Boolean(value.trim());
  if (typeof value === "number") return Number.isFinite(value) && value !== 0;
  if (typeof value === "boolean") return value;
  if (typeof value !== "object") return false;

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key.startsWith("__") || IGNORED_KEYS.has(key)) continue;
    if (meaningful(child, depth + 1)) return true;
  }
  return false;
}

export function seedStableAdminResource(path: string, value: unknown, options: StableSeedOptions = {}) {
  if (typeof window === "undefined" || !value || typeof value !== "object" || (value as any).ok === false) return false;
  if (String(options.status || "healthy") !== "healthy" || !meaningful(value)) return false;

  const normalized = normalizePanelRoute(path);
  if (!normalized || !panelSnapshotEligible(normalized)) return false;
  const nextRevision = Number.isFinite(Number(options.revision)) ? Number(options.revision) : null;
  const previousRevision = revisions.get(normalized);
  if (previousRevision != null && nextRevision != null && nextRevision < previousRevision) return false;
  if (nextRevision != null) revisions.set(normalized, nextRevision);
  return true;
}

// Retained only for source compatibility. Resource payloads are owned by adminApi.
export function peekStableAdminResource<T = any>(_path: string): T | null {
  return null;
}

export function clearStableAdminResources(match?: string) {
  for (const key of [...revisions.keys()]) if (!match || key.includes(match)) revisions.delete(key);
  if (typeof window === "undefined") return;
  try {
    const remove: string[] = [];
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (!key?.startsWith(LEGACY_STABLE_PREFIX)) continue;
      if (!match) remove.push(key);
      else {
        try {
          const path = decodeURIComponent(key.slice(LEGACY_STABLE_PREFIX.length));
          if (path.includes(match)) remove.push(key);
        } catch {}
      }
    }
    remove.forEach((key) => window.sessionStorage.removeItem(key));
  } catch {}
}

export function installAdminStableResourceLayer() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  // One-way retirement of the old fetch-intercepting cache. Do not install a
  // replacement fetch wrapper here: adminApi must remain the single read owner.
  clearStableAdminResources();
}
