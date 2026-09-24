import sharp from "sharp";

export const PRODUCT_IMAGE_WIDTH = 1200;
export const PRODUCT_IMAGE_HEIGHT = 1600;
export const PRODUCT_IMAGE_MAX_BYTES = 24 * 1024 * 1024;

export type ProductImageTransform = {
  focalX?: number;
  focalY?: number;
  zoom?: number;
  rotation?: number;
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

  const focalX = clamp(Number(options.focalX ?? 0.5), 0, 1);
  const focalY = clamp(Number(options.focalY ?? 0.5), 0, 1);
  const zoom = clamp(Number(options.zoom ?? 1), 1, 3);
  const rotation = normalizeRotation(options.rotation);

  // İlk adım EXIF yönünü düzeltir. İkinci adım panelde seçilen manuel dönüşü
  // uygular; böylece önizleme ile kaydedilen WebP aynı yönde olur.
  const autoOriented = await sharp(input, { failOn: "none" })
    .rotate()
    .toColorspace("srgb")
    .toBuffer();
  const normalized = await sharp(autoOriented)
    .rotate(rotation)
    .toBuffer({ resolveWithObject: true });

  const width = normalized.info.width;
  const height = normalized.info.height;
  if (!width || !height) throw new Error("Görsel ölçüleri okunamadı.");

  const targetAspect = PRODUCT_IMAGE_WIDTH / PRODUCT_IMAGE_HEIGHT;
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
    .resize(PRODUCT_IMAGE_WIDTH, PRODUCT_IMAGE_HEIGHT, {
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
      cropWidth < PRODUCT_IMAGE_WIDTH || cropHeight < PRODUCT_IMAGE_HEIGHT,
  };
}
