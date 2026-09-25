// @ts-nocheck
import {
  ORB_BUFFER_SIZE,
  clamp,
  createV83Environment,
  lerp,
  radialGlow,
  type V83Mode,
} from "./RuthieVoiceOrbV83Core";
import {
  drawBackgroundStars,
  drawOrbitLayer,
  drawOrbitingStars,
  drawOuterField,
  drawOuterParticles,
  drawThinkingVortex,
} from "./RuthieVoiceOrbV83Effects";
import { drawWholeOrbWarped, renderWholeOrb } from "./RuthieVoiceOrbV83Orb";
import { V83_MASK_MIDDLE } from "./v83MaskMiddle";
import { V83_MASK_INNER } from "./v83MaskInner";

export type RuthieV83Phase = "connecting" | "listening" | "thinking" | "acting" | "speaking" | "error";

export type V83MountOptions = {
  getPhase: () => RuthieV83Phase;
  getMuted: () => boolean;
  stream?: MediaStream | null;
  inputStream?: MediaStream | null;
  outputStream?: MediaStream | null;
};

type AudioState = {
  context: AudioContext;
  analyser: AnalyserNode;
  data: Uint8Array<ArrayBuffer>;
  smoothLevel: number;
  previousLevel: number;
  tempo: number;
};

const ORB_ASSET = "/ruthie/ruthie-liquid-gold-orb.webp";

function modeForPhase(phase: RuthieV83Phase): V83Mode {
  if (phase === "listening") return "listening";
  if (phase === "thinking") return "thinking";
  if (phase === "acting") return "processing";
  if (phase === "speaking") return "speaking";
  return "idle";
}

function createAudioState(stream: MediaStream | null): AudioState | null {
  if (!stream?.getAudioTracks().some((track) => track.readyState === "live")) return null;
  try {
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = .72;
    context.createMediaStreamSource(stream).connect(analyser);
    void context.resume().catch(() => undefined);
    return {
      context,
      analyser,
      data: new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)),
      smoothLevel: 0,
      previousLevel: 0,
      tempo: 0,
    };
  } catch {
    return null;
  }
}

function readV83Audio(state: AudioState | null, time: number, muted: boolean) {
  if (!state || muted) {
    return {
      level: clamp((Math.sin(time * 4.7) + Math.sin(time * 7.9) * .5 + Math.sin(time * 13.1) * .25 + 1.75) / 3.5, 0, 1),
      tempo: clamp(Math.sin(time * 5.6) * .5 + Math.sin(time * 9.4) * .25 + .75, 0, 1),
    };
  }

  state.analyser.getByteFrequencyData(state.data);
  let sum = 0;
  for (let index = 2; index < 90; index += 1) sum += state.data[index];
  const rawLevel = clamp((sum / 88 - 20) / 85, 0, 1);
  state.smoothLevel = lerp(state.smoothLevel, rawLevel, .26);
  const delta = Math.abs(rawLevel - state.previousLevel);
  state.tempo = lerp(state.tempo, clamp(delta * 12, 0, 1), .18);
  state.previousLevel = lerp(state.previousLevel, rawLevel, .18);
  return { level: state.smoothLevel, tempo: state.tempo };
}

function createCanvas(willReadFrequently = false) {
  const canvas = document.createElement("canvas");
  canvas.width = ORB_BUFFER_SIZE;
  canvas.height = ORB_BUFFER_SIZE;
  const context = canvas.getContext("2d", { alpha: true, willReadFrequently });
  if (!context) throw new Error("Ruthie v8.3 katman canvası oluşturulamadı.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  return { canvas, context };
}

function createHdBaseLayer(source: CanvasImageSource) {
  const { canvas, context } = createCanvas(true);
  context.clearRect(0, 0, ORB_BUFFER_SIZE, ORB_BUFFER_SIZE);
  context.filter = "contrast(1.075) saturate(1.055)";
  context.drawImage(source, 0, 0, ORB_BUFFER_SIZE, ORB_BUFFER_SIZE);
  context.filter = "none";

  // One-time, restrained unsharp pass. This restores edge definition lost by the
  // old small WebP without adding scanlines or a permanent canvas blur.
  const { canvas: blurCanvas, context: blurContext } = createCanvas(false);
  blurContext.filter = "blur(1.15px)";
  blurContext.drawImage(canvas, 0, 0);
  blurContext.filter = "none";

  const sharp = context.getImageData(0, 0, ORB_BUFFER_SIZE, ORB_BUFFER_SIZE);
  const blurred = blurContext.getImageData(0, 0, ORB_BUFFER_SIZE, ORB_BUFFER_SIZE).data;
  const pixels = sharp.data;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] === 0) continue;
    pixels[index] = clamp(Math.round(pixels[index] + (pixels[index] - blurred[index]) * .42 + 1), 0, 255);
    pixels[index + 1] = clamp(Math.round(pixels[index + 1] + (pixels[index + 1] - blurred[index + 1]) * .42 + 1), 0, 255);
    pixels[index + 2] = clamp(Math.round(pixels[index + 2] + (pixels[index + 2] - blurred[index + 2]) * .42 + 1), 0, 255);
  }
  context.putImageData(sharp, 0, 0);
  return canvas;
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const unit = clamp((value - edge0) / Math.max(.0001, edge1 - edge0), 0, 1);
  return unit * unit * (3 - 2 * unit);
}

function createSolarOuterLayer(source: CanvasImageSource) {
  const { canvas, context } = createCanvas(true);
  context.drawImage(source, 0, 0, ORB_BUFFER_SIZE, ORB_BUFFER_SIZE);
  const imageData = context.getImageData(0, 0, ORB_BUFFER_SIZE, ORB_BUFFER_SIZE);
  const pixels = imageData.data;
  const center = ORB_BUFFER_SIZE / 2;
  const inverseRadius = 2 / ORB_BUFFER_SIZE;

  for (let y = 0; y < ORB_BUFFER_SIZE; y += 1) {
    const dy = y - center;
    for (let x = 0; x < ORB_BUFFER_SIZE; x += 1) {
      const index = (y * ORB_BUFFER_SIZE + x) * 4;
      const alpha = pixels[index + 3];
      if (!alpha) continue;

      const dx = x - center;
      const distance = Math.sqrt(dx * dx + dy * dy) * inverseRadius;
      const innerGate = smoothstep(.49, .68, distance);
      const outerGate = 1 - smoothstep(.93, 1.035, distance);
      const luminance = pixels[index] * .30 + pixels[index + 1] * .59 + pixels[index + 2] * .11;
      const lightGate = .20 + smoothstep(22, 175, luminance) * .92;
      const edgeAlpha = innerGate * outerGate * lightGate;

      pixels[index + 3] = Math.round(alpha * edgeAlpha);
      pixels[index] = clamp(Math.round(pixels[index] * 1.16 + luminance * .055 + 3), 0, 255);
      pixels[index + 1] = clamp(Math.round(pixels[index + 1] * 1.11 + luminance * .035 + 2), 0, 255);
      pixels[index + 2] = clamp(Math.round(pixels[index + 2] * 1.04 + luminance * .012), 0, 255);
    }
  }

  context.clearRect(0, 0, ORB_BUFFER_SIZE, ORB_BUFFER_SIZE);
  context.putImageData(imageData, 0, 0);
  return canvas;
}

function createMaskedLayer(source: CanvasImageSource, mask: CanvasImageSource, kind: "middle" | "inner") {
  const { canvas, context } = createCanvas(true);
  const { context: maskContext } = createCanvas(true);

  context.drawImage(source, 0, 0, ORB_BUFFER_SIZE, ORB_BUFFER_SIZE);
  maskContext.drawImage(mask, 0, 0, ORB_BUFFER_SIZE, ORB_BUFFER_SIZE);

  const imageData = context.getImageData(0, 0, ORB_BUFFER_SIZE, ORB_BUFFER_SIZE);
  const maskData = maskContext.getImageData(0, 0, ORB_BUFFER_SIZE, ORB_BUFFER_SIZE).data;
  const pixels = imageData.data;

  for (let index = 0; index < pixels.length; index += 4) {
    const maskAlpha = Math.max(maskData[index], maskData[index + 1], maskData[index + 2]);
    pixels[index + 3] = Math.round(pixels[index + 3] * (maskAlpha / 255));
    if (kind === "middle") {
      pixels[index] = clamp(Math.round(pixels[index] * 1.075 + 2), 0, 255);
      pixels[index + 1] = clamp(Math.round(pixels[index + 1] * 1.08 + 1), 0, 255);
      pixels[index + 2] = clamp(Math.round(pixels[index + 2] * 1.065), 0, 255);
    } else {
      pixels[index] = clamp(Math.round(pixels[index] * 1.08 + 7), 0, 255);
      pixels[index + 1] = clamp(Math.round(pixels[index + 1] * 1.13 + 2), 0, 255);
      pixels[index + 2] = clamp(Math.round(pixels[index + 2] * 1.11), 0, 255);
    }
  }

  context.clearRect(0, 0, ORB_BUFFER_SIZE, ORB_BUFFER_SIZE);
  context.putImageData(imageData, 0, 0);
  return canvas;
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Ruthie v8.3 görseli yüklenemedi: ${source.slice(0, 48)}`));
    image.src = source;
  });
}

export function mountRuthieV83(canvas: HTMLCanvasElement, options: V83MountOptions) {
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) {
    canvas.dataset.renderError = "canvas-unavailable";
    return () => undefined;
  }

  const environment = createV83Environment(context);
  canvas.dataset.renderer = "canvas-ruthie-v8-3-hd-solar-edge";
  canvas.dataset.ruthieOrbVersion = "8.3-hd-solar-edge-no-slices";
  delete canvas.dataset.renderError;

  const inputStream = options.inputStream || options.stream || options.outputStream || null;
  const outputStream = options.outputStream || options.inputStream || options.stream || null;
  const inputAudio = createAudioState(inputStream);
  const outputAudio = outputStream === inputStream ? inputAudio : createAudioState(outputStream);

  const pointerTarget = { x: 0, y: 0 };
  const pointer = { x: 0, y: 0 };
  let cssWidth = 1;
  let cssHeight = 1;
  let disposed = false;
  let frame = 0;
  let loaded = false;

  const host = canvas.parentElement as HTMLElement | null;
  const priorFilter = host?.style.filter || "";
  const priorTransform = host?.style.transform || "";
  if (host) {
    host.style.filter = "none";
    host.style.transform = "none";
  }

  const resize = () => {
    const rectangle = canvas.getBoundingClientRect();
    cssWidth = Math.max(1, rectangle.width);
    cssHeight = Math.max(1, rectangle.height);
    const mobile = window.matchMedia("(max-width: 760px)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 3 : 2.6);
    const width = Math.max(1, Math.round(cssWidth * dpr));
    const height = Math.max(1, Math.round(cssHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
  };

  const onPointerMove = (event: PointerEvent) => {
    const rectangle = canvas.getBoundingClientRect();
    pointerTarget.x = ((event.clientX - rectangle.left) / Math.max(1, rectangle.width) - .5) * 2;
    pointerTarget.y = ((event.clientY - rectangle.top) / Math.max(1, rectangle.height) - .5) * 2;
  };
  const onPointerLeave = () => {
    pointerTarget.x = 0;
    pointerTarget.y = 0;
  };
  const resumeAudio = () => {
    const states = new Set([inputAudio, outputAudio]);
    for (const state of states) if (state?.context.state === "suspended") void state.context.resume().catch(() => undefined);
  };

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  canvas.addEventListener("pointermove", onPointerMove, { passive: true });
  canvas.addEventListener("pointerleave", onPointerLeave, { passive: true });
  window.addEventListener("pointerdown", resumeAudio, { passive: true });
  window.addEventListener("keydown", resumeAudio);
  resize();

  void loadImage(ORB_ASSET).then((image) => {
    if (disposed) return;

    const hdBase = createHdBaseLayer(image);
    environment.images.base = hdBase;
    environment.images.outer = createSolarOuterLayer(hdBase);
    loaded = true;
    delete canvas.dataset.renderError;

    void Promise.allSettled([
      loadImage(V83_MASK_MIDDLE),
      loadImage(V83_MASK_INNER),
    ]).then(([middle, inner]) => {
      if (disposed) return;
      if (middle.status === "fulfilled") environment.images.middle = createMaskedLayer(hdBase, middle.value, "middle");
      if (inner.status === "fulfilled") environment.images.inner = createMaskedLayer(hdBase, inner.value, "inner");
      const failed = [middle, inner].filter((result) => result.status === "rejected").length;
      if (failed) canvas.dataset.renderWarning = `mask-load-${failed}`;
      else delete canvas.dataset.renderWarning;
    });
  }).catch((error) => {
    console.error("Ruthie v8.3 HD base texture load error", error);
    canvas.dataset.renderError = "base-texture-load";
  });

  const draw = (now: number) => {
    if (disposed) return;
    frame = window.requestAnimationFrame(draw);
    const time = now / 1000;
    const mode = modeForPhase(options.getPhase());
    const selectedAudio = mode === "speaking" ? outputAudio : inputAudio;
    const audio = readV83Audio(selectedAudio, time, options.getMuted());

    pointer.x = lerp(pointer.x, pointerTarget.x, .08);
    pointer.y = lerp(pointer.y, pointerTarget.y, .08);
    context.clearRect(0, 0, cssWidth, cssHeight);
    if (!loaded) return;
    drawBackgroundStars(environment, time, cssWidth, cssHeight);

    let modeLevel = .24;
    if (mode === "listening") modeLevel = .28 + .78 * audio.level;
    else if (mode === "speaking") {
      const speakingLevel = outputAudio
        ? audio.level
        : clamp((Math.sin(time * 5.4) + Math.sin(time * 9.2) * .55 + 1.55) / 3.1, 0, 1);
      modeLevel = .36 + .64 * speakingLevel;
    } else if (mode === "processing") modeLevel = .70;
    else if (mode === "thinking") modeLevel = .53;
    else modeLevel = .22 + .07 * Math.sin(time * 1.25);

    const centerX = cssWidth / 2 + pointer.x * 8;
    const centerY = cssHeight / 2 - 28 + pointer.y * 5;
    const baseRadius = Math.min(cssWidth, cssHeight) * .365;

    let pulse = 1 + .016 * Math.sin(time * 1.15);
    if (mode === "listening") pulse = 1 + .095 * audio.level + Math.sin(time * 1.9) * .008;
    if (mode === "thinking") pulse = .95 + .013 * Math.sin(time * 2.2);
    if (mode === "processing") pulse = 1 + .018 * Math.sin(time * 3.2);
    if (mode === "speaking") pulse = 1 + .030 + .085 * audio.level + Math.sin(time * 2.1) * .006;
    environment.speakingPulse = pulse;
    environment.speechTempo = audio.tempo;

    context.save();
    context.translate(centerX, centerY + baseRadius * .88);
    context.scale(1, .18);
    radialGlow(environment, 0, 0, baseRadius * 1.02, .16 + modeLevel * .09);
    context.restore();
    radialGlow(environment, centerX, centerY, baseRadius * 1.28, .065 + modeLevel * .05);

    if (mode === "idle" || mode === "listening" || mode === "speaking") {
      drawOuterField(environment, centerX, centerY, baseRadius * 1.01, time, modeLevel, mode);
    }

    if (mode === "listening") {
      for (let index = 0; index < 2; index += 1) {
        const unit = (time * .40 + index / 2) % 1;
        context.strokeStyle = `rgba(201, 74, 64,${(1 - unit) * (.065 + .09 * modeLevel)})`;
        context.lineWidth = .9;
        context.beginPath();
        context.arc(centerX, centerY, baseRadius * (1.02 + unit * .21), 0, Math.PI * 2);
        context.stroke();
      }
    }

    if (mode === "speaking") {
      for (let index = 0; index < 3; index += 1) {
        const unit = (time * .70 + index / 3) % 1;
        context.strokeStyle = `rgba(200, 167, 125,${(1 - unit) * (.11 + .12 * modeLevel)})`;
        context.lineWidth = 1 * (1 - unit) + .28;
        context.shadowBlur = 7;
        context.shadowColor = "rgba(201, 74, 64,.48)";
        context.beginPath();
        context.arc(centerX, centerY, baseRadius * (1.02 + unit * .27), 0, Math.PI * 2);
        context.stroke();
      }
      context.shadowBlur = 0;
    }

    if (mode === "processing") drawOrbitLayer(environment, centerX, centerY, baseRadius, time, false);
    renderWholeOrb(environment, time, mode, modeLevel, pulse);
    drawWholeOrbWarped(environment, centerX, centerY, baseRadius, time, mode, modeLevel, audio.tempo);
    if (mode === "thinking") drawThinkingVortex(environment, centerX, centerY, baseRadius, time, modeLevel);
    if (mode === "processing") drawOrbitLayer(environment, centerX, centerY, baseRadius, time, true);
    drawOuterParticles(environment, centerX, centerY, baseRadius, time, mode, modeLevel);
    drawOrbitingStars(environment, centerX, centerY, baseRadius, time, modeLevel);
  };

  frame = window.requestAnimationFrame(draw);

  return () => {
    disposed = true;
    observer.disconnect();
    window.cancelAnimationFrame(frame);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerleave", onPointerLeave);
    window.removeEventListener("pointerdown", resumeAudio);
    window.removeEventListener("keydown", resumeAudio);
    const states = new Set([inputAudio, outputAudio]);
    for (const state of states) if (state) void state.context.close().catch(() => undefined);
    if (host) {
      host.style.filter = priorFilter;
      host.style.transform = priorTransform;
    }
  };
}
