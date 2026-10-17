import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createPhotoAsset, defaultPhotoEdits, normalizedPhotoCrop, photoAssetFolder, readPhotoAsset } from "../src/lib/productPhotoAssets";
import { PRODUCT_IMAGE_MAX_BYTES, transformProductImage } from "../src/lib/productImagePipeline";

function memoryStorage(failAt = -1, origin = "https://media.example.test") {
  const files = new Map<string, Buffer>();
  let uploads = 0;
  const storage = { from: (bucket: string) => ({
    getPublicUrl: (path: string) => ({ data: { publicUrl: `${origin}/storage/v1/object/public/${bucket}/${path}` } }),
    upload: async (path: string, bytes: Buffer, options: { upsert: boolean }) => {
      assert.equal(options.upsert, false);
      if (uploads++ === failAt) return { error: { message: "Storage unavailable" } };
      assert.equal(files.has(path), false);
      files.set(path, Buffer.from(bytes)); return { error: null };
    },
    download: async (path: string) => ({ data: files.has(path) ? new Blob([new Uint8Array(files.get(path)!)]) : null, error: null }),
    remove: async (paths: string[]) => { paths.forEach((path) => files.delete(path)); return { error: null }; },
  }) };
  return { store: { storage } as unknown as Pick<SupabaseClient, "storage">, files };
}

async function splitPhoto() {
  const raw = Buffer.alloc(600 * 600 * 3);
  for (let y = 0; y < 600; y++) for (let x = 0; x < 600; x++) {
    raw[(y * 600 + x) * 3 + (x < 300 ? 0 : 2)] = 240;
  }
  return sharp(raw, { raw: { width: 600, height: 600, channels: 3 } }).png().toBuffer();
}

test("square originals produce independent web/app crops; reopening preserves the uncut source", async () => {
  const source = await splitPhoto();
  const { store, files } = memoryStorage();
  const edits = defaultPhotoEdits();
  edits.website = { focalX: 0, focalY: 0.5, zoom: 2 };
  edits.application = { focalX: 1, focalY: 0.5, zoom: 2 };
  const asset = await createPhotoAsset(store, source, edits);
  const folder = photoAssetFolder(store, asset.url)!;
  assert.ok(folder);
  assert.deepEqual(files.get(folder + "/original"), source);
  const web = files.get(folder + "/website.webp")!;
  const app = files.get(folder + "/application.webp")!;
  const webInfo = await sharp(web).metadata(), appInfo = await sharp(app).metadata();
  assert.deepEqual([webInfo.width, webInfo.height], [1200, 1600]);
  assert.deepEqual([appInfo.width, appInfo.height], [1200, 1800]);
  const webStats = await sharp(web).stats(), appStats = await sharp(app).stats();
  assert.ok(webStats.channels[0].mean > 230 && webStats.channels[2].mean < 5);
  assert.ok(appStats.channels[2].mean > 230 && appStats.channels[0].mean < 5);

  const reopened = await readPhotoAsset(store, asset.url);
  assert.equal(reopened.originalURL, asset.originalURL);
  assert.equal(reopened.edits.application.focalX, 1);
  const updated = await createPhotoAsset(store, source, { ...reopened.edits,
    website: { ...reopened.edits.website, zoom: 3 } });
  const nextFolder = photoAssetFolder(store, updated.url)!;
  assert.notEqual(nextFolder, folder);
  assert.deepEqual(files.get(nextFolder + "/application.webp"), app);
  assert.deepEqual(files.get(folder + "/website.webp"), web);
  assert.deepEqual(files.get(nextFolder + "/original"), source);
});

test("failed multi-file upload removes partial assets and never returns a gallery URL", async () => {
  const { store, files } = memoryStorage(2);
  await assert.rejects(createPhotoAsset(store, await splitPhoto(), defaultPhotoEdits()), /Storage unavailable/);
  assert.equal(files.size, 0);
});

test("legacy URLs remain editable; a different origin/bucket cannot masquerade as this asset family", async () => {
  const { store } = memoryStorage();
  const old = await readPhotoAsset(store, "https://legacy.example.test/photo.jpg");
  assert.equal(old.folder, null);
  assert.deepEqual(old.edits, defaultPhotoEdits());
  assert.equal(photoAssetFolder(store, "https://foreign.example.test/products/crops-v1/11111111-1111-1111-1111-111111111111/website.webp"), null);
  assert.equal(photoAssetFolder(store, "https://media.example.test/storage/v1/object/public/another-bucket/products/crops-v1/11111111-1111-1111-1111-111111111111/website.webp"), null);
});

test("EXIF orientation is applied before crop dimensions; rotated mirrors match preview order", async () => {
  const source = await sharp({ create: { width: 800, height: 500, channels: 3, background: "red" } })
    .jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const oriented = await transformProductImage(source);
  assert.deepEqual([oriented.originalWidth, oriented.originalHeight], [500, 800]);
  const split = await splitPhoto();
  const result = await transformProductImage(split, { rotation: 90, flipX: true });
  const expected = await sharp(await sharp(split).rotate(90).png().toBuffer()).flop()
    .extract({ left: 75, top: 0, width: 450, height: 600 }).resize(1200, 1600).raw().toBuffer();
  const actual = await sharp(result.buffer).raw().toBuffer();
  // Compare points away from the split/encoding boundary.
  for (const y of [200, 1400]) {
    const offset = (y * 1200 + 600) * 3;
    for (let c = 0; c < 3; c++) assert.ok(Math.abs(actual[offset + c] - expected[offset + c]) < 5);
  }
});

test("crop edges stay within the source and invalid/oversize inputs are rejected before upload", async () => {
  const source = await splitPhoto();
  for (const target of ["website", "application"] as const) {
    for (const focal of [0, 1]) {
      const result = await transformProductImage(source, { target, focalX: focal, focalY: focal, zoom: 4 });
      assert.ok(result.crop.left >= 0 && result.crop.left + result.crop.width <= 600);
      assert.ok(result.crop.top >= 0 && result.crop.top + result.crop.height <= 600);
    }
  }
  assert.throws(() => normalizedPhotoCrop({ zoom: NaN }), /geçersiz/);
  await assert.rejects(transformProductImage(source, { focalX: Infinity }), /geçersiz/);
  const { store, files } = memoryStorage();
  await assert.rejects(createPhotoAsset(store, Buffer.alloc(PRODUCT_IMAGE_MAX_BYTES + 1), defaultPhotoEdits()), /24 MB/);
  assert.equal(files.size, 0);
});

test("AVIF originals are recognized and canonical self-host media URLs reopen", async () => {
  const { store, files } = memoryStorage(-1, "https://rosta-supabase.tail178b60.ts.net");
  const source = await sharp({ create: { width: 64, height: 64, channels: 3, background: "blue" } }).avif().toBuffer();
  const asset = await createPhotoAsset(store, source, defaultPhotoEdits());
  const folder = photoAssetFolder(store, asset.url);
  assert.ok(folder);
  assert.deepEqual(files.get(folder + "/original"), source);
  assert.equal((await readPhotoAsset(store, asset.url)).originalURL, asset.originalURL);
});
