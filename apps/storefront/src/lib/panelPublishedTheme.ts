/**
 * ROSTA panel is the write authority for published Store Design documents.
 *
 * The public .zeabur.app endpoint works from a browser, but may be unreachable
 * from a Zeabur app container (egress/DNS/hairpin routing). If the two services
 * share a Zeabur project, configure ROSTA_PANEL_INTERNAL_ORIGIN to the exact
 * private HTTP origin shown in Panel > Networking > Private.
 */
const PUBLIC_PANEL_ORIGIN = "https://rostapanel.zeabur.app";
const THEME_PATH = "/api/public-store-design/theme";

export type PanelPublishedTheme = {
  ok: boolean;
  source: string;
  published: unknown;
  customizer: unknown;
  revision: number | null;
  publishedAt: string | null;
};

export type PanelThemeAttempt = {
  route: "private" | "public";
  httpStatus: number | null;
  latencyMs: number;
  error: "dns" | "timeout" | "tls" | "network" | "http" | "invalid_json" | null;
};

function panelOrigins(): Array<{ origin: string; route: "private" | "public" }> {
  const origins: Array<{ origin: string; route: "private" | "public" }> = [];
  const privateValue = process.env.ROSTA_PANEL_INTERNAL_ORIGIN?.trim();
  if (privateValue) {
    try {
      const url = new URL(privateValue);
      // Never make this environment setting an arbitrary server-side proxy.
      if (url.protocol === "http:" &&
        /^[a-z0-9-]+\.zeabur\.internal$/i.test(url.hostname) &&
        (!url.port || /^\d{2,5}$/.test(url.port)) &&
        url.pathname === "/" && !url.search && !url.hash && !url.username && !url.password) {
        origins.push({ origin: url.origin, route: "private" });
      } else {
        console.warn("[ROSTA published theme] Ignoring invalid private panel origin.");
      }
    } catch {
      console.warn("[ROSTA published theme] Private panel origin is not a URL.");
    }
  }
  origins.push({ origin: PUBLIC_PANEL_ORIGIN, route: "public" });
  return origins;
}

function transportError(error: unknown): PanelThemeAttempt["error"] {
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return "timeout";
  const cause = error && typeof error === "object" ? (error as { cause?: { code?: string } }).cause : undefined;
  const code = String(cause?.code || "");
  if (["ENOTFOUND", "EAI_AGAIN"].includes(code)) return "dns";
  if (/CERT|TLS|SSL/.test(code)) return "tls";
  if (["ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT"].includes(code)) return "timeout";
  return "network";
}

type PanelFetchResult = {
  payload: Record<string, unknown> | null;
  attempts: PanelThemeAttempt[];
};

async function fetchPanelTheme(statusOnly: boolean): Promise<PanelFetchResult> {
  const attempts: PanelThemeAttempt[] = [];
  for (const { origin, route } of panelOrigins()) {
    const started = Date.now();
    let response: Response;
    try {
      const suffix = statusOnly ? "?status=1" : "";
      response = await fetch(`${origin}${THEME_PATH}${suffix}`, {
        cache: "no-store",
        redirect: "error",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      const category = transportError(error);
      attempts.push({ route, httpStatus: null, latencyMs: Date.now() - started, error: category });
      console.warn("[ROSTA published theme] Panel transport:", route, category);
      continue;
    }

    if (!response.ok) {
      attempts.push({ route, httpStatus: response.status, latencyMs: Date.now() - started, error: "http" });
      console.warn("[ROSTA published theme] Panel returned HTTP:", route, response.status);
      continue;
    }

    try {
      const payload = await response.json() as Record<string, unknown>;
      if (payload.ok !== true || payload.source !== "rosta-panel-selfhost") {
        attempts.push({ route, httpStatus: response.status, latencyMs: Date.now() - started, error: "invalid_json" });
        continue;
      }
      attempts.push({ route, httpStatus: response.status, latencyMs: Date.now() - started, error: null });
      return { payload, attempts };
    } catch {
      attempts.push({ route, httpStatus: response.status, latencyMs: Date.now() - started, error: "invalid_json" });
    }
  }
  return { payload: null, attempts };
}

/** Diagnostic is intentionally limited to revision/count and network status. */
export async function inspectPanelPublishedTheme(): Promise<{
  reachable: boolean;
  revision: number | null;
  mediaCount: number | null;
  attempts: PanelThemeAttempt[];
}> {
  const result = await fetchPanelTheme(true);
  const revision = result.payload?.revision;
  const mediaCount = result.payload?.mediaCount;
  return {
    reachable: Boolean(result.payload),
    revision: typeof revision === "number" ? revision : null,
    mediaCount: typeof mediaCount === "number" ? mediaCount : null,
    attempts: result.attempts,
  };
}

export async function readPanelPublishedTheme(): Promise<PanelPublishedTheme | null> {
  const result = await fetchPanelTheme(false);
  const payload = result.payload;
  if (!payload?.published) return null;
  return {
    ok: true,
    source: "rosta-panel-selfhost",
    published: payload.published,
    customizer: payload.customizer || null,
    revision: typeof payload.revision === "number" ? payload.revision : null,
    publishedAt: typeof payload.publishedAt === "string" ? payload.publishedAt : null,
  };
}
