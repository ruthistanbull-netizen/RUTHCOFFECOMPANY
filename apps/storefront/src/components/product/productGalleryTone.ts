export type ProductHeaderTone = "dark" | "light" | "adaptive";

export type ProductHeaderToneDetail = {
  tone: ProductHeaderTone;
  color?: string;
  ink?: string;
  invert?: "0" | "1";
};

const PRODUCT_SURFACE = "rgb(250 247 242)";
const toneCache = new Map<string, ProductHeaderToneDetail>();
const pending = new Set<string>();

function dispatchTone(detail: ProductHeaderToneDetail) {
  window.dispatchEvent(
    new CustomEvent<ProductHeaderToneDetail>("ruth:product-header-tone", {
      detail,
    }),
  );
}

function fallbackTone() {
  return {
    tone: "dark",
    color: PRODUCT_SURFACE,
    ink: "#111111",
    invert: "0",
  } satisfies ProductHeaderToneDetail;
}

function sampleSource(imageUrl: string) {
  const prefixes = [
    "/products/ikas/",
    "/products/ikas-detail/",
    "/products/ikas-card/",
  ];
  const prefix = prefixes.find((candidate) => imageUrl.startsWith(candidate));
  if (!prefix) return imageUrl;
  const fileName = imageUrl.split("/").pop();
  return fileName
    ? `/products/ikas-thumb/${fileName.replace(/\.(png|jpe?g)$/i, ".webp")}`
    : imageUrl;
}

function sampleImage(image: HTMLImageElement) {
  const canvas = document.createElement("canvas");
  canvas.width = 12;
  canvas.height = 3;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return fallbackTone();

  const sourceHeight = Math.max(1, Math.round(image.naturalHeight * 0.12));
  context.drawImage(
    image,
    0,
    0,
    image.naturalWidth,
    sourceHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let red = 0;
  let green = 0;
  let blue = 0;
  let weight = 0;

  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = (pixels[index + 3] || 0) / 255;
    if (alpha < 0.08) continue;
    red += (pixels[index] || 0) * alpha;
    green += (pixels[index + 1] || 0) * alpha;
    blue += (pixels[index + 2] || 0) * alpha;
    weight += alpha;
  }

  if (!weight) return fallbackTone();

  const averageRed = Math.round(red / weight);
  const averageGreen = Math.round(green / weight);
  const averageBlue = Math.round(blue / weight);
  const luminance =
    averageRed * 0.2126 + averageGreen * 0.7152 + averageBlue * 0.0722;
  const darkInk = luminance > 154;

  return {
    tone: darkInk ? "dark" : "light",
    color: `rgb(${averageRed} ${averageGreen} ${averageBlue})`,
    ink: darkInk ? "#111111" : "#ffffff",
    invert: darkInk ? "0" : "1",
  } satisfies ProductHeaderToneDetail;
}

function scheduleIdle(callback: () => void) {
  const idleCallback = window.requestIdleCallback;
  if (typeof idleCallback === "function") {
    idleCallback(callback, { timeout: 700 });
    return;
  }
  globalThis.setTimeout(callback, 120);
}

export function announceProductHeaderTone(imageUrl: string) {
  if (typeof window === "undefined") return;
  if (!imageUrl) {
    dispatchTone(fallbackTone());
    return;
  }

  const cached = toneCache.get(imageUrl);
  if (cached) {
    dispatchTone(cached);
    return;
  }
  if (pending.has(imageUrl)) return;
  pending.add(imageUrl);

  const image = new window.Image();
  image.crossOrigin = "anonymous";
  image.decoding = "async";

  image.onload = () => {
    scheduleIdle(() => {
      try {
        const tone = sampleImage(image);
        toneCache.set(imageUrl, tone);
        dispatchTone(tone);
      } catch {
        const tone = fallbackTone();
        toneCache.set(imageUrl, tone);
        dispatchTone(tone);
      } finally {
        pending.delete(imageUrl);
      }
    });
  };

  image.onerror = () => {
    pending.delete(imageUrl);
    const tone = fallbackTone();
    toneCache.set(imageUrl, tone);
    dispatchTone(tone);
  };

  image.src = sampleSource(imageUrl);
}
