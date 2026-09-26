"use strict";

export const STORE_DESIGN_SCHEMA_VERSION = 2 as const;

export type EditorScope = "instance" | "section" | "family" | "template" | "global";
export type ControlGroup =
  | "content"
  | "data"
  | "layout"
  | "typography"
  | "media"
  | "card"
  | "responsive"
  | "animation"
  | "seo"
  | "accessibility"
  | "advanced";

export type PageCompatibility =
  | "home"
  | "content"
  | "landing"
  | "product"
  | "category"
  | "collection"
  | "cart"
  | "checkout"
  | "account"
  | "search"
  | "legal"
  | "utility";

export type ComponentDefinition = {
  semanticType: string;
  label: string;
  category: string;
  defaultScope: EditorScope;
  allowedScopes: EditorScope[];
  controlGroups: ControlGroup[];
  protectedFields: string[];
  schemaVersion: number;
};

export type SectionDefinition = {
  type: string;
  label: string;
  category: "commerce" | "media" | "content" | "marketing";
  compatiblePages: PageCompatibility[];
  settings: string[];
  allowedBlocks: string[];
  maxBlocks?: number;
  implemented: boolean;
  schemaVersion: number;
};

const component = (
  semanticType: string,
  label: string,
  category: string,
  defaultScope: EditorScope,
  allowedScopes: EditorScope[],
  controlGroups: ControlGroup[],
  protectedFields: string[] = [],
): ComponentDefinition => ({
  semanticType,
  label,
  category,
  defaultScope,
  allowedScopes,
  controlGroups,
  protectedFields,
  schemaVersion: STORE_DESIGN_SCHEMA_VERSION,
});

const globalScopes: EditorScope[] = ["global"];
const familyScopes: EditorScope[] = ["family", "section", "template"];
const templateScopes: EditorScope[] = ["template"];
const sectionScopes: EditorScope[] = ["section", "template"];
const instanceScopes: EditorScope[] = ["instance", "section"];

export const COMPONENT_REGISTRY: ComponentDefinition[] = [
  component("global-theme-tokens", "Global Tema Tokenları", "Global", "global", globalScopes, ["typography", "layout", "responsive"], ["rawCss", "fontUrl", "arbitraryHex"]),
  component("announcement-bar", "Duyuru Çubuğu", "Global", "global", globalScopes, ["content", "layout", "responsive"], ["checkoutState"]),
  component("header-shell", "Header", "Global", "global", globalScopes, ["layout", "responsive"], ["freePosition", "paymentUi"]),
  component("header-logo", "Logo", "Global", "global", globalScopes, ["media", "layout", "responsive"], ["rawTransform"]),
  component("main-menu", "Ana Menü", "Global", "global", globalScopes, ["content", "layout", "responsive"], ["rawChildResize"]),
  component("mega-menu", "Mega Menü", "Global", "global", globalScopes, ["content", "layout", "media", "responsive"], ["rawCss"]),
  component("menu-media-card", "Menü Medya Kartı", "Global", "instance", ["instance", "global"], ["content", "media", "card", "responsive"], ["arbitrarySize"]),
  component("search-trigger", "Arama Butonu", "Global", "global", globalScopes, ["layout"], ["searchLogic"]),
  component("account-trigger", "Hesap Butonu", "Global", "global", globalScopes, ["layout"], ["authLogic"]),
  component("cart-trigger", "Sepet Butonu", "Global", "global", globalScopes, ["layout"], ["cartState"]),
  component("footer-shell", "Footer", "Global", "global", globalScopes, ["content", "layout", "responsive"], ["requiredLegalLinks"]),
  component("footer-group", "Footer Link Grubu", "Global", "global", globalScopes, ["content", "layout"], ["requiredLegalLinks"]),
  component("social-links", "Sosyal Bağlantılar", "Global", "global", globalScopes, ["content", "layout"], []),
  component("whatsapp-trigger", "WhatsApp Butonu", "Global", "global", globalScopes, ["content", "layout"], ["supportLogic"]),
  component("rewards-trigger", "Puan / Ödül Butonu", "Global", "global", globalScopes, ["content", "layout"], ["rewardMath"]),
  component("rewards-panel", "Puan / Ödül Paneli", "Global", "global", globalScopes, ["content", "media", "layout"], ["rewardMath"]),

  component("hero-section", "Hero", "Ana Sayfa", "section", sectionScopes, ["content", "media", "layout", "responsive"], ["freeTransform"]),
  component("hero-media", "Hero Medyası", "Ana Sayfa", "instance", instanceScopes, ["media", "responsive"], ["freeFrame"]),
  component("hero-wordmark", "Hero Wordmark", "Ana Sayfa", "section", sectionScopes, ["layout", "typography", "responsive"], ["rawTransform"]),
  component("scroll-story", "Scroll Story", "Ana Sayfa", "section", sectionScopes, ["content", "media", "layout", "animation", "responsive"], ["rawJs"]),
  component("scroll-story-media", "Scroll Story Medyası", "Ana Sayfa", "instance", instanceScopes, ["media", "responsive"], ["freeFrame"]),
  component("editorial-text", "Editorial Metin", "Ana Sayfa", "section", ["instance", "section"], ["content", "typography", "animation", "responsive"], ["rawEasing"]),
  component("collections-section", "Koleksiyonlar", "Ana Sayfa", "section", sectionScopes, ["data", "layout", "responsive"], ["catalogMembership"]),
  component("collection-card", "Koleksiyon Kartı", "Ana Sayfa", "family", familyScopes, ["card", "typography", "responsive"], ["catalogMembership", "individualWidth"]),
  component("featured-products", "Öne Çıkan Ürünler", "Ana Sayfa", "section", sectionScopes, ["data", "layout", "responsive"], ["productPrice"]),
  component("product-slider", "Ürün Sliderı", "Ana Sayfa", "section", sectionScopes, ["data", "layout", "animation", "responsive"], ["productPrice"]),
  component("product-grid", "Ürün Grid'i", "Katalog", "section", ["section", "template"], ["layout", "responsive"], ["individualCardWidth", "catalogData"]),
  component("product-card", "Ürün Kartı", "Katalog", "family", ["family", "section", "template"], ["card", "typography", "layout", "responsive"], ["productData", "individualMediaScale", "individualWidth"]),
  component("product-card-media", "Ürün Kartı Görseli", "Katalog", "family", familyScopes, ["media", "card", "responsive"], ["productMediaFile"]),
  component("product-card-title", "Ürün Kartı Başlığı", "Katalog", "family", familyScopes, ["typography", "layout"], ["productName"]),
  component("product-card-price", "Ürün Kartı Fiyatı", "Katalog", "family", familyScopes, ["typography", "layout"], ["priceValue"]),
  component("product-card-badge", "Ürün Kartı Rozeti", "Katalog", "family", familyScopes, ["card", "typography"], ["discountValue"]),
  component("product-card-quick-add", "Hızlı Sepete Ekle", "Katalog", "family", familyScopes, ["layout", "card"], ["cartLogic"]),
  component("brand-story", "Marka Hikayesi", "İçerik", "section", sectionScopes, ["content", "media", "layout", "typography", "responsive"], ["rawHtml", "rawCss"]),
  component("trust-section", "Güven / Kargo", "İçerik", "section", sectionScopes, ["content", "layout", "responsive"], ["unverifiedPromises"]),
  component("rich-text", "Rich Text", "İçerik", "instance", instanceScopes, ["content", "typography", "layout", "responsive"], ["rawJs"]),
  component("image-banner", "Görsel Banner", "İçerik", "section", sectionScopes, ["content", "media", "layout", "responsive"], ["freeTransform"]),
  component("video-banner", "Video Banner", "İçerik", "section", sectionScopes, ["content", "media", "layout", "responsive"], ["freeTransform"]),
  component("gallery", "Galeri", "İçerik", "section", sectionScopes, ["media", "layout", "responsive"], ["freeCanvas"]),
  component("slideshow", "Slideshow", "İçerik", "section", sectionScopes, ["content", "media", "layout", "animation", "responsive"], ["rawJs"]),
  component("faq-accordion", "SSS Accordion", "İçerik", "family", familyScopes, ["content", "layout", "animation"], ["endpoint"]),
  component("tabs", "Sekmeler", "İçerik", "family", familyScopes, ["content", "layout", "responsive"], []),
  component("spacer", "Boşluk", "İçerik", "section", sectionScopes, ["layout", "responsive"], ["arbitraryHeight"]),

  component("catalog-shell", "Katalog Sayfası", "Katalog", "template", templateScopes, ["layout", "responsive"], ["catalogDataset"]),
  component("page-intro", "Sayfa Başlığı", "Katalog", "template", ["instance", "template"], ["content", "typography", "layout"], ["dynamicResultCount"]),
  component("breadcrumb", "Breadcrumb", "Katalog", "template", templateScopes, ["typography", "layout"], ["pathGeneration"]),
  component("filter-controls", "Filtreler", "Katalog", "family", familyScopes, ["layout", "card", "responsive"], ["filterValues", "filterLogic"]),
  component("sort-control", "Sıralama", "Katalog", "family", familyScopes, ["layout", "card"], ["sortAlgorithm"]),
  component("category-hero", "Kategori Hero", "Katalog", "template", ["instance", "template"], ["content", "media", "layout", "responsive"], ["categoryRelations"]),
  component("collection-hero", "Koleksiyon Hero", "Katalog", "template", ["instance", "template"], ["content", "media", "layout", "responsive"], ["collectionMembership"]),
  component("pagination", "Sayfalama", "Katalog", "template", templateScopes, ["layout"], ["paginationLogic"]),
  component("empty-state", "Boş Durum", "Katalog", "template", templateScopes, ["content", "media", "layout"], ["resultCount"]),

  component("product-detail-shell", "Ürün Detay", "Ürün Detay", "template", templateScopes, ["layout", "responsive"], ["productData"]),
  component("product-gallery", "Ürün Galerisi", "Ürün Detay", "template", templateScopes, ["layout", "media", "responsive"], ["productMediaFile"]),
  component("product-gallery-media", "Galeri Medyası", "Ürün Detay", "family", ["family", "template"], ["media", "responsive"], ["productMediaFile"]),
  component("product-title-meta", "Ürün Başlık / Meta", "Ürün Detay", "template", templateScopes, ["typography", "layout"], ["productName"]),
  component("price-block", "Fiyat Bloğu", "Ürün Detay", "template", templateScopes, ["typography", "layout"], ["priceValue"]),
  component("status-badges", "Ürün Rozetleri", "Ürün Detay", "template", templateScopes, ["card", "layout"], ["discountValue", "stockState"]),
  component("variant-picker", "Varyant Seçici", "Ürün Detay", "template", templateScopes, ["card", "layout"], ["variantValues"]),
  component("quantity-control", "Adet Kontrolü", "Ürün Detay", "template", templateScopes, ["card", "layout"], ["stockMinMax"]),
  component("add-to-cart", "Sepete Ekle", "Ürün Detay", "template", templateScopes, ["card", "layout", "responsive"], ["cartLogic"]),
  component("buy-now", "Hemen Al", "Ürün Detay", "template", templateScopes, ["card", "layout"], ["checkoutLogic"]),
  component("shipping-info", "Kargo Bilgisi", "Ürün Detay", "template", templateScopes, ["content", "layout"], ["shippingLogic"]),
  component("product-points", "Ürün Puan Bilgisi", "Ürün Detay", "template", templateScopes, ["content", "layout"], ["rewardMath"]),
  component("product-details", "Ürün Detay Accordion", "Ürün Detay", "template", templateScopes, ["layout", "typography"], ["productContent"]),
  component("reviews", "Yorumlar", "Ürün Detay", "template", templateScopes, ["layout", "card"], ["reviewContent"]),
  component("recommendations", "Önerilen Ürünler", "Ürün Detay", "section", ["section", "template"], ["data", "layout", "responsive"], ["recommendationAlgorithm"]),
  component("recently-viewed", "Son Görüntülenenler", "Ürün Detay", "section", sectionScopes, ["layout", "responsive"], ["clientHistory"]),
  component("sticky-mobile-cart", "Mobil Sabit Sepet", "Ürün Detay", "template", templateScopes, ["layout", "responsive"], ["cartLogic"]),
  component("product-sequence-nav", "Ürün Sıra Navigasyonu", "Ürün Detay", "template", templateScopes, ["layout"], ["catalogOrder"]),

  component("cart-drawer", "Sepet Drawer", "Sepet", "global", ["global", "template"], ["layout", "responsive"], ["cartState"]),
  component("cart-line-item", "Sepet Ürünü", "Sepet", "family", familyScopes, ["card", "layout", "typography"], ["cartValues"]),
  component("cart-quantity", "Sepet Adet", "Sepet", "family", familyScopes, ["card", "layout"], ["stockMinMax"]),
  component("cart-remove", "Sepetten Sil", "Sepet", "family", familyScopes, ["layout"], ["cartLogic"]),
  component("cart-shipping-message", "Sepet Kargo Mesajı", "Sepet", "template", templateScopes, ["content", "typography"], ["shippingCalculation"]),
  component("cart-cross-sell", "Sepet Cross-sell", "Sepet", "section", sectionScopes, ["data", "layout"], ["pricingLogic"]),
  component("discount-section", "İndirim Kodu", "Sepet", "template", templateScopes, ["layout"], ["couponValidation"]),
  component("cart-totals", "Sepet Toplamları", "Sepet", "template", templateScopes, ["typography", "layout"], ["calculatedTotals"]),
  component("checkout-cta", "Ödemeye Geç", "Sepet", "template", templateScopes, ["card", "layout"], ["checkoutRoute"]),
  component("checkout-stepper", "Checkout Adımları", "Checkout", "template", templateScopes, ["layout", "responsive"], ["stepOrder", "securityFlow"]),
  component("address-section", "Adres Alanı", "Checkout", "template", templateScopes, ["card", "layout", "responsive"], ["addressDatasource", "validation"]),
  component("form-field", "Form Alanı", "Checkout", "family", familyScopes, ["card", "layout", "typography"], ["required", "type", "autocomplete"]),
  component("city-district-selector", "İl / İlçe", "Checkout", "template", templateScopes, ["layout"], ["basitKargoDatasource", "validation"]),
  component("order-preview-row", "Sipariş Önizleme Satırı", "Checkout", "family", familyScopes, ["card", "layout", "typography"], ["orderValues"]),
  component("payment-summary", "Ödeme Özeti", "Checkout", "template", templateScopes, ["card", "layout", "typography"], ["paymentTotals"]),
  component("payment-surface", "PayTR Ödeme Alanı", "Checkout", "template", templateScopes, ["layout"], ["iframe", "paymentFields", "transactionLogic", "security"]),
  component("checkout-trust", "Checkout Güven Alanı", "Checkout", "section", sectionScopes, ["content", "layout"], ["paymentSecurityClaims"]),

  component("auth-form", "Giriş / Kayıt Formu", "Hesap", "template", templateScopes, ["card", "layout", "typography"], ["authValidation", "tokens"]),
  component("account-nav", "Hesap Navigasyonu", "Hesap", "template", templateScopes, ["layout", "card"], ["authorization"]),
  component("account-profile", "Hesap Profili", "Hesap", "template", templateScopes, ["layout", "card"], ["customerData"]),
  component("address-card", "Adres Kartı", "Hesap", "family", familyScopes, ["card", "layout"], ["customerData"]),
  component("order-card", "Sipariş Kartı", "Hesap", "family", familyScopes, ["card", "layout"], ["orderState"]),
  component("rewards-card", "Puan Kartı", "Hesap", "family", familyScopes, ["card", "layout"], ["rewardMath"]),
  component("search-overlay", "Arama", "Diğer", "template", templateScopes, ["layout", "card"], ["searchAlgorithm"]),
  component("order-tracking", "Sipariş Takip", "Diğer", "template", templateScopes, ["content", "layout", "card"], ["trackingApi"]),
  component("contact-form", "İletişim Formu", "Diğer", "template", templateScopes, ["content", "layout", "card"], ["submissionEndpoint", "antiSpam"]),
  component("legal-document", "Yasal Metin", "Diğer", "template", templateScopes, ["typography", "layout"], ["legalContent"]),
  component("system-state", "Sistem Durumu", "Diğer", "template", templateScopes, ["content", "media", "layout"], ["httpStatus"]),
  component("toast", "Bildirim", "Diğer", "global", globalScopes, ["card", "typography"], ["systemMessage"]),
  component("consent-banner", "Çerez / Onay", "Diğer", "global", globalScopes, ["content", "layout", "card"], ["consentSemantics", "categories"]),
];

export const COMPONENT_REGISTRY_BY_TYPE: Record<string, ComponentDefinition> =
  Object.fromEntries(COMPONENT_REGISTRY.map((item) => [item.semanticType, item]));

const allContentPages: PageCompatibility[] = ["home", "content", "landing"];
const allCommercePages: PageCompatibility[] = ["home", "content", "landing", "product", "category", "collection"];

const section = (
  type: string,
  label: string,
  category: SectionDefinition["category"],
  compatiblePages: PageCompatibility[],
  settings: string[],
  allowedBlocks: string[] = [],
  implemented = false,
  maxBlocks?: number,
): SectionDefinition => ({
  type,
  label,
  category,
  compatiblePages,
  settings,
  allowedBlocks,
  implemented,
  maxBlocks,
  schemaVersion: STORE_DESIGN_SCHEMA_VERSION,
});

export const SECTION_LIBRARY: SectionDefinition[] = [
  section("featured-products", "Öne Çıkan Ürünler", "commerce", allCommercePages, ["source", "limit", "desktopColumns", "mobileColumns", "gap", "cardPreset", "heading", "cta"], [], true),
  section("product-slider", "Ürün Sliderı / Carousel", "commerce", allCommercePages, ["source", "itemsPerView", "arrows", "dots", "autoplay", "gap"], [], true),
  section("product-grid", "Ürün Grid", "commerce", ["content", "landing", "category", "collection"], ["columns", "density", "maxWidth", "pagination"], [], true),
  section("product-spotlight", "Tek Ürün Spotlight", "commerce", allCommercePages, ["productId", "mediaPosition", "infoBlocks", "cta"]),
  section("featured-collection", "Featured Collection", "commerce", allCommercePages, ["collectionId", "layout", "limit", "cta"]),
  section("category-cards", "Kategori Kartları", "commerce", allContentPages, ["source", "ratio", "columns", "titlePlacement"]),
  section("collection-cards", "Koleksiyon Kartları", "commerce", allContentPages, ["source", "ratio", "columns", "titlePlacement"], [], true),
  section("new-arrivals", "Yeni Gelenler", "commerce", allCommercePages, ["limit", "layout"]),
  section("best-sellers", "Çok Satanlar", "commerce", allCommercePages, ["window", "limit", "layout"]),
  section("sale-products", "İndirimdekiler", "commerce", allCommercePages, ["limit", "badgeStyle"]),
  section("recommendations", "Önerilen Ürünler", "commerce", ["product", "cart"], ["algorithm", "limit", "layout"]),
  section("recently-viewed", "Son Görüntülenenler", "commerce", ["product", "cart"], ["limit", "layout", "heading"]),
  section("bundle", "Birlikte Alınanlar / Bundle", "commerce", ["product", "cart"], ["source", "layout", "cta"]),
  section("cross-sell", "Cross-sell / Upsell", "commerce", ["cart", "checkout"], ["source", "position", "density"]),
  section("product-comparison", "Ürün Karşılaştırma", "commerce", ["content", "landing"], ["products", "fields", "layout"]),

  section("hero", "Hero", "media", allContentPages, ["desktopMedia", "mobileMedia", "height", "focalPoint", "overlay", "cta", "contrast"], [], true),
  section("video-hero", "Video Hero", "media", allContentPages, ["video", "poster", "focalPoint", "loop", "muted", "cta"]),
  section("image-banner", "Image Banner", "media", allCommercePages, ["image", "height", "focalPoint", "overlay", "text", "cta"], [], true),
  section("video-banner", "Video Banner", "media", allCommercePages, ["video", "poster", "height", "fit", "text", "cta"]),
  section("image-text-split", "Image + Text Split", "media", allContentPages, ["side", "ratio", "contentWidth", "cta"], ["rich-text"]),
  section("video-text-split", "Video + Text Split", "media", allContentPages, ["side", "poster", "copy", "cta"], ["rich-text"]),
  section("slideshow", "Slideshow", "media", allContentPages, ["transition", "autoplay"], ["slide"], false, 12),
  section("gallery-grid", "Gallery Grid", "media", allContentPages, ["columns", "gap", "ratio", "lightbox"], ["media"], false, 30),
  section("masonry-gallery", "Masonry Gallery", "media", allContentPages, ["columns", "gap"], ["media"], false, 30),
  section("collage", "Collage", "media", allContentPages, ["layout", "focalPoint"], ["media"], false, 6),
  section("before-after", "Before / After", "media", allContentPages, ["before", "after", "divider", "labels"]),
  section("hotspot-lookbook", "Hotspot / Lookbook", "media", allContentPages, ["image"], ["hotspot"], false, 12),
  section("background-media", "Background Media Section", "media", allContentPages, ["media", "overlay", "minHeight"], ["content"]),
  section("logo-cloud", "Logo / Marka Bulutu", "media", allContentPages, ["size", "monochrome"], ["logo"], false, 30),
  section("social-grid", "Social Media Grid", "media", allContentPages, ["source", "layout"], ["media"]),

  section("rich-text", "Rich Text", "content", allContentPages, ["eyebrow", "headingRole", "body", "align", "width", "cta"], [], true),
  section("heading-subtext", "Başlık + Alt Metin", "content", allContentPages, ["role", "size", "maxWidth", "align"]),
  section("text-columns", "Metin Kolonları", "content", allContentPages, ["columns", "gap"], ["text-column"], false, 4),
  section("brand-story", "Brand Story", "content", allContentPages, ["media", "copy", "layout"], [], true),
  section("manifesto", "Manifesto / Statement", "content", allContentPages, ["typography", "maxWidth", "align"]),
  section("quote", "Quote / Pull Quote", "content", allContentPages, ["quote", "attribution", "align"]),
  section("stats", "İstatistik / Sayaç", "content", allContentPages, ["columns", "animation"], ["stat"], false, 8),
  section("timeline", "Timeline", "content", allContentPages, ["orientation"], ["timeline-item"]),
  section("feature-grid", "Icon List / Feature Grid", "content", allContentPages, ["columns"], ["feature"], false, 12),
  section("trust-badges", "Trust Badges", "content", allCommercePages, ["layout", "density"], ["trust-item"], true, 12),
  section("testimonials", "Testimonials", "content", allContentPages, ["layout"], ["testimonial"], false, 20),
  section("review-highlights", "Review Highlights", "content", allCommercePages, ["source", "limit", "ratingDisplay"]),
  section("faq", "FAQ / Accordion", "content", allContentPages, ["initialOpen", "dividers"], ["faq-item"], true, 30),
  section("tabs", "Tabs", "content", allContentPages, ["style", "firstActive"], ["tab"], false, 12),
  section("press-awards", "Press / Awards", "content", allContentPages, ["layout"], ["award"], false, 30),
  section("team", "Team", "content", allContentPages, ["layout"], ["member"], false, 30),

  section("announcement-bar", "Announcement Bar", "marketing", ["home", "content", "landing"], ["text", "links", "rotation", "sticky", "schedule"], ["announcement"], true, 8),
  section("promo-banner", "Promo Banner", "marketing", allContentPages, ["copy", "cta", "media", "schedule"]),
  section("countdown", "Countdown", "marketing", allContentPages, ["targetTime", "completedState", "style"]),
  section("marquee", "Marquee / Ticker", "marketing", allContentPages, ["speed", "pause"], ["ticker-item"], false, 20),
  section("newsletter", "Newsletter", "marketing", allContentPages, ["heading", "body", "fieldLabel", "consent", "successCopy"]),
  section("contact-form", "Contact Form", "marketing", ["content", "landing"], ["fieldVisibility", "labels", "copy", "successState"], [], true),
  section("custom-form", "Custom Form", "marketing", ["content", "landing"], ["schema", "successCopy"], ["field"], false, 20),
  section("map-locator", "Map / Store Locator", "marketing", allContentPages, ["locations", "mapStyle", "cta"]),
  section("rewards-promo", "Puan / Ödül Promo", "marketing", allCommercePages, ["media", "copy", "cta", "layout"]),
  section("shipping-returns-cta", "Shipping / Returns CTA", "marketing", allCommercePages, ["icon", "copy", "link"]),
  section("consent-banner", "Cookie / Consent Banner", "marketing", ["utility"], ["copy", "style", "position"]),
  section("spacer", "Spacer", "marketing", allContentPages, ["desktopHeight", "mobileHeight"]),
  section("divider", "Divider", "marketing", allContentPages, ["width", "thickness", "colorToken"]),
  section("anchor", "Anchor / Jump Link", "marketing", allContentPages, ["anchorId", "labelVisibility"]),
  section("breadcrumb", "Breadcrumb", "marketing", ["content", "product", "category", "collection"], ["visible", "separator", "typography"]),
  section("integration-block", "App / Integration Block", "marketing", allContentPages, ["integrationId", "settings"]),
  section("developer-embed", "Developer Embed", "marketing", ["content", "landing"], ["whitelistedEmbed"]),
  section("grid-stack-builder", "Boş Grid / Stack Builder", "marketing", allContentPages, ["columns", "gap", "alignment", "responsiveStack"], ["content"], false, 24),
];

export const SECTION_LIBRARY_BY_TYPE: Record<string, SectionDefinition> =
  Object.fromEntries(SECTION_LIBRARY.map((item) => [item.type, item]));

export type PageStatus = "draft" | "published" | "scheduled" | "archived";
export type PageKind = "system" | "merchant" | "managed-static" | "catalog" | "protected" | "utility";

export type SeoDocument = {
  title: string;
  description: string;
  openGraphTitle?: string;
  openGraphDescription?: string;
  openGraphAssetId?: string;
  canonical?: string;
  robots: "index,follow" | "noindex,follow" | "noindex,nofollow";
};

export type PageRecord = {
  id: string;
  name: string;
  slug: string;
  route: string;
  kind: PageKind;
  templateId: string;
  status: PageStatus;
  seoId: string;
  reserved: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type RedirectRecord = {
  id: string;
  from: string;
  to: string;
  status: 301 | 302;
  createdAt: string;
};

export type TemplateRecord = {
  id: string;
  label: string;
  compatibility: PageCompatibility[];
  sectionIds: string[];
  schemaVersion: number;
};

export type SectionInstance = {
  id: string;
  type: string;
  schemaVersion: number;
  enabled: boolean;
  settings: Record<string, unknown>;
  blockIds: string[];
};

export type BlockDefinition = {
  type: string;
  label: string;
  settings: string[];
  schemaVersion: number;
};

export type BlockInstance = {
  id: string;
  type: string;
  schemaVersion: number;
  settings: Record<string, unknown>;
};

export type ComponentFamilyStyle = {
  type: string;
  desktop: Record<string, unknown>;
  mobile: Record<string, unknown>;
};

export type MediaAsset = {
  assetId: string;
  type: "image" | "video";
  url: string;
  version: number;
  width?: number;
  height?: number;
  duration?: number;
  bytes?: number;
  mime?: string;
  checksum?: string;
  focalPoint?: { x: number; y: number };
  posterAssetId?: string;
  mobileAssetId?: string;
  usageCount: number;
  createdAt: string;
};

export type ThemeDocument = {
  schemaVersion: typeof STORE_DESIGN_SCHEMA_VERSION;
  revision: number;
  globals: {
    tokens: Record<string, unknown>;
    header: Record<string, unknown>;
    footer: Record<string, unknown>;
    componentFamilies: Record<string, ComponentFamilyStyle>;
  };
  pages: Record<string, PageRecord>;
  seo: Record<string, SeoDocument>;
  templates: Record<string, TemplateRecord>;
  sections: Record<string, SectionInstance>;
  blocks: Record<string, BlockInstance>;
  media: Record<string, MediaAsset>;
  redirects: RedirectRecord[];
  publishedAt: string | null;
};

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown, fallback = "", max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : fallback;
}

function integerValue(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : fallback;
}

export function createEmptyThemeDocument(): ThemeDocument {
  return {
    schemaVersion: STORE_DESIGN_SCHEMA_VERSION,
    revision: 0,
    globals: { tokens: {}, header: {}, footer: {}, componentFamilies: {} },
    pages: {},
    seo: {},
    templates: {},
    sections: {},
    blocks: {},
    media: {},
    redirects: [],
    publishedAt: null,
  };
}

export function normalizeThemeDocument(input: unknown): ThemeDocument {
  const raw = objectRecord(input);
  const base = createEmptyThemeDocument();
  const globals = objectRecord(raw.globals);
  return {
    schemaVersion: STORE_DESIGN_SCHEMA_VERSION,
    revision: integerValue(raw.revision, 0),
    globals: {
      tokens: objectRecord(globals.tokens),
      header: objectRecord(globals.header),
      footer: objectRecord(globals.footer),
      componentFamilies: objectRecord(globals.componentFamilies) as Record<string, ComponentFamilyStyle>,
    },
    pages: objectRecord(raw.pages) as Record<string, PageRecord>,
    seo: objectRecord(raw.seo) as Record<string, SeoDocument>,
    templates: objectRecord(raw.templates) as Record<string, TemplateRecord>,
    sections: objectRecord(raw.sections) as Record<string, SectionInstance>,
    blocks: objectRecord(raw.blocks) as Record<string, BlockInstance>,
    media: objectRecord(raw.media) as Record<string, MediaAsset>,
    redirects: Array.isArray(raw.redirects) ? raw.redirects.slice(0, 500) as RedirectRecord[] : [],
    publishedAt: raw.publishedAt == null ? null : stringValue(raw.publishedAt, "", 80) || null,
  };
}

export type EditorTargetRegistration = {
  id: string;
  type: string;
  label: string;
  parentId?: string;
  instanceKey?: string;
};

export const EDITOR_DATA_ATTRIBUTES = {
  id: "data-editor-id",
  type: "data-editor-type",
  label: "data-editor-label",
  parentId: "data-editor-parent",
  instanceKey: "data-editor-instance",
} as const;

export const STORE_DESIGN_MESSAGES = {
  READY: "EDITOR_READY",
  SELECT: "EDITOR_SELECT",
  PATCH: "THEME_PATCH",
  PATCH_APPLIED: "PATCH_APPLIED",
  ROUTE_NAVIGATE: "ROUTE_NAVIGATE",
  STRUCTURE_PATCH: "STRUCTURE_PATCH",
  MEDIA_ASSET_READY: "MEDIA_ASSET_READY",
  HEARTBEAT: "HEARTBEAT",
} as const;

export function componentDefinition(type: string) {
  return COMPONENT_REGISTRY_BY_TYPE[type] || null;
}

export function sectionDefinitionsFor(page: PageCompatibility) {
  return SECTION_LIBRARY.filter((definition) => definition.compatiblePages.includes(page));
}

export function semanticEditorAttributes(target: EditorTargetRegistration) {
  return {
    [EDITOR_DATA_ATTRIBUTES.id]: target.id,
    [EDITOR_DATA_ATTRIBUTES.type]: target.type,
    [EDITOR_DATA_ATTRIBUTES.label]: target.label,
    ...(target.parentId ? { [EDITOR_DATA_ATTRIBUTES.parentId]: target.parentId } : {}),
    ...(target.instanceKey ? { [EDITOR_DATA_ATTRIBUTES.instanceKey]: target.instanceKey } : {}),
  };
}
