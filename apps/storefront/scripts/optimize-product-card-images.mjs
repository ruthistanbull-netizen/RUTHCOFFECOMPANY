import path from "node:path";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const sourceDir = path.join(root, "public", "products", "ikas");
const detailDir = path.join(root, "public", "products", "ikas-detail");
const cardDir = path.join(root, "public", "products", "ikas-card");
const thumbDir = path.join(root, "public", "products", "ikas-thumb");
const manifestFile = path.join(cardDir, "manifest.json");
const VERSION = 11;
const FORCE = process.env.OPTIMIZE_PRODUCT_IMAGES_FORCE === "1";

const OUTPUTS = {
  detail: { dir: detailDir, width: 1200, height: 1600, quality: 86, fit: "contain" },
  card: { dir: cardDir, width: 900, height: 1200, quality: 84, fit: "cover" },
  thumb: { dir: thumbDir, width: 300, height: 400, quality: 78, fit: "cover" },
};

async function loadSharp() {
  try {
    const mod = await import("sharp");
    return mod.default || mod;
  } catch {
    console.error("sharp bulunamadı. Önce proje klasöründe pnpm install çalıştır.");
    process.exit(1);
  }
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith("ikas-card") || entry.name.startsWith("ikas-thumb") || entry.name.startsWith("ikas-detail")) continue;
      files.push(...await walk(full));
    } else if (/\.(webp|png|jpe?g)$/i.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

async function readManifest() {
  if (!existsSync(manifestFile)) return { processed: {} };
  try {
    return JSON.parse(await readFile(manifestFile, "utf8"));
  } catch {
    return { processed: {} };
  }
}

async function renderVariant(sharp, file, outputPath, { width, height, quality, fit }) {
  await sharp(file, { failOn: "none" })
    .rotate()
    .resize({
      width,
      height,
      fit,
      position: "centre",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      withoutEnlargement: fit === "contain",
    })
    .webp({ quality })
    .toFile(outputPath);
}

async function main() {
  if (!existsSync(sourceDir)) {
    console.error("public/products/ikas klasörü yok. Önce pnpm run cache:ikas-images çalıştır.");
    process.exit(1);
  }

  const sharp = await loadSharp();
  await mkdir(detailDir, { recursive: true });
  await mkdir(cardDir, { recursive: true });
  await mkdir(thumbDir, { recursive: true });

  const manifest = await readManifest();
  manifest.processed ||= {};

  const files = await walk(sourceDir);
  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of files) {
    const rel = path.relative(sourceDir, file).replaceAll("\\", "/");
    const outputName = path.basename(file).replace(/\.(png|jpe?g|webp)$/i, ".webp");

    const detailPath = path.join(detailDir, outputName);
    const cardPath = path.join(cardDir, outputName);
    const thumbPath = path.join(thumbDir, outputName);

    if (
      !FORCE &&
      manifest.processed[rel]?.version === VERSION &&
      existsSync(detailPath) &&
      existsSync(cardPath) &&
      existsSync(thumbPath)
    ) {
      skipped += 1;
      continue;
    }

    try {
      await renderVariant(sharp, file, detailPath, OUTPUTS.detail);
      await renderVariant(sharp, file, cardPath, OUTPUTS.card);
      await renderVariant(sharp, file, thumbPath, OUTPUTS.thumb);

      manifest.processed[rel] = {
        version: VERSION,
        processed_at: new Date().toISOString(),
        fit_by_output: {
          detail: OUTPUTS.detail.fit,
          card: OUTPUTS.card.fit,
          thumb: OUTPUTS.thumb.fit,
        },
        outputs: {
          detail: { width: OUTPUTS.detail.width, height: OUTPUTS.detail.height },
          card: { width: OUTPUTS.card.width, height: OUTPUTS.card.height },
          thumb: { width: OUTPUTS.thumb.width, height: OUTPUTS.thumb.height },
        },
      };

      processed += 1;
      console.log(`HAZIR ${outputName}`);
    } catch (error) {
      failed += 1;
      console.log(`HATA ${rel}: ${error?.message || error}`);
    }
  }

  manifest.generated_at = new Date().toISOString();
  manifest.summary = { total: files.length, processed, skipped, failed };
  await writeFile(manifestFile, JSON.stringify(manifest, null, 2), "utf8");

  console.log("\nBitti.");
  console.log(`Hazırlanan: ${processed}`);
  console.log(`Atlanan: ${skipped}`);
  console.log(`Hata: ${failed}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});