import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function file(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    failures.push(`missing file: ${rel}`);
    return "";
  }
  return fs.readFileSync(full, "utf8");
}

function json(rel) {
  try {
    return JSON.parse(file(rel));
  } catch (error) {
    failures.push(`invalid json: ${rel} (${error instanceof Error ? error.message : error})`);
    return {};
  }
}

function expect(condition, message) {
  if (!condition) failures.push(message);
}

const rootPkg = json("package.json");
const adminPkg = json("apps/admin/package.json");
const storefrontPkg = json("apps/storefront/package.json");
const storefrontNext = file("apps/storefront/next.config.ts");
const storefrontLayout = file("apps/storefront/src/app/layout.tsx");
const storefrontHome = file("apps/storefront/src/app/page.tsx");
const adminShell = file("apps/admin/src/components/base44-exact/ExactBase44ShellV2.tsx");
const recovery = file("apps/storefront/src/app/api/auth/password-recovery/route.ts");
const rostaPoints = file("apps/admin/src/app/api/rosta-points/route.ts");
const themeSections = file("apps/admin/src/app/api/theme-sections/route.ts");
const storefrontRevalidate = file("apps/storefront/src/app/api/revalidate/route.ts");
const adminEnv = file("apps/admin/.env.example");
const storefrontEnv = file("apps/storefront/.env.example");
const adminNextConfig = file("apps/admin/next.config.mjs");
const analyticsMigration = file("supabase/migrations/20260924170000_rosta_dashboard_session_accuracy.sql");
const compactOrderMigration = file("supabase/migrations/20260924180000_compact_rosta_order_numbers.sql");
const emailCronMigration = file("supabase/migrations/20260924181500_rosta_customer_email_automation_crons.sql");
const orderServer = file("apps/storefront/src/lib/orderServer.ts");
const checkoutDraftSave = file("apps/storefront/src/app/api/checkout-draft/save/route.ts");
const shippingHardening = file("supabase/migrations/20260924183000_rosta_basit_kargo_lifecycle_hardening.sql");
const bootstrapSeed = file("supabase/migrations/20260922014705_rosta_bootstrap_seed.sql");
const sharedDocker = file("Dockerfile");
const panelDocker = file("Dockerfile.rostapanel");
const storefrontDocker = file("Dockerfile.rostacoffecompany");
const actualServiceDocker = file("Dockerfile.ruthcoffeecompany");
const canonicalStorefrontDocker = file("Dockerfile.rostacoffeecompany");
const exactRuntimeServiceDocker = file("Dockerfile.ruthcoffecompany");
const panelZbpack = file("zbpack.rostapanel.json");
const storefrontZbpack = file("zbpack.ruthcoffecompany.json");
const genericPanelZbpack = file("zbpack.admin.json");
const genericStorefrontZbpack = file("zbpack.storefront.json");
const adminManifest = file("apps/admin/src/app/manifest.ts");
const adminLayout = file("apps/admin/src/app/layout.tsx");
const notificationCenter = file("apps/admin/src/components/base44-exact/ExactNotificationCenter.tsx");
const adminPushSw = file("apps/admin/public/push-sw.js");
const adminIcon192 = file("apps/admin/src/app/icon-192.png/route.ts");
const adminIcon512 = file("apps/admin/src/app/icon-512.png/route.ts");
const panelHomeIcon = file("apps/admin/src/app/api/panel-home-icon/route.ts");
const platformTick = file("apps/admin/src/app/api/internal/platform-tick/route.ts");
const panelMaintenance = file("apps/admin/src/app/api/internal/panel-maintenance/route.ts");
const runtimeConvergence = file("supabase/migrations/20260924184500_rosta_platform_runtime_convergence.sql");

expect(Boolean(rootPkg.scripts?.["typecheck:all"]), "root typecheck:all script missing");
expect(Boolean(rootPkg.scripts?.["build:all"]), "root build:all script missing");
expect(String(rootPkg.scripts?.["start:storefront"] || "").includes("npm --prefix apps/storefront run start"), "storefront runtime must start the prebuilt Next app directly");
expect(String(rootPkg.scripts?.["start:admin"] || "").includes("npm --prefix apps/admin run start"), "admin runtime must start the prebuilt Next app directly");
expect(!String(rootPkg.scripts?.["start:storefront"] || "").includes("build:storefront"), "storefront runtime must never compile after container start");
expect(!String(rootPkg.scripts?.["start:admin"] || "").includes("build:admin"), "admin runtime must never compile after container start");

expect(adminPkg.dependencies?.["@supabase/supabase-js"] === "2.110.8", "admin Supabase client must match current Commerce lock (2.110.8)");
expect(storefrontPkg.dependencies?.["@supabase/supabase-js"] === "2.110.8", "storefront Supabase client must match current Commerce lock (2.110.8)");
expect(adminPkg.dependencies?.["@tailwindcss/postcss"] === "4.3.3", "admin Tailwind PostCSS must be available to production builds");
expect(storefrontPkg.scripts?.start === "next start", "storefront start script must match the Ruth-proven Next runtime contract");
expect(adminPkg.scripts?.start === "next start", "admin start script must match the Ruth-proven Next runtime contract");

expect(!storefrontNext.includes("ignoreBuildErrors"), "storefront build must not ignore TypeScript errors");
expect(storefrontNext.includes("analytics.tiktok.com"), "TikTok analytics domains missing from storefront CSP");
expect(storefrontNext.includes(".split(/[\\s,]+/)"), "theme editor origins must split on whitespace/comma");

for (const [name, source] of [["layout", storefrontLayout], ["homepage", storefrontHome]]) {
  expect(source.includes("export const revalidate = 10;"), `storefront ${name} must use 10s revalidation`);
  expect(!source.includes('export const dynamic = "force-dynamic"'), `storefront ${name} must not force dynamic rendering`);
}

expect(adminShell.includes("w-[min(420px,calc(100vw-32px))]"), "latest compact mobile command palette width missing");
expect(adminShell.includes('label="ROSTA Insight"'), "ROSTA Insight top shortcut missing");
expect(!adminShell.includes("⌘K"), "legacy command shortcut badge still visible");

expect(recovery.includes("ADMIN_ORIGIN"), "storefront password recovery must proxy through admin recovery service");
expect(!recovery.includes("createClient("), "storefront password recovery must not directly create a Supabase client");

expect(rostaPoints.includes('adjust_rosta_points'), "ROSTA Points admin adjustments must use the atomic ROSTA RPC");
expect(rostaPoints.includes('update_loyalty_reward_settings'), "ROSTA Points settings must use the canonical loyalty settings RPC");
expect(rostaPoints.includes('rosta_point_transactions'), "ROSTA Points history must use the ROSTA ledger alias");
expect(!rostaPoints.includes('update({reward_points_balance'), "ROSTA Points route must not manually mutate balances");

expect(themeSections.includes('tags: ["rosta-theme"]'), "theme section saves must invalidate the ROSTA theme tag");
expect(storefrontRevalidate.includes('revalidateTag("rosta-theme", IMMEDIATE_EXPIRY)'), "storefront theme revalidation must expire immediately");
expect(storefrontRevalidate.includes('revalidatePath("/", "layout")'), "theme revalidation must refresh the root layout");

expect(!adminEnv.includes("sb_publishable_"), "admin env example must not contain a real Supabase publishable key");
expect(!storefrontEnv.includes("sb_publishable_"), "storefront env example must not contain a real Supabase publishable key");
expect(adminEnv.includes("COMMERCE_WORKER_SECRET="), "admin COMMERCE_WORKER_SECRET placeholder missing");
expect(adminEnv.includes("CRON_SECRET="), "admin CRON_SECRET placeholder missing");

expect(analyticsMigration.includes("public.admin_analytics_summary"), "dashboard analytics summary RPC migration missing");
expect(analyticsMigration.includes("analytics_events_session_created_at_idx"), "dashboard analytics session index missing");

expect(orderServer.includes('return `RST${year}${random}`;'), "storefront must generate compact ROSTA order numbers");
expect(checkoutDraftSave.includes('return `RST${year}${random}`;'), "checkout draft API must generate the same compact ROSTA order number format");
expect(compactOrderMigration.includes("generate_compact_rosta_order_no"), "compact ROSTA order number DB guard missing");
expect(compactOrderMigration.includes("new.merchant_oid := new.order_no"), "checkout merchant_oid must stay synchronized with the compact order number");

expect(emailCronMigration.includes("'rosta-abandoned-cart-email'"), "abandoned-cart customer email scheduler missing");
expect(emailCronMigration.includes("'rosta-review-request-email'"), "review-request customer email scheduler missing");
expect(emailCronMigration.includes("'x-automation-cron-secret'"), "customer email schedulers must authenticate by header");
expect(!emailCronMigration.includes("?kind=review&secret="), "review scheduler must never expose its secret in the URL");

expect(shippingHardening.includes("force_order_lifecycle_from_shipping_status"), "shipping lifecycle force-sync guard missing");
expect(shippingHardening.includes("normalize_basit_kargo_status"), "Basit Kargo status normalizer missing");
expect(shippingHardening.includes("reconcile_order_from_basit_kargo_event"), "Basit Kargo event reconciliation trigger missing");
expect(shippingHardening.includes("reconcile_basit_kargo_delivery_evidence"), "Basit Kargo delivery evidence guard missing");

expect(panelDocker.includes("COPY apps/admin/package.json") && panelDocker.includes("COPY apps/storefront/package.json"), "panel Docker workspace manifests incomplete");
expect(storefrontDocker.includes("COPY apps/admin/package.json") && storefrontDocker.includes("COPY apps/storefront/package.json"), "storefront Docker workspace manifests incomplete");
expect(!sharedDocker.includes("npm run build:all"), "root Dockerfile must not hide per-app build failures behind build:all");
expect(sharedDocker.includes("ARG ZEABUR_SERVICE_ID"), "root Dockerfile must consume Zeabur's stable service ID during build");
expect(sharedDocker.includes("6ab1db67afd7153d77b410bb"), "root Dockerfile must recognize the panel service ID");
expect(sharedDocker.includes("6ab040b5477bfd0030149f96"), "root Dockerfile must recognize the storefront service ID");
expect(sharedDocker.includes("npm run build:admin"), "root Dockerfile must be able to build admin");
expect(sharedDocker.includes("npm run build:storefront"), "root Dockerfile must be able to build storefront");
expect(sharedDocker.includes("ZEABUR_WEB_DOMAIN") && sharedDocker.includes("ZEABUR_WEB_URL"), "root Dockerfile runtime must retain domain-hint fallback");
expect(sharedDocker.includes("ENV PORT=8080") && sharedDocker.includes("EXPOSE 8080"), "root Dockerfile must use Zeabur Git-service port 8080");
expect(!sharedDocker.includes("test -f apps/admin/.next/BUILD_ID"), "root Dockerfile must not add a false admin BUILD_ID gate");
expect(!sharedDocker.includes("test -f apps/storefront/.next/BUILD_ID"), "root Dockerfile must not add a false storefront BUILD_ID gate");
expect(panelDocker.includes("RUN npm run build:admin"), "panel Dockerfile must build only admin");
expect(panelDocker.includes('CMD ["npm","run","start:admin"]'), "panel Dockerfile must start only admin");
expect(panelDocker.includes("ENV PORT=8080") && panelDocker.includes("EXPOSE 8080"), "panel Dockerfile must use Zeabur port 8080");
expect(!panelDocker.includes("BUILD_ID"), "panel Dockerfile must not gate deployment on BUILD_ID");
expect(storefrontDocker.includes("RUN npm run build:storefront"), "storefront Dockerfile must build only storefront");
expect(storefrontDocker.includes('CMD ["npm","run","start:storefront"]'), "storefront Dockerfile must start only storefront");
expect(storefrontDocker.includes("ENV PORT=8080") && storefrontDocker.includes("EXPOSE 8080"), "storefront Dockerfile must use Zeabur port 8080");
expect(!storefrontDocker.includes("BUILD_ID"), "storefront Dockerfile must not gate deployment on BUILD_ID");
expect(actualServiceDocker.includes("RUN npm run build:storefront"), "storefront service Dockerfile must build storefront");
expect(actualServiceDocker.includes('CMD ["npm","run","start:storefront"]'), "storefront service Dockerfile must start storefront");
expect(canonicalStorefrontDocker.includes("RUN npm run build:storefront"), "canonical storefront Docker alias must build storefront");
expect(exactRuntimeServiceDocker.includes("RUN npm run build:storefront"), "exact runtime service Docker alias must build storefront");
expect(panelZbpack.includes('"name": "rostapanel"'), "Zeabur panel service must pin Dockerfile.rostapanel when service-specific config is honored");
expect(storefrontZbpack.includes('"name": "ruthcoffecompany"'), "Zeabur storefront service must pin Dockerfile.ruthcoffecompany when service-specific config is honored");
expect(genericPanelZbpack.includes('"name": "rostapanel"'), "generic Zeabur admin alias must pin Dockerfile.rostapanel");
expect(genericStorefrontZbpack.includes('"name": "ruthcoffecompany"'), "generic Zeabur storefront alias must pin Dockerfile.ruthcoffecompany");

expect(adminNextConfig.includes("https://rostacoffecompany.zeabur.app"), "admin Next config must use the actual storefront Zeabur domain");
expect(!adminNextConfig.includes('output: "standalone"'), "admin Docker runtime uses next start, so standalone output must not be enabled");
expect(adminEnv.includes("https://rostacoffecompany.zeabur.app/"), "admin env example must use the actual storefront Zeabur domain");
expect(storefrontEnv.includes("https://rostacoffecompany.zeabur.app/"), "storefront env example must use the actual storefront Zeabur domain");

expect(adminManifest.includes('name: "ROSTA Coffee Co. Control Room"'), "admin dynamic PWA manifest must be ROSTA branded");
expect(adminManifest.includes('url: "/icon-192.png?v=25"'), "admin manifest 192px ROSTA icon missing");
expect(adminManifest.includes('url: "/icon-512.png?v=25"'), "admin manifest 512px ROSTA icon missing");
expect(adminLayout.includes('manifest: "/manifest.webmanifest?v=25"'), "admin metadata must bind the versioned dynamic PWA manifest");
expect(adminLayout.includes('url: "/api/panel-home-icon?v=25"'), "admin Apple home-screen metadata must bind the ROSTA generated icon");
expect(notificationCenter.includes('payload.title || "ROSTA Panel"'), "notification center fallback title must be ROSTA branded");
expect(!notificationCenter.includes('payload.title || "Ruth Panel"'), "notification center still contains the visible Ruth fallback title");
expect(!fs.existsSync(path.join(root, "apps/admin/public/manifest.webmanifest")), "legacy static admin manifest must not shadow the dynamic manifest");
expect(adminIcon192.includes("renderRostaPanelIcon(192)"), "admin 192px icon route must render the ROSTA panel icon");
expect(adminIcon512.includes("renderRostaPanelIcon(512)"), "admin 512px icon route must render the ROSTA panel icon");
expect(panelHomeIcon.includes("renderRostaPanelIcon(180)"), "iOS panel home icon must render the ROSTA panel icon");
expect(adminPushSw.includes('payload.title || "ROSTA Panel"'), "admin push service worker fallback title must be ROSTA branded");
expect(adminPushSw.includes('kind: "ruth-push"'), "push service worker must preserve the current Commerce client event contract");
expect(adminPushSw.includes('self.addEventListener("notificationclick"'), "push service worker notification click handler missing");

expect(platformTick.includes('import { after, NextResponse } from "next/server"'), "platform tick must use Next after() for background health work");
expect(platformTick.includes("const PRIMARY_TIMEOUT_MS = 30_000;"), "platform tick background timeout contract missing");
expect(platformTick.includes('"/api/internal/service-health-monitor-v4"'), "platform tick must invoke service-health-monitor-v4");
expect(platformTick.includes('"/api/internal/panel-maintenance"'), "platform tick must invoke panel maintenance");
expect(platformTick.includes("const maintenanceDue = minute % 5 === 3;"), "platform tick five-minute maintenance cadence missing");
expect(platformTick.includes('healthMonitor: "v4"'), "platform tick response must expose the v4 health monitor contract");
expect(platformTick.includes('"x-rosta-internal-secret": secret'), "platform tick must authenticate with the ROSTA internal header");
expect(!platformTick.includes('"x-ruth-internal-secret"'), "platform tick must not use Ruth internal authentication headers");

expect(panelMaintenance.includes('"ROSTA Panel bakım uyarısı"'), "panel maintenance push alert must be ROSTA branded");
expect(!panelMaintenance.includes('"Ruth Panel bakım uyarısı"'), "panel maintenance still contains the visible Ruth alert title");

expect(runtimeConvergence.includes("https://rostapanel.zeabur.app"), "runtime convergence must bind database-owned callbacks to the ROSTA panel");
expect(runtimeConvergence.includes("'rosta-platform-orchestrator'"), "canonical ROSTA platform orchestrator cron missing");
expect(runtimeConvergence.includes("'rosta-service-health-supervisor-v4'"), "ROSTA health supervisor cron missing");
expect(runtimeConvergence.includes("public.watch_service_health_monitor_v4()"), "ROSTA V4 heartbeat supervisor function missing");
expect(runtimeConvergence.includes("'x-rosta-internal-secret'"), "ROSTA platform scheduler must use the ROSTA internal auth header");
expect(!/ruthcommerce\.zeabur\.app/i.test(runtimeConvergence), "ROSTA runtime convergence contains the Ruth panel host");
expect(!/ruthistanbul\.com/i.test(runtimeConvergence), "ROSTA runtime convergence contains the Ruth production domain");

expect(!/ruthistanbul\.com/i.test(bootstrapSeed), "ROSTA bootstrap seed contains a Ruth Istanbul domain");
expect(!/^\s*insert\s+into\s+(public\.)?(products|orders|profiles)\b/im.test(bootstrapSeed), "ROSTA bootstrap seed must not seed Ruth products/orders/profiles");

if (failures.length) {
  console.error("ROSTA Commerce parity verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("ROSTA Commerce parity verification passed.");
