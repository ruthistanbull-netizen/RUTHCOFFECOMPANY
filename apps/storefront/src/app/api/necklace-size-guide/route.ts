import { necklaceSizeGuideChunk0 } from "@/lib/necklace-size-guide-chunk-0";
import { necklaceSizeGuideChunk1 } from "@/lib/necklace-size-guide-chunk-1";
import { necklaceSizeGuideChunk2 } from "@/lib/necklace-size-guide-chunk-2";
import { necklaceSizeGuideChunk3 } from "@/lib/necklace-size-guide-chunk-3";

export const runtime = "nodejs";
export const dynamic = "force-static";

const image = Buffer.from(
  necklaceSizeGuideChunk0
    + necklaceSizeGuideChunk1
    + necklaceSizeGuideChunk2
    + necklaceSizeGuideChunk3,
  "base64",
);

export function GET() {
  return new Response(image, {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(image.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Disposition": "inline; filename=necklace-size-guide.jpg",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
