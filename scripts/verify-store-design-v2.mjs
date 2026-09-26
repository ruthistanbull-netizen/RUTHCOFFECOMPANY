import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const notes = [];

function fail(message) {
  failures.push(message);
}

function note(message) {
  notes.push(message);
}

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`Eksik dosya: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function walk(relativeDir) {
  const absoluteDir = path.join(root, relativeDir);
  if (!fs.existsSync(absoluteDir)) return [];
  const output = [];
  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) output.push(...walk(relativePath));
    else if (/\.(?:ts|tsx|js|jsx)$/.test(entry.name)) output.push(relativePath);
  }
  return output;
}

const corePath = "packages/commerce-core/src/store-design-v2.ts";
const core = read(corePath);
const registryMatches = [...core.matchAll(/component\("([^"]+)"/g)].map((match) => match[1]);
const registry = new Set(registryMatches);

for (const type of registryMatches) {
  if (registryMatches.filter((candidate) => candidate === type).length > 1) {
    fail(`Duplicate component registry semanticType: ${type}`);
  }
}

const sourceFiles = walk("apps/storefront/src");
const semanticTypes = new Map();

for (const relativePath of sourceFiles) {
  const source = read(relativePath);
  const literalPatterns = [
    /data-editor-type\s*=\s*"([^"]+)"/g,
    /data-editor-type\s*=\s*\{\s*"([^"]+)"\s*\}/g,
  ];
  for (const pattern of literalPatterns) {
    for (const match of source.matchAll(pattern)) {
      const type = match[1];
      const files = semanticTypes.get(type) || new Set();
      files.add(relativePath);
      semanticTypes.set(type, files);
    }
  }

  if (/<<<<<<<|=======|>>>>>>>/.test(source)) {
    fail(`Conflict marker bulundu: ${relativePath}`);
  }
}

for (const [type, files] of semanticTypes) {
  if (!registry.has(type)) {
    fail(`Registry'de olmayan data-editor-type "${type}": ${[...files].join(", ")}`);
  }
}

const editorFiles = [
  "apps/storefront/src/components/theme/SemanticThemeEditorBridge.tsx",
  "apps/storefront/src/components/theme/SemanticThemeRuntimeProvider.tsx",
  "apps/admin/src/components/theme/StoreDesignV21.tsx",
];

for (const relativePath of editorFiles) {
  const source = read(relativePath);
  if (source.includes("MutationObserver")) {
    fail(`MutationObserver yasak: ${relativePath}`);
  }
  if (/postMessage\s*\([^)]*,\s*["']\*["']\s*\)/s.test(source)) {
    fail(`Wildcard postMessage origin bulundu: ${relativePath}`);
  }
}

const requiredCoreTokens = [
  "STORE_DESIGN_SCHEMA_VERSION",
  "migrateThemeDocument",
  "validateThemeDocument",
  "templateBindings",
  "flattenThemeRedirects",
  "COMPONENT_REGISTRY_BY_TYPE",
  "SECTION_LIBRARY_BY_TYPE",
  "BLOCK_LIBRARY_BY_TYPE",
];

for (const token of requiredCoreTokens) {
  if (!core.includes(token)) fail(`Core sözleşmede eksik token: ${token}`);
}

const api = read("apps/admin/src/app/api/store-design-v2/route.ts");
for (const token of ["migrateThemeDocument", "validateThemeDocument", "SNAPSHOT_PREFIX", "flattenThemeRedirects"]) {
  if (!api.includes(token)) fail(`Store Design V2 API'de eksik güvenlik/publish adımı: ${token}`);
}

const snapshotApi = read("apps/admin/src/app/api/store-design-v2/snapshots/route.ts");
for (const token of ["migrateThemeDocument", "validateThemeDocument", "liveSiteChanged: false"]) {
  if (!snapshotApi.includes(token)) fail(`Snapshot API'de eksik rollback koruması: ${token}`);
}

const bridge = read("apps/storefront/src/components/theme/SemanticThemeEditorBridge.tsx");
const runtime = read("apps/storefront/src/components/theme/SemanticThemeRuntimeProvider.tsx");
if (!bridge.includes("COMPONENT_REGISTRY_BY_TYPE")) fail("Semantic bridge registry tabanlı değil.");
if (!runtime.includes("templateBindings")) fail("Semantic runtime templateBindings çözümlemiyor.");

const requiredRegisteredTypes = [
  "header-shell",
  "footer-shell",
  "product-grid",
  "product-card",
  "product-detail-shell",
  "cart-drawer",
  "checkout-stepper",
  "payment-surface",
  "auth-form",
  "account-profile",
  "search-overlay",
  "order-tracking",
  "contact-form",
  "legal-document",
];

for (const type of requiredRegisteredTypes) {
  if (!registry.has(type)) fail(`Kritik semantic type registry'de yok: ${type}`);
}

note(`Registry component sayısı: ${registry.size}`);
note(`Storefront'ta literal semantic target tipi: ${semanticTypes.size}`);
note(`Taranan storefront kaynak dosyası: ${sourceFiles.length}`);

if (failures.length) {
  console.error("\nStore Design V2 doğrulaması BAŞARISIZ:\n");
  for (const message of failures) console.error(` - ${message}`);
  console.error("");
  process.exit(1);
}

console.log("\nStore Design V2 doğrulaması başarılı.");
for (const message of notes) console.log(` - ${message}`);
console.log("");
