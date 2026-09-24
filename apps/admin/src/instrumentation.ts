import { joinInternalServiceUrl, resolveInternalServiceBaseUrl } from "@ruth-commerce/commerce-core";

const CANONICAL_ADMIN_HOST = "rostapanel.zeabur.app";

function installZeaburSelfFetchLoopback() {
  const port = String(process.env.PORT || "").trim();
  const isZeabur = Boolean(String(process.env.ZEABUR_SERVICE_ID || "").trim() || String(process.env.ZEABUR_PROJECT_ID || "").trim());
  if (!isZeabur || !port || typeof globalThis.fetch !== "function") return;

  const root = globalThis as typeof globalThis & { __ruthZeaburLoopbackFetchInstalled?: boolean };
  if (root.__ruthZeaburLoopbackFetchInstalled) return;

  const original = root.fetch.bind(root);
  root.__ruthZeaburLoopbackFetchInstalled = true;
  const loopbackOrigin = resolveInternalServiceBaseUrl({
    configuredBaseUrl: `https://${CANONICAL_ADMIN_HOST}`,
    internalBaseUrl: process.env.INTERNAL_SERVICE_BASE_URL,
    port,
    preferLoopback: true,
  });

  root.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      if (loopbackOrigin) {
        const sourceUrl = input instanceof Request
          ? new URL(input.url)
          : input instanceof URL
            ? new URL(input.toString())
            : new URL(String(input));
        if (sourceUrl.protocol === "https:" && sourceUrl.hostname === CANONICAL_ADMIN_HOST) {
          const loopbackUrl = joinInternalServiceUrl(loopbackOrigin, `${sourceUrl.pathname}${sourceUrl.search}`);
          if (input instanceof Request) return original(new Request(loopbackUrl, input), init);
          return original(loopbackUrl, init);
        }
      }
    } catch {
      // Preserve original fetch behavior if URL normalization ever fails.
    }
    return original(input, init);
  }) as typeof fetch;
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  installZeaburSelfFetchLoopback();
  const [{ installServerFetchGuard }, { startBasitKargoStatusPoller }] = await Promise.all([
    import("@/lib/serverFetchGuard"),
    import("@/lib/basitKargoStatusPoller"),
  ]);
  installServerFetchGuard();
  startBasitKargoStatusPoller();
}
