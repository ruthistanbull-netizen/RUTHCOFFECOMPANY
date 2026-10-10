// The panel is the writer of record for ROSTA's self-hosted store design.
// Only already-public theme settings are exposed by this read-only endpoint.
const PANEL_THEME_URL = "https://rostapanel.zeabur.app/api/public-store-design/theme";

export type PanelPublishedTheme = {
  ok: boolean;
  source: string;
  published: unknown;
  customizer: unknown;
  revision: number | null;
  publishedAt: string | null;
};

export async function readPanelPublishedTheme(): Promise<PanelPublishedTheme | null> {
  try {
    const response = await fetch(PANEL_THEME_URL, {
      next: { revalidate: 10, tags: ["rosta-theme"] },
      signal: AbortSignal.timeout(5_000),
      redirect: "error",
    });
    if (!response.ok) {
      console.warn("[ROSTA storefront] Public theme read from panel failed:", response.status);
      return null;
    }
    const payload = await response.json() as Partial<PanelPublishedTheme>;
    if (payload.ok !== true || payload.source !== "rosta-panel-selfhost" || !payload.published) {
      console.warn("[ROSTA storefront] Panel has no published theme document.");
      return null;
    }
    return {
      ok: true,
      source: payload.source,
      published: payload.published,
      customizer: payload.customizer || null,
      revision: typeof payload.revision === "number" ? payload.revision : null,
      publishedAt: typeof payload.publishedAt === "string" ? payload.publishedAt : null,
    };
  } catch (error) {
    console.warn("[ROSTA storefront] Panel theme source unreachable:", error instanceof Error ? error.message : "network error");
    return null;
  }
}
