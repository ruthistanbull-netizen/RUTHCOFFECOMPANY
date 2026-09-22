export type AdminPagePerformancePlan = {
  apis: string[];
  resourcePathnames?: string[];
  likelyNext?: string[];
  budgetMs?: number;
};

const ordersToday = "/api/orders/list?range=today&payment=all&q=";

const plans: Record<string, AdminPagePerformancePlan> = {
  "/": { apis: ["/api/summary?range=today", "/api/dashboard/catalog-counts"], likelyNext: ["/orders", "/products", "/customers"], budgetMs: 500 },
  "/orders": { apis: [], resourcePathnames: ["/api/orders/list"], likelyNext: ["/shipping", "/returns", "/customers"], budgetMs: 400 },
  "/orders/new": { apis: [], resourcePathnames: ["/api/customers", "/api/products", "/api/orders"], likelyNext: ["/orders", "/customers", "/products"], budgetMs: 450 },
  "/orders/import": { apis: [], resourcePathnames: ["/api/orders", "/api/customers"], likelyNext: ["/orders", "/customers"], budgetMs: 450 },
  "/preparing-products": { apis: ["/api/preparing-products", ordersToday], likelyNext: ["/orders", "/shipping"], budgetMs: 500 },
  "/abandoned-carts": { apis: ["/api/abandoned-carts?range=all", "/api/email/status"], likelyNext: ["/email", "/customers"], budgetMs: 600 },
  "/payments": { apis: ["/api/payments/list?q=&limit=220&range=this_month"], likelyNext: ["/orders", "/returns"], budgetMs: 600 },
  "/shipping": { apis: ["/api/shipping/basit-kargo/orders", "/api/shipping/basit-kargo/handlers", "/api/shipping/operations"], likelyNext: ["/orders", "/returns"], budgetMs: 650 },
  "/shipping/operations": { apis: ["/api/shipping/operations"], likelyNext: ["/shipping", "/orders"], budgetMs: 550 },
  "/returns": { apis: ["/api/returns?range=all", "/api/returns/shipping?q="], likelyNext: ["/orders", "/shipping"], budgetMs: 650 },
  "/products": { apis: [], resourcePathnames: ["/api/products/list"], likelyNext: ["/catalog", "/inventory", "/bulk-edit"], budgetMs: 400 },
  "/products/studio": { apis: ["/api/products?q=", "/api/product-settings/materials"], resourcePathnames: ["/api/products"], likelyNext: ["/products", "/catalog", "/inventory"], budgetMs: 500 },
  "/catalog": { apis: ["/api/products?q=", "/api/catalog-groups?type=category", "/api/catalog-groups?type=collection"], likelyNext: ["/products", "/inventory"], budgetMs: 500 },
  "/inventory": { apis: ["/api/products?q=", "/api/dashboard/catalog-counts"], likelyNext: ["/products", "/bulk-edit"], budgetMs: 550 },
  "/pricing": { apis: ["/api/products?q=", "/api/products/discount-pricing", "/api/discount-campaigns"], likelyNext: ["/products", "/discounts"], budgetMs: 550 },
  "/bulk-edit": { apis: ["/api/products?q="], likelyNext: ["/products", "/inventory"], budgetMs: 550 },
  "/customers": { apis: [], resourcePathnames: ["/api/customers/list"], likelyNext: ["/segments", "/crm", "/ruthie-points"], budgetMs: 400 },
  "/segments": { apis: ["/api/customers/list"], likelyNext: ["/customers", "/crm"], budgetMs: 600 },
  "/crm": { apis: ["/api/customers/list", "/api/contact-messages?status=all"], likelyNext: ["/customers", "/email"], budgetMs: 600 },
  "/ruthie-points": { apis: ["/api/ruthie-points", "/api/customers/list"], likelyNext: ["/customers"], budgetMs: 550 },
  "/marketing": { apis: ["/api/discount-campaigns", "/api/meta-ads?range=today"], likelyNext: ["/discounts", "/meta-ads", "/email"], budgetMs: 800 },
  "/email": { apis: ["/api/email/status", "/api/contact-messages?status=new", "/api/customers/list"], likelyNext: ["/email/templates", "/email/automations", "/email/customers"], budgetMs: 600 },
  "/email/customers": { apis: ["/api/email/templates"], likelyNext: ["/email", "/email/templates"], budgetMs: 650 },
  "/email/templates": { apis: ["/api/email/status", "/api/email/templates"], likelyNext: ["/email", "/email/automations"], budgetMs: 500 },
  "/email/automations": { apis: ["/api/email/status", "/api/review-automation/settings", "/api/email/abandoned-cart/settings"], likelyNext: ["/email", "/email/templates"], budgetMs: 500 },
  "/reviews": { apis: ["/api/reviews?status=pending", "/api/review-automation/settings"], resourcePathnames: ["/api/reviews"], likelyNext: ["/email/automations", "/products"], budgetMs: 550 },
  "/contact-messages": { apis: ["/api/contact-messages?status=all", "/api/email/status"], resourcePathnames: ["/api/contact-messages"], likelyNext: ["/email", "/customers"], budgetMs: 650 },
  "/discounts": { apis: ["/api/discount-campaigns", "/api/products/discount-pricing"], likelyNext: ["/products", "/marketing"], budgetMs: 550 },
  "/meta-ads": { apis: ["/api/meta-ads?range=today", "/api/meta-ads/account-balance"], resourcePathnames: ["/api/meta-ads"], likelyNext: ["/meta-ads/analysis", "/marketing"], budgetMs: 1000 },
  "/meta-ads/analysis": { apis: ["/api/meta-ads?range=7d", "/api/meta-ads?range=30d"], resourcePathnames: ["/api/meta-ads"], likelyNext: ["/meta-ads"], budgetMs: 1000 },
  "/analytics": { apis: ["/api/summary?range=today", "/api/dashboard/catalog-counts", "/api/dashboard/sales-series?metric=sales&period=weekly"], likelyNext: ["/orders", "/products", "/customers"], budgetMs: 600 },
  "/storefront": { apis: ["/api/theme"], likelyNext: ["/theme", "/products"], budgetMs: 550 },
  "/theme": { apis: ["/api/theme"], resourcePathnames: ["/api/theme"], likelyNext: ["/storefront", "/settings"], budgetMs: 550 },
  "/notifications": { apis: [], resourcePathnames: ["/api/push"], likelyNext: ["/settings", "/system"], budgetMs: 350 },
  "/search": { apis: [], resourcePathnames: ["/api/search"], likelyNext: ["/orders", "/customers", "/products"], budgetMs: 400 },
  "/account": { apis: ["/api/account"], likelyNext: ["/settings/users", "/settings/security"], budgetMs: 550 },
  "/settings": { apis: ["/api/theme"], resourcePathnames: ["/api/theme"], likelyNext: ["/settings/integrations", "/settings/security", "/settings/appearance"], budgetMs: 550 },
  "/settings/users": { apis: ["/api/account"], likelyNext: ["/account", "/settings/security"], budgetMs: 550 },
  "/settings/security": { apis: ["/api/audit?limit=200"], resourcePathnames: ["/api/audit", "/api/admin/audit"], likelyNext: ["/settings/users", "/system"], budgetMs: 600 },
  "/settings/integrations": { apis: ["/api/email/status", "/api/shipping/basit-kargo/handlers"], resourcePathnames: ["/api/ruthie/integrations", "/api/email", "/api/shipping"], likelyNext: ["/settings", "/system"], budgetMs: 650 },
  "/system": { apis: ["/api/health", "/api/commerce-core/health", "/api/health/ready"], likelyNext: ["/settings/integrations"], budgetMs: 600 },
  "/ruthie": { apis: [], resourcePathnames: ["/api/ruthie"], likelyNext: ["/orders", "/customers", "/products"], budgetMs: 450 },
};

export function performancePlanFor(pathname: string) {
  const orderTimeline = pathname.match(/^\/orders\/([^/]+)\/timeline$/);
  if (orderTimeline) {
    return {
      apis: [`/api/orders/timeline?order_id=${encodeURIComponent(orderTimeline[1])}`],
      resourcePathnames: ["/api/orders/timeline"],
      likelyNext: ["/orders"],
      budgetMs: 500,
    };
  }

  if (plans[pathname]) return plans[pathname];
  const parent = Object.keys(plans)
    .filter((path) => path !== "/" && pathname.startsWith(`${path}/`))
    .sort((a, b) => b.length - a.length)[0];
  return parent ? plans[parent] : { apis: [], resourcePathnames: [], likelyNext: [], budgetMs: 750 };
}
