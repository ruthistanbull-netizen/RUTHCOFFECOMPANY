import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const productImagePath = fileURLToPath(
  new URL("../src/components/ProductImage.tsx", import.meta.url),
);
const experiencePath = fileURLToPath(
  new URL("../src/components/product/ProductDetailExperience.tsx", import.meta.url),
);

function replaceRequired(source, search, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!source.includes(search)) {
    throw new Error(`Gallery/material patch failed: ${label} pattern was not found.`);
  }
  return source.replace(search, replacement);
}

let productImageSource = await readFile(productImagePath, "utf8");
const originalProductImage = productImageSource;

// ProductImage already uses the reliable eager behavior in current storefront code.
// Only patch the legacy source shape; once the current expression is present,
// subsequent builds must be a no-op rather than failing on an obsolete anchor.
if (!productImageSource.includes("const loadEagerly = priority || eager;")) {
  productImageSource = replaceRequired(
    productImageSource,
    `  // Product galleries used to mark every detail image as eager. On mobile this\n  // decoded the complete gallery before the user requested it. Preserve eager\n  // behavior for cards/thumbs that explicitly need it, while detail galleries\n  // load only their priority image immediately.\n  const loadEagerly = priority || (eager && mode !== "detail");`,
    `  // ProductGallery explicitly marks its image elements as eager. Keep every\n  // real slide visible while the lightweight Image cache controls fetch priority.\n  const loadEagerly = priority || eager;`,
    "reliable detail image loading",
  );
}

if (productImageSource !== originalProductImage) {
  await writeFile(productImagePath, productImageSource, "utf8");
}

let experienceSource = await readFile(experiencePath, "utf8");
const originalExperience = experienceSource;

// The material/care source has changed shape several times during the storefront
// work. Patch the stable semantic anchor instead of depending on an entire block
// of surrounding formatting. This makes the prebuild deterministic and idempotent.
if (!experienceSource.includes("const coatingDetails = cleanLine(product.finish_color);")) {
  const materialLine = `  const materialDetails = cleanLine(\n    product.material || productMaterialDetails(product) || material,\n  );\n`;
  if (!experienceSource.includes(materialLine)) {
    throw new Error("Gallery/material patch failed: material detail resolver was not found.");
  }
  experienceSource = experienceSource.replace(
    materialLine,
    `${materialLine}  const coatingDetails = cleanLine(product.finish_color);\n`,
  );
}

if (!experienceSource.includes("...(coatingDetails ? [\"\", \"KAPLAMA\", coatingDetails] : []),")) {
  const oldMaterialContent = `        materialDetails || "Ürün materyal ve kaplama bilgileri ürün bazında değişebilir.",\n        "",\n        "BAKIM",`;
  const currentMaterialContent = `        materialDetails || "Ürün materyal bilgisi ürün bazında değişebilir.",\n        ...(coatingDetails ? ["", "KAPLAMA", coatingDetails] : []),\n        "",\n        "BAKIM",`;

  if (experienceSource.includes(oldMaterialContent)) {
    experienceSource = experienceSource.replace(oldMaterialContent, currentMaterialContent);
  } else if (!experienceSource.includes("KAPLAMA") || !experienceSource.includes("coatingDetails")) {
    throw new Error("Gallery/material patch failed: material detail content anchor was not found.");
  }
}

if (experienceSource !== originalExperience) {
  await writeFile(experiencePath, experienceSource, "utf8");
}

console.log("Kept product media loading stable and added the exact coating field.");
