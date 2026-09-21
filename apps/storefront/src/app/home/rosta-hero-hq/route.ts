import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function sourceBuffer() {
  const candidates = [
    path.join(process.cwd(), "public", "home", "rosta-hero-current.webp"),
    path.join(process.cwd(), "apps", "storefront", "public", "home", "rosta-hero-current.webp"),
  ];

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return await readFile(candidate);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("Rosta hero source not found");
}

export async function GET() {
  try {
    const source = await sourceBuffer();
    const image = await sharp(source)
      .resize(1920, 1080, {
        fit: "cover",
        position: "centre",
        kernel: sharp.kernel.lanczos3,
        withoutEnlargement: false,
      })
      .sharpen({ sigma: 0.85, m1: 1.05, m2: 2.2 })
      .webp({ quality: 94, smartSubsample: true })
      .toBuffer();

    return new Response(new Uint8Array(image), {
      status: 200,
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
