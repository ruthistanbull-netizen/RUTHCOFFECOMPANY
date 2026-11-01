// Server-owned Auth metadata is the only source of panel role/status.
// A JWT or user_metadata snapshot must never be passed as a live user here.
const roles = new Set(["owner", "admin", "operations", "support", "marketing", "viewer"]);
const writes: Record<string, string[]> = {
  operations: ["/api/products", "/api/product-settings", "/api/orders", "/api/shipping", "/api/inventory", "/api/preparing-products", "/api/warehouse"],
  support: ["/api/orders", "/api/customers", "/api/contact", "/api/returns", "/api/shipping"],
  marketing: ["/api/theme", "/api/social-media", "/api/collections", "/api/marketing", "/api/campaigns", "/api/email", "/api/media"],
};
const matches = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + "/");

export function panelRole(user: { app_metadata?: Record<string, unknown>; banned_until?: string | null }) {
  const metadata = user.app_metadata || {};
  const role = String(metadata.panel_role || "").toLowerCase();
  const status = String(metadata.panel_status || "active").toLowerCase();
  return roles.has(role) && status === "active"
    && !(user.banned_until && Date.parse(user.banned_until) > Date.now()) ? role : null;
}

export function panelRouteAllowed(role: string, method: string, path: string) {
  if (!roles.has(role)) return false;
  if (role === "owner" || role === "admin") return true;
  if (path === "/api/me" && ["GET", "HEAD"].includes(method)) return true;
  // Canonical account route enforces self/owner authorization for every action.
  if (path === "/api/account") return true;
  const read = ["GET", "HEAD", "OPTIONS"].includes(method);
  if (!read) return (writes[role] || []).some(prefix => matches(path, prefix));
  const common = ["/api/dashboard", "/api/products", "/api/categories", "/api/collections", "/api/inventory"];
  return [...common, ...(role === "viewer" ? [] : writes[role] || [])].some(prefix => matches(path, prefix));
}
