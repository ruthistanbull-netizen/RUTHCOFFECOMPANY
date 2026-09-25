// @ts-nocheck
export type V83Mode = "idle" | "listening" | "thinking" | "processing" | "speaking";
export type V83ImageKey = "base" | "outer" | "middle" | "inner";

export type V83Environment = {
  ctx: CanvasRenderingContext2D;
  orbBuffer: HTMLCanvasElement;
  orbCtx: CanvasRenderingContext2D;
  images: Partial<Record<V83ImageKey, CanvasImageSource>>;
  particles: Array<{ angle: number; radius: number; speed: number; size: number; jitter: number }>;
  backgroundStars: Array<{ x: number; y: number; size: number; brightness: number; twinkleSpeed: number; twinklePhase: number; sparkle: boolean }>;
  orbitingStars: Array<{ orbit: number; angle: number; speed: number; size: number; brightness: number; twinkleSpeed: number; twinklePhase: number }>;
  speechTempo: number;
  speakingPulse: number;
};

// The approved HTML textures are 760px. Rendering the composed object at 1140px
// avoids repeated low-resolution rotations/scales on high-DPI mobile screens.
export const ORB_BUFFER_SIZE = 1140;
export const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
export const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount;

export function createV83Environment(ctx: CanvasRenderingContext2D): V83Environment {
  const orbBuffer = document.createElement("canvas");
  orbBuffer.width = ORB_BUFFER_SIZE;
  orbBuffer.height = ORB_BUFFER_SIZE;
  const orbCtx = orbBuffer.getContext("2d", { alpha: true, willReadFrequently: false });
  if (!orbCtx) throw new Error("Ruthie v8.3 orb buffer oluşturulamadı.");
  orbCtx.imageSmoothingEnabled = true;
  orbCtx.imageSmoothingQuality = "high";

  return {
    ctx,
    orbBuffer,
    orbCtx,
    images: {},
    particles: Array.from({ length: 125 }, () => ({
      angle: Math.random() * Math.PI * 2,
      radius: .68 + Math.random() * .5,
      speed: .14 + Math.random() * .9,
      size: .35 + Math.random() * 1.15,
      jitter: Math.random() * 10,
    })),
    backgroundStars: Array.from({ length: 72 }, () => ({
      x: Math.random(), y: Math.random(), size: .45 + Math.random() * 1.4,
      brightness: .35 + Math.random() * 1.05,
      twinkleSpeed: .25 + Math.random(), twinklePhase: Math.random() * Math.PI * 2,
      sparkle: Math.random() < .10,
    })),
    orbitingStars: Array.from({ length: 11 }, (_, index) => ({
      orbit: index % 4, angle: Math.random() * Math.PI * 2,
      speed: .18 + Math.random() * .55, size: .6 + Math.random() * 1.6,
      brightness: .55 + Math.random() * .95,
      twinkleSpeed: .8 + Math.random() * 2, twinklePhase: Math.random() * Math.PI * 2,
    })),
    speechTempo: 0,
    speakingPulse: 1,
  };
}

export function radialGlowTo(context: CanvasRenderingContext2D, cx: number, cy: number, radius: number, alpha: number) {
  const gradient = context.createRadialGradient(cx, cy, 0, cx, cy, radius);
  gradient.addColorStop(0, `rgba(251, 243, 230,${.98 * alpha})`);
  gradient.addColorStop(.06, `rgba(200, 167, 125,${.80 * alpha})`);
  gradient.addColorStop(.28, `rgba(201, 74, 64,${.26 * alpha})`);
  gradient.addColorStop(1, "rgba(56, 37, 28,0)");
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(cx, cy, radius, 0, Math.PI * 2);
  context.fill();
}

export function radialGlow(env: V83Environment, cx: number, cy: number, radius: number, alpha: number) {
  radialGlowTo(env.ctx, cx, cy, radius, alpha);
}

export function drawImageLayerTo(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource | undefined,
  cx: number, cy: number, size: number, angle: number, scale: number, alpha: number, blur = 0,
) {
  if (!image) return;
  context.save();
  context.translate(cx, cy);
  context.rotate(angle);
  context.scale(scale, scale);
  context.globalAlpha = alpha;
  context.globalCompositeOperation = "screen";
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.filter = blur ? `blur(${blur}px)` : "none";
  context.drawImage(image, -size / 2, -size / 2, size, size);
  context.restore();
  context.filter = "none";
  context.globalAlpha = 1;
  context.globalCompositeOperation = "source-over";
}

export function ellipsePoint(rx: number, ry: number, tilt: number, angle: number, wobble: number, time: number, phase: number) {
  const breathing = 1 + wobble * (
    Math.sin(angle * 3 + time * .72 + phase) * .55
    + Math.sin(angle * 5 - time * .47 + phase) * .25
  );
  const x0 = Math.cos(angle) * rx * breathing;
  const y0 = Math.sin(angle) * ry * breathing;
  return {
    x: x0 * Math.cos(tilt) - y0 * Math.sin(tilt),
    y: x0 * Math.sin(tilt) + y0 * Math.cos(tilt),
    depth: Math.sin(angle),
  };
}
