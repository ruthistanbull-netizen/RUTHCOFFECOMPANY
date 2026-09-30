import test from "node:test";
import assert from "node:assert/strict";
import { normalizeInformationSections, normalizeProductInformation } from "../src/product-information.ts";

test("four information sections remain fixed and variant/package fields are excluded", () => {
  const sections = normalizeInformationSections([{ id: "material", fields: [{ id: "roast", label: "Kavrum Profili", options: [{ id: "medium", label: "Orta", value: "Dengeli gövde" }] }] }, { id: "size-usage", fields: [{ id: "size_usage", label: "Paket gramajı", options: [] }] }, { id: "variants", fields: [] }]);
  assert.deepEqual(sections.map(section => section.title), ["Açıklama", "Ürün Bilgisi", "Paket / Kullanım", "Kargo ve İade"]);
  assert.equal(sections[1].fields[0].options[0].value, "Dengeli gövde");
  assert.equal(sections[2].fields.length, 0);
});
test("product selections preserve multiline copy, reject duplicate or unknown fields and omit package gramaj", () => {
  const row = { section: "material", field: "tasting", label: "Tadım Notları", value: "Kakao\nKiraz" };
  const result = normalizeProductInformation([row, row, { ...row, section: "variants" }, { ...row, field: "size_usage" }, { ...row, field: "empty", value: "" }]);
  assert.deepEqual(result, [row]);
});
