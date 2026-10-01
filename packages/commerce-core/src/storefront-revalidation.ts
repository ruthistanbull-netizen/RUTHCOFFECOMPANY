import { createHmac, timingSafeEqual } from "node:crypto";

/** Server-only, purpose-specific credential; never transmit the internal admin secret. */
export function createStorefrontRevalidationSecretResolver(options: {
  configuredSecret: () => string | undefined;
  loadInternalSecret: () => Promise<string | undefined>;
}) {
  let cached: { value: string; expiresAt: number } | null = null;
  let pending: Promise<string> | null = null;
  return async function resolveSecret(): Promise<string> {
    const configured = options.configuredSecret()?.trim();
    if (configured) return configured;
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    if (pending) return pending;

    pending = (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const internal = await Promise.race([
          options.loadInternalSecret(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("Revalidation credential timeout")), 1_500);
          }),
        ]);
        if (!internal?.trim()) return "";
        const value = createHmac("sha256", internal.trim())
          .update("rosta-storefront-revalidation:v1")
          .digest("hex");
        cached = { value, expiresAt: Date.now() + 60_000 };
        return value;
      } catch {
        return "";
      } finally {
        if (timer) clearTimeout(timer);
      }
    })();
    try {
      return await pending;
    } finally {
      pending = null;
    }
  };
}

export function matchesStorefrontRevalidationSecret(expected: string, supplied: string) {
  if (!expected || !supplied) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}
