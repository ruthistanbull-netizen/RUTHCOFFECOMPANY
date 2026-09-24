import { withDependencyGuard } from "@/lib/platformResilience";

type GuardPolicy = {
  name: string;
  timeoutMs: number;
  maxConcurrent: number;
  failureThreshold: number;
  resetAfterMs: number;
};

type HttpResponseError = Error & { response?: Response; status?: number };

const HOST_POLICIES: Array<[RegExp, GuardPolicy]> = [
  [/^(?:www\.)?basitkargo\.com$/i, { name: "basit-kargo", timeoutMs: 15_000, maxConcurrent: 8, failureThreshold: 4, resetAfterMs: 30_000 }],
  [/^(?:gmail|oauth2)\.googleapis\.com$/i, { name: "gmail-google", timeoutMs: 12_000, maxConcurrent: 8, failureThreshold: 4, resetAfterMs: 30_000 }],
  [/^graph\.facebook\.com$/i, { name: "meta-graph", timeoutMs: 18_000, maxConcurrent: 10, failureThreshold: 5, resetAfterMs: 30_000 }],
  [/^(?:www\.)?paytr\.com$/i, { name: "paytr", timeoutMs: 18_000, maxConcurrent: 10, failureThreshold: 4, resetAfterMs: 20_000 }],
];

function urlOf(input: RequestInfo | URL) {
  try {
    if (input instanceof Request) return new URL(input.url);
    return new URL(input instanceof URL ? input.toString() : String(input));
  } catch {
    return null;
  }
}

function policyFor(input: RequestInfo | URL) {
  const url = urlOf(input);
  if (!url) return null;
  for (const [matcher, policy] of HOST_POLICIES) if (matcher.test(url.hostname)) return policy;
  return null;
}

function methodOf(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.method) return String(init.method).toUpperCase();
  if (input instanceof Request) return input.method.toUpperCase();
  return "GET";
}

function mergedHeaders(input: RequestInfo | URL, init?: RequestInit) {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  if (init?.headers) new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  return headers;
}

function requestHasIdempotency(input: RequestInfo | URL, init?: RequestInit) {
  const headers = mergedHeaders(input, init);
  return headers.has("x-idempotency-key") || headers.has("idempotency-key");
}

function callerOwnsRetry(input: RequestInfo | URL, init?: RequestInit) {
  return Boolean(mergedHeaders(input, init).get("x-ruth-retry-owner")?.trim());
}

function retryableStatus(status: number) {
  return [408, 425, 429, 500, 502, 503, 504].includes(status);
}

export function installServerFetchGuard() {
  const root = globalThis as typeof globalThis & {
    __ruthOriginalFetch?: typeof fetch;
    __ruthFetchGuardInstalled?: boolean;
  };
  if (root.__ruthFetchGuardInstalled || typeof root.fetch !== "function") return;

  const original = root.fetch.bind(root);
  root.__ruthOriginalFetch = original;
  root.__ruthFetchGuardInstalled = true;

  root.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const guard = policyFor(input);
    if (!guard) return original(input, init);

    const method = methodOf(input, init);
    const retryOwnedByCaller = callerOwnsRetry(input, init);
    const safeRetry = !retryOwnedByCaller && (["GET", "HEAD", "OPTIONS"].includes(method) || requestHasIdempotency(input, init));
    const externalSignal = init?.signal || (input instanceof Request ? input.signal : undefined);

    try {
      return await withDependencyGuard(
        guard.name,
        async () => {
          const controller = new AbortController();
          const onAbort = () => controller.abort(externalSignal?.reason);
          if (externalSignal?.aborted) onAbort();
          else externalSignal?.addEventListener("abort", onAbort, { once: true });

          const timer = setTimeout(() => {
            controller.abort(new Error(`${guard.name} provider timeout`));
          }, guard.timeoutMs);

          try {
            const requestInput = input instanceof Request ? input.clone() : input;
            const response = await original(requestInput, { ...init, signal: controller.signal });
            if (retryableStatus(response.status)) {
              const error = new Error(`${guard.name} HTTP ${response.status}`) as HttpResponseError;
              error.status = response.status;
              error.response = response;
              throw error;
            }
            return response;
          } finally {
            clearTimeout(timer);
            externalSignal?.removeEventListener("abort", onAbort);
          }
        },
        {
          timeoutMs: guard.timeoutMs + 250,
          retries: safeRetry ? 2 : 0,
          maxConcurrent: guard.maxConcurrent,
          failureThreshold: guard.failureThreshold,
          resetAfterMs: guard.resetAfterMs,
        },
        (error) => {
          const status = Number((error as HttpResponseError)?.status || 0);
          return safeRetry && (!status || retryableStatus(status));
        },
      );
    } catch (error) {
      const response = (error as HttpResponseError)?.response;
      if (response) return response;
      throw error;
    }
  }) as typeof fetch;
}
