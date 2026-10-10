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
  | "form"
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
  pendingReason?: string;
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
  component("global-theme-tokens", "Genel Tema Değerleri", "Global", "global", globalScopes, ["typography", "layout", "responsive"], ["rawCss", "fontUrl", "arbitraryHex"]),
  component("announcement-bar", "Duyuru Çubuğu", "Global", "global", globalScopes, ["content", "layout", "responsive"], ["checkoutState"]),
  component("header-shell", "Üst Bilgi", "Global", "global", globalScopes, ["layout", "responsive"], ["freePosition", "paymentUi"]),
  component("header-logo", "Logo", "Global", "global", globalScopes, ["media", "layout", "responsive"], ["rawTransform"]),
  component("main-menu", "Ana Menü", "Global", "global", globalScopes, ["content", "layout", "responsive"], ["rawChildResize"]),
  component("mega-menu", "Geniş Menü", "Global", "global", globalScopes, ["content", "layout", "media", "responsive"], ["rawCss"]),
  component("menu-media-card", "Menü Medya Kartı", "Global", "instance", ["instance", "global"], ["content", "media", "card", "responsive"], ["arbitrarySize"]),
  component("menu-link", "Menü Bağlantısı", "Global", "instance", ["instance", "global"], ["content", "layout", "responsive"], []),
  component("footer-link", "Alt Bilgi Bağlantısı", "Global", "instance", ["instance", "global"], ["content", "layout", "responsive"], []),
  component("footer-logo", "Alt Bilgi Logosu", "Global", "instance", ["instance", "global"], ["content", "media", "layout", "responsive"], ["rawTransform"]),
  component("footer-text", "Alt Bilgi Metni", "Global", "instance", ["instance", "global"], ["content", "typography", "layout", "responsive"], []),
  component("text", "Metin", "İçerik", "instance", instanceScopes, ["content", "typography", "layout", "responsive"], []),
  component("link", "Bağlantı", "İçerik", "instance", instanceScopes, ["content", "typography", "layout", "responsive"], []),
  component("button", "Düğme", "İçerik", "instance", instanceScopes, ["content", "card", "layout", "responsive"], []),
  component("image", "Görsel", "İçerik", "instance", instanceScopes, ["media", "layout", "responsive"], []),
  component("video", "Video", "İçerik", "instance", instanceScopes, ["media", "layout", "responsive"], ["autoplayPolicy"]),
  component("search-trigger", "Arama Düğmesi", "Global", "global", globalScopes, ["layout"], ["searchLogic"]),
  component("account-trigger", "Hesap Düğmesi", "Global", "global", globalScopes, ["layout"], ["authLogic"]),
  component("cart-trigger", "Sepet Düğmesi", "Global", "global", globalScopes, ["layout"], ["cartState"]),
  component("footer-shell", "Alt Bilgi", "Global", "global", globalScopes, ["content", "layout", "responsive"], ["requiredLegalLinks"]),
  component("footer-group", "Alt Bilgi Bağlantı Grubu", "Global", "global", globalScopes, ["content", "layout"], ["requiredLegalLinks"]),
  component("social-links", "Sosyal Bağlantılar", "Global", "global", globalScopes, ["content", "layout"], []),
  component("whatsapp-trigger", "WhatsApp Düğmesi", "Global", "global", globalScopes, ["content", "layout"], ["supportLogic"]),
  component("rewards-trigger", "Puan / Ödül Düğmesi", "Global", "global", globalScopes, ["content", "layout"], ["rewardMath"]),
  component("rewards-panel", "Puan / Ödül Paneli", "Global", "global", globalScopes, ["content", "media", "layout"], ["rewardMath"]),

  component("hero-section", "Ana Görsel", "Ana Sayfa", "section", sectionScopes, ["content", "media", "layout", "responsive"], ["freeTransform"]),
  component("hero-media", "Ana Görsel Medyası", "Ana Sayfa", "instance", instanceScopes, ["media", "responsive"], ["freeFrame"]),
  component("hero-wordmark", "Ana Görsel Logosu", "Ana Sayfa", "section", sectionScopes, ["layout", "typography", "responsive"], ["rawTransform"]),
  component("scroll-story", "Kaydırmalı Hikâye", "Ana Sayfa", "section", sectionScopes, ["content", "media", "layout", "animation", "responsive"], ["rawJs"]),
  component("scroll-story-media", "Kaydırmalı Hikâye Medyası", "Ana Sayfa", "instance", instanceScopes, ["media", "responsive"], ["freeFrame"]),
  component("scroll-story-slide", "Kaydırmalı Hikâye Öğesi", "Ana Sayfa", "instance", instanceScopes, ["content", "media", "responsive"], ["freeFrame", "rawAnimation"]),
  component("editorial-text", "Editoryal Metin", "Ana Sayfa", "section", ["instance", "section"], ["content", "typography", "animation", "responsive"], ["rawEasing"]),
  component("collections-section", "Koleksiyonlar", "Ana Sayfa", "section", sectionScopes, ["data", "layout", "responsive"], ["catalogMembership"]),
  component("collection-card", "Koleksiyon Kartı", "Ana Sayfa", "family", familyScopes, ["card", "typography", "responsive"], ["catalogMembership", "individualWidth"]),
  component("featured-products", "Öne Çıkan Ürünler", "Ana Sayfa", "section", sectionScopes, ["data", "layout", "responsive"], ["productPrice"]),
  component("product-slider", "Ürün Kaydırıcısı", "Ana Sayfa", "section", sectionScopes, ["data", "layout", "animation", "responsive"], ["productPrice"]),
  component("product-grid", "Ürün Izgarası", "Katalog", "section", ["section", "template"], ["layout", "responsive"], ["individualCardWidth", "catalogData"]),
  component("product-spotlight", "Ürün Vitrini", "Katalog", "section", sectionScopes, ["data", "content", "layout", "responsive"], ["productData", "priceValue", "stockLogic"]),
  component("featured-collection", "Öne Çıkan Koleksiyon", "Katalog", "section", sectionScopes, ["data", "content", "layout", "responsive"], ["catalogMembership", "productData"]),
  component("category-cards", "Kategori Kartları", "Katalog", "section", sectionScopes, ["data", "layout", "responsive"], ["catalogMembership"]),
  component("product-comparison", "Ürün Karşılaştırma", "Katalog", "section", sectionScopes, ["data", "content", "layout", "responsive"], ["productData", "priceValue", "stockLogic"]),
  component("new-arrivals", "Yeni Gelenler", "Katalog", "section", sectionScopes, ["data", "layout", "responsive"], ["sourceRule", "productData"]),
  component("best-sellers", "Çok Satanlar", "Katalog", "section", sectionScopes, ["data", "layout", "responsive"], ["orderAnalytics", "productData"]),
  component("bundle", "Ürün Paketi", "Katalog", "section", sectionScopes, ["data", "content", "layout", "responsive"], ["bundleItems", "bundlePrice", "priceValue", "cartLogic", "catalogMutation"]),
  component("sale-products", "İndirimdekiler", "Katalog", "section", sectionScopes, ["data", "layout", "card", "responsive"], ["discountLogic", "productData"]),
  component("product-card", "Ürün Kartı", "Katalog", "family", ["family", "section", "template"], ["card", "typography", "layout", "responsive"], ["productData", "individualMediaScale", "individualWidth"]),
  component("product-card-media", "Ürün Kartı Görseli", "Katalog", "family", familyScopes, ["media", "card", "responsive"], ["productMediaFile"]),
  component("product-card-title", "Ürün Kartı Başlığı", "Katalog", "family", familyScopes, ["typography", "layout"], ["productName"]),
  component("product-card-price", "Ürün Kartı Fiyatı", "Katalog", "family", familyScopes, ["typography", "layout"], ["priceValue"]),
  component("product-card-badge", "Ürün Kartı Rozeti", "Katalog", "family", familyScopes, ["card", "typography"], ["discountValue"]),
  component("product-card-quick-add", "Hızlı Sepete Ekle", "Katalog", "family", familyScopes, ["layout", "card"], ["cartLogic"]),
  component("brand-story", "Marka Hikayesi", "İçerik", "section", sectionScopes, ["content", "media", "layout", "typography", "responsive"], ["rawHtml", "rawCss"]),
  component("trust-section", "Güven / Kargo", "İçerik", "section", sectionScopes, ["content", "layout", "responsive"], ["unverifiedPromises"]),
  component("rich-text", "Metin Alanı", "İçerik", "instance", instanceScopes, ["content", "typography", "layout", "responsive"], ["rawJs"]),
  component("image-banner", "Görsel Afiş", "İçerik", "section", sectionScopes, ["content", "media", "layout", "responsive"], ["freeTransform"]),
  component("video-hero", "Video Ana Görsel", "İçerik", "section", sectionScopes, ["content", "media", "layout", "responsive"], ["autoplayPolicy", "freeTransform"]),
  component("video-banner", "Video Afiş", "İçerik", "section", sectionScopes, ["content", "media", "layout", "responsive"], ["autoplayPolicy", "freeTransform"]),
  component("background-media", "Arka Plan Medyası", "İçerik", "section", sectionScopes, ["content", "media", "layout", "responsive"], ["freeTransform"]),
  component("content", "İçerik Alanı", "İçerik", "instance", instanceScopes, ["content", "typography", "layout"], ["rawHtml", "rawJs"]),
  component("gallery", "Galeri", "İçerik", "section", sectionScopes, ["media", "layout", "responsive"], ["freeCanvas"]),
  component("slideshow", "Görsel Slayt", "İçerik", "section", sectionScopes, ["content", "media", "layout", "animation", "responsive"], ["rawJs"]),
  component("faq-accordion", "Sık Sorulan Sorular", "İçerik", "family", familyScopes, ["content", "layout", "animation"], ["endpoint"]),
  component("faq-item", "Sık Sorulan Soru", "İçerik", "instance", ["instance", "section"], ["content", "layout"], []),
  component("tabs", "Sekmeler", "İçerik", "family", familyScopes, ["content", "layout", "responsive"], []),
  component("text-columns", "Metin Sütunları", "İçerik", "section", sectionScopes, ["content", "layout", "responsive"], []),
  component("text-column", "Metin Sütunu", "İçerik", "family", familyScopes, ["content", "typography", "layout"], []),
  component("stats", "İstatistikler", "İçerik", "section", sectionScopes, ["content", "layout", "responsive"], []),
  component("stat", "İstatistik Öğesi", "İçerik", "family", familyScopes, ["content", "typography"], []),
  component("timeline", "Zaman Çizelgesi", "İçerik", "section", sectionScopes, ["content", "layout", "responsive"], []),
  component("timeline-item", "Zaman Çizelgesi Öğesi", "İçerik", "family", familyScopes, ["content", "typography"], []),
  component("feature-grid", "Özellik Izgarası", "İçerik", "section", sectionScopes, ["content", "layout", "responsive"], []),
  component("feature", "Özellik Öğesi", "İçerik", "family", familyScopes, ["content", "card", "typography"], []),
  component("trust-badges", "Güven Bilgileri", "İçerik", "section", sectionScopes, ["content", "layout", "responsive"], ["unverifiedPromises"]),
  component("trust-item", "Güven Öğesi", "İçerik", "family", familyScopes, ["content", "card", "typography"], ["unverifiedPromises"]),
  component("testimonials", "Müşteri Yorumları", "İçerik", "section", sectionScopes, ["content", "layout", "responsive"], []),
  component("review-highlights", "Öne Çıkan Yorumlar", "İçerik", "section", sectionScopes, ["data", "content", "layout", "responsive"], ["reviewContent", "reviewModeration"]),
  component("testimonial", "Müşteri Yorumu", "İçerik", "family", familyScopes, ["content", "card", "typography"], []),
  component("gallery-grid", "Galeri Izgarası", "İçerik", "section", sectionScopes, ["media", "layout", "responsive"], ["freeCanvas"]),
  component("masonry-gallery", "Serbest Galeri", "İçerik", "section", sectionScopes, ["media", "layout", "responsive"], ["freeCanvas"]),
  component("collage", "Kolaj", "İçerik", "section", sectionScopes, ["media", "layout", "responsive"], ["freeCanvas"]),
  component("image-text-split", "Görsel ve Metin", "İçerik", "section", sectionScopes, ["content", "media", "layout", "responsive"], ["freeTransform"]),
  component("video-text-split", "Video ve Metin", "İçerik", "section", sectionScopes, ["content", "media", "layout", "responsive"], ["rawVideoPolicy"]),
  component("social-grid", "Sosyal Medya Izgarası", "İçerik", "section", sectionScopes, ["media", "layout", "responsive"], ["integrationCredentials"]),
  component("before-after", "Öncesi ve Sonrası", "İçerik", "section", sectionScopes, ["media", "layout", "responsive"], []),
  component("hotspot-lookbook", "Etkileşimli Görsel", "İçerik", "section", sectionScopes, ["media", "layout", "responsive"], ["catalogData"]),
  component("hotspot", "Etkileşim Noktası", "İçerik", "instance", instanceScopes, ["content", "layout"], ["catalogData"]),
  component("media", "Medya Öğesi", "İçerik", "family", familyScopes, ["media", "card", "responsive"], ["mediaFile"]),
  component("logo-cloud", "Logo Listesi", "İçerik", "section", sectionScopes, ["media", "layout", "responsive"], []),
  component("logo", "Logo Öğesi", "İçerik", "family", familyScopes, ["media", "layout"], ["mediaFile"]),
  component("press-awards", "Basın / Ödüller", "İçerik", "section", sectionScopes, ["media", "content", "layout"], []),
  component("award", "Basın / Ödül Öğesi", "İçerik", "family", familyScopes, ["media", "content", "card"], ["mediaFile"]),
  component("team", "Ekip", "İçerik", "section", sectionScopes, ["media", "content", "layout"], []),
  component("member", "Ekip Üyesi", "İçerik", "family", familyScopes, ["media", "content", "card"], ["mediaFile"]),
  component("slide", "Slayt", "İçerik", "family", familyScopes, ["media", "content", "layout"], ["mediaFile"]),
  component("announcement-section", "Duyuru Bölümü", "İçerik", "section", sectionScopes, ["content", "layout"], []),
  component("announcement", "Duyuru", "İçerik", "family", familyScopes, ["content", "typography"], []),
  component("marquee", "Kayan Yazı", "İçerik", "section", sectionScopes, ["content", "layout", "animation"], []),
  component("ticker-item", "Kayan Yazı Öğesi", "İçerik", "family", familyScopes, ["content", "typography"], []),
  component("heading-subtext", "Başlık + Alt Metin", "İçerik", "section", sectionScopes, ["content", "typography", "layout", "responsive"], []),
  component("manifesto", "Marka Bildirisi", "İçerik", "section", sectionScopes, ["content", "typography", "layout", "responsive"], []),
  component("quote", "Alıntı", "İçerik", "section", sectionScopes, ["content", "typography", "layout"], []),
  component("promo-banner", "Kampanya Afişi", "Marketing", "section", sectionScopes, ["content", "media", "layout", "responsive"], []),
  component("countdown", "Geri Sayım", "Marketing", "section", sectionScopes, ["content", "layout", "responsive"], ["serverTimeSource"]),
  component("shipping-returns-cta", "Kargo ve İade Bilgisi", "Marketing", "section", sectionScopes, ["content", "layout"], ["shippingLogic"]),
  component("newsletter", "E-posta Bülteni", "Marketing", "section", sectionScopes, ["content", "layout", "responsive"], ["subscriptionAction", "subscriberState", "consentRecord"]),
  component("custom-form", "Özel Form", "Marketing", "section", sectionScopes, ["content", "layout", "card", "responsive"], ["submissionAction", "antiSpam", "schemaValidation"]),
  component("map-locator", "Konumlar", "Marketing", "section", sectionScopes, ["content", "layout", "responsive"], ["geolocation", "providerScript", "rawEmbed"]),
  component("location", "Mağaza / Konum", "Marketing", "instance", instanceScopes, ["content", "layout"], ["geolocation", "providerEmbed", "rawHtml"]),
  component("integration-block", "Uygulama Entegrasyonu", "Marketing", "section", sectionScopes, ["content", "layout", "responsive"], ["integrationCredentials", "integrationRuntime", "rawEmbed", "rawHtml", "rawJs"]),
  component("developer-embed", "Geliştirici İçeriği", "Marketing", "section", sectionScopes, ["layout", "responsive"], ["rawHtml", "rawJs", "arbitraryUrl", "sandboxFlags"]),
  component("contact-form", "İletişim Formu", "Marketing", "section", sectionScopes, ["content", "layout", "form"], ["submissionEndpoint", "antiSpam", "requiredFields"]),
  component("rewards-promo", "Avantaj Tanıtımı", "Marketing", "section", sectionScopes, ["content", "media", "layout", "responsive"], ["rewardMath", "rewardSettings"]),
  component("spacer", "Boşluk", "İçerik", "section", sectionScopes, ["layout", "responsive"], ["arbitraryHeight"]),
  component("divider", "Ayırıcı", "İçerik", "section", sectionScopes, ["layout", "responsive"], []),
  component("anchor", "Sayfa Bağlantı Noktası", "İçerik", "section", sectionScopes, ["content", "advanced"], ["rawHtml"]),
  component("grid-stack-builder", "Izgara Düzeni", "İçerik", "section", sectionScopes, ["content", "layout", "responsive"], ["absoluteCanvas", "rawCss"]),

  component("catalog-shell", "Katalog Sayfası", "Katalog", "template", templateScopes, ["layout", "responsive"], ["catalogDataset"]),
  component("page-intro", "Sayfa Başlığı", "Katalog", "template", ["instance", "template"], ["content", "typography", "layout"], ["dynamicResultCount"]),
  component("breadcrumb", "Sayfa Yolu", "Katalog", "template", templateScopes, ["typography", "layout"], ["pathGeneration"]),
  component("filter-controls", "Filtreler", "Katalog", "family", familyScopes, ["layout", "card", "responsive"], ["filterValues", "filterLogic"]),
  component("sort-control", "Sıralama", "Katalog", "family", familyScopes, ["layout", "card"], ["sortAlgorithm"]),
  component("category-hero", "Kategori Ana Görseli", "Katalog", "template", ["instance", "template"], ["content", "media", "layout", "responsive"], ["categoryRelations"]),
  component("collection-hero", "Koleksiyon Ana Görseli", "Katalog", "template", ["instance", "template"], ["content", "media", "layout", "responsive"], ["collectionMembership"]),
  component("pagination", "Sayfalama", "Katalog", "template", templateScopes, ["layout"], ["paginationLogic"]),
  component("empty-state", "Boş Durum", "Katalog", "template", templateScopes, ["content", "media", "layout"], ["resultCount"]),

  component("product-detail-shell", "Ürün Detay", "Ürün Detay", "template", templateScopes, ["layout", "responsive"], ["productData"]),
  component("product-gallery", "Ürün Galerisi", "Ürün Detay", "template", templateScopes, ["layout", "media", "responsive"], ["productMediaFile"]),
  component("product-gallery-media", "Galeri Medyası", "Ürün Detay", "family", ["family", "template"], ["media", "responsive"], ["productMediaFile"]),
  component("product-title-meta", "Ürün Başlığı ve Bilgileri", "Ürün Detay", "template", templateScopes, ["typography", "layout"], ["productName"]),
  component("price-block", "Fiyat Bloğu", "Ürün Detay", "template", templateScopes, ["typography", "layout"], ["priceValue"]),
  component("status-badges", "Ürün Rozetleri", "Ürün Detay", "template", templateScopes, ["card", "layout"], ["discountValue", "stockState"]),
  component("variant-picker", "Varyant Seçici", "Ürün Detay", "template", templateScopes, ["card", "layout"], ["variantValues"]),
  component("quantity-control", "Adet Kontrolü", "Ürün Detay", "template", templateScopes, ["card", "layout"], ["stockMinMax"]),
  component("add-to-cart", "Sepete Ekle", "Ürün Detay", "template", templateScopes, ["card", "layout", "responsive"], ["cartLogic"]),
  component("buy-now", "Hemen Al", "Ürün Detay", "template", templateScopes, ["card", "layout"], ["checkoutLogic"]),
  component("shipping-info", "Kargo Bilgisi", "Ürün Detay", "template", templateScopes, ["content", "layout"], ["shippingLogic"]),
  component("product-points", "Ürün Puan Bilgisi", "Ürün Detay", "template", templateScopes, ["content", "layout"], ["rewardMath"]),
  component("product-details", "Ürün Detayları", "Ürün Detay", "template", templateScopes, ["layout", "typography"], ["productContent"]),
  component("reviews", "Yorumlar", "Ürün Detay", "template", templateScopes, ["layout", "card"], ["reviewContent"]),
  component("recommendations", "Önerilen Ürünler", "Ürün Detay", "section", ["section", "template"], ["data", "layout", "responsive"], ["recommendationAlgorithm"]),
  component("recently-viewed", "Son Görüntülenenler", "Ürün Detay", "section", sectionScopes, ["layout", "responsive"], ["clientHistory"]),
  component("sticky-mobile-cart", "Mobil Sabit Sepet", "Ürün Detay", "template", templateScopes, ["layout", "responsive"], ["cartLogic"]),
  component("product-sequence-nav", "Ürün Sıra Geçişi", "Ürün Detay", "template", templateScopes, ["layout"], ["catalogOrder"]),

  component("cart-drawer", "Sepet Paneli", "Sepet", "global", ["global", "template"], ["layout", "responsive"], ["cartState"]),
  component("cart-line-item", "Sepet Ürünü", "Sepet", "family", familyScopes, ["card", "layout", "typography"], ["cartValues"]),
  component("cart-quantity", "Sepet Adet", "Sepet", "family", familyScopes, ["card", "layout"], ["stockMinMax"]),
  component("cart-remove", "Sepetten Sil", "Sepet", "family", familyScopes, ["layout"], ["cartLogic"]),
  component("cart-shipping-message", "Sepet Kargo Mesajı", "Sepet", "template", templateScopes, ["content", "typography"], ["shippingCalculation"]),
  component("cart-cross-sell", "Sepet Tamamlayıcı Ürünleri", "Sepet", "section", sectionScopes, ["data", "layout"], ["pricingLogic", "recommendationData", "recommendationAlgorithm", "productData", "priceValue", "cartState", "cartLogic"]),
  component("cross-sell", "Tamamlayıcı Ürünler", "Sepet", "section", sectionScopes, ["data", "layout", "responsive"], ["recommendationData", "recommendationAlgorithm", "productData", "priceValue", "cartState", "cartLogic"]),
  component("discount-section", "İndirim Kodu", "Sepet", "template", templateScopes, ["layout"], ["couponValidation"]),
  component("cart-totals", "Sepet Toplamları", "Sepet", "template", templateScopes, ["typography", "layout"], ["calculatedTotals"]),
  component("checkout-cta", "Ödemeye Geç", "Sepet", "template", templateScopes, ["card", "layout"], ["checkoutRoute"]),
  component("checkout-stepper", "Ödeme Adımları", "Checkout", "template", templateScopes, ["layout", "responsive"], ["stepOrder", "securityFlow"]),
  component("address-section", "Adres Alanı", "Checkout", "template", templateScopes, ["card", "layout", "responsive"], ["addressDatasource", "validation"]),
  component("form-field", "Form Alanı", "Checkout", "family", familyScopes, ["card", "layout", "typography"], ["required", "type", "autocomplete"]),
  component("city-district-selector", "İl / İlçe", "Checkout", "template", templateScopes, ["layout"], ["basitKargoDatasource", "validation"]),
  component("order-preview-row", "Sipariş Önizleme Satırı", "Checkout", "family", familyScopes, ["card", "layout", "typography"], ["orderValues"]),
  component("payment-summary", "Ödeme Özeti", "Checkout", "template", templateScopes, ["card", "layout", "typography"], ["paymentTotals"]),
  component("payment-surface", "PayTR Ödeme Alanı", "Checkout", "template", templateScopes, ["layout"], ["iframe", "paymentFields", "transactionLogic", "security"]),
  component("checkout-trust", "Ödeme Güven Alanı", "Checkout", "section", sectionScopes, ["content", "layout"], ["paymentSecurityClaims"]),

  component("auth-form", "Giriş / Kayıt Formu", "Hesap", "template", templateScopes, ["card", "layout", "typography"], ["authValidation", "tokens"]),
  component("account-nav", "Hesap Menüsü", "Hesap", "template", templateScopes, ["layout", "card"], ["authorization"]),
  component("account-profile", "Hesap Profili", "Hesap", "template", templateScopes, ["layout", "card"], ["customerData"]),
  component("address-card", "Adres Kartı", "Hesap", "family", familyScopes, ["card", "layout"], ["customerData"]),
  component("order-card", "Sipariş Kartı", "Hesap", "family", familyScopes, ["card", "layout"], ["orderState"]),
  component("discount-card", "İndirim Kartı", "Hesap", "family", familyScopes, ["card", "layout", "typography"], ["discountValue", "eligibility"]),
  component("rewards-card", "Puan Kartı", "Hesap", "family", familyScopes, ["card", "layout"], ["rewardMath"]),
  component("search-overlay", "Arama", "Diğer", "template", templateScopes, ["layout", "card"], ["searchAlgorithm"]),
  component("order-tracking", "Sipariş Takip", "Diğer", "template", templateScopes, ["content", "layout", "card"], ["trackingApi"]),
  component("legal-document", "Yasal Metin", "Diğer", "template", templateScopes, ["typography", "layout"], ["legalContent"]),
  component("system-state", "Sistem Durumu", "Diğer", "template", templateScopes, ["content", "media", "layout"], ["httpStatus"]),
  component("toast", "Bildirim", "Diğer", "global", globalScopes, ["card", "typography"], ["systemMessage"]),
  component("consent-banner", "Çerez / Onay", "Diğer", "global", globalScopes, ["content", "layout", "card", "responsive"], ["consentSemantics", "categories", "consentState", "privacyUrl"]),
];

export const COMPONENT_REGISTRY_BY_TYPE: Record<string, ComponentDefinition> =
  Object.fromEntries(COMPONENT_REGISTRY.map((item) => [item.semanticType, item]));

export const GLOBAL_PROTECTED_COMPONENT_TYPES = new Set(["consent-banner"] as const);

export type StoreDesignIntegrationBlockDefinition = {
  id: string;
  label: string;
  settingKeys: readonly string[];
  renderer: string;
  credentialMode: "none";
};

export const STORE_DESIGN_INTEGRATION_BLOCK_REGISTRY: readonly StoreDesignIntegrationBlockDefinition[] = [];
export const STORE_DESIGN_INTEGRATION_BLOCK_REGISTRY_BY_ID: Readonly<Record<string, StoreDesignIntegrationBlockDefinition>> =
  Object.freeze(Object.fromEntries(STORE_DESIGN_INTEGRATION_BLOCK_REGISTRY.map((item) => [item.id, item])));

export const STORE_DESIGN_DEVELOPER_EMBED_POLICY = Object.freeze({
  merchantModeEnabled: false,
  rawJsEnabled: false,
  allowedHosts: [] as readonly string[],
  sandboxFlags: ["allow-forms", "allow-popups", "allow-popups-to-escape-sandbox"] as readonly string[],
});

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
  pendingReason?: string,
): SectionDefinition => ({
  type,
  label,
  category,
  compatiblePages,
  settings,
  allowedBlocks,
  implemented,
  maxBlocks,
  pendingReason,
  schemaVersion: STORE_DESIGN_SCHEMA_VERSION,
});

export const SECTION_LIBRARY: SectionDefinition[] = [
  // These original homepage sections are still rendered by HomeSectionRenderer.
  section("collections", "Koleksiyonlar", "commerce", allContentPages, ["title", "eyebrow", "linkLabel", "linkHref"], [], true),
  section("trust", "Güven Bilgileri", "content", allContentPages, ["title", "body"], [], true),
  section("featured-products", "Öne Çıkan Ürünler", "commerce", allCommercePages, ["title", "eyebrow", "productSource", "productLimit", "desktopItems", "mobileItems", "gap", "paddingY", "showArrows", "linkLabel", "linkHref"], [], true),
  section("product-slider", "Ürün Kaydırıcısı", "commerce", allCommercePages, ["title", "eyebrow", "productSource", "productLimit", "desktopItems", "mobileItems", "gap", "paddingY", "showArrows", "linkLabel", "linkHref"], [], true),
  section("product-grid", "Ürün Izgarası", "commerce", ["content", "landing", "category", "collection"], ["title", "eyebrow", "productSource", "productLimit", "desktopItems", "mobileItems", "gap", "maxWidth", "paddingY", "linkLabel", "linkHref"], [], true),
  section("product-spotlight", "Ürün Vitrini", "commerce", allCommercePages, ["productId", "mediaPosition", "infoBlocks", "linkLabel", "paddingY"], [], true),
  section("featured-collection", "Öne Çıkan Koleksiyon", "commerce", allCommercePages, ["collectionId", "layout", "limit", "desktopColumns", "mobileColumns", "gap", "heading", "linkLabel", "paddingY"], [], true),
  section("category-cards", "Kategori Kartları", "commerce", allContentPages, ["title", "eyebrow", "source", "limit", "ratio", "columns", "gap", "titlePlacement", "paddingY"], [], true),
  section("collection-cards", "Koleksiyon Kartları", "commerce", allContentPages, ["title", "eyebrow", "source", "limit", "ratio", "columns", "gap", "titlePlacement", "paddingY"], [], true),
  section("new-arrivals", "Yeni Gelenler", "commerce", allCommercePages, ["title", "eyebrow", "productLimit", "layout", "desktopItems", "mobileItems", "gap", "paddingY", "showArrows", "linkLabel", "linkHref"], [], true),
  section("best-sellers", "Çok Satanlar", "commerce", allCommercePages, ["title", "window", "limit", "layout", "paddingY"], [], true),
  section("sale-products", "İndirimdekiler", "commerce", allCommercePages, ["title", "eyebrow", "productLimit", "layout", "desktopItems", "mobileItems", "gap", "paddingY", "showArrows", "badgeStyle", "linkLabel", "linkHref"], [], true),
  section("recommendations", "Önerilen Ürünler", "commerce", ["product"], ["title", "eyebrow", "algorithm", "limit", "layout", "paddingY"], [], true),
  section("recently-viewed", "Son Görüntülenenler", "commerce", ["product"], ["title", "limit", "layout", "paddingY"], [], true),
  section("bundle", "Ürün Paketi", "commerce", ["product"], ["source", "layout", "cta"], [], true),
  section("cross-sell", "Tamamlayıcı Ürünler", "commerce", ["cart", "checkout"], ["source", "limit", "position", "density"], [], true),
  section("product-comparison", "Ürün Karşılaştırma", "commerce", ["content", "landing"], ["productIds", "fields", "layout", "title", "paddingY"], [], true),

  section("hero", "Ana Görsel", "media", allContentPages, ["imageAssetId", "posterAssetId", "heightPreset", "fit", "playbackPreset", "title", "body", "linkLabel", "linkHref", "align", "overlayOpacity", "contrastMode"], [], true),
  section("scroll-story", "Kaydırmalı Hikâye", "media", allContentPages, ["scrollLengthPreset", "transitionPreset", "cueVisibility"], ["scroll-story-slide"], true, 8),
  section("video-hero", "Video Ana Görsel", "media", allContentPages, ["imageAssetId", "posterAssetId", "heightPreset", "fit", "playbackPreset", "title", "body", "linkLabel", "linkHref", "align", "overlayOpacity", "contrastMode"], [], true),
  section("image-banner", "Görsel Afiş", "media", allCommercePages, ["imageAssetId", "eyebrow", "title", "body", "linkLabel", "linkHref", "desktopHeight", "mobileHeight", "borderRadius", "paddingY"], [], true),
  section("video-banner", "Video Afiş", "media", allCommercePages, ["imageAssetId", "posterAssetId", "heightPreset", "fit", "playbackPreset", "title", "body", "linkLabel", "linkHref", "align", "overlayOpacity", "contrastMode"], [], true),
  section("image-text-split", "Görsel ve Metin", "media", allContentPages, ["imageAssetId", "side", "ratio", "fit", "contentWidth", "contentMode", "linkLabel", "linkHref"], ["rich-text"], true, 1),
  section("video-text-split", "Video ve Metin", "media", allContentPages, ["imageAssetId", "posterAssetId", "side", "ratio", "fit", "contentWidth", "contentMode", "playbackPreset", "linkLabel", "linkHref"], ["rich-text"], true, 1),
  section("slideshow", "Görsel Slayt", "media", allContentPages, ["transition", "autoplay"], ["slide"], true, 12),
  section("gallery-grid", "Galeri Izgarası", "media", allContentPages, ["columns", "gap", "ratio", "lightbox"], ["media"], true, 30),
  section("masonry-gallery", "Serbest Galeri", "media", allContentPages, ["columns", "gap"], ["media"], true, 30),
  section("collage", "Kolaj", "media", allContentPages, ["layout", "focalPoint"], ["media"], true, 6),
  section("before-after", "Öncesi ve Sonrası", "media", allContentPages, ["beforeAssetId", "afterAssetId", "beforeLabel", "afterLabel", "divider"], [], true),
  section("hotspot-lookbook", "Etkileşimli Görsel", "media", allContentPages, ["image"], ["hotspot"], true, 12),
  section("background-media", "Arka Plan Medyası", "media", allContentPages, ["imageAssetId", "posterAssetId", "minHeightPreset", "fit", "playbackPreset", "overlayOpacity", "contrastMode"], ["content"], true, 1),
  section("logo-cloud", "Logo Listesi", "media", allContentPages, ["size", "monochrome"], ["logo"], true, 30),
  section("social-grid", "Sosyal Medya Izgarası", "media", allContentPages, ["source", "layout"], ["media"], true, 20),

  section("rich-text", "Metin Alanı", "content", allContentPages, ["eyebrow", "title", "body", "headingRole", "align", "maxWidth", "linkLabel", "linkHref", "paddingY"], [], true),
  section("heading-subtext", "Başlık + Alt Metin", "content", allContentPages, ["title", "body", "role", "size", "maxWidth", "align"], [], true),
  section("text-columns", "Metin Sütunları", "content", allContentPages, ["columns", "gap"], ["text-column"], true, 4),
  section("brand-story", "Marka Hikâyesi", "content", allContentPages, ["imageAssetId", "title", "eyebrow", "body", "linkLabel", "linkHref", "side", "contentWidth", "playbackPreset", "paddingY"], [], true),
  section("manifesto", "Marka Bildirisi", "content", allContentPages, ["title", "body", "typography", "maxWidth", "align"], [], true),
  section("quote", "Alıntı", "content", allContentPages, ["quote", "attribution", "align"], [], true),
  section("stats", "İstatistikler", "content", allContentPages, ["columns", "animation"], ["stat"], true, 8),
  section("timeline", "Zaman Çizelgesi", "content", allContentPages, ["orientation"], ["timeline-item"], true, 30),
  section("feature-grid", "Özellik Izgarası", "content", allContentPages, ["columns"], ["feature"], true, 12),
  section("trust-badges", "Güven Bilgileri", "content", allCommercePages, ["layout", "density"], ["trust-item"], true, 12),
  section("testimonials", "Müşteri Yorumları", "content", allContentPages, ["layout"], ["testimonial"], true, 20),
  section("review-highlights", "Öne Çıkan Yorumlar", "content", allCommercePages, ["productId", "title", "body", "limit", "ratingDisplay", "paddingY"], [], true),
  section("faq", "Sık Sorulan Sorular", "content", allContentPages, ["initialOpen", "dividers"], ["faq-item"], true, 30),
  section("tabs", "Sekmeler", "content", allContentPages, ["style", "firstActive"], ["tab"], true, 12),
  section("press-awards", "Basın ve Ödüller", "content", allContentPages, ["layout"], ["award"], true, 30),
  section("team", "Ekip", "content", allContentPages, ["layout"], ["member"], true, 30),

  section("announcement-bar", "Duyuru Çubuğu", "marketing", ["home", "content", "landing"], ["text", "links", "rotation", "sticky", "schedule"], ["announcement"], true, 8),
  section("promo-banner", "Kampanya Afişi", "marketing", allContentPages, ["title", "body", "linkLabel", "linkHref", "align", "paddingY"], [], true),
  section("countdown", "Geri Sayım", "marketing", allContentPages, ["targetTime", "completedState", "style"], [], true),
  section("marquee", "Kayan Yazı", "marketing", allContentPages, ["speed", "pause"], ["ticker-item"], true, 20),
  section("newsletter", "E-posta Bülteni", "marketing", allContentPages, ["heading", "body", "fieldLabel", "consent", "buttonLabel", "successCopy", "paddingY"], [], true),
  section("contact-form", "İletişim Formu", "marketing", ["content", "landing"], ["title", "body", "phoneVisible", "nameLabel", "emailLabel", "phoneLabel", "messageLabel", "namePlaceholder", "emailPlaceholder", "phonePlaceholder", "messagePlaceholder", "buttonLabel", "successCopy", "paddingY"], [], true),
  section("custom-form", "Özel Form", "marketing", ["content", "landing"], ["schema", "action", "title", "body", "buttonLabel", "successCopy", "paddingY"], ["field"], true, 20),
  section("map-locator", "Konumlar", "marketing", allContentPages, ["title", "body", "layout", "showMapLinks", "mapLinkLabel", "paddingY"], ["location"], true, 20),
  section("rewards-promo", "Avantaj Tanıtımı", "marketing", allCommercePages, ["imageAssetId", "title", "body", "linkLabel", "linkHref", "layout", "showSignupPoints", "showEarnRate", "paddingY"], [], true),
  section("shipping-returns-cta", "Kargo ve İade Bilgisi", "marketing", allCommercePages, ["icon", "title", "body", "linkLabel", "linkHref", "align", "paddingY"], [], true),
  section("spacer", "Boşluk", "marketing", allContentPages, ["desktopHeight", "mobileHeight"], [], true),
  section("divider", "Ayırıcı", "marketing", allContentPages, ["width", "thickness", "colorToken", "paddingY"], [], true),
  section("anchor", "Sayfa Bağlantı Noktası", "marketing", allContentPages, ["anchorId", "labelVisibility"], [], true),
  section("breadcrumb", "Sayfa Yolu", "marketing", ["content", "product", "category", "collection"], ["visible", "separator", "typography", "paddingY"], [], true),
  section("integration-block", "Uygulama Entegrasyonu", "marketing", allContentPages, ["integrationId", "settings"], [], false, undefined, "Yalnız STORE_DESIGN_INTEGRATION_BLOCK_REGISTRY içindeki credential-free storefront block'lar açılabilir; registry şu anda boş olduğu için güvenlik kilidi aktiftir."),
  section("developer-embed", "Geliştirici İçeriği", "marketing", ["content", "landing"], ["whitelistedEmbed"], [], false, undefined, "Merchant mode raw HTML/JS kapalıdır; yalnız developer mode + explicit host allowlist + sandbox contract ile açılabilir."),
  section("grid-stack-builder", "Izgara Düzeni", "marketing", allContentPages, ["columns", "gap", "alignment", "responsiveStack"], ["content"], true, 24),
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
  robotsPreset?: "index,follow" | "noindex,follow" | "noindex,nofollow";
  structuredDataPolicy?: "inherit" | "page" | "none";
};

export type PageRecord = {
  id: string;
  name: string;
  slug: string;
  route: string;
  kind: PageKind;
  type?: PageKind;
  templateId: string;
  status: PageStatus;
  seoId: string;
  reserved: boolean;
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string | null;
  schemaVersion?: number;
};

const PROTECTED_STORE_DESIGN_ROUTE_PREFIXES = [
  "/checkout",
  "/account",
  "/login",
  "/register",
  "/reset-password",
  "/activate-account",
  "/order-success",
  "/order-fail",
  "/order-failed",
  "/internal",
] as const;

export function normalizeStoreDesignRoute(value: string) {
  const raw = String(value || "/").trim();
  const pathname = raw.split(/[?#]/, 1)[0] || "/";
  const normalized = `/${pathname.replace(/^\/+|\/+$/g, "")}`;
  return normalized === "/" ? "/" : normalized.replace(/\/{2,}/g, "/");
}

export function isProtectedStoreDesignRoute(value: string) {
  const route = normalizeStoreDesignRoute(value);
  return PROTECTED_STORE_DESIGN_ROUTE_PREFIXES.some(
    (prefix) => route === prefix || route.startsWith(`${prefix}/`),
  );
}

export function storeDesignSlug(value: string) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function normalizeStoreDesignAnchorId(value: string) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 96);
}

export function merchantStoreDesignRoute(value: string) {
  const slug = storeDesignSlug(value);
  return slug ? `/pages/${slug}` : "/pages";
}

export function deterministicStoreDesignId(prefix: string, value: string) {
  const normalized = normalizeStoreDesignRoute(value);
  const safe = normalized === "/" ? "home" : normalized.slice(1).replace(/[^a-zA-Z0-9_-]+/g, "-");
  return `${prefix}:${safe || "page"}`;
}

export type RedirectRecord = {
  id: string;
  from: string;
  to: string;
  status: 301 | 302;
  sourcePath?: string;
  targetPath?: string;
  statusCode?: 301 | 302;
  reason?: string;
  pageId?: string;
  active?: boolean;
  createdAt: string;
};

export type TemplateComponentSettings = {
  desktop: Record<string, unknown>;
  mobile: Record<string, unknown>;
};

export type TemplateRecord = {
  id: string;
  label: string;
  description?: string;
  pageType?: PageCompatibility;
  compatibility: PageCompatibility[];
  sectionIds: string[];
  componentSettings?: Record<string, TemplateComponentSettings>;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
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
  parentCompatibility: string[];
  settings: string[];
  nesting: "none" | "children";
  implemented: boolean;
  schemaVersion: number;
};

export type BlockInstance = {
  id: string;
  type: string;
  schemaVersion: number;
  settings: Record<string, unknown>;
};

const block = (
  type: string,
  label: string,
  parentCompatibility: string[],
  settings: string[],
  implemented = false,
  nesting: BlockDefinition["nesting"] = "none",
): BlockDefinition => ({
  type,
  label,
  parentCompatibility,
  settings,
  nesting,
  implemented,
  schemaVersion: STORE_DESIGN_SCHEMA_VERSION,
});

export const BLOCK_LIBRARY: BlockDefinition[] = [
  block("faq-item", "Sık Sorulan Soru", ["faq"], ["question", "answer"], true),
  block("slide", "Slayt", ["slideshow"], ["media", "title", "body", "cta"], true),
  block("scroll-story-slide", "Kaydırmalı Hikâye Öğesi", ["scroll-story"], ["assetId", "title", "body", "href"], true),
  block("media", "Medya", ["gallery-grid", "masonry-gallery", "collage"], ["assetId", "alt", "link"], true),
  block("rich-text", "Metin Alanı", ["image-text-split", "video-text-split"], ["heading", "body", "cta"], true),
  block("hotspot", "Etkileşim Noktası", ["hotspot-lookbook"], ["x", "y", "targetType", "targetId"], true),
  block("logo", "Logo", ["logo-cloud"], ["assetId", "alt", "link"], true),
  block("content", "İçerik", ["background-media", "grid-stack-builder"], ["eyebrow", "heading", "body", "linkLabel", "linkHref", "align", "maxWidth"], true),
  block("text-column", "Metin Sütunu", ["text-columns"], ["heading", "body"], true),
  block("stat", "İstatistik", ["stats"], ["value", "label"], true),
  block("timeline-item", "Zaman Çizelgesi Öğesi", ["timeline"], ["date", "heading", "body"], true),
  block("feature", "Özellik", ["feature-grid"], ["icon", "heading", "body"], true),
  block("trust-item", "Güven Öğesi", ["trust-badges"], ["icon", "heading", "body"], true),
  block("testimonial", "Müşteri Yorumu", ["testimonials"], ["quote", "name", "meta"], true),
  block("tab", "Sekme", ["tabs"], ["label", "body"], true),
  block("award", "Basın / Ödül", ["press-awards"], ["assetId", "label", "link"], true),
  block("member", "Ekip Üyesi", ["team"], ["assetId", "name", "role", "bio"], true),
  block("announcement", "Duyuru", ["announcement-bar"], ["text", "linkLabel", "linkHref"], true),
  block("ticker-item", "Kayan Yazı Öğesi", ["marquee"], ["text", "link"], true),
  block("field", "Form Alanı", ["custom-form"], ["name", "label", "type", "required", "placeholder", "options"], true),
  block("location", "Mağaza / Konum", ["map-locator"], ["name", "address", "city", "phone", "hours"], true),
];

export const BLOCK_LIBRARY_BY_TYPE: Record<string, BlockDefinition> =
  Object.fromEntries(BLOCK_LIBRARY.map((item) => [item.type, item]));

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

export type SectionPresetRecord = {
  id: string;
  label: string;
  sectionType: string;
  settings: Record<string, unknown>;
  blocks: Array<{
    type: string;
    settings: Record<string, unknown>;
  }>;
  createdAt: string;
  updatedAt: string;
  schemaVersion: number;
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
  templateBindings: Record<string, string>;
  sections: Record<string, SectionInstance>;
  blocks: Record<string, BlockInstance>;
  media: Record<string, MediaAsset>;
  presets: Record<string, SectionPresetRecord>;
  redirects: RedirectRecord[];
  publishedAt: string | null;
};

function countExactReference(value: unknown, assetId: string): number {
  if (value === assetId) return 1;
  if (Array.isArray(value)) {
    return value.reduce<number>((sum, item) => sum + countExactReference(item, assetId), 0);
  }
  if (!value || typeof value !== "object") return 0;
  return Object.values(value as Record<string, unknown>)
    .reduce<number>((sum, item) => sum + countExactReference(item, assetId), 0);
}

export function themeMediaUsageCount(document: ThemeDocument, assetId: string) {
  let count = 0;
  count += countExactReference(document.globals, assetId);
  count += countExactReference(document.pages, assetId);
  count += countExactReference(document.seo, assetId);
  count += countExactReference(document.templates, assetId);
  count += countExactReference(document.sections, assetId);
  count += countExactReference(document.blocks, assetId);
  count += countExactReference(document.presets, assetId);

  for (const asset of Object.values(document.media)) {
    if (asset.assetId === assetId) continue;
    if (asset.posterAssetId === assetId) count += 1;
    if (asset.mobileAssetId === assetId) count += 1;
  }
  return count;
}

export function withThemeMediaUsageCounts(document: ThemeDocument) {
  const next = structuredClone(document) as ThemeDocument;
  for (const [assetId, asset] of Object.entries(next.media)) {
    next.media[assetId] = { ...asset, assetId, usageCount: themeMediaUsageCount(next, assetId) };
  }
  return next;
}

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

const PAGE_KINDS = new Set<PageKind>(["system", "merchant", "managed-static", "catalog", "protected", "utility"]);
const PAGE_STATUSES = new Set<PageStatus>(["draft", "published", "scheduled", "archived"]);
const ROBOTS_PRESETS = new Set<SeoDocument["robots"]>(["index,follow", "noindex,follow", "noindex,nofollow"]);

export const RESERVED_PAGE_SLUGS = new Set([
  "api", "_next", "checkout", "account", "login", "register", "search",
  "products", "product", "category", "categories", "collections", "cart",
  "internal", "order-success", "order-fail", "order-failed", "order-tracking",
  "siparis-takip", "reset-password", "activate-account",
]);

export function normalizePageSlug(value: unknown) {
  const raw = stringValue(value, "", 180)
    .replace(/[çÇ]/g, "c")
    .replace(/[ğĞ]/g, "g")
    .replace(/[ıİ]/g, "i")
    .replace(/[öÖ]/g, "o")
    .replace(/[şŞ]/g, "s")
    .replace(/[üÜ]/g, "u")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return raw.slice(0, 120);
}

export function customPageRoute(slug: unknown) {
  const normalized = normalizePageSlug(slug);
  return normalized ? `/pages/${normalized}` : "/pages";
}

export function isReservedPageSlug(slug: unknown) {
  return RESERVED_PAGE_SLUGS.has(normalizePageSlug(slug));
}

function normalizeRoute(value: unknown, fallback = "/") {
  const input = stringValue(value, "", 240).split(/[?#]/)[0];
  if (!input) {
    if (!fallback) return "";
    return normalizeRoute(fallback, "");
  }
  const withSlash = `/${input.replace(/^\/+/, "")}`.replace(/\/{2,}/g, "/");
  return withSlash.length > 1 && withSlash.endsWith("/") ? withSlash.slice(0, -1) : withSlash;
}

function normalizePageRecord(input: unknown, fallbackKey: string): PageRecord | null {
  const raw = objectRecord(input);
  const name = stringValue(raw.name, "", 160);
  const rawKind = raw.kind ?? raw.type;
  const kind = PAGE_KINDS.has(rawKind as PageKind) ? rawKind as PageKind : "merchant";
  const slug = normalizePageSlug(raw.slug || normalizeRoute(raw.route || fallbackKey).split("/").filter(Boolean).at(-1) || name);
  if (!name || !slug) return null;

  const route = kind === "merchant"
    ? customPageRoute(slug)
    : normalizeRoute(raw.route || fallbackKey, customPageRoute(slug));
  const status = PAGE_STATUSES.has(raw.status as PageStatus) ? raw.status as PageStatus : "draft";
  const id = stringValue(raw.id, `page-${slug}`, 160).replace(/[^a-zA-Z0-9_-]/g, "-") || `page-${slug}`;
  const seoId = stringValue(raw.seoId, `seo:${id}`, 180);

  return {
    id,
    name,
    slug,
    route,
    kind,
    type: kind,
    templateId: stringValue(raw.templateId, `page:${id}`, 180),
    status,
    seoId,
    reserved: raw.reserved === true || kind === "system" || kind === "protected" || kind === "catalog",
    createdAt: raw.createdAt == null ? undefined : stringValue(raw.createdAt, "", 80) || undefined,
    updatedAt: raw.updatedAt == null ? undefined : stringValue(raw.updatedAt, "", 80) || undefined,
    publishedAt: raw.publishedAt == null ? null : stringValue(raw.publishedAt, "", 80) || null,
    schemaVersion: integerValue(raw.schemaVersion, STORE_DESIGN_SCHEMA_VERSION),
  };
}

function normalizeSeoDocument(input: unknown): SeoDocument {
  const raw = objectRecord(input);
  const robots = ROBOTS_PRESETS.has((raw.robots ?? raw.robotsPreset) as SeoDocument["robots"])
    ? (raw.robots ?? raw.robotsPreset) as SeoDocument["robots"]
    : "index,follow";
  const canonicalRaw = stringValue(raw.canonical, "", 600);
  const canonical = canonicalRaw && (canonicalRaw.startsWith("/") || /^https:\/\//i.test(canonicalRaw))
    ? canonicalRaw
    : undefined;
  const structuredDataPolicy = raw.structuredDataPolicy === "page" || raw.structuredDataPolicy === "none"
    ? raw.structuredDataPolicy
    : "inherit";

  return {
    title: stringValue(raw.title, "", 180),
    description: stringValue(raw.description, "", 400),
    openGraphTitle: stringValue(raw.openGraphTitle ?? raw.ogTitle, "", 180) || undefined,
    openGraphDescription: stringValue(raw.openGraphDescription ?? raw.ogDescription, "", 400) || undefined,
    openGraphAssetId: stringValue(raw.openGraphAssetId ?? raw.ogAssetId, "", 180) || undefined,
    canonical,
    robots,
    robotsPreset: robots,
    structuredDataPolicy,
  };
}

function normalizeRedirectRecord(input: unknown, index: number): RedirectRecord | null {
  const raw = objectRecord(input);
  const from = normalizeRoute(raw.from ?? raw.sourcePath, "");
  const to = normalizeRoute(raw.to ?? raw.targetPath, "");
  if (!from || !to || from === to) return null;
  const status = Number(raw.status ?? raw.statusCode) === 302 ? 302 : 301;
  return {
    id: stringValue(raw.id, `redirect-${index}`, 180).replace(/[^a-zA-Z0-9_-]/g, "-") || `redirect-${index}`,
    from,
    to,
    status,
    sourcePath: from,
    targetPath: to,
    statusCode: status,
    reason: stringValue(raw.reason, "", 120) || undefined,
    pageId: stringValue(raw.pageId, "", 180) || undefined,
    active: raw.active !== false,
    createdAt: stringValue(raw.createdAt, new Date(0).toISOString(), 80),
  };
}

export function flattenThemeRedirects(input: RedirectRecord[]) {
  const active = input.filter((item) => item.active !== false);
  const disabled = input.filter((item) => item.active === false);
  const direct = new Map(active.map((item) => [item.from, item.to]));
  const flattened: RedirectRecord[] = [];
  const seenFrom = new Set<string>();

  for (const item of active) {
    if (seenFrom.has(item.from)) continue;
    seenFrom.add(item.from);
    let target = item.to;
    const visited = new Set([item.from]);
    let looped = false;

    for (let depth = 0; depth < 64; depth += 1) {
      if (visited.has(target)) {
        looped = true;
        break;
      }
      visited.add(target);
      const next = direct.get(target);
      if (!next) break;
      target = next;
    }

    if (looped || target === item.from) {
      flattened.push({ ...item, sourcePath: item.from, targetPath: item.to, statusCode: item.status, active: true });
      continue;
    }

    flattened.push({
      ...item,
      to: target,
      targetPath: target,
      sourcePath: item.from,
      statusCode: item.status,
      active: true,
    });
  }

  return [...flattened, ...disabled].slice(0, 500);
}

export type ThemeReferenceIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
  ownerId?: string;
  targetId?: string;
  source?: string;
  target?: string;
};

function internalManagedPageRoute(value: unknown) {
  if (typeof value !== "string") return "";
  const route = normalizeStoreDesignRoute(value);
  return route.startsWith("/pages/") ? route : "";
}

export function themeDocumentReferenceReport(document: ThemeDocument): ThemeReferenceIssue[] {
  const issues: ThemeReferenceIssue[] = [];
  const referencedSections = new Set<string>();
  const referencedBlocks = new Set<string>();
  const referencedMedia = new Set<string>();
  const publishedRoutes = new Set(
    Object.values(document.pages)
      .filter((page) => page.status === "published")
      .map((page) => page.route),
  );
  const redirectSources = new Set(
    document.redirects.filter((item) => item.active !== false).map((item) => item.from),
  );

  const push = (issue: ThemeReferenceIssue) => issues.push(issue);

  for (const page of Object.values(document.pages)) {
    if (!document.templates[page.templateId]) {
      push({ severity: "error", code: "PAGE_TEMPLATE_MISSING", ownerId: page.id, targetId: page.templateId, message: `${page.route}: bağlı template bulunamadı (${page.templateId}).` });
    }
    if (!document.seo[page.seoId]) {
      push({ severity: "error", code: "PAGE_SEO_MISSING", ownerId: page.id, targetId: page.seoId, message: `${page.route}: SEO kaydı bulunamadı (${page.seoId}).` });
    }
  }

  for (const [templateId, template] of Object.entries(document.templates)) {
    for (const sectionId of template.sectionIds || []) {
      referencedSections.add(sectionId);
      if (!document.sections[sectionId]) {
        push({ severity: "error", code: "TEMPLATE_SECTION_MISSING", ownerId: templateId, targetId: sectionId, message: `${templateId}: section referansı bulunamadı (${sectionId}).` });
      }
    }
  }

  for (const [presetId, preset] of Object.entries(document.presets)) {
    collectThemeSettingReferences(preset.settings, `preset:${presetId}`, issues, document);
    preset.blocks.forEach((block, index) => {
      collectThemeSettingReferences(block.settings, `preset:${presetId}.blocks[${index}]`, issues, document);
    });
  }

  for (const [sectionId, section] of Object.entries(document.sections)) {
    for (const blockId of section.blockIds || []) {
      referencedBlocks.add(blockId);
      if (!document.blocks[blockId]) {
        push({ severity: "error", code: "SECTION_BLOCK_MISSING", ownerId: sectionId, targetId: blockId, message: `${sectionId}: block referansı bulunamadı (${blockId}).` });
      }
    }

    const settings = section.settings || {};
    for (const [key, value] of Object.entries(settings)) {
      if (typeof value !== "string" || !value) continue;
      if (key === "imageAssetId" || key === "mobileImageAssetId" || key === "posterAssetId" || key.endsWith("AssetId")) {
        referencedMedia.add(value);
        if (!document.media[value]) {
          push({ severity: "error", code: "SECTION_MEDIA_MISSING", ownerId: sectionId, targetId: value, message: `${sectionId}: medya referansı bulunamadı (${value}).` });
        }
      }
      if (["linkHref", "href", "link", "cta"].includes(key)) {
        const route = internalManagedPageRoute(value);
        if (route && !publishedRoutes.has(route) && !redirectSources.has(route)) {
          push({ severity: "warning", code: "BROKEN_MANAGED_LINK", ownerId: sectionId, targetId: route, message: `${sectionId}: ${route} için yayınlanmış sayfa veya redirect bulunamadı.` });
        }
      }
    }
  }

  for (const [blockId, block] of Object.entries(document.blocks)) {
    for (const [key, value] of Object.entries(block.settings || {})) {
      if (typeof value !== "string" || !value) continue;
      if (key === "assetId" || key === "media" || key === "posterAssetId" || key.endsWith("AssetId")) {
        referencedMedia.add(value);
        if (!document.media[value]) {
          push({ severity: "error", code: "BLOCK_MEDIA_MISSING", ownerId: blockId, targetId: value, message: `${blockId}: medya referansı bulunamadı (${value}).` });
        }
      }
      if (["linkHref", "href", "link", "cta"].includes(key)) {
        const route = internalManagedPageRoute(value);
        if (route && !publishedRoutes.has(route) && !redirectSources.has(route)) {
          push({ severity: "warning", code: "BROKEN_MANAGED_LINK", ownerId: blockId, targetId: route, message: `${blockId}: ${route} için yayınlanmış sayfa veya redirect bulunamadı.` });
        }
      }
    }
  }

  for (const [seoId, seo] of Object.entries(document.seo)) {
    if (seo.openGraphAssetId) {
      referencedMedia.add(seo.openGraphAssetId);
      if (!document.media[seo.openGraphAssetId]) {
        push({ severity: "error", code: "SEO_MEDIA_MISSING", ownerId: seoId, targetId: seo.openGraphAssetId, message: `${seoId}: Open Graph medya referansı bulunamadı (${seo.openGraphAssetId}).` });
      }
    }
  }

  for (const asset of Object.values(document.media)) {
    if (asset.mobileAssetId) referencedMedia.add(asset.mobileAssetId);
    if (asset.posterAssetId) referencedMedia.add(asset.posterAssetId);
  }

  for (const [sectionId] of Object.entries(document.sections)) {
    if (!referencedSections.has(sectionId)) {
      push({ severity: "warning", code: "ORPHAN_SECTION", ownerId: sectionId, message: `${sectionId}: hiçbir template tarafından kullanılmıyor.` });
    }
  }
  for (const [blockId] of Object.entries(document.blocks)) {
    if (!referencedBlocks.has(blockId)) {
      push({ severity: "warning", code: "ORPHAN_BLOCK", ownerId: blockId, message: `${blockId}: hiçbir section tarafından kullanılmıyor.` });
    }
  }
  for (const [assetId, asset] of Object.entries(document.media)) {
    if (!referencedMedia.has(assetId) && (asset.usageCount || 0) === 0) {
      push({ severity: "warning", code: "ORPHAN_MEDIA", ownerId: assetId, message: `${assetId}: kullanım referansı olmayan medya.` });
    }
  }

  return issues;
}

const LINK_SETTING_KEYS = new Set([
  "href",
  "link",
  "linkHref",
  "cta",
  "url",
  "targetUrl",
  "buttonHref",
]);

const MEDIA_SETTING_KEYS = new Set([
  "assetId",
  "media",
  "imageAssetId",
  "posterAssetId",
  "mobileAssetId",
  "ogAssetId",
]);

function collectThemeSettingReferences(
  value: unknown,
  source: string,
  issues: ThemeReferenceIssue[],
  document: ThemeDocument,
  key = "",
  visited = new Set<unknown>(),
) {
  if (value == null) return;
  if (typeof value === "object") {
    if (visited.has(value)) return;
    visited.add(value);
  }

  if (typeof value === "string") {
    if (LINK_SETTING_KEYS.has(key) && value.startsWith("/pages/")) {
      const route = normalizeStoreDesignRoute(value);
      const page = Object.values(document.pages).find((candidate) => candidate.route === route);
      const redirect = document.redirects.find((candidate) => candidate.active !== false && candidate.from === route);
      if (!page && !redirect) {
        issues.push({
          severity: "warning",
          code: "broken-merchant-link",
          message: `${source}: ${route} için sayfa veya redirect kaydı bulunamadı.`,
          source,
          target: route,
        });
      } else if (page && page.status !== "published") {
        issues.push({
          severity: "warning",
          code: "link-to-unpublished-page",
          message: `${source}: ${route} henüz published değil; canlı sitede link çalışmayabilir.`,
          source,
          target: route,
        });
      }
    }

    if ((MEDIA_SETTING_KEYS.has(key) || key.endsWith("AssetId")) && value && !document.media[value]) {
      issues.push({
        severity: "error",
        code: "missing-media-reference",
        message: `${source}: medya referansı bulunamadı (${value}).`,
        source,
        target: value,
      });
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectThemeSettingReferences(item, `${source}[${index}]`, issues, document, key, visited));
    return;
  }

  if (value && typeof value === "object") {
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      collectThemeSettingReferences(childValue, `${source}.${childKey}`, issues, document, childKey, visited);
    }
  }
}

export function analyzeThemeDocumentReferences(document: ThemeDocument): ThemeReferenceIssue[] {
  const issues: ThemeReferenceIssue[] = [];
  const sectionOwners = new Map<string, string[]>();
  const blockOwners = new Map<string, string[]>();

  for (const [route, page] of Object.entries(document.pages)) {
    if (!document.templates[page.templateId]) {
      issues.push({
        severity: "error",
        code: "missing-page-template",
        message: `${route}: template bulunamadı (${page.templateId}).`,
        source: route,
        target: page.templateId,
      });
    }
    if (!document.seo[page.seoId]) {
      issues.push({
        severity: "error",
        code: "missing-page-seo",
        message: `${route}: SEO kaydı bulunamadı (${page.seoId}).`,
        source: route,
        target: page.seoId,
      });
    }
  }

  for (const [templateId, template] of Object.entries(document.templates)) {
    for (const sectionId of template.sectionIds || []) {
      if (!document.sections[sectionId]) {
        issues.push({
          severity: "error",
          code: "missing-template-section",
          message: `${templateId}: section bulunamadı (${sectionId}).`,
          source: templateId,
          target: sectionId,
        });
        continue;
      }
      const owners = sectionOwners.get(sectionId) || [];
      owners.push(templateId);
      sectionOwners.set(sectionId, owners);
    }
    collectThemeSettingReferences(template.componentSettings, `template:${templateId}`, issues, document);
  }

  for (const [sectionId, section] of Object.entries(document.sections)) {
    const definition = SECTION_LIBRARY_BY_TYPE[section.type];
    // The semantic runtime also stores edits to existing image/text components
    // here. They are settings owners, not independently rendered sections.
    // Only accept registered component types with actual overrides outside a
    // template's section list; unsupported renderable sections still warn.
    const semantic = section.settings?.semantic;
    const semanticSettingsOwner = !sectionOwners.has(sectionId)
      && Boolean(COMPONENT_REGISTRY_BY_TYPE[section.type])
      && semantic !== null && typeof semantic === "object" && !Array.isArray(semantic)
      && Object.keys(semantic).length > 0
      && (section.blockIds || []).length === 0;
    if (!definition && !semanticSettingsOwner) {
      issues.push({
        severity: "warning",
        code: "unknown-section-definition",
        message: `${sectionId}: registry'de section definition yok (${section.type}).`,
        source: sectionId,
        target: section.type,
      });
    } else if (definition && !definition.implemented) {
      issues.push({
        severity: "error",
        code: "section-runtime-unavailable",
        message: `${sectionId}: ${definition.label} runtime henüz hazır değil.`,
        source: sectionId,
        target: section.type,
      });
    }

    for (const blockId of section.blockIds || []) {
      const block = document.blocks[blockId];
      if (!block) {
        issues.push({
          severity: "error",
          code: "missing-section-block",
          message: `${sectionId}: block bulunamadı (${blockId}).`,
          source: sectionId,
          target: blockId,
        });
        continue;
      }
      const owners = blockOwners.get(blockId) || [];
      owners.push(sectionId);
      blockOwners.set(blockId, owners);
    }
    collectThemeSettingReferences(section.settings, `section:${sectionId}`, issues, document);
  }

  for (const [blockId, block] of Object.entries(document.blocks)) {
    const definition = BLOCK_LIBRARY_BY_TYPE[block.type];
    if (!definition) {
      issues.push({
        severity: "warning",
        code: "unknown-block-definition",
        message: `${blockId}: registry'de block definition yok (${block.type}).`,
        source: blockId,
        target: block.type,
      });
    } else if (!definition.implemented) {
      issues.push({
        severity: "error",
        code: "block-runtime-unavailable",
        message: `${blockId}: ${definition.label} runtime henüz hazır değil.`,
        source: blockId,
        target: block.type,
      });
    }
    collectThemeSettingReferences(block.settings, `block:${blockId}`, issues, document);
  }

  for (const [sectionId, owners] of sectionOwners) {
    if (owners.length > 1) {
      issues.push({
        severity: "warning",
        code: "shared-section-reference",
        message: `${sectionId}: section birden fazla template tarafından kullanılıyor (${owners.join(", ")}). Silme/değiştirme tümünü etkiler.`,
        source: sectionId,
      });
    }
  }

  for (const [blockId, owners] of blockOwners) {
    if (owners.length > 1) {
      issues.push({
        severity: "warning",
        code: "shared-block-reference",
        message: `${blockId}: block birden fazla section tarafından kullanılıyor (${owners.join(", ")}).`,
        source: blockId,
      });
    }
  }

  for (const [presetId, preset] of Object.entries(document.presets)) {
    const definition = SECTION_LIBRARY_BY_TYPE[preset.sectionType];
    const presetError = (message: string, target?: string) => issues.push({
      severity: "error",
      code: "invalid-preset-reference",
      message,
      source: presetId,
      target,
    });
    if (!definition) presetError(`${presetId}: preset section type registry'de yok (${preset.sectionType}).`, preset.sectionType);
    if (definition && !definition.implemented) presetError(`${presetId}: preset section runtime hazır değil (${preset.sectionType}).`, preset.sectionType);
    if (definition?.maxBlocks && preset.blocks.length > definition.maxBlocks) {
      presetError(`${presetId}: preset maxBlocks sınırını aşıyor (${definition.maxBlocks}).`, preset.sectionType);
    }
    for (const block of preset.blocks) {
      if (definition?.allowedBlocks?.length && !definition.allowedBlocks.includes(block.type)) {
        presetError(`${presetId}: ${block.type} preset block tipi section için izinli değil.`, block.type);
      }
      if (!BLOCK_LIBRARY_BY_TYPE[block.type]) presetError(`${presetId}: preset block registry'de yok (${block.type}).`, block.type);
    }
  }

  for (const [route, templateId] of Object.entries(document.templateBindings)) {
    if (!document.templates[templateId]) {
      issues.push({
        severity: "error",
        code: "missing-template-binding",
        message: `${route}: template binding hedefi bulunamadı (${templateId}).`,
        source: route,
        target: templateId,
      });
    }
  }

  for (const [seoId, seo] of Object.entries(document.seo)) {
    if (seo.openGraphAssetId && !document.media[seo.openGraphAssetId]) {
      issues.push({
        severity: "error",
        code: "missing-og-media",
        message: `${seoId}: Open Graph medya kaydı bulunamadı (${seo.openGraphAssetId}).`,
        source: seoId,
        target: seo.openGraphAssetId,
      });
    }
  }

  return issues;
}

export function validateThemeDocument(document: ThemeDocument) {
  const errors: string[] = [];
  const referenceIssues = analyzeThemeDocumentReferences(document);
  errors.push(...referenceIssues.filter((issue) => issue.severity === "error").map((issue) => issue.message));
  const routes = new Map<string, string>();
  const anchorIds = new Map<string, string>();

  for (const [key, page] of Object.entries(document.pages)) {
    if (!page.name.trim()) errors.push(`${key}: sayfa adı boş olamaz.`);
    if (!page.slug) errors.push(`${key}: slug boş olamaz.`);
    if (routes.has(page.route) && routes.get(page.route) !== page.id) errors.push(`${page.route}: aynı route birden fazla sayfada kullanılıyor.`);
    routes.set(page.route, page.id);
    if (page.kind === "merchant" && !page.reserved && isReservedPageSlug(page.slug)) {
      errors.push(`${page.slug}: reserved route kullanılamaz.`);
    }
    if (!document.templates[page.templateId]) errors.push(`${page.route}: bağlı template bulunamadı (${page.templateId}).`);
    if (!document.seo[page.seoId]) errors.push(`${page.route}: SEO kaydı bulunamadı (${page.seoId}).`);
    const seo = document.seo[page.seoId];
    if (seo?.canonical && !seo.canonical.startsWith("/") && !/^https:\/\//i.test(seo.canonical)) {
      errors.push(`${page.route}: canonical yalnız relative path veya https olabilir.`);
    }
  }

  for (const [templateId, template] of Object.entries(document.templates)) {
    if (!Array.isArray(template.compatibility) || template.compatibility.length === 0) {
      errors.push(`${templateId}: template compatibility boş olamaz.`);
    }
    for (const sectionId of template.sectionIds || []) {
      if (!document.sections[sectionId]) errors.push(`${templateId}: section referansı bulunamadı (${sectionId}).`);
    }
  }

  for (const [sectionId, section] of Object.entries(document.sections)) {
    const definition = SECTION_LIBRARY_BY_TYPE[section.type];
    const blockIds = Array.isArray(section.blockIds) ? section.blockIds : [];

    if (section.type === "newsletter") {
      const heading = typeof section.settings?.heading === "string" ? section.settings.heading.trim() : "";
      const fieldLabel = typeof section.settings?.fieldLabel === "string" ? section.settings.fieldLabel.trim() : "";
      const consent = typeof section.settings?.consent === "string" ? section.settings.consent.trim() : "";
      const successCopy = typeof section.settings?.successCopy === "string" ? section.settings.successCopy.trim() : "";
      if (!heading) errors.push(`${sectionId}: Newsletter başlığı boş olamaz.`);
      if (!fieldLabel) errors.push(`${sectionId}: Newsletter alan etiketi boş olamaz.`);
      if (!consent) errors.push(`${sectionId}: Newsletter consent metni boş olamaz.`);
      if (!successCopy) errors.push(`${sectionId}: Newsletter başarı mesajı boş olamaz.`);
      if (blockIds.length) errors.push(`${sectionId}: Newsletter section block kabul etmez.`);
    }

    if (section.type === "custom-form") {
      const action = String(section.settings?.action || "store");
      if (action !== "store") errors.push(`${sectionId}: Custom Form action whitelist dışında.`);
      const fieldNames = new Set<string>();
      const allowedFieldTypes = new Set(["text", "email", "tel", "textarea", "select", "checkbox"]);
      for (const blockId of blockIds) {
        const block = document.blocks[blockId];
        if (!block || block.type !== "field") continue;
        const name = typeof block.settings?.name === "string" ? block.settings.name.trim() : "";
        const label = typeof block.settings?.label === "string" ? block.settings.label.trim() : "";
        const fieldType = String(block.settings?.type || "text");
        if (!/^[a-z][a-z0-9_-]{0,39}$/.test(name)) errors.push(`${blockId}: Form alan adı geçersiz.`);
        if (name && fieldNames.has(name)) errors.push(`${blockId}: Form alan adı benzersiz olmalı (${name}).`);
        if (name) fieldNames.add(name);
        if (!label) errors.push(`${blockId}: Form alan etiketi boş olamaz.`);
        if (!allowedFieldTypes.has(fieldType)) errors.push(`${blockId}: Form alan tipi desteklenmiyor (${fieldType}).`);
        if (fieldType === "select") {
          const options = typeof block.settings?.options === "string"
            ? block.settings.options.split(/[\n,]/).map((item) => item.trim()).filter(Boolean)
            : [];
          if (!options.length) errors.push(`${blockId}: Select alanı en az bir seçenek içermeli.`);
        }
      }
    }

    if (section.type === "integration-block") {
      const integrationId = typeof section.settings?.integrationId === "string" ? section.settings.integrationId.trim() : "";
      const integration = integrationId ? STORE_DESIGN_INTEGRATION_BLOCK_REGISTRY_BY_ID[integrationId] : undefined;
      if (!integration) errors.push(`${sectionId}: Integration Block yalnız kayıtlı storefront entegrasyonlarını kullanabilir.`);
      if (section.settings && Object.prototype.hasOwnProperty.call(section.settings, "credentials")) {
        errors.push(`${sectionId}: Integration Block credential taşıyamaz.`);
      }
    }

    if (section.type === "developer-embed") {
      errors.push(`${sectionId}: Developer Embed merchant modunda kapalıdır.`);
      if (section.settings && Object.prototype.hasOwnProperty.call(section.settings, "rawJs")) {
        errors.push(`${sectionId}: Developer Embed raw JS ayarı yasaktır.`);
      }
    }

    if (section.type === "map-locator") {
      const layout = String(section.settings?.layout || "cards");
      if (!["cards", "list"].includes(layout)) errors.push(`${sectionId}: Store Locator layout geçersiz.`);
      if (section.settings?.showMapLinks != null && typeof section.settings.showMapLinks !== "boolean") {
        errors.push(`${sectionId}: Store Locator showMapLinks boolean olmalı.`);
      }
      for (const blockId of blockIds) {
        const block = document.blocks[blockId];
        if (!block || block.type !== "location") continue;
        const name = typeof block.settings?.name === "string" ? block.settings.name.trim() : "";
        const address = typeof block.settings?.address === "string" ? block.settings.address.trim() : "";
        if (!name) errors.push(`${blockId}: Konum adı boş olamaz.`);
        if (!address) errors.push(`${blockId}: Konum adresi boş olamaz.`);
      }
    }

    if (section.type === "anchor") {
      const anchorId = normalizeStoreDesignAnchorId(typeof section.settings?.anchorId === "string" ? section.settings.anchorId : "");
      if (!anchorId) {
        errors.push(`${sectionId}: Anchor ID boş olamaz.`);
      } else if (anchorIds.has(anchorId)) {
        errors.push(`${sectionId}: Anchor ID benzersiz olmalı (${anchorId}); zaten ${anchorIds.get(anchorId)} kullanıyor.`);
      } else {
        anchorIds.set(anchorId, sectionId);
      }
    }
    if (definition?.maxBlocks && blockIds.length > definition.maxBlocks) {
      errors.push(`${sectionId}: maxBlocks sınırı aşıldı (${definition.maxBlocks}).`);
    }
    for (const blockId of blockIds) {
      const block = document.blocks[blockId];
      if (!block) {
        errors.push(`${sectionId}: block referansı bulunamadı (${blockId}).`);
        continue;
      }
      if (definition?.allowedBlocks?.length && !definition.allowedBlocks.includes(block.type)) {
        errors.push(`${sectionId}: ${block.type} block tipi bu section için izinli değil.`);
      }
    }
  }

  for (const [route, templateId] of Object.entries(document.templateBindings)) {
    if (!document.templates[templateId]) errors.push(`${route}: atanmış template bulunamadı (${templateId}).`);
    if (!route.startsWith("/")) errors.push(`${route}: template binding route geçersiz.`);
  }

  for (const [assetId, asset] of Object.entries(document.media)) {
    if (!asset.url || !/^https?:\/\//i.test(asset.url)) errors.push(`${assetId}: medya URL geçersiz.`);
    if (asset.mobileAssetId && !document.media[asset.mobileAssetId]) errors.push(`${assetId}: mobil medya referansı bulunamadı.`);
    if (asset.posterAssetId && !document.media[asset.posterAssetId]) errors.push(`${assetId}: video poster referansı bulunamadı.`);
    if (asset.mobileAssetId === assetId) errors.push(`${assetId}: medya kendi mobil varyantı olamaz.`);
    if (asset.posterAssetId === assetId) errors.push(`${assetId}: medya kendi posteri olamaz.`);

    const poster = asset.posterAssetId ? document.media[asset.posterAssetId] : undefined;
    if (poster && (asset.type !== "video" || poster.type !== "image")) errors.push(`${assetId}: video posteri görsel asset olmalı.`);
  }

  for (const seo of Object.values(document.seo)) {
    if (seo.openGraphAssetId && !document.media[seo.openGraphAssetId]) {
      errors.push(`${seo.openGraphAssetId}: Open Graph medya referansı bulunamadı.`);
    }
  }

  for (const section of Object.values(document.sections)) {
    const imageAssetId = typeof section.settings.imageAssetId === "string" ? section.settings.imageAssetId : "";
    const asset = imageAssetId ? document.media[imageAssetId] : undefined;
    if (imageAssetId && !asset) errors.push(`${section.id}: bölüm medya referansı bulunamadı.`);

    if (section.type === "product-spotlight") {
      const productId = typeof section.settings.productId === "string" ? section.settings.productId.trim() : "";
      if (!productId) errors.push(`${section.id}: Tek Ürün Spotlight için ürün seçimi zorunlu.`);
      const mediaPosition = String(section.settings.mediaPosition || "left");
      if (!["left", "right"].includes(mediaPosition)) errors.push(`${section.id}: Spotlight mediaPosition geçersiz.`);
      const infoBlocks = Array.isArray(section.settings.infoBlocks) ? section.settings.infoBlocks : ["description", "stock", "compare-price"];
      const allowedInfoBlocks = new Set(["description", "stock", "compare-price"]);
      if (infoBlocks.some((item) => typeof item !== "string" || !allowedInfoBlocks.has(item))) errors.push(`${section.id}: Spotlight infoBlocks geçersiz.`);
    }

    if (section.type === "featured-collection") {
      const collectionId = typeof section.settings.collectionId === "string" ? section.settings.collectionId.trim() : "";
      if (!collectionId) errors.push(`${section.id}: Featured Collection için koleksiyon seçimi zorunlu.`);
      const layout = String(section.settings.layout || "slider");
      if (!["slider", "grid"].includes(layout)) errors.push(`${section.id}: Featured Collection layout geçersiz.`);
      const limit = Number(section.settings.limit ?? 8);
      if (!Number.isFinite(limit) || limit < 1 || limit > 24) errors.push(`${section.id}: Featured Collection limiti 1-24 aralığında olmalı.`);
      const desktopColumns = Number(section.settings.desktopColumns ?? 4);
      const mobileColumns = Number(section.settings.mobileColumns ?? 2);
      if (!Number.isFinite(desktopColumns) || desktopColumns < 1 || desktopColumns > 6) errors.push(`${section.id}: Featured Collection desktop kolon 1-6 aralığında olmalı.`);
      if (!Number.isFinite(mobileColumns) || mobileColumns < 1 || mobileColumns > 3) errors.push(`${section.id}: Featured Collection mobil kolon 1-3 aralığında olmalı.`);
    }

    if (section.type === "category-cards") {
      const columns = Number(section.settings.columns ?? 3);
      const limit = Number(section.settings.limit ?? 6);
      const gap = Number(section.settings.gap ?? 20);
      const ratio = String(section.settings.ratio || "4/5");
      const placement = String(section.settings.titlePlacement || "overlay");
      if (!Number.isFinite(columns) || columns < 1 || columns > 4) errors.push(`${section.id}: Kategori kartı kolon sayısı 1-4 aralığında olmalı.`);
      if (!Number.isFinite(limit) || limit < 1 || limit > 12) errors.push(`${section.id}: Kategori kartı limiti 1-12 aralığında olmalı.`);
      if (!Number.isFinite(gap) || gap < 0 || gap > 64) errors.push(`${section.id}: Kategori kartı gap 0-64 aralığında olmalı.`);
      if (!["16/10", "4/5", "1/1"].includes(ratio)) errors.push(`${section.id}: Kategori kartı ratio preset geçersiz.`);
      if (!["overlay", "below"].includes(placement)) errors.push(`${section.id}: Kategori kartı titlePlacement geçersiz.`);
    }

    if (section.type === "rewards-promo") {
      const layout = String(section.settings.layout || "split");
      if (!["split", "card"].includes(layout)) errors.push(`${section.id}: Rewards Promo layout geçersiz.`);
      if (section.settings.showSignupPoints !== undefined && typeof section.settings.showSignupPoints !== "boolean") errors.push(`${section.id}: Rewards Promo showSignupPoints boolean olmalı.`);
      if (section.settings.showEarnRate !== undefined && typeof section.settings.showEarnRate !== "boolean") errors.push(`${section.id}: Rewards Promo showEarnRate boolean olmalı.`);
      const paddingY = Number(section.settings.paddingY ?? 72);
      if (!Number.isFinite(paddingY) || paddingY < 0 || paddingY > 240) errors.push(`${section.id}: Rewards Promo paddingY 0-240 aralığında olmalı.`);
    }

    if (section.type === "grid-stack-builder") {
      const columns = Number(section.settings.columns ?? 2);
      if (!Number.isFinite(columns) || columns < 1 || columns > 4) errors.push(`${section.id}: Grid / Stack kolon sayısı 1-4 aralığında olmalı.`);
      const gap = Number(section.settings.gap ?? 20);
      if (!Number.isFinite(gap) || gap < 0 || gap > 64) errors.push(`${section.id}: Grid / Stack gap 0-64 aralığında olmalı.`);
      const alignment = String(section.settings.alignment || "stretch");
      if (!["start", "center", "stretch"].includes(alignment)) errors.push(`${section.id}: Grid / Stack alignment geçersiz.`);
      if (section.settings.responsiveStack !== undefined && typeof section.settings.responsiveStack !== "boolean") errors.push(`${section.id}: Grid / Stack responsiveStack boolean olmalı.`);
    }

    if (section.type === "review-highlights") {
      const productId = typeof section.settings.productId === "string" ? section.settings.productId.trim() : "";
      if (!productId) errors.push(`${section.id}: Review Highlights için ürün kaynağı seçilmeli.`);
      const limit = Number(section.settings.limit ?? 6);
      if (!Number.isFinite(limit) || limit < 1 || limit > 12) errors.push(`${section.id}: Review Highlights limiti 1-12 aralığında olmalı.`);
      if (section.settings.ratingDisplay !== undefined && typeof section.settings.ratingDisplay !== "boolean") errors.push(`${section.id}: Review Highlights ratingDisplay boolean olmalı.`);
    }

    if (section.type === "contact-form") {
      const phoneVisible = section.settings.phoneVisible;
      if (phoneVisible !== undefined && typeof phoneVisible !== "boolean") errors.push(`${section.id}: Contact Form phoneVisible boolean olmalı.`);
      const paddingY = Number(section.settings.paddingY ?? 72);
      if (!Number.isFinite(paddingY) || paddingY < 0 || paddingY > 240) errors.push(`${section.id}: Contact Form paddingY 0-240 aralığında olmalı.`);
      for (const key of ["title", "body", "nameLabel", "emailLabel", "phoneLabel", "messageLabel", "namePlaceholder", "emailPlaceholder", "phonePlaceholder", "messagePlaceholder", "buttonLabel", "successCopy"]) {
        const value = section.settings[key];
        if (value !== undefined && typeof value !== "string") errors.push(`${section.id}: Contact Form ${key} metin olmalı.`);
      }
    }

    if (section.type === "breadcrumb") {
      if (section.settings.visible !== undefined && typeof section.settings.visible !== "boolean") errors.push(`${section.id}: Breadcrumb visible boolean olmalı.`);
      const separator = String(section.settings.separator || "chevron");
      if (!["chevron", "slash", "dot"].includes(separator)) errors.push(`${section.id}: Breadcrumb separator preset geçersiz.`);
      const typography = String(section.settings.typography || "compact");
      if (!["compact", "default"].includes(typography)) errors.push(`${section.id}: Breadcrumb typography preset geçersiz.`);
      const paddingY = Number(section.settings.paddingY ?? 12);
      if (!Number.isFinite(paddingY) || paddingY < 0 || paddingY > 64) errors.push(`${section.id}: Breadcrumb paddingY 0-64 aralığında olmalı.`);
    }

    if (section.type === "recently-viewed") {
      const limit = Number(section.settings.limit ?? 8);
      if (!Number.isFinite(limit) || limit < 2 || limit > 12) errors.push(`${section.id}: Son Görüntülenenler limiti 2-12 aralığında olmalı.`);
      const layout = String(section.settings.layout || "slider");
      if (!["grid", "slider"].includes(layout)) errors.push(`${section.id}: Son Görüntülenenler layout geçersiz.`);
      const paddingY = Number(section.settings.paddingY ?? 58);
      if (!Number.isFinite(paddingY) || paddingY < 0 || paddingY > 240) errors.push(`${section.id}: Son Görüntülenenler paddingY 0-240 aralığında olmalı.`);
    }

    if (section.type === "bundle") {
      const source = String(section.settings.source || "related");
      if (!["related", "all"].includes(source)) errors.push(`${section.id}: Bundle source yalnız related/all olabilir.`);
      const layout = String(section.settings.layout || "grid");
      if (!["grid", "slider"].includes(layout)) errors.push(`${section.id}: Bundle layout geçersiz.`);
      const cta = section.settings.cta;
      if (cta !== undefined && (typeof cta !== "string" || cta.trim().length < 1 || cta.trim().length > 80)) errors.push(`${section.id}: Bundle CTA 1-80 karakter olmalı.`);
      for (const protectedKey of ["bundleItems", "bundle_items", "bundlePrice", "price", "priceValue", "productIds", "cartLogic"]) {
        if (protectedKey in section.settings) errors.push(`${section.id}: Bundle ${protectedKey} business verisi tema editöründen değiştirilemez.`);
      }
    }

    if (section.type === "cross-sell") {
      const source = String(section.settings.source || "related");
      if (!["related", "best-sellers", "new-arrivals"].includes(source)) errors.push(`${section.id}: Cross-sell source preset geçersiz.`);
      const limit = Number(section.settings.limit ?? 4);
      if (!Number.isFinite(limit) || limit < 2 || limit > 8) errors.push(`${section.id}: Cross-sell limiti 2-8 aralığında olmalı.`);
      const position = String(section.settings.position || "after-items");
      if (!["after-items", "before-totals"].includes(position)) errors.push(`${section.id}: Cross-sell position preset geçersiz.`);
      const density = String(section.settings.density || "standard");
      if (!["compact", "standard", "comfortable"].includes(density)) errors.push(`${section.id}: Cross-sell density preset geçersiz.`);
      for (const protectedKey of ["productIds", "products", "recommendationData", "recommendationAlgorithm", "price", "priceValue", "cartState", "cartLogic"]) {
        if (protectedKey in section.settings) errors.push(`${section.id}: Cross-sell ${protectedKey} business verisi tema editöründen değiştirilemez.`);
      }
    }

    if (section.type === "recommendations") {
      const algorithm = String(section.settings.algorithm || "related");
      if (algorithm !== "related") errors.push(`${section.id}: Önerilen Ürünler yalnız korumalı related algoritmasını kullanabilir.`);
      const limit = Number(section.settings.limit ?? 6);
      if (!Number.isFinite(limit) || limit < 2 || limit > 12) errors.push(`${section.id}: Önerilen Ürünler limiti 2-12 aralığında olmalı.`);
      const layout = String(section.settings.layout || "grid");
      if (!["grid", "slider"].includes(layout)) errors.push(`${section.id}: Önerilen Ürünler layout geçersiz.`);
    }

    if (section.type === "best-sellers") {
      const windowPreset = String(section.settings.window || "30d");
      if (!["7d", "30d", "90d"].includes(windowPreset)) errors.push(`${section.id}: Çok Satanlar tarih penceresi geçersiz.`);
      const limit = Number(section.settings.limit ?? 12);
      if (!Number.isFinite(limit) || limit < 1 || limit > 24) errors.push(`${section.id}: Çok Satanlar limiti 1-24 aralığında olmalı.`);
      const layout = String(section.settings.layout || "slider");
      if (!["slider", "grid"].includes(layout)) errors.push(`${section.id}: Çok Satanlar layout geçersiz.`);
    }

    if (section.type === "product-comparison") {
      const productIds = Array.isArray(section.settings.productIds) ? section.settings.productIds.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
      if (productIds.length < 2 || productIds.length > 4) errors.push(`${section.id}: Ürün Karşılaştırma 2-4 ürün seçimi gerektirir.`);
      if (new Set(productIds).size !== productIds.length) errors.push(`${section.id}: Ürün Karşılaştırma aynı ürünü birden fazla kez içeremez.`);
      const fields = Array.isArray(section.settings.fields) ? section.settings.fields : ["price", "stock", "description"];
      const allowedFields = new Set(["price", "compare-price", "stock", "description", "material"]);
      if (!fields.length || fields.some((item) => typeof item !== "string" || !allowedFields.has(item))) errors.push(`${section.id}: Ürün Karşılaştırma field seçimi geçersiz.`);
      const layout = String(section.settings.layout || "table");
      if (layout !== "table") errors.push(`${section.id}: Ürün Karşılaştırma yalnız güvenli table layout kullanabilir.`);
    }

    if (section.type === "scroll-story") {
      const lengthPreset = String(section.settings.scrollLengthPreset || "standard");
      if (!["compact", "standard", "long"].includes(lengthPreset)) errors.push(`${section.id}: Scroll Story uzunluk preset geçersiz.`);
      const transitionPreset = String(section.settings.transitionPreset || "fade-scale");
      if (!["fade-scale", "fade"].includes(transitionPreset)) errors.push(`${section.id}: Scroll Story transition preset geçersiz.`);
      if ((section.blockIds || []).length > 0) {
        for (const blockId of section.blockIds || []) {
          const block = document.blocks[blockId];
          if (!block || block.type !== "scroll-story-slide") continue;
          const assetId = typeof block.settings.assetId === "string" ? block.settings.assetId : "";
          // Blank slots deliberately use the existing/legacy circular image.
          // A media asset is only required after the user selects one.
          const asset = assetId ? document.media[assetId] : undefined;
          if (assetId && !asset) errors.push(`${blockId}: Scroll Story medya referansı bulunamadı (${assetId}).`);
        }
      }
    }

    if (section.type === "collection-cards") {
      const columns = Number(section.settings.columns ?? 2);
      if (!Number.isFinite(columns) || columns < 1 || columns > 4) errors.push(`${section.id}: Koleksiyon kartı kolon sayısı 1-4 aralığında olmalı.`);
      const limit = Number(section.settings.limit ?? 4);
      if (!Number.isFinite(limit) || limit < 1 || limit > 12) errors.push(`${section.id}: Koleksiyon kartı limiti 1-12 aralığında olmalı.`);
      const gap = Number(section.settings.gap ?? 20);
      if (!Number.isFinite(gap) || gap < 0 || gap > 64) errors.push(`${section.id}: Koleksiyon kartı gap 0-64 aralığında olmalı.`);
      const ratio = String(section.settings.ratio || "16/10");
      if (!["16/10", "4/5", "1/1"].includes(ratio)) errors.push(`${section.id}: Koleksiyon kartı ratio preset geçersiz.`);
      const placement = String(section.settings.titlePlacement || "overlay");
      if (!["overlay", "below"].includes(placement)) errors.push(`${section.id}: Koleksiyon kartı titlePlacement geçersiz.`);
    }

    if (section.type === "brand-story" && imageAssetId) {
      const playbackPreset = String(section.settings.playbackPreset || "ambient");
      if (!["ambient", "once", "controls"].includes(playbackPreset)) errors.push(`${section.id}: Brand Story playbackPreset geçersiz.`);
      const side = String(section.settings.side || "left");
      if (!["left", "right"].includes(side)) errors.push(`${section.id}: Brand Story media side geçersiz.`);
      const contentWidth = String(section.settings.contentWidth || "50%");
      if (!["40%", "50%", "60%"].includes(contentWidth)) errors.push(`${section.id}: Brand Story contentWidth geçersiz.`);
    }

    if (section.type === "hero" && imageAssetId) {
      const posterId = typeof section.settings.posterAssetId === "string" ? section.settings.posterAssetId : "";
      const poster = posterId ? document.media[posterId] : undefined;
      if (posterId && !poster) errors.push(`${section.id}: Hero poster medya referansı bulunamadı (${posterId}).`);
      if (poster && poster.type !== "image") errors.push(`${section.id}: Hero video poster yalnız image asset olabilir.`);
      const playbackPreset = String(section.settings.playbackPreset || "ambient");
      if (!["ambient", "once", "controls"].includes(playbackPreset)) errors.push(`${section.id}: Hero playbackPreset geçersiz.`);
      const fit = String(section.settings.fit || "cover");
      if (!["cover", "contain"].includes(fit)) errors.push(`${section.id}: Hero media fit geçersiz.`);
      const heightPreset = String(section.settings.heightPreset || "viewport");
      if (!["medium", "tall", "viewport"].includes(heightPreset)) errors.push(`${section.id}: Hero heightPreset geçersiz.`);
      const contrastMode = String(section.settings.contrastMode || "light");
      if (!["light", "dark", "adaptive"].includes(contrastMode)) errors.push(`${section.id}: Hero contrastMode geçersiz.`);
      const overlayOpacity = Number(section.settings.overlayOpacity ?? 24);
      if (!Number.isFinite(overlayOpacity) || overlayOpacity < 0 || overlayOpacity > 80) errors.push(`${section.id}: Hero overlay 0-80 aralığında olmalı.`);
    }

    if (section.type === "video-hero" || section.type === "video-banner") {
      if (!imageAssetId) errors.push(`${section.id}: ${section.type === "video-hero" ? "Video Hero" : "Video Banner"} medya gerektirir.`);
      const posterId = typeof section.settings.posterAssetId === "string" ? section.settings.posterAssetId : "";
      const poster = posterId ? document.media[posterId] : undefined;
      if (posterId && !poster) errors.push(`${section.id}: poster medya referansı bulunamadı (${posterId}).`);
      if (poster && poster.type !== "image") errors.push(`${section.id}: video poster yalnız image asset olabilir.`);
      const playbackPreset = String(section.settings.playbackPreset || "ambient");
      if (!["ambient", "once", "controls"].includes(playbackPreset)) errors.push(`${section.id}: playbackPreset geçersiz.`);
      const fit = String(section.settings.fit || "cover");
      if (!["cover", "contain"].includes(fit)) errors.push(`${section.id}: video fit geçersiz.`);
    }

    if (section.type === "background-media") {
      if (!imageAssetId) errors.push(`${section.id}: Background Media bir fotoğraf veya video asset gerektirir.`);
      const posterId = typeof section.settings.posterAssetId === "string" ? section.settings.posterAssetId : "";
      const poster = posterId ? document.media[posterId] : undefined;
      if (posterId && !poster) errors.push(`${section.id}: background poster medya referansı bulunamadı (${posterId}).`);
      if (poster && poster.type !== "image") errors.push(`${section.id}: background video posteri image asset olmalı.`);
      const fit = String(section.settings.fit || "cover");
      if (!["cover", "contain"].includes(fit)) errors.push(`${section.id}: background media fit geçersiz.`);
      const playbackPreset = String(section.settings.playbackPreset || "ambient");
      if (!["ambient", "once", "controls"].includes(playbackPreset)) errors.push(`${section.id}: background playbackPreset geçersiz.`);
      if ((section.blockIds || []).length > 1) errors.push(`${section.id}: Background Media yalnız bir content block kabul eder.`);
    }

    if (section.type === "before-after") {
      const beforeId = typeof section.settings.beforeAssetId === "string" ? section.settings.beforeAssetId : "";
      const afterId = typeof section.settings.afterAssetId === "string" ? section.settings.afterAssetId : "";
      const before = beforeId ? document.media[beforeId] : undefined;
      const after = afterId ? document.media[afterId] : undefined;
      if (!beforeId || !afterId) errors.push(`${section.id}: Before / After iki görsel gerektirir.`);
      if (beforeId && !before) errors.push(`${section.id}: önce görsel referansı bulunamadı (${beforeId}).`);
      if (afterId && !after) errors.push(`${section.id}: sonra görsel referansı bulunamadı (${afterId}).`);
      if (before && before.type !== "image") errors.push(`${section.id}: önce asset image olmalı.`);
      if (after && after.type !== "image") errors.push(`${section.id}: sonra asset image olmalı.`);
      const divider = Number(section.settings.divider ?? 50);
      if (!Number.isFinite(divider) || divider < 10 || divider > 90) errors.push(`${section.id}: divider 10-90 aralığında olmalı.`);
    }

    if (section.type === "hotspot-lookbook") {
      if (!imageAssetId) errors.push(`${section.id}: Hotspot / Lookbook görseli gerekli.`);
      for (const blockId of section.blockIds || []) {
        const block = document.blocks[blockId];
        if (!block || block.type !== "hotspot") continue;
        const x = Number(block.settings.x);
        const y = Number(block.settings.y);
        if (!Number.isFinite(x) || x < 0 || x > 100 || !Number.isFinite(y) || y < 0 || y > 100) {
          errors.push(`${blockId}: hotspot x/y 0-100 aralığında olmalı.`);
        }
        const targetType = String(block.settings.targetType || "link");
        if (targetType !== "link" && targetType !== "product") errors.push(`${blockId}: hotspot targetType geçersiz.`);
        const targetId = typeof block.settings.targetId === "string" ? block.settings.targetId.trim() : "";
        if (!targetId) errors.push(`${blockId}: hotspot hedefi boş olamaz.`);
      }
    }
  }

  for (const block of Object.values(document.blocks)) {
    for (const [key, value] of Object.entries(block.settings || {})) {
      if (typeof value !== "string" || !value) continue;
      if ((key === "assetId" || key === "media" || key === "posterAssetId" || key.endsWith("AssetId")) && !document.media[value]) {
        errors.push(`${block.id}: block medya referansı bulunamadı (${value}).`);
      }
    }
  }

  const redirectMap = new Map<string, string>();
  for (const redirect of document.redirects.filter((item) => item.active !== false)) {
    if (redirect.from === redirect.to) errors.push(`${redirect.from}: redirect kendi üzerine gidemez.`);
    if (isProtectedStoreDesignRoute(redirect.from)) errors.push(`${redirect.from}: korumalı sistem route'u redirect kaynağı olamaz.`);
    if (redirectMap.has(redirect.from) && redirectMap.get(redirect.from) !== redirect.to) {
      errors.push(`${redirect.from}: birden fazla aktif redirect hedefi var.`);
    }
    if (Object.values(document.pages).some((page) => page.status === "published" && page.route === redirect.from)) {
      errors.push(`${redirect.from}: yayınlanmış bir sayfa aktif redirect kaynağı olamaz.`);
    }
    redirectMap.set(redirect.from, redirect.to);
  }

  for (const source of redirectMap.keys()) {
    const visited = new Set<string>();
    let cursor: string | undefined = source;
    for (let depth = 0; cursor && depth < 128; depth += 1) {
      if (visited.has(cursor)) {
        errors.push(`${source}: redirect döngüsü tespit edildi.`);
        break;
      }
      visited.add(cursor);
      cursor = redirectMap.get(cursor);
    }
  }

  const uniqueErrors = [...new Set(errors)];
  return { ok: uniqueErrors.length === 0, errors: uniqueErrors };
}

export function createEmptyThemeDocument(): ThemeDocument {
  return {
    schemaVersion: STORE_DESIGN_SCHEMA_VERSION,
    revision: 0,
    globals: { tokens: {}, header: {}, footer: {}, componentFamilies: {} },
    pages: {},
    seo: {},
    templates: {},
    templateBindings: {},
    sections: {},
    blocks: {},
    media: {},
    presets: {},
    redirects: [],
    publishedAt: null,
  };
}

export type ThemeMigrationResult = {
  document: ThemeDocument;
  fromVersion: number;
  toVersion: number;
  changed: boolean;
  notes: string[];
};

export function themeDocumentSchemaVersion(input: unknown) {
  const raw = objectRecord(input);
  return integerValue(raw.schemaVersion, 0);
}

export function assertSupportedThemeDocumentVersion(input: unknown) {
  const version = themeDocumentSchemaVersion(input);
  if (version > STORE_DESIGN_SCHEMA_VERSION) {
    throw new Error(`Tema şeması bu editor sürümünden daha yeni (v${version} > v${STORE_DESIGN_SCHEMA_VERSION}). Downgrade uygulanmadı.`);
  }
  return version;
}

export function normalizeThemeDocument(input: unknown): ThemeDocument {
  assertSupportedThemeDocumentVersion(input);
  const raw = objectRecord(input);
  const globals = objectRecord(raw.globals);

  const pages: Record<string, PageRecord> = {};
  for (const [key, value] of Object.entries(objectRecord(raw.pages)).slice(0, 500)) {
    const page = normalizePageRecord(value, key);
    if (page) pages[page.route] = page;
  }

  const seo: Record<string, SeoDocument> = {};
  for (const [key, value] of Object.entries(objectRecord(raw.seo)).slice(0, 1000)) {
    seo[key] = normalizeSeoDocument(value);
  }

  const redirects = (Array.isArray(raw.redirects) ? raw.redirects : [])
    .slice(0, 500)
    .map((value, index) => normalizeRedirectRecord(value, index))
    .filter((value): value is RedirectRecord => value !== null);

  const rawSections = objectRecord(raw.sections);
  const globalProtectedSectionIds = new Set(
    Object.entries(rawSections)
      .filter(([, value]) => stringValue(objectRecord(value).type, "", 120) === "consent-banner")
      .map(([id]) => id),
  );
  const sections: Record<string, SectionInstance> = {};
  for (const [id, value] of Object.entries(rawSections)) {
    if (globalProtectedSectionIds.has(id)) continue;
    sections[id] = value as SectionInstance;
  }

  const templates: Record<string, TemplateRecord> = {};
  for (const [templateId, value] of Object.entries(objectRecord(raw.templates))) {
    const template = objectRecord(value);
    const sectionIds = Array.isArray(template.sectionIds)
      ? template.sectionIds.filter(
          (sectionId): sectionId is string =>
            typeof sectionId === "string" && !globalProtectedSectionIds.has(sectionId),
        )
      : [];
    templates[templateId] = { ...template, sectionIds } as TemplateRecord;
  }

  const templateBindings: Record<string, string> = {};
  for (const [key, value] of Object.entries(objectRecord(raw.templateBindings)).slice(0, 500)) {
    if (typeof value === "string" && value) templateBindings[key] = value;
  }

  const presets: Record<string, SectionPresetRecord> = {};
  for (const [presetId, value] of Object.entries(objectRecord(raw.presets)).slice(0, 200)) {
    const preset = objectRecord(value);
    const blocks = (Array.isArray(preset.blocks) ? preset.blocks : [])
      .slice(0, 50)
      .map((blockValue) => {
        const block = objectRecord(blockValue);
        return {
          type: stringValue(block.type, "", 120),
          settings: objectRecord(block.settings),
        };
      })
      .filter((block) => Boolean(block.type));

    const normalizedPreset: SectionPresetRecord = {
      id: stringValue(preset.id, presetId, 180) || presetId,
      label: stringValue(preset.label, "Saved Section", 180),
      sectionType: stringValue(preset.sectionType, "", 120),
      settings: objectRecord(preset.settings),
      blocks,
      createdAt: stringValue(preset.createdAt, new Date(0).toISOString(), 80),
      updatedAt: stringValue(preset.updatedAt, new Date(0).toISOString(), 80),
      schemaVersion: integerValue(preset.schemaVersion, STORE_DESIGN_SCHEMA_VERSION),
    };

    if (!normalizedPreset.sectionType || normalizedPreset.sectionType === "consent-banner") continue;
    presets[presetId] = normalizedPreset;
  }

  return {
    schemaVersion: STORE_DESIGN_SCHEMA_VERSION,
    revision: integerValue(raw.revision, 0),
    globals: {
      tokens: objectRecord(globals.tokens),
      header: objectRecord(globals.header),
      footer: objectRecord(globals.footer),
      componentFamilies: objectRecord(globals.componentFamilies) as Record<string, ComponentFamilyStyle>,
    },
    pages,
    seo,
    templates,
    templateBindings,
    sections,
    blocks: objectRecord(raw.blocks) as Record<string, BlockInstance>,
    media: objectRecord(raw.media) as Record<string, MediaAsset>,
    presets,
    redirects,
    publishedAt: raw.publishedAt == null ? null : stringValue(raw.publishedAt, "", 80) || null,
  };
}

export function migrateThemeDocument(input: unknown): ThemeMigrationResult {
  const fromVersion = assertSupportedThemeDocumentVersion(input);
  const document = normalizeThemeDocument(input);
  const notes: string[] = [];

  if (fromVersion === 0) {
    notes.push("Legacy/versionsuz ThemeDocument V2 kayıt modeline normalize edildi.");
  } else if (fromVersion < STORE_DESIGN_SCHEMA_VERSION) {
    notes.push(`ThemeDocument v${fromVersion} → v${STORE_DESIGN_SCHEMA_VERSION} normalize edildi.`);
  }

  const raw = objectRecord(input);
  if (!raw.templateBindings) notes.push("Eksik templateBindings boş registry ile tamamlandı.");
  if (!raw.presets) notes.push("Eksik presets registry boş kayıtla tamamlandı.");
  const legacyConsentSections = Object.values(objectRecord(raw.sections))
    .filter((value) => stringValue(objectRecord(value).type, "", 120) === "consent-banner").length;
  if (legacyConsentSections) {
    notes.push(`${legacyConsentSections} legacy consent-banner section kaydı section tree'den kaldırıldı; consent yalnız global protected hedef olarak tutulur.`);
  }
  const globals = objectRecord(raw.globals);
  if (!globals.componentFamilies) notes.push("Eksik componentFamilies registry tamamlandı.");

  for (const template of Object.values(document.templates)) {
    if (!template.schemaVersion || template.schemaVersion !== STORE_DESIGN_SCHEMA_VERSION) {
      template.schemaVersion = STORE_DESIGN_SCHEMA_VERSION;
    }
  }
  for (const section of Object.values(document.sections)) {
    if (!section.schemaVersion || section.schemaVersion !== STORE_DESIGN_SCHEMA_VERSION) {
      section.schemaVersion = STORE_DESIGN_SCHEMA_VERSION;
    }
  }
  for (const block of Object.values(document.blocks)) {
    if (!block.schemaVersion || block.schemaVersion !== STORE_DESIGN_SCHEMA_VERSION) {
      block.schemaVersion = STORE_DESIGN_SCHEMA_VERSION;
    }
  }
  for (const page of Object.values(document.pages)) {
    if (!page.schemaVersion || page.schemaVersion !== STORE_DESIGN_SCHEMA_VERSION) {
      page.schemaVersion = STORE_DESIGN_SCHEMA_VERSION;
    }
  }

  return {
    document,
    fromVersion,
    toVersion: STORE_DESIGN_SCHEMA_VERSION,
    changed: fromVersion !== STORE_DESIGN_SCHEMA_VERSION || notes.length > 0,
    notes,
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
  REQUEST_READY: "EDITOR_REQUEST_READY",
  SELECT: "EDITOR_SELECT",
  PATCH: "THEME_PATCH",
  PATCH_APPLIED: "PATCH_APPLIED",
  ROUTE_NAVIGATE: "ROUTE_NAVIGATE",
  STRUCTURE_PATCH: "STRUCTURE_PATCH",
  MEDIA_ASSET_READY: "MEDIA_ASSET_READY",
  HEARTBEAT: "HEARTBEAT",
  INTERACTION_MODE: "EDITOR_INTERACTION_MODE",
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
