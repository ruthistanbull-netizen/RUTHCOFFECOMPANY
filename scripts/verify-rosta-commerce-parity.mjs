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
const adminEnv = file("apps/admin/.env.example");
const storefrontEnv = file("apps/storefront/.env.example");
const analyticsMigration = file("supabase/migrations/20260924170000_rosta_dashboard_session_accuracy.sql");
const bootstrapSeed = file("supabase/migrations/20260922014705_rosta_bootstrap_seed.sql");
const sharedDocker = file("Dockerfile");
const panelDocker = file("Dockerfile.rostapanel");
const storefrontDocker = file("Dockerfile.rostacoffecompany");

expect(Boolean(rootPkg.scripts?.["typecheck:all"]), "root typecheck:all script missing");
expect(Boolean(rootPkg.scripts?.["build:all"]), "root build:all script missing");

expect(adminPkg.dependencies?.["@supabase/supabase-js"] === "2.110.8", "admin Supabase client must match current Commerce lock (2.110.8)");
expect(storefrontPkg.dependencies?.["@supabase/supabase-js"] === "2.110.8", "storefront Supabase client must match current Commerce lock (2.110.8)");
expect(adminPkg.dependencies?.["@tailwindcss/postcss"] === "4.3.3", "admin Tailwind PostCSS must be available to production builds");

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

expect(!adminEnv.includes("sb_publishable_"), "admin env example must not contain a real Supabase publishable key");
expect(!storefrontEnv.includes("sb_publishable_"), "storefront env example must not contain a real Supabase publishable key");
expect(adminEnv.includes("COMMERCE_WORKER_SECRET="), "admin COMMERCE_WORKER_SECRET placeholder missing");
expect(adminEnv.includes("CRON_SECRET="), "admin CRON_SECRET placeholder missing");

expect(analyticsMigration.includes("public.admin_analytics_summary"), "dashboard analytics summary RPC migration missing");
expect(analyticsMigration.includes("analytics_events_session_created_at_idx"), "dashboard analytics session index missing");

expect(panelDocker.includes("COPY apps/admin/package.json") && panelDocker.includes("COPY apps/storefront/package.json"), "panel Docker workspace manifests incomplete");
expect(storefrontDocker.includes("COPY apps/admin/package.json") && storefrontDocker.includes("COPY apps/storefront/package.json"), "storefront Docker workspace manifests incomplete");
expect(sharedDocker.includes("npm run build:all"), "shared Dockerfile must safely build both apps when target detection is unavailable");

expect(!/ruthistanbul\.com/i.test(bootstrapSeed), "ROSTA bootstrap seed contains a Ruth Istanbul domain");
expect(!/^\s*insert\s+into\s+(public\.)?(products|orders|profiles)\b/im.test(bootstrapSeed), "ROSTA bootstrap seed must not seed Ruth products/orders/profiles");

if (failures.length) {
  console.error("ROSTA Commerce parity verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("ROSTA Commerce parity verification passed.");
