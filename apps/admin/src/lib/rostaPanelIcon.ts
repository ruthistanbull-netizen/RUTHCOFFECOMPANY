import sharp from "sharp";

const cache = new Map<number, Buffer>();

function iconSvg(size: number) {
  const radius = Math.round(size * 0.14);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
    <rect width="512" height="512" rx="${Math.round((radius / size) * 512)}" fill="#FBF3E6"/>
    <g transform="rotate(-18 256 256)">
      <path fill="#111111" d="M261 49C163 47 84 123 75 223c-10 116 62 215 165 238 102 23 199-38 215-148 15-98-33-195-118-242-23-13-49-21-76-22Z"/>
      <path fill="none" stroke="#FBF3E6" stroke-width="34" stroke-linecap="round" d="M332 80c-49 44-71 91-63 145 7 56 4 113-67 201"/>
    </g>
  </svg>`;
}

export async function renderRostaPanelIcon(size: number) {
  const cached = cache.get(size);
  if (cached) return cached;
  const png = await sharp(Buffer.from(iconSvg(size))).png({ compressionLevel: 9 }).toBuffer();
  cache.set(size, png);
  return png;
}
