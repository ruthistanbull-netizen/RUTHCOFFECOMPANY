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

const sectionRegistryMatches = [...core.matchAll(/^\s*section\("([^"]+)"/gm)].map((match) => match[1]);
const blockRegistryMatches = [...core.matchAll(/^\s*block\("([^"]+)"/gm)].map((match) => match[1]);

for (const [registryName, values] of [
  ["section", sectionRegistryMatches],
  ["block", blockRegistryMatches],
]) {
  const seen = new Set();
  for (const type of values) {
    if (seen.has(type)) fail(`Duplicate ${registryName} registry type: ${type}`);
    seen.add(type);
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
if (!bridge.includes("COMPONENT_REGISTRY")) fail("Semantic bridge registry tabanlı değil.");
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


const allSourceFiles = [...walk("apps/storefront/src"), ...walk("apps/admin/src")];
for (const relativePath of allSourceFiles) {
  const source = read(relativePath);
  if (/<<<<<<<|=======|>>>>>>>/.test(source)) fail(`Conflict marker bulundu: ${relativePath}`);
  if (source.includes("MutationObserver")) fail(`MutationObserver yasak: ${relativePath}`);
  if (/postMessage\s*\([^)]*,\s*["']\*["']\s*\)/s.test(source)) fail(`Wildcard postMessage origin bulundu: ${relativePath}`);
}

const requiredV21Files = [
  "apps/admin/src/components/theme/StoreDesignPublishReport.tsx",
  "apps/admin/src/components/theme/StoreDesignSnapshotManager.tsx",
  "apps/admin/src/components/theme/StoreDesignRedirectManager.tsx",
  "apps/admin/src/components/theme/StoreDesignTemplateManager.tsx",
  "apps/admin/src/components/theme/StoreDesignMediaLibrary.tsx",
  "apps/admin/src/components/theme/StoreDesignBlockSectionEditor.tsx",
  "apps/admin/src/components/theme/StoreDesignPresetLibrary.tsx",
  "apps/storefront/src/components/theme/StoreDesignBlockSection.tsx",
];

for (const relativePath of requiredV21Files) read(relativePath);

for (const token of [
  "analyzeThemeDocumentReferences",
  "ThemeReferenceIssue",
  "presets:",
  "SectionPresetRecord",
  "migrateThemeDocument",
  "flattenThemeRedirects",
]) {
  if (!core.includes(token)) fail(`V2.1 core sözleşmede eksik token: ${token}`);
}

const publishReport = read("apps/admin/src/components/theme/StoreDesignPublishReport.tsx");
if (!publishReport.includes("Yayınlama Öncesi Kontrol")) fail("Yayınlama öncesi kırık referans raporu bağlı değil.");

const sectionManager = read("apps/admin/src/components/theme/StoreDesignSectionManager.tsx");
for (const token of ["document.templateBindings[activePage.path]", "activePage?.template", "templateId"]) {
  if (!sectionManager.includes(token)) fail(`Dynamic template editor resolver eksik: ${token}`);
}
for (const token of ["StoreDesignPresetLibrary", "StoreDesignBlockSectionEditor", "allowedBlocks", "Hazır Düzenler"]) {
  if (!sectionManager.includes(token)) fail(`Section Manager V2.1 eksik: ${token}`);
}

const activeThemeViewport = read("apps/admin/src/components/theme/ThemePreviewViewport.tsx");
if (!activeThemeViewport.includes("StoreDesignV21")) fail("Aktif Mağaza Tasarımı sayfası V2.1 çalışma alanını kullanmıyor.");

const storeDesignShell = read("apps/admin/src/components/theme/StoreDesignV21.tsx");

const legacyIssueCodeAliases = [
  ["PAGE_TEMPLATE_MISSING", "missing-page-template"],
  ["PAGE_SEO_MISSING", "missing-page-seo"],
  ["TEMPLATE_SECTION_MISSING", "missing-template-section"],
  ["SECTION_BLOCK_MISSING", "missing-section-block"],
  ["SECTION_MEDIA_MISSING", "missing-media-reference"],
  ["BLOCK_MEDIA_MISSING", "missing-media-reference"],
  ["SEO_MEDIA_MISSING", "missing-og-media"],
  ["BROKEN_MANAGED_LINK", "broken-merchant-link"],
  ["ORPHAN_SECTION", "orphan-section"],
  ["ORPHAN_BLOCK", "orphan-block"],
  ["ORPHAN_MEDIA", "orphan-media"],
];

for (const [legacyCode, normalizedCode] of legacyIssueCodeAliases) {
  if (!publishReport.includes(legacyCode) || !publishReport.includes(normalizedCode)) {
    fail(`Publish raporu legacy issue alias kapsamı eksik: ${legacyCode}`);
  }
  if (!storeDesignShell.includes(legacyCode) || !storeDesignShell.includes(normalizedCode)) {
    fail(`Publish düzeltme yönlendirmesi legacy issue alias kapsamı eksik: ${legacyCode}`);
  }
}

for (const token of ["issue.ownerId", "issue.targetId"]) {
  if (!publishReport.includes(token)) fail(`Publish raporu legacy issue alanı fallback'i eksik: ${token}`);
  if (!storeDesignShell.includes(token)) fail(`Publish düzeltme yönlendirmesi legacy issue alanı fallback'i eksik: ${token}`);
}

for (const token of [
  'selected.type === "consent-banner"',
  'document.globals.tokens["consent-banner"]',
  "ÇEREZ BİLDİRİMİ",
  "Kabul düğmesi",
  "Ret düğmesi",
  "Konum",
  "widthPreset",
  "radiusPreset",
  "Kabul ve ret davranışı",
]) {
  if (!storeDesignShell.includes(token)) fail(`Global protected consent editor eksik: ${token}`);
}
if (!core.includes('component("consent-banner", "Çerez / Onay", "Diğer", "global", globalScopes, ["content", "layout", "card", "responsive"], ["consentSemantics", "categories", "consentState", "privacyUrl"])')) {
  fail("Consent banner global protected registry sözleşmesi eksik.");
}
if (!core.includes('export const GLOBAL_PROTECTED_COMPONENT_TYPES = new Set(["consent-banner"] as const)')) {
  fail("Consent banner global protected component set içinde değil.");
}
if (core.includes('section("consent-banner"')) {
  fail("Consent banner section library'ye geri eklenmiş; yalnız global protected hedef olmalı.");
}
for (const token of [
  "globalProtectedSectionIds",
  "globalProtectedSectionIds.has(id)",
  'normalizedPreset.sectionType === "consent-banner"',
  "legacy consent-banner section kaydı section tree'den kaldırıldı",
]) {
  if (!core.includes(token)) fail(`Consent global protected migration temizliği eksik: ${token}`);
}

const blockRenderer = read("apps/storefront/src/components/theme/StoreDesignBlockSection.tsx");
for (const type of [
  "video-hero",
  "video-banner",
  "background-media",
  "slideshow",
  "gallery-grid",
  "text-columns",
  "stats",
  "timeline",
  "feature-grid",
  "trust-badges",
  "testimonials",
  "tabs",
  "press-awards",
  "team",
  "announcement-bar",
  "marquee",
  "heading-subtext",
  "manifesto",
  "quote",
  "promo-banner",
  "shipping-returns-cta",
  "map-locator",
  "spacer",
  "divider",
  "anchor",
]) {
  if (!blockRenderer.includes(`"${type}"`)) fail(`Block section runtime eksik: ${type}`);
}

function extractStringSet(source, declaration) {
  const start = source.indexOf(`const ${declaration} = new Set([`);
  if (start < 0) {
    fail(`Set declaration bulunamadı: ${declaration}`);
    return new Set();
  }
  const end = source.indexOf("]);", start);
  if (end < 0) {
    fail(`Set declaration kapanışı bulunamadı: ${declaration}`);
    return new Set();
  }
  return new Set([...source.slice(start, end).matchAll(/"([^"]+)"/g)].map((match) => match[1]));
}

const sectionRows = core
  .split("\n")
  .filter((line) => line.trim().startsWith("section("))
  .map((line) => ({
    type: line.match(/section\("([^"]+)"/)?.[1] || "",
    implemented: /,\s*true(?:,\s*\d+)?\s*\),?\s*$/.test(line),
    line,
  }))
  .filter((item) => item.type);

const implementedSectionTypes = sectionRows.filter((item) => item.implemented).map((item) => item.type);
const pendingSectionTypes = sectionRows.filter((item) => !item.implemented).map((item) => item.type);
const expectedPendingSectionTypes = new Set(["integration-block", "developer-embed"]);
if (pendingSectionTypes.length !== expectedPendingSectionTypes.size || pendingSectionTypes.some((type) => !expectedPendingSectionTypes.has(type))) {
  fail(`Beklenmeyen pending section seti: ${pendingSectionTypes.join(", ")}`);
}
const pickerRenderableTypes = extractStringSet(sectionManager, "RENDERABLE_SECTION_TYPES");
if (pickerRenderableTypes.has("consent-banner")) fail("Consent banner section picker'a açılmış.");
const v2Sections = read("apps/storefront/src/lib/storeDesignV2Sections.ts");
const blockRuntimeTypes = extractStringSet(v2Sections, "BLOCK_RENDER_SECTION_TYPES");
const homeRenderer = read("apps/storefront/src/components/theme/HomeSectionRenderer.tsx");
const homeRuntimeTypes = new Set([...homeRenderer.matchAll(/section\.type\s*===\s*"([^"]+)"/g)].map((match) => match[1]));
const runtimeAliases = new Map([["collection-cards", "collections"]]);
const externalRuntimeTypes = new Set(["recommendations", "recently-viewed", "bundle", "cross-sell", "breadcrumb"]);

function hasSectionRuntime(type) {
  const alias = runtimeAliases.get(type);
  return blockRuntimeTypes.has(type)
    || homeRuntimeTypes.has(type)
    || externalRuntimeTypes.has(type)
    || Boolean(alias && homeRuntimeTypes.has(alias));
}

for (const type of implementedSectionTypes) {
  if (!pickerRenderableTypes.has(type)) fail(`implemented=true fakat admin picker runtime listesinde yok: ${type}`);
  if (!hasSectionRuntime(type)) fail(`implemented=true fakat storefront runtime bulunamadı: ${type}`);
}

for (const type of pendingSectionTypes) {
  if (pickerRenderableTypes.has(type)) fail(`implemented=false section admin picker'da yanlışlıkla açık: ${type}`);
  if (hasSectionRuntime(type)) fail(`implemented=false section storefront runtime listesinde açık: ${type}`);
  const row = sectionRows.find((item) => item.type === type);
  if (!row || !/,\s*false,\s*(?:undefined|\d+),\s*"[^"]+"/.test(row.line)) {
    fail(`Pending section capability gate açıklaması eksik: ${type}`);
  }
}

for (const token of ["securityLocked", "Güvenlik kilidi", "Henüz hazır değil"]) {
  if (!sectionManager.includes(token)) fail(`Section picker capability gate UI eksik: ${token}`);
}

for (const token of [
  'component("integration-block"',
  'component("developer-embed"',
  "STORE_DESIGN_INTEGRATION_BLOCK_REGISTRY",
  "STORE_DESIGN_INTEGRATION_BLOCK_REGISTRY_BY_ID",
  "credentialMode: \"none\"",
  "STORE_DESIGN_DEVELOPER_EMBED_POLICY",
  "merchantModeEnabled: false",
  "rawJsEnabled: false",
  "allowedHosts: [] as readonly string[]",
  'section.type === "integration-block"',
  'section.type === "developer-embed"',
  "Integration Block credential taşıyamaz",
  "Developer Embed merchant modunda kapalıdır",
]) {
  if (!core.includes(token)) fail(`Extension surface güvenlik sözleşmesi eksik: ${token}`);
}
if (!core.includes('severity: "error",\n        code: "section-runtime-unavailable"')) {
  fail("Pending section publish-blocking severity error değil.");
}
if (!core.includes('| "form"')) fail("ControlGroup union form alanını içermiyor.");

for (const token of [
  "normalizeStoreDesignAnchorId",
  'section.type === "anchor"',
  "Anchor ID benzersiz olmalı",
]) {
  if (!core.includes(token)) fail(`Generic section güvenlik sözleşmesi eksik: ${token}`);
}

const genericEditor = read("apps/admin/src/components/theme/StoreDesignBlockSectionEditor.tsx");
for (const token of [
  "Başlık rolü",
  "Boyut",
  "Yazı biçimi",
  "En fazla genişlik",
  "Masaüstü yüksekliği",
  "Mobil yüksekliği",
  "Kalınlık",
  "Renk",
  "Bağlantı kimliği",
]) {
  if (!genericEditor.includes(token)) fail(`Generic zero-block editor kontrolü eksik: ${token}`);
}

for (const token of ["HeadingTag", "headingSizeClass", "manifestoTitleClass", "dividerColor", "normalizeStoreDesignAnchorId"]) {
  if (!blockRenderer.includes(token)) fail(`Generic zero-block storefront preset runtime eksik: ${token}`);
}
for (const token of ["playbackPolicy", "v2-media-narrative-media", "posterAssetId", "data-editor-type=\"content\""]) {
  if (!blockRenderer.includes(token)) fail(`Media narrative storefront runtime eksik: ${token}`);
}

const mediaLibrary = read("apps/admin/src/components/theme/StoreDesignMediaLibrary.tsx");
for (const token of [
  "Fotoğraf ve video kayıtları",
  "Kaplama ve kırpma",
  "Video kapak görseli",
  "Mobil görsel",
]) {
  if (!mediaLibrary.includes(token)) fail(`Media Library V2 video/focal kontrolü eksik: ${token}`);
}

const mediaSectionEditor = read("apps/admin/src/components/theme/StoreDesignBlockSectionEditor.tsx");
for (const token of [
  "hero",
  "video-hero",
  "video-banner",
  "background-media",
  "brand-story",
  "collection-cards",
  "product-spotlight",
  "featured-collection",
  "category-cards",
  "product-comparison",
  "best-sellers",
  "recommendations",
  "recently-viewed",
  "bundle",
  "cross-sell",
  "breadcrumb",
  "contact-form",
  "map-locator",
  "review-highlights",
  "rewards-promo",
  "grid-stack-builder",
  "scroll-story",
  "Medya Arşivi",
  "Oynatma politikası",
  "Otomatik · sessiz · sürekli",
  "Metin kontrastı",
  "aktif koleksiyonlar",
  "Kart oranı",
  "Başlık konumu",
  "Marka hikayesi medyası",
  "İçerik genişliği",
  "Bilgi alanları",
  "Karşılaştırılacak ürünler · 2-4 seçim",
  "Karşılaştırma alanları",
  "Tablo · mobilde yatay kaydırma",
  "Otomatik · ödenmiş sipariş miktarları",
  "Tarih penceresi",
  "Öneri algoritması",
  "Öneri sıralaması mağaza tarafından otomatik hesaplanır.",
  "Geçmiş politikası",
  "İzin verilmezse geçmiş tutulmaz",
  "Telefon alanını göster",
  "Başarı mesajı",
  "güvenli gönderim için zorunludur",
  "Haritada aç bağlantıları",
  "Konum kartları aşağıdaki adreslerden oluşturulur",
  "Yorum kaynağı · ürün",
  "Yalnız onaylı yorumlar mağaza verilerinden otomatik gelir.",
  "Puanı göster",
  "Kayıt puanını göster",
  "Mobilde tek sütuna indir",
  "Güvenli yerleşim kullanılır",
  "Kaydırma uzunluğu",
  "Geçiş biçimi",
  "Kaydırma ipucunu göster",
]) {
  if (!mediaSectionEditor.includes(token)) fail(`Media narrative editor kontrolü eksik: ${token}`);
}

for (const token of [
  'component("video-hero"',
  'component("background-media"',
  'block("content"',
  'section("hero"',
  'section("video-hero"',
  'section("video-banner"',
  'section("background-media"',
  'section("product-spotlight"',
  'section("featured-collection"',
  'section("category-cards"',
  'section("product-comparison"',
  'section("best-sellers"',
  'section("recommendations"',
  'component("recently-viewed"',
  'section("recently-viewed"',
  'component("bundle"',
  'section("bundle"',
  'component("cross-sell"',
  'section("cross-sell"',
  'section("breadcrumb"',
  'component("contact-form"',
  'section("contact-form"',
  'component("map-locator"',
  'component("location"',
  'section("map-locator"',
  'block("location"',
  'component("review-highlights"',
  'section("review-highlights"',
  'component("rewards-promo"',
  'section("rewards-promo"',
  'component("grid-stack-builder"',
  'section("grid-stack-builder"',
  'section("collection-cards"',
  'section("brand-story"',
  'component("scroll-story-slide"',
  'block("scroll-story-slide"',
]) {
  if (!core.includes(token)) fail(`Media narrative registry sözleşmesi eksik: ${token}`);
}

const productPresetEditor = read("apps/admin/src/components/theme/StoreDesignSectionEditor.tsx");
for (const token of ["new-arrivals", "sale-products", "Otomatik · yeni ürün işareti", "Otomatik · gerçek indirim verisi", "İndirim rozeti"]) {
  if (!productPresetEditor.includes(token)) fail(`Product preset editor eksik: ${token}`);
}

const themeSections = read("packages/commerce-core/src/theme-sections.ts");
for (const token of ['| "product-spotlight"', '| "featured-collection"', '| "category-cards"', '| "product-comparison"', '| "best-sellers"', '| "recommendations"', '| "recently-viewed"', '| "bundle"', '| "cross-sell"', '| "breadcrumb"', '| "new-arrivals"', '| "sale-products"', 'layout?: "slider" | "grid"', 'badgeStyle?: "pill" | "outline" | "minimal"', "mobileAssetUrl?: string", "mobileObjectPosition?: string"]) {
  if (!themeSections.includes(token)) fail(`Product preset render contract eksik: ${token}`);
}

const homeSectionRenderer = read("apps/storefront/src/components/theme/HomeSectionRenderer.tsx");
for (const token of ['product.is_new === true', 'section.type === "sale-products"', 'section.layout === "grid"', "saleBadgeVars", "productHasDiscount"]) {
  if (!homeSectionRenderer.includes(token)) fail(`Product preset storefront runtime eksik: ${token}`);
}
for (const token of [
  "customHero",
  "safeSectionHref",
  "data-home-editorial-media",
  'section.type === "product-spotlight"',
  'section.type === "featured-collection"',
  'section.type === "category-cards"',
  'section.type === "product-comparison"',
  'section.type === "best-sellers"',
  "formatPrice",
  "customCollectionCards",
  "--collection-columns",
  "customBrandStory",
  "v2-brand-story-media",
]) {
  if (!homeSectionRenderer.includes(token)) fail(`Hero/collection/brand V2 storefront runtime eksik: ${token}`);
}

for (const token of [
  '["hero", "product-spotlight", "featured-collection", "category-cards", "product-comparison", "best-sellers", "recommendations", "recently-viewed", "bundle", "cross-sell", "breadcrumb", "collection-cards", "brand-story"]',
  'section.type === "scroll-story"',
  "hydrateV2Blocks",
  "mobileAssetUrl",
  "mobileObjectPosition",
  "semanticV2Section",
]) {
  if (!v2Sections.includes(token)) fail(`Semantic V2 hydration eksik: ${token}`);
}

const scrollStory = read("apps/storefront/src/components/home/ScrollStory.tsx");
for (const token of [
  "buildV2Slides",
  "scroll-story-slide",
  "safeStoryHref",
  "scrollLengthPreset",
  "transitionPreset",
  "cueVisibility",
  "mobileObjectPosition",
]) {
  if (!scrollStory.includes(token)) fail(`Scroll Story V2 runtime eksik: ${token}`);
}

const productCard = read("apps/storefront/src/components/ProductCard.tsx");
if (!productCard.includes("--theme-sale-badge-bg")) fail("Sale badge style preset ProductCard'a bağlı değil.");

const recommendationsRuntime = read("apps/storefront/src/components/product/ProductRecommendations.tsx");
for (const token of [
  "relationScore",
  "sortRecommendations",
  "recommendationLimit",
  'layout === "slider"',
  "settings?: Record<string, unknown>",
]) {
  if (!recommendationsRuntime.includes(token)) fail(`Recommendations protected runtime eksik: ${token}`);
}
const productDetailRuntime = read("apps/storefront/src/components/product/ProductDetailExperience.tsx");
if (!productDetailRuntime.includes("recommendationsConfig")) fail("Recommendations product detail config bağlantısı eksik.");
const productRoute = read("apps/storefront/src/app/products/[slug]/page.tsx");
for (const token of ["storeDesignSectionsForTemplatePath", '"/products/[slug]"', "recommendationsConfig"]) {
  if (!productRoute.includes(token)) fail(`Recommendations product template runtime bağlantısı eksik: ${token}`);
}
if (!v2Sections.includes("storeDesignSectionsForTemplatePath")) fail("Dynamic template storefront resolver eksik.");

const bundleRuntime = read("apps/storefront/src/components/product/ProductBundleSection.tsx");
for (const token of [
  "/bundles?source=",
  "bundleConfig",
  "formatPrice",
  "item.price",
  'data-editor-type="bundle"',
  "Paketi İncele",
]) {
  if (!bundleRuntime.includes(token) && !productDetailRuntime.includes(token)) fail(`Bundle protected runtime eksik: ${token}`);
}
const bundleRoute = read("apps/storefront/src/app/api/products/[slug]/bundles/route.ts");
for (const token of [
  "getBundleSectionProducts",
  "getProductBySlug",
  'sourceParam === "all" ? "all" : "related"',
  "price: product.price",
  "compare_at_price: product.compare_at_price",
]) {
  if (!bundleRoute.includes(token)) fail(`Bundle read-only endpoint eksik: ${token}`);
}
const storefrontData = read("apps/storefront/src/data/site.ts");
for (const token of [
  "getBundleSectionProducts",
  'product.product_type === "bundle"',
  "bundleItemIds(bundle).includes(productId)",
  "bundleItemSlugs(bundle).includes(productSlug)",
]) {
  if (!storefrontData.includes(token)) fail(`Bundle catalog resolver eksik: ${token}`);
}
for (const forbiddenToken of ["bundle_items =", "price =", "compare_at_price ="]) {
  if (bundleRuntime.includes(forbiddenToken)) fail(`Bundle runtime business verisi hesaplamamalı/değiştirmemeli: ${forbiddenToken}`);
}
if (!productDetailRuntime.includes("bundleConfig")) fail("Bundle product detail config bağlantısı eksik.");
for (const token of ['section.type === "bundle"', "bundleConfig"]) {
  if (!productRoute.includes(token)) fail(`Bundle product template runtime bağlantısı eksik: ${token}`);
}

const crossSellRuntime = read("apps/storefront/src/components/cart/StoreDesignCrossSell.tsx");
for (const token of [
  "STORE_DESIGN_CROSS_SELL_SETTINGS_EVENT",
  "/api/cart/cross-sell",
  'data-editor-type="cross-sell"',
  "context",
  "after-items",
  "before-totals",
]) {
  if (!crossSellRuntime.includes(token)) fail(`Cross-sell protected runtime eksik: ${token}`);
}
const crossSellRoute = read("apps/storefront/src/app/api/cart/cross-sell/route.ts");
for (const token of ["getCrossSellProducts", "best-sellers", "new-arrivals", "price: product.price"]) {
  if (!crossSellRoute.includes(token)) fail(`Cross-sell read-only endpoint eksik: ${token}`);
}
const crossSellData = read("apps/storefront/src/data/crossSell.ts");
for (const token of ["relationScore", "getCachedBestSellingProducts", "product.is_new", 'product.stock_status !== "out_of_stock"']) {
  if (!crossSellData.includes(token)) fail(`Cross-sell source service eksik: ${token}`);
}
for (const forbiddenToken of ["addItem(", "updateQuantity(", "price =", "compare_at_price ="]) {
  if (crossSellRuntime.includes(forbiddenToken)) fail(`Cross-sell protected runtime cart/fiyat mantığına dokunuyor: ${forbiddenToken}`);
}
const cartDrawer = read("apps/storefront/src/components/cart/CartDrawer.tsx");
for (const token of ["crossSellConfig", 'context="cart"', "storeDesignCartPreview"]) {
  if (!cartDrawer.includes(token)) fail(`Cart Cross-sell protected zone bağlantısı eksik: ${token}`);
}
const checkoutPage = read("apps/storefront/src/app/checkout/page.tsx");
const checkoutClient = read("apps/storefront/src/components/checkout/PaytrIframeCheckoutClient.tsx");
for (const token of ['"/checkout"', "crossSellConfig", "getStoreDesignV2Preview"]) {
  if (!checkoutPage.includes(token)) fail(`Checkout Cross-sell config bağlantısı eksik: ${token}`);
}
for (const token of ['context="checkout"', "after-items", "before-totals"]) {
  if (!checkoutClient.includes(token)) fail(`Checkout Cross-sell protected zone runtime eksik: ${token}`);
}
const editorPagesRoute = read("apps/admin/src/app/api/theme-editor-pages/route.ts");
for (const token of ['path: "/cart"', 'path: "/checkout"', "Sistem Şablonları", "storeDesignCartPreview=1"]) {
  if (!editorPagesRoute.includes(token)) fail(`Cart/Checkout protected editor hedefi eksik: ${token}`);
}
const storeDesignV21 = read("apps/admin/src/components/theme/StoreDesignV21.tsx");
if (!storeDesignV21.includes('page.path.startsWith("/cart")')) fail("Cart page compatibility protected editor'a bağlı değil.");
const crossSellSemanticRuntimeProvider = read("apps/storefront/src/components/theme/SemanticThemeRuntimeProvider.tsx");
for (const token of ["STORE_DESIGN_CROSS_SELL_SETTINGS_EVENT", "crossSellConfigForPath", '"/cart"', '"/checkout"', "storeDesignCartPreview"]) {
  if (!crossSellSemanticRuntimeProvider.includes(token)) fail(`Cross-sell preview document bridge eksik: ${token}`);
}

const recentlyViewedRuntime = read("apps/storefront/src/components/product/ProductRecentlyViewed.tsx");
for (const token of [
  'const CONSENT_KEY = "ruth_analytics_consent_v1"',
  'const HISTORY_KEY = "storefront_recently_viewed_v2"',
  'window.addEventListener("ruth:analytics-consent"',
  "clearHistory()",
  'consent !== "accepted"',
  "fetchProduct",
  "/browser-window",
  "product.status === \"active\"",
]) {
  if (!recentlyViewedRuntime.includes(token)) fail(`Recently Viewed privacy runtime eksik: ${token}`);
}
for (const forbiddenToken of ["name: current.name", "image: productPrimaryDetailImageSrc(current)"]) {
  if (recentlyViewedRuntime.includes(forbiddenToken)) fail(`Recently Viewed history yalnız slug/timestamp tutmalı: ${forbiddenToken}`);
}
if (!productDetailRuntime.includes("recentlyViewedConfig")) fail("Recently Viewed product detail config bağlantısı eksik.");
for (const token of ['section.type === "recently-viewed"', "recentlyViewedConfig"]) {
  if (!productRoute.includes(token)) fail(`Recently Viewed product template runtime bağlantısı eksik: ${token}`);
}

const consentRuntime = read("apps/storefront/src/components/analytics/AnalyticsConsentGate.tsx");
for (const token of [
  "desktopSettings",
  "mobileSettings",
  "SEMANTIC_RUNTIME_PATCH_EVENT",
  "STORE_DESIGN_CONSENT_SETTINGS_EVENT",
  "onDocumentSettings",
  'detail.selectorValue !== "consent-banner"',
  'detail.scope !== "global"',
  'params.get("themeEditor") === "1"',
  "if (editorPreview) return",
  "Gerekli çerezler her zaman aktiftir",
  'href="/privacy-policy"',
  '"bottom-center", "bottom-left", "bottom-right"',
  '"compact", "standard", "wide"',
  '"soft", "rounded", "pill"',
]) {
  if (!consentRuntime.includes(token)) fail(`Consent protected runtime bridge eksik: ${token}`);
}
for (const forbiddenToken of ['settings?.categories', 'settings?.consentState', 'settings?.privacyUrl']) {
  if (consentRuntime.includes(forbiddenToken)) fail(`Consent protected alanı runtime appearance settings'e açılmış: ${forbiddenToken}`);
}
const storefrontLayout = read("apps/storefront/src/app/layout.tsx");
for (const token of [
  'storeDesignV2.globals.tokens["consent-banner"]',
  "consentDesktopSettings",
  "consentMobileSettings",
  "desktopSettings={consentDesktopSettings}",
  "mobileSettings={consentMobileSettings}",
]) {
  if (!storefrontLayout.includes(token)) fail(`Consent global settings storefront bridge eksik: ${token}`);
}
const semanticRuntimeProvider = read("apps/storefront/src/components/theme/SemanticThemeRuntimeProvider.tsx");
for (const token of [
  'STORE_DESIGN_CONSENT_SETTINGS_EVENT = "store-design-v2:consent-settings"',
  'effectiveDocument.globals.tokens["consent-banner"]',
  "desktop: objectRecord(responsive.desktop)",
  "mobile: objectRecord(responsive.mobile)",
]) {
  if (!semanticRuntimeProvider.includes(token)) fail(`Consent preview document hydration bridge eksik: ${token}`);
}
const semanticEditorBridge = read("apps/storefront/src/components/theme/SemanticThemeEditorBridge.tsx");
for (const token of [
  "CONSENT_APPEARANCE_PATCHES",
  'definition.semanticType === "consent-banner"',
  'case "intro"',
  'case "position"',
  'case "widthPreset"',
  'case "radiusPreset"',
  '"bottom-center", "bottom-left", "bottom-right"',
  '"compact", "standard", "wide"',
  '"soft", "rounded", "pill"',
]) {
  if (!semanticEditorBridge.includes(token)) fail(`Consent semantic patch validation eksik: ${token}`);
}

const breadcrumbRuntime = read("apps/storefront/src/components/theme/StoreDesignBreadcrumb.tsx");
for (const token of [
  'data-editor-type="breadcrumb"',
  'aria-label="Sayfa Yolu"',
  'separatorPreset === "slash"',
  'separatorPreset === "dot"',
  "items.length < 2",
]) {
  if (!breadcrumbRuntime.includes(token)) fail(`Breadcrumb protected runtime eksik: ${token}`);
}
for (const [relativePath, tokens] of [
  ["apps/storefront/src/app/products/[slug]/page.tsx", ["breadcrumbConfig", '"/products/[slug]"']],
  ["apps/storefront/src/app/collections/[slug]/page.tsx", ["StoreDesignBreadcrumb", '"/collections/[slug]"']],
  ["apps/storefront/src/app/category/[slug]/page.tsx", ["StoreDesignBreadcrumb", '"/category/[slug]"']],
  ["apps/storefront/src/app/pages/[slug]/page.tsx", ["StoreDesignBreadcrumb", 'section.type === "breadcrumb"']],
]) {
  const source = read(relativePath);
  for (const token of tokens) {
    if (!source.includes(token)) fail(`Breadcrumb route runtime eksik (${relativePath}): ${token}`);
  }
}

const contactFormRuntime = read("apps/storefront/src/components/theme/StoreDesignContactForm.tsx");
for (const token of [
  'fetch("/api/contact"',
  'name="company"',
  'minLength={2}',
  'type="email"',
  'minLength={10}',
  'maxLength={4000}',
  "successCopy",
]) {
  if (!contactFormRuntime.includes(token)) fail(`Protected Contact Form runtime eksik: ${token}`);
}
if (!blockRenderer.includes('type === "contact-form"')) fail("Contact Form StoreDesignBlockSection runtime'a bağlı değil.");
if (!v2Sections.includes('"contact-form"')) fail("Contact Form V2 adapter allowlist'e bağlı değil.");

const newsletterRuntime = read("apps/storefront/src/components/theme/StoreDesignNewsletter.tsx");
for (const token of [
  'fetch("/api/newsletter/subscribe"',
  'data-editor-type="newsletter"',
  "consent",
  "Önizleme modunda gerçek abonelik gönderilmez.",
]) {
  if (!newsletterRuntime.includes(token)) fail(`Newsletter protected runtime eksik: ${token}`);
}
const newsletterRoute = read("apps/storefront/src/app/api/newsletter/subscribe/route.ts");
for (const token of [
  "getStoreDesignV2Published",
  'section.type !== "newsletter"',
  "storefront_public_submission_attempts",
  "newsletter_subscribers",
  "consent_copy",
  'onConflict: "email"',
]) {
  if (!newsletterRoute.includes(token)) fail(`Newsletter protected endpoint eksik: ${token}`);
}
if (!blockRenderer.includes('type === "newsletter"')) fail("Newsletter StoreDesignBlockSection runtime'a bağlı değil.");
if (!v2Sections.includes('"newsletter"')) fail("Newsletter V2 adapter allowlist'e bağlı değil.");

const customFormRuntime = read("apps/storefront/src/components/theme/StoreDesignCustomForm.tsx");
for (const token of [
  'fetch("/api/store-design/forms"',
  'data-editor-type="custom-form"',
  'data-editor-type="form-field"',
  'action: "store"',
  "Önizleme modunda gerçek form gönderimi yapılmaz.",
]) {
  if (!customFormRuntime.includes(token)) fail(`Custom Form protected runtime eksik: ${token}`);
}
const customFormRoute = read("apps/storefront/src/app/api/store-design/forms/route.ts");
for (const token of [
  "getStoreDesignV2Published",
  'section.type !== "custom-form"',
  'const ACTIONS = new Set(["store"])',
  "storefront_public_submission_attempts",
  "storefront_form_submissions",
  "schema_snapshot",
  "FIELD_TYPES",
]) {
  if (!customFormRoute.includes(token)) fail(`Custom Form protected endpoint eksik: ${token}`);
}
if (!blockRenderer.includes('type === "custom-form"')) fail("Custom Form StoreDesignBlockSection runtime'a bağlı değil.");
if (!v2Sections.includes('"custom-form"')) fail("Custom Form V2 adapter allowlist'e bağlı değil.");

const publicFormsMigration = read("supabase/migrations/20260928003000_store_design_newsletter_custom_forms.sql");
for (const token of [
  "newsletter_subscribers",
  "storefront_form_submissions",
  "storefront_public_submission_attempts",
  "enable row level security",
  "revoke all",
  "service_role",
]) {
  if (!publicFormsMigration.includes(token)) fail(`Public form storage migration eksik: ${token}`);
}

for (const token of [
  'component("newsletter"',
  'section("newsletter"',
  'component("custom-form"',
  'section("custom-form"',
  'block("field", "Form Alanı", ["custom-form"]',
]) {
  if (!core.includes(token)) fail(`Newsletter/Custom Form registry sözleşmesi eksik: ${token}`);
}

for (const token of [
  "Bülten kaydı güvenli şekilde yönetilir",
  "Gönderim biçimi",
  "güvenli gönderim için zorunludur",
  'block.type === "field" && key === "type"',
  'block.type === "field" && key === "required"',
]) {
  if (!genericEditor.includes(token)) fail(`Newsletter/Custom Form editor koruması eksik: ${token}`);
}

for (const token of [
  'section.type === "map-locator"',
  "Haritada aç bağlantıları",
  "Konum kartları aşağıdaki adreslerden oluşturulur",
  "güvenli biçimde hazırlanır",
  'if (type === "location")',
]) {
  if (!genericEditor.includes(token)) fail(`Store Locator editor koruması eksik: ${token}`);
}
for (const token of [
  'type === "map-locator"',
  'data-editor-type="map-locator"',
  'data-editor-type="location"',
  "storeMapHref",
  "https://www.google.com/maps/search/?api=1&query=",
  'rel="noopener noreferrer"',
]) {
  if (!blockRenderer.includes(token)) fail(`Store Locator provider-free runtime eksik: ${token}`);
}
for (const forbiddenToken of ["navigator.geolocation", "maps.googleapis.com", "<iframe"]) {
  if (blockRenderer.includes(forbiddenToken)) fail(`Store Locator üçüncü taraf/geolocation runtime açmış: ${forbiddenToken}`);
}
if (!v2Sections.includes('"map-locator"')) fail("Store Locator V2 adapter allowlist'e bağlı değil.");

const reviewHighlightsRuntime = read("apps/storefront/src/components/theme/StoreDesignReviewHighlights.tsx");
for (const token of [
  "/api/reviews/summary?productId=",
  "verified_purchase",
  "ratingDisplay",
  "summary.reviews.slice(0, limit)",
]) {
  if (!reviewHighlightsRuntime.includes(token)) fail(`Review Highlights read-only runtime eksik: ${token}`);
}
if (!blockRenderer.includes('type === "review-highlights"')) fail("Review Highlights StoreDesignBlockSection runtime'a bağlı değil.");
if (!v2Sections.includes('"review-highlights"')) fail("Review Highlights V2 adapter allowlist'e bağlı değil.");

const rewardsPromoRuntime = read("apps/storefront/src/components/theme/StoreDesignRewardsPromo.tsx");
for (const token of [
  "useRostaPointsSettings",
  "rewards.signupPoints",
  "rewards.pointsPerTl",
  "safeHref",
  "showSignupPoints",
  "showEarnRate",
]) {
  if (!rewardsPromoRuntime.includes(token)) fail(`Rewards Promo protected runtime eksik: ${token}`);
}
if (!blockRenderer.includes('type === "rewards-promo"')) fail("Rewards Promo StoreDesignBlockSection runtime'a bağlı değil.");
if (!v2Sections.includes('"rewards-promo"')) fail("Rewards Promo V2 adapter allowlist'e bağlı değil.");

for (const token of [
  'type === "grid-stack-builder"',
  "v2-safe-grid",
  "--v2-grid-mobile-columns",
  "responsiveStack",
]) {
  if (!blockRenderer.includes(token)) fail(`Grid Stack storefront runtime eksik: ${token}`);
}
if (!v2Sections.includes('"grid-stack-builder"')) fail("Grid Stack V2 adapter allowlist'e bağlı değil.");
if (!core.includes('block("content", "İçerik", ["background-media", "grid-stack-builder"]')) fail("Grid Stack content block contract eksik.");

const catalogCache = read("apps/storefront/src/data/catalogCache.ts");
for (const token of [
  "getCachedBestSellingProducts",
  "paidBestSellerOrder",
  "testBestSellerOrder",
  '.from("orders")',
  "order_items (product_id, product_slug, quantity)",
]) {
  if (!catalogCache.includes(token)) fail(`Best Sellers read-only order ranking eksik: ${token}`);
}

const storefrontHomePage = read("apps/storefront/src/app/page.tsx");
for (const token of ["bestSellerWindows", "getCachedBestSellingProducts", "bestSellerProductsByWindow"]) {
  if (!storefrontHomePage.includes(token)) fail(`Best Sellers server prefetch eksik: ${token}`);
}

const controlGroupStart = core.indexOf("export type ControlGroup");
const pageCompatibilityStart = core.indexOf("export type PageCompatibility");
if (controlGroupStart >= 0 && pageCompatibilityStart > controlGroupStart) {
  const controlUnion = new Set([...core.slice(controlGroupStart, pageCompatibilityStart).matchAll(/\|\s*"([^"]+)"/g)].map((match) => match[1]));
  const componentLines = core.split("\n").filter((line) => line.trim().startsWith("component("));
  const usedControlGroups = new Set();
  for (const line of componentLines) {
    const arrays = [...line.matchAll(/\[([^\]]*)\]/g)];
    const controlGroupArray = arrays.length >= 2 ? arrays[arrays.length - 2]?.[1] || "" : "";
    for (const match of controlGroupArray.matchAll(/"([^"]+)"/g)) usedControlGroups.add(match[1]);
  }
  for (const control of usedControlGroups) {
    if (!controlUnion.has(control)) fail(`Component registry ControlGroup union dışında değer kullanıyor: ${control}`);
  }
}

const analyzeStart = core.indexOf("export function analyzeThemeDocumentReferences");
const validateStart = core.indexOf("export function validateThemeDocument");
if (analyzeStart >= 0 && validateStart > analyzeStart && core.slice(analyzeStart, validateStart).includes("errors.push")) {
  fail("analyzeThemeDocumentReferences içinde tanımsız errors collector kullanılıyor.");
}

const adminStoreDesignCss = read("apps/admin/src/app/globals.css");
for (const token of [
  "sd-mobile-dock",
  "Önizleme",
  "Yapı",
  "Ekle",
  "Düzenle",
  "data-store-design-context-menu",
  "Hızlı ayarları sıfırla",
  "window.visualViewport",
  "connectionStalled",
  "Yeniden bağlan",
  "onFixIssue",
]) {
  if (!storeDesignShell.includes(token)) fail(`V4.1 editor shell kabul özelliği eksik: ${token}`);
}

for (const token of [
  "touchReorderTimerRef",
  "sectionReferenceCounts",
  "Sıralamak için basılı tut ve sürükle",
  "yerde kullanılıyor",
  "Hazır Düzenler",
]) {
  if (!sectionManager.includes(token)) fail(`V4.1 mobil yapı/shared-section davranışı eksik: ${token}`);
}

for (const token of [
  "LONG_PRESS_MS",
  'event.key === "ContextMenu"',
  'event.shiftKey && event.key === "F10"',
  "PREVIEW_SCROLL_MESSAGE",
]) {
  if (!semanticEditorBridge.includes(token)) fail(`V4.1 semantic seçim/klavye davranışı eksik: ${token}`);
}

for (const token of [
  "--sd-visual-height",
  "prefers-reduced-motion:reduce",
  "min-width:44px",
  "data-physical-mobile",
  "@media (min-width:768px) and (max-width:1199px)",
]) {
  if (!adminStoreDesignCss.includes(token)) fail(`V4.1 responsive/erişilebilirlik stili eksik: ${token}`);
}

for (const token of [
  "contextTargetsWholeSection",
  "Üst bölüm işlemleri",
  "Üst bölümü çoğalt",
  "Üst bölümü kaldır",
  "Görünürlük değişikliği bağlı olan tüm yerleri etkiler",
]) {
  if (!storeDesignShell.includes(token)) fail(`V4.1 sağ tık üst-bölüm güvenliği eksik: ${token}`);
}

for (const forbidden of [
  "GLOBAL CONSENT",
  "Kabul butonu",
  "Red butonu",
  "Media Library",
  "Anchor ID",
]) {
  if (storeDesignShell.includes(forbidden) || genericEditor.includes(forbidden)) {
    fail(`Kullanıcı arayüzünde eski teknik/İngilizce ifade kaldı: ${forbidden}`);
  }
}

note("V4.1 mobil kabuk, hızlı düzenleme, erişilebilirlik ve responsive kabul korumaları tarandı.");

note(`Section library: ${implementedSectionTypes.length} runtime hazır · ${pendingSectionTypes.length} kapalı/pending`);

if (!storefrontData.includes("migrateThemeDocument")) fail("Storefront published/preview theme read migration katmanından geçmiyor.");
if (!storefrontData.includes("legacy storefront fallback")) fail("Unsupported schema için güvenli storefront fallback eksik.");

const v2Api = read("apps/admin/src/app/api/store-design-v2/route.ts");
for (const token of ["MAX_PUBLISH_SNAPSHOTS", "SNAPSHOT_PREFIX", "validateThemeDocument", "migrateThemeDocument"]) {
  if (!v2Api.includes(token)) fail(`Publish API güvenilirlik adımı eksik: ${token}`);
}

note(`Toplam admin+storefront kaynak dosyası: ${allSourceFiles.length}`);

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
