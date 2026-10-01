import test from "node:test";
import assert from "node:assert/strict";
import { analyzeThemeDocumentReferences, createEmptyThemeDocument, validateThemeDocument } from "../src/store-design-v2.ts";

test("existing homepage sections and semantic media/text edits publish without false warnings", () => {
  const document = createEmptyThemeDocument();
  document.templates.home = { id: "home", label: "Ana Sayfa", compatibility: ["home"], sectionIds: ["trust", "collections"], componentSettings: {}, schemaVersion: 2 };
  for (const type of ["trust", "collections"]) {
    document.sections[type] = { id: type, type, enabled: true, settings: {}, blockIds: [], schemaVersion: 2 };
  }
  // Original semantic component edits are stored outside template section lists.
  for (const [index, type] of ["image", "image", "text", "text", "text", "text"].entries()) {
    const id = `home-hero::auto::${index}`;
    document.sections[id] = { id, type, enabled: true, settings: { semantic: { [`section:${id}`]: { desktop: { visible: true } } } }, blockIds: [], schemaVersion: 2 };
  }
  const before = structuredClone(document);
  assert.deepEqual(analyzeThemeDocumentReferences(document), []);
  assert.deepEqual(validateThemeDocument(document), { ok: true, errors: [] });
  assert.deepEqual(document, before, "validation must preserve the layout and saved edits");
});

test("semantic settings do not hide an unsupported renderable section", () => {
  const document = createEmptyThemeDocument();
  document.sections.photo = { id: "photo", type: "image", enabled: true, settings: { semantic: { photo: { desktop: {} } } }, blockIds: [], schemaVersion: 2 };
  document.templates.home = { id: "home", label: "Ana Sayfa", compatibility: ["home"], sectionIds: ["photo"], componentSettings: {}, schemaVersion: 2 };
  assert.ok(analyzeThemeDocumentReferences(document).some((issue) => issue.code === "unknown-section-definition"));
});

test("semantic owners still validate missing media references", () => {
  const document = createEmptyThemeDocument();
  document.sections.photo = { id: "photo", type: "image", enabled: true, settings: { semantic: { photo: { desktop: { imageAssetId: "missing" } } } }, blockIds: [], schemaVersion: 2 };
  assert.ok(analyzeThemeDocumentReferences(document).some((issue) => issue.code === "missing-media-reference"));
  assert.equal(validateThemeDocument(document).ok, false);
});

test("unknown types and unavailable runtimes remain visible in publish checks", () => {
  const document = createEmptyThemeDocument();
  document.sections.unknown = { id: "unknown", type: "unsupported", enabled: true, settings: { semantic: { unknown: { desktop: {} } } }, blockIds: [], schemaVersion: 2 };
  document.sections.embed = { id: "embed", type: "developer-embed", enabled: true, settings: {}, blockIds: [], schemaVersion: 2 };
  const issues = analyzeThemeDocumentReferences(document);
  assert.ok(issues.some((issue) => issue.code === "unknown-section-definition" && issue.source === "unknown"));
  assert.ok(issues.some((issue) => issue.code === "section-runtime-unavailable" && issue.severity === "error"));
  assert.equal(validateThemeDocument(document).ok, false);
});
