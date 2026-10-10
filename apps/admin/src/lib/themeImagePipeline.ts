import sharp from "sharp";

/** Keep the editor's crop/focal point independent from upload compression. */
export async function transformThemeImage(input: Uint8Array) {
  return sharp(input, { failOn: "error", limitInputPixels: 80_000_000 })
    .rotate()
    .toColorspace("srgb")
    .resize({ width: 2560, height: 2560, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 90, effort: 4 })
    .toBuffer();
}
