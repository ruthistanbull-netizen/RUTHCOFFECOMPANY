import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultThemeCustomizerSettings,
  mergeThemeDeviceStyle,
  normalizeThemeCustomizerSettings,
  removeThemeElementOverride,
  resolveThemeElementOverrides,
  themePage,
  themePageKey,
  upsertThemeElementOverride,
} from "../src/theme-engine.ts";

test("themePageKey normalizes paths", () => {
  assert.equal(themePageKey("products/test/?x=1"), "/products/test");
  assert.equal(themePageKey("/"), "/");
});

test("normalizer keeps editor overrides and clamps unsafe values", () => {
  const settings = normalizeThemeCustomizerSettings({
    ...defaultThemeCustomizerSettings,
    editor: {
      pages: {
        "/": {
          overrides: [{
            id: "hero",
            selector: "[data-theme-id=hero]",
            label: "Hero",
            kind: "image",
            desktop: { width: 99999, opacity: 4, objectPositionX: -20 },
            mobile: { height: 620, heightUnit: "px" },
          }],
        },
      },
    },
  });

  const override = themePage(settings, "/").overrides[0];
  assert.equal(override.desktop?.width, 5000);
  assert.equal(override.desktop?.opacity, 1);
  assert.equal(override.desktop?.objectPositionX, 0);
  assert.equal(override.desktop?.textAlign, undefined);
  assert.equal(override.desktop?.objectFit, undefined);
  assert.equal(override.mobile?.height, 620);
});

test("link overrides keep safe contact protocols", () => {
  const email = upsertThemeElementOverride(defaultThemeCustomizerSettings, "/contact", {
    id: "email",
    selector: "[data-theme-id=email]",
    label: "E-posta",
    kind: "link",
    href: "mailto:hello@ruthistanbul.com",
  });
  assert.equal(themePage(email, "/contact").overrides[0].href, "mailto:hello@ruthistanbul.com");

  const phone = upsertThemeElementOverride(defaultThemeCustomizerSettings, "/contact", {
    id: "phone",
    selector: "[data-theme-id=phone]",
    label: "Telefon",
    kind: "link",
    href: "tel:+908503469789",
  });
  assert.equal(themePage(phone, "/contact").overrides[0].href, "tel:+908503469789");
});

test("upsert and remove page element overrides", () => {
  const added = upsertThemeElementOverride(defaultThemeCustomizerSettings, "/contact", {
    id: "title",
    selector: "[data-theme-id=title]",
    label: "Başlık",
    kind: "text",
    text: "İletişim",
    desktop: { fontSize: 42 },
    mobile: { fontSize: 30 },
  });

  assert.equal(themePage(added, "/contact").overrides.length, 1);
  assert.equal(themePage(added, "/contact").overrides[0].mobile?.fontSize, 30);

  const updated = upsertThemeElementOverride(added, "/contact", {
    ...themePage(added, "/contact").overrides[0],
    text: "Bize Ulaşın",
  });
  assert.equal(themePage(updated, "/contact").overrides[0].text, "Bize Ulaşın");

  const removed = removeThemeElementOverride(updated, "/contact", "title");
  assert.equal(themePage(removed, "/contact").overrides.length, 0);
});

test("all editable visual fields survive normalization", () => {
  const settings = normalizeThemeCustomizerSettings({
    ...defaultThemeCustomizerSettings,
    editor: { pages: { "/": { overrides: [{
      id: "everything",
      selector: "[data-theme-id=everything]",
      label: "Her alan",
      tag: "a",
      kind: "link",
      hidden: false,
      text: "Yeni metin",
      imageSrc: "https://example.com/image.webp",
      href: "/products",
      desktop: {
        width: 420, widthUnit: "px", height: 240, heightUnit: "px",
        maxWidth: 90, maxWidthUnit: "%", minHeight: 30, minHeightUnit: "vh",
        fontSize: 28, lineHeight: 1.4, letterSpacing: 1.5,
        paddingX: 24, paddingY: 16, marginTop: -12, marginBottom: 32, gap: 18,
        borderRadius: 20, opacity: 0.85, textAlign: "center", objectFit: "contain",
        objectPositionX: 25, objectPositionY: 75,
        color: "#112233", backgroundColor: "#fefefe",
      },
      mobile: { width: 88, widthUnit: "%", fontSize: 18, paddingX: 12 },
    }] } } },
  });
  const override = themePage(settings, "/").overrides[0];

  assert.equal(override.hidden, false);
  assert.equal(override.text, "Yeni metin");
  assert.equal(override.imageSrc, "https://example.com/image.webp");
  assert.equal(override.href, "/products");
  assert.deepEqual(override.desktop, {
    width: 420, widthUnit: "px", height: 240, heightUnit: "px",
    maxWidth: 90, maxWidthUnit: "%", minHeight: 30, minHeightUnit: "vh",
    fontSize: 28, lineHeight: 1.4, letterSpacing: 1.5,
    paddingX: 24, paddingY: 16, marginTop: -12, marginBottom: 32, gap: 18,
    borderRadius: 20, opacity: 0.85, textAlign: "center", objectFit: "contain",
    objectPositionX: 25, objectPositionY: 75,
    color: "#112233", backgroundColor: "#fefefe",
  });
  assert.equal(override.mobile?.width, 88);
  assert.equal(override.mobile?.widthUnit, "%");
  assert.equal(override.mobile?.fontSize, 18);
  assert.equal(override.mobile?.paddingX, 12);
});

test("mobile sparse styles inherit desktop values instead of clearing them", () => {
  const settings = normalizeThemeCustomizerSettings({
    ...defaultThemeCustomizerSettings,
    editor: { pages: { "/": { overrides: [{
      id: "title", selector: "[data-theme-id=title]", label: "Başlık", kind: "text",
      desktop: { width: 80, widthUnit: "%", fontSize: 40, color: "#112233" },
      mobile: { fontSize: 22 },
    }] } } },
  });
  const override = themePage(settings, "/").overrides[0];
  const mobile = mergeThemeDeviceStyle(override.desktop, override.mobile);

  assert.equal(mobile.width, 80);
  assert.equal(mobile.widthUnit, "%");
  assert.equal(mobile.color, "#112233");
  assert.equal(mobile.fontSize, 22);
});

test("global, template and exact page overrides use one lossless precedence rule", () => {
  const settings = normalizeThemeCustomizerSettings({
    ...defaultThemeCustomizerSettings,
    editor: { pages: {
      "/__global__": { overrides: [{
        id: "shared", selector: "[data-theme-id=shared]", label: "Ortak", kind: "text",
        hidden: true, desktop: { width: 70, widthUnit: "%", color: "#112233" },
      }] },
      "/products/[slug]": { overrides: [{
        id: "shared", selector: "[data-theme-id=shared]", label: "Şablon", kind: "text",
        text: "Şablon metni", desktop: { fontSize: 36 },
      }] },
      "/products/test": { overrides: [{
        id: "shared", selector: "[data-theme-id=shared]", label: "Ürün", kind: "text",
        hidden: false, mobile: { fontSize: 20 },
      }] },
    } },
  });

  const [resolved] = resolveThemeElementOverrides(settings, "/products/test");
  assert.equal(resolved.hidden, false);
  assert.equal(resolved.text, "Şablon metni");
  assert.equal(resolved.desktop?.width, 70);
  assert.equal(resolved.desktop?.widthUnit, "%");
  assert.equal(resolved.desktop?.fontSize, 36);
  assert.equal(resolved.mobile?.fontSize, 20);
});
