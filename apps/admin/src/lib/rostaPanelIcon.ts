import sharp from "sharp";

const cache = new Map<number, Buffer>();

function iconSvg(size: number) {
  const radius = Math.round(size * 0.14);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
    <rect width="512" height="512" rx="${Math.round((radius / size) * 512)}" fill="#111111"/>
    <g transform="translate(91 103) scale(1.03)">
      <path fill="#FBF3E6" fill-rule="evenodd" d="M 142 262.5 L 98.5 262 L 88.5 180 L 87 178.5 L 78.5 179 L 63.5 261 L 62 262.5 L 20.5 262 L 62.5 41 L 68 19.5 L 108 19.5 L 136 25.5 L 150 33.5 L 158.5 42 L 165.5 53 L 169.5 64 L 171.5 76 L 171.5 95 L 164.5 124 L 150.5 148 L 139 159.5 L 129.5 166 L 142.5 257 L 142 262.5 Z M 275 262.5 L 231.5 262 L 220 178.5 L 211.5 179 L 195.5 262 L 152.5 262 L 200 19.5 L 240 19.5 L 260 22.5 L 271 26.5 L 287.5 38 L 296.5 50 L 301.5 62 L 304.5 90 L 302.5 106 L 297.5 123 L 289.5 139 L 280.5 151 L 269 161.5 L 262.5 165 L 275 262.5 Z M 95.5 139 L 103 137.5 L 115.5 129 L 125.5 111 L 128.5 96 L 128.5 80 L 124.5 69 L 117 62.5 L 106 59.5 L 103 59.5 L 101.5 62 L 86.5 137 L 87 139.5 L 95.5 139 Z M 227.5 139 L 238 136.5 L 250.5 126 L 256.5 115 L 260.5 100 L 261.5 83 L 256.5 68 L 247 61.5 L 239 59.5 L 234.5 60 L 219.5 135 L 220 139.5 L 227.5 139 Z"/>
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
