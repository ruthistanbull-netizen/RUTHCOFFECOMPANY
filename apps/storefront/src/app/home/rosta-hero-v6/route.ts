import { ROSTA_HERO_AVIF_BASE64 } from "@/lib/rostaHeroAvif";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const heroBytes = Buffer.from(ROSTA_HERO_AVIF_BASE64, "base64");

export async function GET() {
  return new Response(new Uint8Array(heroBytes), {
    status: 200,
    headers: {
      "Content-Type": "image/avif",
      "Content-Length": String(heroBytes.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
