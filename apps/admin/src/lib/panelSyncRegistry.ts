export type PanelSyncTarget = {
  key: string;
  route: string;
  scope: string;
  intervalMs: number;
  maxAgeMs: number;
  priority: number;
};

const MINUTE = 60_000;
// Refresh ownership remains event-driven: requested scopes refresh immediately and
// wall-clock age alone does not make normal navigation fan out provider reads.
// Snapshot authority is deliberately finite though. Once expires_at passes, the
// snapshot is paint-only fallback and the browser must reconcile against live data.
const EVENT_ONLY_INTERVAL_MS = 10 * 365 * 24 * 60 * MINUTE;
const DEFAULT_SNAPSHOT_AUTHORITY_MS = 30_000;

function snapshotAuthorityMs(scope: string) {
  if (["orders", "payments", "shipping", "returns"].includes(scope)) return 15_000;
  if (["products", "catalog", "inventory", "customers", "ruthie-points"].includes(scope)) return 30_000;
  if (["dashboard", "contact", "reviews"].includes(scope)) return 30_000;
  if (["email", "marketing", "theme"].includes(scope)) return 60_000;
  return DEFAULT_SNAPSHOT_AUTHORITY_MS;
}

function eventTarget(key: string, route: string, scope: string, priority: number): PanelSyncTarget {
  return {
    key,
    route,
    scope,
    intervalMs: EVENT_ONLY_INTERVAL_MS,
    maxAgeMs: snapshotAuthorityMs(scope),
    priority,
  };
}

export function normalizePanelRoute(input: string) {
  const url = new URL(input, "https://admin.local");
  for (const key of ["t", "_", "ts", "timestamp", "cacheBust", "cache_bust"]) {
    const value = url.searchParams.get(key);
    if (value && /^\d{8,}$/.test(value)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return `${url.pathname}${url.search}`;
}

export function panelReadModelKey(route: string) {
  const normalized = normalizePanelRoute(route);
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `route:${(hash >>> 0).toString(36)}:${normalized.slice(0, 120)}`;
}

export function panelSnapshotExpired(expiresAt: unknown, now = Date.now()) {
  if (typeof expiresAt !== "string" || !expiresAt.trim()) return true;
  const timestamp = new Date(expiresAt).getTime();
  return !Number.isFinite(timestamp) || timestamp <= now;
}

export function panelSnapshotEligible(route: string) {
  const pathname = new URL(route, "https://admin.local").pathname;
  if (!pathname.startsWith("/api/")) return false;
  const excluded = [
    "/api/me",
    "/api/account",
    "/api/auth",
    "/api/instant-data",
    "/api/internal",
    "/api/push",
    "/api/notifications",
    "/api/rosta-insight",
    "/api/ruthie",
    "/api/health",
    "/api/commerce-core/health",
    // Products, orders and customers were stable in the early-August panel when
    // their pages owned one live request directly. Never let panel read-model
    // snapshots or dynamic registration become the first paint authority here.
    "/api/products",
    "/api/orders",
    "/api/customers",
    // Meta is an external provider-backed view. Keeping several date-range
    // snapshots hot in the background fan-outs Graph API calls and can trigger
    // provider rate limits. Fetch Meta only when its page explicitly needs it.
    "/api/meta-ads",
    // Contact activity is a foreground notification poll, while thread reads are
    // message-specific Gmail provider calls. Neither is a durable panel read-model.
    "/api/contact-messages/activity",
    "/api/contact-messages/thread",
    // Brevo was removed from the runtime. An old self-hosted DB row for this route
    // must not be rediscovered as a dynamic target and retried forever as `stale`.
    "/api/email/brevo",
  ];
  if (excluded.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return false;
  return true;
}

export const PANEL_SYNC_TARGETS: PanelSyncTarget[] = [
  eventTarget("dashboard-today", "/api/summary?range=today", "dashboard", 100),
  eventTarget("dashboard-7d", "/api/summary?range=last_7_days", "dashboard", 90),
  eventTarget("dashboard-30d", "/api/summary?range=last_30_days", "dashboard", 80),
  eventTarget("dashboard-90d", "/api/summary?range=last_90_days", "dashboard", 60),
  eventTarget("dashboard-catalog", "/api/dashboard/catalog-counts", "dashboard", 90),
  eventTarget("dashboard-sales", "/api/dashboard/sales-series?metric=sales&period=weekly", "dashboard", 90),

  // Core product/order/customer lists intentionally do not live here. Their page
  // components own the live request directly, matching the stable early-August
  // behavior and preventing a stale/empty panel_read_models row from replacing data.
  eventTarget("preparing-products", "/api/preparing-products", "orders", 90),
  eventTarget("abandoned-carts", "/api/abandoned-carts?range=all", "orders", 75),
  eventTarget("payments", "/api/payments/list?q=&limit=220&range=this_month", "payments", 95),
  eventTarget("shipping-orders", "/api/shipping/basit-kargo/orders", "shipping", 95),
  eventTarget("shipping-handlers", "/api/shipping/basit-kargo/handlers", "shipping", 40),
  eventTarget("shipping-operations", "/api/shipping/operations", "shipping", 80),
  eventTarget("returns-all", "/api/returns?range=all", "returns", 85),
  eventTarget("returns-shipping", "/api/returns/shipping?q=", "returns", 75),
  eventTarget("materials", "/api/product-settings/materials", "products", 40),
  eventTarget("catalog-categories", "/api/catalog-groups?type=category", "catalog", 65),
  eventTarget("catalog-collections", "/api/catalog-groups?type=collection", "catalog", 65),
  eventTarget("discount-campaigns", "/api/discount-campaigns", "marketing", 65),
  eventTarget("rosta-points", "/api/ruthie-points", "ruthie-points", 75),
  eventTarget("email-status", "/api/email/status", "email", 70),
  eventTarget("review-settings", "/api/review-automation/settings", "email", 45),
  eventTarget("abandoned-settings", "/api/email/abandoned-cart/settings", "email", 45),
  eventTarget("reviews-pending", "/api/reviews?status=pending", "reviews", 70),
  eventTarget("contact-all", "/api/contact-messages?status=all", "contact", 80),
  eventTarget("contact-new", "/api/contact-messages?status=new", "contact", 80),
  eventTarget("theme", "/api/theme", "theme", 50),
];

export const PANEL_SYNC_BY_ROUTE = new Map(PANEL_SYNC_TARGETS.map((target) => [normalizePanelRoute(target.route), target]));

function dynamicScope(pathname: string) {
  if (pathname === "/api/summary" || pathname.startsWith("/api/dashboard/")) return "dashboard";
  if (pathname.startsWith("/api/orders") || pathname.startsWith("/api/preparing-products") || pathname.startsWith("/api/abandoned-carts")) return "orders";
  if (pathname.startsWith("/api/payments") || pathname.startsWith("/api/paytr")) return "payments";
  if (pathname.startsWith("/api/shipping")) return "shipping";
  if (pathname.startsWith("/api/returns")) return "returns";
  if (pathname.startsWith("/api/products") || pathname.startsWith("/api/product-")) return "products";
  if (pathname.startsWith("/api/catalog")) return "catalog";
  if (pathname.startsWith("/api/inventory")) return "inventory";
  if (pathname.startsWith("/api/customers") || pathname.startsWith("/api/crm") || pathname.startsWith("/api/members")) return "customers";
  if (pathname.startsWith("/api/ruthie-points") || pathname.startsWith("/api/loyalty") || pathname.startsWith("/api/rewards")) return "ruthie-points";
  if (pathname.startsWith("/api/email") || pathname.startsWith("/api/review-automation")) return "email";
  if (pathname.startsWith("/api/reviews")) return "reviews";
  if (pathname.startsWith("/api/contact")) return "contact";
  if (pathname.startsWith("/api/theme") || pathname.startsWith("/api/site-settings") || pathname.startsWith("/api/homepage")) return "theme";
  if (pathname.startsWith("/api/meta-ads")) return "meta";
  if (pathname.startsWith("/api/discount") || pathname.startsWith("/api/coupon")) return "marketing";
  return "general";
}

export function defaultDynamicTarget(route: string): PanelSyncTarget {
  const normalized = normalizePanelRoute(route);
  const pathname = new URL(normalized, "https://admin.local").pathname;
  const scope = dynamicScope(pathname);
  return {
    key: panelReadModelKey(normalized),
    route: normalized,
    scope,
    intervalMs: EVENT_ONLY_INTERVAL_MS,
    maxAgeMs: snapshotAuthorityMs(scope),
    priority: 30,
  };
}
