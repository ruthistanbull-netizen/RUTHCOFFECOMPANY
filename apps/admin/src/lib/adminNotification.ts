export const ADMIN_NOTIFICATION_BRAND = "ROSTA Coffee";

export type AdminNotificationKind = "order" | "reminder" | "contact" | "appointment" | "health" | "test" | "default";
const kinds = new Set<AdminNotificationKind>(["order", "reminder", "contact", "appointment", "health", "test"]);

export function panelServiceAlertTitle(status: string) {
  return `${ADMIN_NOTIFICATION_BRAND} servis ${status === "unhealthy" ? "hatası" : "uyarısı"}`;
}

// These are generated system headings from older releases, never customer text.
const legacyServiceTitles = new Map([
  ["Ruth Panel servis hatası", "unhealthy"],
  ["Ruth Panel servis uyarısı", "degraded"],
  ["ROSTA Panel servis hatası", "unhealthy"],
  ["ROSTA Panel servis uyarısı", "degraded"],
]);

export function normalizePanelNotificationTitle(title: string, kind: AdminNotificationKind) {
  const status = kind === "health" ? legacyServiceTitles.get(title) : undefined;
  return status ? panelServiceAlertTitle(status) : title;
}

export function normalizePanelNotificationPayload(payload: Record<string, unknown>) {
  const explicitKind = String(payload.type || payload.kind || "") as AdminNotificationKind;
  const tagKind = /^rosta-(order|reminder|contact|health|test)-/.exec(String(payload.tag || ""))?.[1] as AdminNotificationKind | undefined;
  const kind: AdminNotificationKind = kinds.has(explicitKind) ? explicitKind : tagKind || "default";
  return {
    kind,
    title: normalizePanelNotificationTitle(String(payload.title || ADMIN_NOTIFICATION_BRAND), kind),
    body: String(payload.body || "Yeni bildirim"),
    url: typeof payload.url === "string" && payload.url ? payload.url : "/",
  };
}
