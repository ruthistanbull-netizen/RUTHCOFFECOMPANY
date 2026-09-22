import sharp from "sharp";

export const runtime = "nodejs";

const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#101318"/><circle cx="256" cy="256" r="180" fill="none" stroke="#315efb" stroke-width="8"/><text x="256" y="326" text-anchor="middle" font-family="Georgia,serif" font-size="238" font-weight="700" fill="#ffffff">R</text></svg>`);
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
