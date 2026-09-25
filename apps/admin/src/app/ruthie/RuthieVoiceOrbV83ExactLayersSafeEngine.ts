// @ts-nocheck
import {
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
import { drawWholeOrbExact, renderWholeOrbExact } from "./RuthieVoiceOrbV83ExactLayersOrb";
import { V83_MASK_OUTER } from "./v83MaskOuter";
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

type ExactLayerKind = "outer" | "middle" | "inner";

const ORB_ASSET = "/ruthie/ruthie-liquid-gold-orb.webp";
const LAYER_SIZE = 760;

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

function createLayerCanvas(willReadFrequently = false) {
  const canvas = document.createElement("canvas");
  canvas.width = LAYER_SIZE;
  canvas.height = LAYER_SIZE;
  const context = canvas.getContext("2d", { alpha: true, willReadFrequently });
  if (!context) throw new Error("Ruthie v8.3 layer canvas unavailable");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  return { canvas, context };
}

function createBaseLayer(source: CanvasImageSource) {
  const { canvas, context } = createLayerCanvas(false);
  context.drawImage(source, 0, 0, LAYER_SIZE, LAYER_SIZE);
  return canvas;
}

function createExactMaskedLayer(source: CanvasImageSource, mask: CanvasImageSource, kind: ExactLayerKind) {
  const { canvas, context } = createLayerCanvas(true);
  const { context: maskContext } = createLayerCanvas(true);

  context.drawImage(source, 0, 0, LAYER_SIZE, LAYER_SIZE);
  maskContext.drawImage(mask, 0, 0, LAYER_SIZE, LAYER_SIZE);

  const imageData = context.getImageData(0, 0, LAYER_SIZE, LAYER_SIZE);
  const maskData = maskContext.getImageData(0, 0, LAYER_SIZE, LAYER_SIZE).data;
  const pixels = imageData.data;

  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    pixels[index + 3] = Math.max(maskData[index], maskData[index + 1], maskData[index + 2]);

    if (kind === "outer") {
      pixels[index] = clamp(Math.round(red * 1.1625 + .8), 0, 255);
      pixels[index + 1] = clamp(Math.round(green * 1.1713 + .25), 0, 255);
      pixels[index + 2] = clamp(Math.round(blue * 1.1755), 0, 255);
    } else if (kind === "middle") {
      pixels[index] = clamp(Math.round(red * 1.1407 + .95), 0, 255);
      pixels[index + 1] = clamp(Math.round(green * 1.1505 + .17), 0, 255);
      pixels[index + 2] = clamp(Math.round(blue * 1.1531), 0, 255);
    } else {
      pixels[index] = clamp(Math.round(red * 1.1423 + 8.4), 0, 255);
      pixels[index + 1] = clamp(Math.round(green * 1.2041 + 1.16), 0, 255);
      pixels[index + 2] = clamp(Math.round(blue * 1.2158 + .17), 0, 255);
    }
  }

  context.clearRect(0, 0, LAYER_SIZE, LAYER_SIZE);
  context.putImageData(imageData, 0, 0);
  return canvas;
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Ruthie layer load failed: ${source.slice(0, 42)}`));
    image.src = source;
  });
}

function nextPaint() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

export function mountRuthieV83ExactLayersSafe(canvas: HTMLCanvasElement, options: V83MountOptions) {
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) {
    canvas.dataset.renderError = "canvas-unavailable";
    return () => undefined;
  }

  const environment = createV83Environment(context);
  canvas.dataset.renderer = "canvas-ruthie-v8-3-exact-four-layers-safe";
  canvas.dataset.ruthieOrbVersion = "8.3-html-four-layers-progressive";
  canvas.dataset.layerStage = "loading-base";
  delete canvas.dataset.renderError;
  delete canvas.dataset.renderWarning;

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
    for (const state of states) {
      if (state?.context.state === "suspended") void state.context.resume().catch(() => undefined);
    }
  };

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  canvas.addEventListener("pointermove", onPointerMove, { passive: true });
  canvas.addEventListener("pointerleave", onPointerLeave, { passive: true });
  window.addEventListener("pointerdown", resumeAudio, { passive: true });
  window.addEventListener("keydown", resumeAudio);
  resize();

  void (async () => {
    try {
      const source = await loadImage(ORB_ASSET);
      if (disposed) return;

      const base = createBaseLayer(source);
      environment.images.base = base;
      loaded = true;
      canvas.dataset.layerStage = "base-ready";
      delete canvas.dataset.renderError;

      const layers: Array<[ExactLayerKind, string]> = [
        ["outer", V83_MASK_OUTER],
        ["middle", V83_MASK_MIDDLE],
        ["inner", V83_MASK_INNER],
      ];
      const failed: string[] = [];

      for (const [kind, sourceValue] of layers) {
        if (disposed) return;
        await nextPaint();
        try {
          const mask = await loadImage(sourceValue);
          if (disposed) return;
          environment.images[kind] = createExactMaskedLayer(base, mask, kind);
          canvas.dataset.layerStage = `${kind}-ready`;
        } catch (error) {
          failed.push(kind);
          console.error(`Ruthie ${kind} layer preparation error`, error);
        }
      }

      if (failed.length) canvas.dataset.renderWarning = `layer-fallback-${failed.join("-")}`;
      else delete canvas.dataset.renderWarning;
      canvas.dataset.layerStage = failed.length ? "ready-with-fallback" : "all-layers-ready";
    } catch (error) {
      console.error("Ruthie base layer load error", error);
      canvas.dataset.renderError = "base-layer-load";
      canvas.dataset.layerStage = "base-failed";
    }
  })();

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
    renderWholeOrbExact(environment, time, mode, modeLevel, pulse);
    drawWholeOrbExact(environment, centerX, centerY, baseRadius, time, mode, modeLevel, audio.tempo);
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
