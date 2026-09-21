const DEFAULT_READ_TIMEOUT_MS = 7_000;
const MIN_READ_TIMEOUT_MS = 1_000;
const MAX_READ_TIMEOUT_MS = 30_000;

function configuredReadTimeoutMs() {
  const raw = Number(
    process.env.NEXT_PUBLIC_SUPABASE_READ_TIMEOUT_MS ||
      process.env.SUPABASE_READ_TIMEOUT_MS ||
      DEFAULT_READ_TIMEOUT_MS,
  );
  if (!Number.isFinite(raw)) return DEFAULT_READ_TIMEOUT_MS;
  return Math.min(MAX_READ_TIMEOUT_MS, Math.max(MIN_READ_TIMEOUT_MS, Math.trunc(raw)));
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit) {
  const explicitMethod = init?.method?.trim();
  if (explicitMethod) return explicitMethod.toUpperCase();
  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.method.toUpperCase();
  }
  return "GET";
}

function timeoutSignal(timeoutMs: number) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(timeoutMs);
  }

  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

/**
 * Supabase reads must never hold a server render or production build open until
 * the hosting platform kills the whole page-generation worker.
 *
 * Writes keep the caller's normal fetch semantics. Read requests get a bounded
 * deadline unless the caller already supplied its own AbortSignal.
 */
export const supabaseFetch: typeof fetch = async (input, init) => {
  const method = requestMethod(input, init);
  if ((method !== "GET" && method !== "HEAD") || init?.signal) {
    return fetch(input, init);
  }

  return fetch(input, {
    ...init,
    signal: timeoutSignal(configuredReadTimeoutMs()),
  });
};
