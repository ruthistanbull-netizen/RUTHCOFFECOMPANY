import chunk0 from "./chunk0";
import chunk1 from "./chunk1";
import chunk2 from "./chunk2";
import chunk3 from "./chunk3";
import chunk4 from "./chunk4";
import chunk5 from "./chunk5";

export const runtime = "nodejs";
export const revalidate = 31536000;

const image = Buffer.from(
  `${chunk0}${chunk1}${chunk2}${chunk3}${chunk4}${chunk5}`,
  "base64",
);

export async function GET() {
  return new Response(image, {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Length": String(image.byteLength),
    },
  });
}
