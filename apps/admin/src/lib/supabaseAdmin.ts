import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeSupabaseUrl } from "@/lib/supabaseRuntime";
import { assertRostaSupabaseUrl } from "@/lib/platform";

let adminClient: SupabaseClient | null = null;

const DATABASE_READ_TIMEOUT_MS = 8_000;
const DATABASE_WRITE_TIMEOUT_MS = 30_000;
const databaseReads = new Map<string, Promise<Response>>();

// Transport deduplication only: no persisted/private response cache. Independent
// panel loaders often request the same settings/groups concurrently. They share
// the in-flight read, and writes detach both pre-write and mid-write reads.
export const supabaseAdminFetch: typeof fetch = async (input, init) => {
  const request = input instanceof Request ? input : null;
  const url = new URL(request?.url || String(input));
  const method = String(init?.method || request?.method || "GET").toUpperCase();
  const authUserRead = url.pathname === "/auth/v1/user" && method === "GET";
  if (!url.pathname.startsWith("/rest/v1/") && !authUserRead) return fetch(input, { ...init, cache: "no-store" });

  const readOnly = method === "GET" || method === "HEAD";
  const headers = new Headers(request?.headers);
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  const upstreamSignal = init?.signal || request?.signal;
  const key = JSON.stringify([method, url.href, [...headers.entries()].sort()]);
  const shareable = readOnly && !upstreamSignal;
  if (shareable && databaseReads.has(key)) return (await databaseReads.get(key)!).clone();
  if (!readOnly) databaseReads.clear();

  const controller = new AbortController();
  const abort = () => controller.abort(upstreamSignal?.reason);
  if (upstreamSignal?.aborted) abort();
  else upstreamSignal?.addEventListener("abort", abort, { once: true });
  const startedAt = performance.now();
  const timer = setTimeout(() => {
    // AbortError suppresses SDK network retries once this request's deadline
    // expires. PostgreSQL execution cancellation still depends on the server.
    controller.abort(new DOMException("Database request deadline exceeded", "AbortError"));
  }, authUserRead ? 3_000 : readOnly ? DATABASE_READ_TIMEOUT_MS : DATABASE_WRITE_TIMEOUT_MS);

  const work = (async () => {
    try {
      const response = await fetch(input, { ...init, cache: "no-store", signal: controller.signal });
      // Keep the deadline through the response body, not just until HTTP headers.
      const body = method === "HEAD" || [204, 205, 304].includes(response.status)
        ? null : await response.arrayBuffer();
      return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
    } finally {
      clearTimeout(timer);
      upstreamSignal?.removeEventListener("abort", abort);
      const durationMs = Math.round(performance.now() - startedAt);
      if (durationMs >= 1_500) console.warn("[admin/database] Slow request", {
        method, resource: url.pathname, durationMs, aborted: controller.signal.aborted,
      });
    }
  })();
  if (shareable) databaseReads.set(key, work);
  try {
    const response = await work;
    return shareable ? response.clone() : response;
  } finally {
    if (databaseReads.get(key) === work) databaseReads.delete(key);
    if (!readOnly) databaseReads.clear();
  }
};

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const payload = parts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
    return JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function assertValidServerKey(supabaseUrl: string, key: string) {
  if (key.startsWith("sb_secret_")) return;

  const payload = decodeJwtPayload(key);
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];

  if (
    payload?.role !== "service_role" ||
    (typeof payload?.ref === "string" && payload.ref !== projectRef)
  ) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY ROSTA Supabase projesi için geçerli değil.",
    );
  }
}

export function getSupabaseAdmin() {
  const supabaseUrl = assertRostaSupabaseUrl(normalizeSupabaseUrl(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  ));
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!serviceRoleKey) {
    throw new Error("Supabase admin service-role env eksik.");
  }

  assertValidServerKey(supabaseUrl, serviceRoleKey);

  if (!adminClient) {
    adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: supabaseAdminFetch },
    });
  }

  return adminClient;
}
