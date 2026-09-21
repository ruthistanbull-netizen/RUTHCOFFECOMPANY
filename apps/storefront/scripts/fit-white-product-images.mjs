import path from "node:path";
import { readdir, readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const imagesDir = path.join(root, "public", "products", "ikas");
const manifestPath = path.join(imagesDir, "fit-white-images-manifest.json");

const TARGET_WIDTH = 1200;
const TARGET_HEIGHT = 1600;
const MAX_PRODUCT_WIDTH = 1040;
const MAX_PRODUCT_HEIGHT = 1360;
const NECKLACE_MAX_WIDTH = 900;
const NECKLACE_MAX_HEIGHT = 1260;
const SAMPLE_SIZE = 260;
const FIT_VERSION = 2;
const FORCE = process.env.FIT_WHITE_IMAGES_FORCE === "1";

async function loadSharp() {
  try {
    const mod = await import("sharp");
    return mod.default || mod;
  } catch {
    console.error("sharp bulunamadı. Önce proje klasöründe şu komutu çalıştır:");
    console.error("pnpm add sharp");
    process.exit(1);
  }
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith("_")) continue;
      files.push(...await walk(full));
    } else if (/\.(webp|png|jpe?g)$/i.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function nearWhite(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return r > 232 && g > 232 && b > 232 && max - min < 28;
}

function shouldCountAsProduct(r, g, b, a) {
  if (a < 180) return false;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max - min;
  const darkEnough = r < 242 || g < 242 || b < 242;
  const coloredEnough = saturation > 14 && max < 252;
  return darkEnough || coloredEnough;
}

function analyze(buffer, width, height) {
  let borderTotal = 0;
  let borderWhite = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let productPixels = 0;

  const border = Math.max(5, Math.round(Math.min(width, height) * 0.07));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const r = buffer[i];
      const g = buffer[i + 1];
      const b = buffer[i + 2];
      const a = buffer[i + 3];

      if (x < border || x >= width - border || y < border || y >= height - border) {
        borderTotal += 1;
        if (nearWhite(r, g, b)) borderWhite += 1;
      }

      if (shouldCountAsProduct(r, g, b, a)) {
        productPixels += 1;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  const borderWhiteRatio = borderTotal ? borderWhite / borderTotal : 0;
  const productRatio = productPixels / (width * height);

  return { borderWhiteRatio, productRatio, minX, minY, maxX, maxY };
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

async function readManifest() {
  if (!existsSync(manifestPath)) return { processed: {} };
  try {
    return JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    return { processed: {} };
  }
}

async function main() {
  if (!existsSync(imagesDir)) {
    console.error("public/products/ikas klasörü bulunamadı.");
    process.exit(1);
  }

  const sharp = await loadSharp();
  const files = await walk(imagesDir);
  const manifest = await readManifest();
  manifest.processed ||= {};

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  await mkdir(imagesDir, { recursive: true });

  for (const file of files) {
    const rel = path.relative(root, file).replaceAll("\\", "/");
    if (!FORCE && manifest.processed[rel]?.version === FIT_VERSION) {
      skipped += 1;
      continue;
    }

    try {
      const image = sharp(file, { failOn: "none" }).rotate();
      const meta = await image.metadata();
      if (!meta.width || !meta.height) {
        skipped += 1;
        continue;
      }

      const sample = await image
        .clone()
        .resize({ width: SAMPLE_SIZE, height: SAMPLE_SIZE, fit: "inside" })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const { width, height } = sample.info;
      const result = analyze(sample.data, width, height);

      // Model/renkli arka planlı görselleri değiştirme. Sadece beyaz ürün çekimleri.
      if (result.borderWhiteRatio < 0.72 || result.productRatio < 0.002 || result.maxX < 0) {
        skipped += 1;
        continue;
      }

      const scaleX = meta.width / width;
      const scaleY = meta.height / height;
      let left = Math.floor(result.minX * scaleX);
      let top = Math.floor(result.minY * scaleY);
      let right = Math.ceil((result.maxX + 1) * scaleX);
      let bottom = Math.ceil((result.maxY + 1) * scaleY);

      const boxW = right - left;
      const boxH = bottom - top;
      const marginX = Math.round(boxW * 0.15);
      const marginY = Math.round(boxH * 0.18);

      left = clamp(left - marginX, 0, meta.width - 1);
      top = clamp(top - marginY, 0, meta.height - 1);
      right = clamp(right + marginX, left + 1, meta.width);
      bottom = clamp(bottom + marginY, top + 1, meta.height);

      const cropW = right - left;
      const cropH = bottom - top;
      const looksLikeNecklace = cropH / Math.max(1, cropW) > 1.45;
      const maxWidth = looksLikeNecklace ? NECKLACE_MAX_WIDTH : MAX_PRODUCT_WIDTH;
      const maxHeight = looksLikeNecklace ? NECKLACE_MAX_HEIGHT : MAX_PRODUCT_HEIGHT;
      const targetCenterY = looksLikeNecklace ? 0.56 : 0.5;

      const output = await image
        .clone()
        .extract({ left, top, width: cropW, height: cropH })
        .resize({
          width: maxWidth,
          height: maxHeight,
          fit: "inside",
          withoutEnlargement: false,
        })
        .extend({
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          background: "#ffffff",
        })
        .toBuffer({ resolveWithObject: true });

      const finalW = output.info.width;
      const finalH = output.info.height;
      const leftPad = Math.round((TARGET_WIDTH - finalW) / 2);
      const topPad = clamp(Math.round(TARGET_HEIGHT * targetCenterY - finalH / 2), 0, TARGET_HEIGHT - finalH);

      const tmpFile = `${file}.tmp-fit.webp`;
      await sharp({
        create: {
          width: TARGET_WIDTH,
          height: TARGET_HEIGHT,
          channels: 4,
          background: "#ffffff",
        },
      })
        .composite([{ input: output.data, left: leftPad, top: topPad }])
        .webp({ quality: 92 })
        .toFile(tmpFile);
      await rename(tmpFile, file);

      manifest.processed[rel] = {
        version: FIT_VERSION,
        processed_at: new Date().toISOString(),
        original_width: meta.width,
        original_height: meta.height,
        border_white_ratio: Number(result.borderWhiteRatio.toFixed(4)),
        product_ratio: Number(result.productRatio.toFixed(4)),
        looks_like_necklace: looksLikeNecklace,
      };
      processed += 1;
      console.log(`DÜZELTILDI ${rel}`);
    } catch (error) {
      failed += 1;
      console.log(`HATA ${rel}: ${error?.message || error}`);
    }
  }

  manifest.generated_at = new Date().toISOString();
  manifest.summary = { processed, skipped, failed, total: files.length };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  console.log("\nBitti.");
  console.log(`Düzeltilen beyaz ürün fotoğrafı: ${processed}`);
  console.log(`Atlanan/model/önceden düzeltilmiş: ${skipped}`);
  console.log(`Hata: ${failed}`);
  console.log("Manifest: public/products/ikas/fit-white-images-manifest.json");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
