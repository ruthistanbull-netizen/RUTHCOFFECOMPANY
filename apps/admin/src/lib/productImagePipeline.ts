import sharp from "sharp";

export const PRODUCT_IMAGE_WIDTH = 1200;
export const PRODUCT_IMAGE_HEIGHT = 1600;
export const PRODUCT_IMAGE_MAX_BYTES = 24 * 1024 * 1024;

export type ProductImageTransform = {
  focalX?: number;
  focalY?: number;
  zoom?: number;
  rotation?: number;
  flipX?: boolean;
  target?: "website" | "application";
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeRotation(value: unknown): 0 | 90 | 180 | 270 {
  const number = Math.round(Number(value || 0));
  const normalized = ((number % 360) + 360) % 360;
  if (normalized === 90 || normalized === 180 || normalized === 270) return normalized;
  return 0;
}

export async function transformProductImage(
  input: Buffer,
  options: ProductImageTransform = {},
) {
  if (!input.byteLength || input.byteLength > PRODUCT_IMAGE_MAX_BYTES) {
    throw new Error("Görsel 24 MB sınırını aşamaz.");
  }

  const values = [options.focalX ?? 0.5, options.focalY ?? 0.5, options.zoom ?? 1];
  if (!values.every((value) => Number.isFinite(Number(value)))) throw new Error("Kırpma ayarları geçersiz.");
  const focalX = clamp(Number(values[0]), 0, 1);
  const focalY = clamp(Number(values[1]), 0, 1);
  const zoom = clamp(Number(values[2]), 1, 4);
  const outputHeight = options.target === "application" ? 1800 : PRODUCT_IMAGE_HEIGHT;
  const rotation = normalizeRotation(options.rotation);

  // İlk adım EXIF yönünü düzeltir. İkinci adım panelde seçilen manuel dönüşü
  // uygular; böylece önizleme ile kaydedilen WebP aynı yönde olur.
  const autoOriented = await sharp(input, { failOn: "error", limitInputPixels: 80_000_000 })
    .rotate()
    .toColorspace("srgb")
    .png()
    .toBuffer();
  const rotated = await sharp(autoOriented)
    .rotate(rotation)
    .png()
    .toBuffer();
  // Sharp always mirrors before rotation within one pipeline. Separating the
  // stages makes flipX a horizontal mirror of the oriented preview in both UIs.
  const normalized = await sharp(rotated)
    .flop(Boolean(options.flipX))
    .toBuffer({ resolveWithObject: true });

  const width = normalized.info.width;
  const height = normalized.info.height;
  if (!width || !height) throw new Error("Görsel ölçüleri okunamadı.");

  const targetAspect = PRODUCT_IMAGE_WIDTH / outputHeight;
  const sourceAspect = width / height;
  const baseCropWidth = sourceAspect > targetAspect ? height * targetAspect : width;
  const baseCropHeight = sourceAspect > targetAspect ? height : width / targetAspect;
  const cropWidth = clamp(Math.round(baseCropWidth / zoom), 1, width);
  const cropHeight = clamp(Math.round(baseCropHeight / zoom), 1, height);
  const left = clamp(
    Math.round(focalX * width - cropWidth / 2),
    0,
    Math.max(0, width - cropWidth),
  );
  const top = clamp(
    Math.round(focalY * height - cropHeight / 2),
    0,
    Math.max(0, height - cropHeight),
  );

  const buffer = await sharp(normalized.data)
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .resize(PRODUCT_IMAGE_WIDTH, outputHeight, {
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    })
    .webp({ quality: 88, effort: 5, smartSubsample: true })
    .toBuffer();

  return {
    buffer,
    originalWidth: width,
    originalHeight: height,
    rotation,
    crop: {
      left,
      top,
      width: cropWidth,
      height: cropHeight,
      focalX,
      focalY,
      zoom,
      rotation,
    },
    upscaled:
      cropWidth < PRODUCT_IMAGE_WIDTH || cropHeight < outputHeight,
  };
}

