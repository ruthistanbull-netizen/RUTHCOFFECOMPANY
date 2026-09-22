import sharp from "sharp";

export const runtime = "nodejs";

const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192"><rect width="192" height="192" rx="42" fill="#101318"/><circle cx="96" cy="96" r="67" fill="none" stroke="#315efb" stroke-width="3"/><text x="96" y="122" text-anchor="middle" font-family="Georgia,serif" font-size="88" font-weight="700" fill="#ffffff">R</text></svg>`);
let cachedPng: ArrayBuffer | null = null;

function toArrayBuffer(value: Uint8Array) {
  const output = new ArrayBuffer(value.byteLength);
  new Uint8Array(output).set(value);
  return output;
}

export async function GET() {
  if (!cachedPng) cachedPng = toArrayBuffer(await sharp(svg).png().toBuffer());
  return new Response(cachedPng, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
