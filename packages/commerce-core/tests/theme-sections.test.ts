import assert from "node:assert/strict";
import test from "node:test";
import {
  createThemeSection,
  normalizeThemeSectionSettings,
  themeSectionPage,
  themeSectionRenderSignature,
} from "../src/theme-sections.ts";

test("editable section fields survive normalization while colors stay in the ROSTA palette", () => {
  const settings = normalizeThemeSectionSettings({ pages: { "/": {
    path: "/",
    label: "Ana Sayfa",
    sections: [{
      id: "complete-section",
      type: "product-slider",
      enabled: false,
      title: "Başlık",
      eyebrow: "Üst başlık",
      body: "Açıklama",
      linkLabel: "İncele",
      linkHref: "/products",
      imageSrc: "https://example.com/banner.webp",
      productSource: "collection",
      productSourceId: "collection-id",
      productLimit: 17,
      desktopItems: 6,
      mobileItems: 2,
      desktopHeight: 640,
      mobileHeight: 420,
      gap: 18,
      paddingY: 72,
      borderRadius: 24,
      backgroundColor: "#F4F0E8",
      textColor: "#111111",
      autoplay: true,
      showArrows: false,
    }],
  } } });
  const [section] = themeSectionPage(settings, "/").sections;

  assert.deepEqual(section, {
    id: "complete-section", type: "product-slider", enabled: false,
    title: "Başlık", eyebrow: "Üst başlık", body: "Açıklama",
    linkLabel: "İncele", linkHref: "/products", imageSrc: "https://example.com/banner.webp",
    productSource: "collection", productSourceId: "collection-id", productLimit: 17,
    desktopItems: 6, mobileItems: 2, desktopHeight: 640, mobileHeight: 420,
    gap: 18, paddingY: 72, borderRadius: 24,
    backgroundColor: "#FBF3E6", textColor: "#111111", autoplay: true, showArrows: false,
  });
});

test("section color normalizer migrates legacy colors and rejects arbitrary hex", () => {
  const settings = normalizeThemeSectionSettings({ pages: { "/": {
    path: "/", label: "Ana Sayfa", sections: [
      { id: "legacy", type: "rich-text", enabled: true, backgroundColor: "#F4F0E8", textColor: "#B9563D" },
      { id: "invalid", type: "rich-text", enabled: true, backgroundColor: "#123456", textColor: "#abcdef" },
    ],
  } } });

  const [legacy, invalid] = themeSectionPage(settings, "/").sections;
  assert.equal(legacy.backgroundColor, "#FBF3E6");
  assert.equal(legacy.textColor, "#C94A40");
  assert.equal(invalid.backgroundColor, undefined);
  assert.equal(invalid.textColor, undefined);
});

test("editable text and links can be explicitly cleared", () => {
  const settings = normalizeThemeSectionSettings({ pages: { "/": {
    path: "/", label: "Ana Sayfa", sections: [{
      id: "copy", type: "rich-text", enabled: true,
      title: "", eyebrow: "", body: "", linkLabel: "", linkHref: "",
    }],
  } } });
  const [section] = themeSectionPage(settings, "/").sections;

  assert.equal(section.title, "");
  assert.equal(section.eyebrow, "");
  assert.equal(section.body, "");
  assert.equal(section.linkLabel, "");
  assert.equal(section.linkHref, "");
});

test("render signature reloads only for structural and product-data changes", () => {
  const base = normalizeThemeSectionSettings({ pages: { "/": {
    path: "/", label: "Ana Sayfa", sections: [{
      id: "slider", type: "product-slider", enabled: true,
      title: "Ürünler", backgroundColor: "#FBF3E6", desktopItems: 4,
      productSource: "featured", productLimit: 12, showArrows: true,
    }],
  } } });
  const visualEdit = normalizeThemeSectionSettings({ pages: { "/": {
    ...base.pages["/"], sections: [{ ...base.pages["/"].sections[0], title: "Yeni Ürünler", backgroundColor: "#242424", desktopItems: 6 }],
  } } });
  const productEdit = normalizeThemeSectionSettings({ pages: { "/": {
    ...visualEdit.pages["/"], sections: [{ ...visualEdit.pages["/"].sections[0], productLimit: 20 }],
  } } });

  assert.equal(themeSectionRenderSignature(base), themeSectionRenderSignature(visualEdit));
  assert.notEqual(themeSectionRenderSignature(visualEdit), themeSectionRenderSignature(productEdit));
});

test("new section defaults expose every supported editor section", () => {
  assert.equal(createThemeSection("product-slider", "products").showArrows, true);
  assert.equal(createThemeSection("image-banner", "banner").desktopHeight, 520);
  assert.equal(createThemeSection("rich-text", "copy").body, "Metninizi buraya ekleyin.");
});
