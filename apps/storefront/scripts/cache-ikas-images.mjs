import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const dataFile = path.join(root, "src", "data", "generated-products.ts");
const publicDir = path.join(root, "public", "products", "ikas");
const manifestFile = path.join(publicDir, "manifest.json");

const CDN_RE = /https:\/\/cdn\.myikas\.com\/images\/[^"'\\\s)]+/g;
const CONCURRENCY = Number(process.env.IKAS_IMAGE_CACHE_CONCURRENCY || 8);
const MAX_RETRIES = Number(process.env.IKAS_IMAGE_CACHE_RETRIES || 3);
const STRICT = process.env.IKAS_IMAGE_CACHE_STRICT === "1";

function extFromUrl(url) {
  const pathname = new URL(url).pathname.toLowerCase();
  const match = pathname.match(/\.(webp|jpg|jpeg|png|avif)(?:$|\?)/);
  return match ? `.${match[1].replace("jpeg", "jpg")}` : ".webp";
}

function fileBaseFromUrl(url) {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  const imageFolder = parts.length >= 2 ? parts[parts.length - 2] : "";
  const safeFolder = imageFolder.replace(/[^a-zA-Z0-9_-]/g, "");
  if (safeFolder && safeFolder.length >= 8) return safeFolder;
  return createHash("sha1").update(url).digest("hex").slice(0, 16);
}

function localPathForUrl(url) {
  return `/products/ikas/${fileBaseFromUrl(url)}${extFromUrl(url)}`;
}

async function existsNonEmpty(filePath) {
  try {
    const info = await stat(filePath);
    return info.isFile() && info.size > 0;
  } catch {
    return false;
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function downloadOne(url) {
  const localPublicPath = localPathForUrl(url);
  const target = path.join(root, "public", localPublicPath);

  if (await existsNonEmpty(target)) {
    return { url, local: localPublicPath, status: "cached" };
  }

  let lastError = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": "Mozilla/5.0 Ruth-Istanbul-Image-Cache/1.0",
          "accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const contentType = response.headers.get("content-type") || "";
      if (contentType && !contentType.toLowerCase().includes("image")) {
        throw new Error(`Beklenmeyen dosya tipi: ${contentType}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      if (!buffer.length) {
        throw new Error("Boş görsel dosyası geldi");
      }

      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, buffer);
      return { url, local: localPublicPath, status: "downloaded", bytes: buffer.length };
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES) await sleep(750 * attempt);
    }
  }

  return { url, local: localPublicPath, status: "failed", error: lastError?.message || String(lastError) };
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;

  async function run() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
      const result = results[index];
      const label = result.status === "failed" ? "HATA" : result.status === "cached" ? "VAR" : "INDI";
      console.log(`[${index + 1}/${items.length}] ${label} ${result.local}`);
      if (result.status === "failed") console.log(`  ↳ ${result.error}`);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function main() {
  await mkdir(publicDir, { recursive: true });

  const original = await readFile(dataFile, "utf8");
  const urls = [...new Set(original.match(CDN_RE) || [])];

  if (!urls.length) {
    console.log("Ikas CDN görsel linki bulunamadı. Dosya zaten yerel olabilir.");
    return;
  }

  console.log(`${urls.length} tekil Ikas görsel linki bulundu.`);
  console.log(`Hedef klasör: public/products/ikas`);

  const results = await mapLimit(urls, CONCURRENCY, downloadOne);
  const successful = results.filter((item) => item.status !== "failed");
  const failed = results.filter((item) => item.status === "failed");

  let updated = original;
  for (const item of successful) {
    updated = updated.split(item.url).join(item.local);
  }
  await writeFile(dataFile, updated, "utf8");

  const manifest = {
    generated_at: new Date().toISOString(),
    total_urls: urls.length,
    successful: successful.length,
    failed: failed.length,
    images: results,
  };
  await writeFile(manifestFile, JSON.stringify(manifest, null, 2), "utf8");

  console.log("\nBitti.");
  console.log(`Indirilen/önceden var olan: ${successful.length}`);
  console.log(`Indirilemeyen: ${failed.length}`);
  console.log("Manifest: public/products/ikas/manifest.json");

  if (failed.length) {
    console.log("\nIndirilemeyen linkler generated-products.ts içinde uzaktan kalır; onları tekrar denemek için komutu yeniden çalıştır.");
    if (STRICT) process.exit(1);
  }
}

main().catch((error) => {
  console.error("Ikas görselleri indirilemedi:", error);
  process.exit(1);
});
