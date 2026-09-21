import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sourceCandidates() {
  const roots = [
    process.cwd(),
    path.join(process.cwd(), "apps", "storefront"),
  ];

  const files = [
    "rosta-hero.webp",
    "rosta-hero-current.webp",
  ];

  return roots.flatMap((root) =>
    files.map((file) => path.join(root, "public", "home", file)),
  );
}

async function renderHero() {
  let lastError: unknown;

  for (const candidate of sourceCandidates()) {
    try {
      const source = await readFile(candidate);
      return await sharp(source)
        .resize(1920, 1080, {
          fit: "cover",
          position: "centre",
          kernel: sharp.kernel.lanczos3,
          withoutEnlargement: false,
        })
        .sharpen({ sigma: 0.8, m1: 1.05, m2: 2.1 })
        .webp({ quality: 95, smartSubsample: true })
        .toBuffer();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("Rosta hero source not found");
}

export async function GET() {
  try {
    const image = await renderHero();

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
