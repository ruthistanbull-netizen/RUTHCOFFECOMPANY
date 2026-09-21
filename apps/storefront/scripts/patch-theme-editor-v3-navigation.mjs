import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(here, "../src/components/theme/ThemeEditorBridgeV3.tsx");
let source = fs.readFileSync(target, "utf8");

const before = 'window.location.assign(`${url.pathname}${url.search}${url.hash}`);';
const after = 'url.searchParams.set("themeEditor", "1");\n        url.searchParams.set("themePreview", String(Date.now()));\n        window.location.assign(`${url.pathname}?${url.searchParams.toString()}${url.hash}`);';
if (source.includes(before)) source = source.replace(before, after);

source = source.replace(
  'function isPlainTextElement(element: Element) {\n  if (kindFor(element) === "image") return false;',
  'function isPlainTextElement(element: Element) {\n  if (!(element.textContent || "").trim()) return false;\n  if (kindFor(element) === "image") return false;',
);

fs.writeFileSync(target, source);
console.log("Theme editor preview navigation prepared.");
