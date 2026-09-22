import { mergeRuthieUsage, type RuthieApiUsage } from "@/lib/ruthieApiCost";

export function createRuthieUsageMeter(baseFetch: typeof fetch = fetch) {
  let aggregate: RuthieApiUsage = {};
  let resolvedModel = "";
  let webSearchCalls = 0;

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await baseFetch(input, init);
    try {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (!url.includes("/v1/responses")) return response;

      const payload = await response.clone().json().catch(() => null) as Record<string, any> | null;
      if (!payload) return response;
      if (typeof payload.model === "string" && payload.model.trim()) resolvedModel = payload.model.trim();
      aggregate = mergeRuthieUsage(aggregate, payload.usage);
      const output = Array.isArray(payload.output) ? payload.output : [];
      webSearchCalls += output.filter((item) => item?.type === "web_search_call").length;
    } catch {
      // Metering must never break the actual Ruthie response.
    }
    return response;
  }) as typeof fetch;

  return {
    fetchImpl,
    usage: () => aggregate,
    model: () => resolvedModel,
    webSearchCalls: () => webSearchCalls,
  };
}
