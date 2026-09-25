// @ts-nocheck
import {
  ORB_BUFFER_SIZE,
  clamp,
  createV83Environment,
  lerp,
  radialGlow,
  type V83Environment,
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

function createCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = ORB_BUFFER_SIZE;
  canvas.height = ORB_BUFFER_SIZE;
  return canvas;
}

function champagnePixels(imageData: ImageData, kind: "base" | "outer" | "middle" | "inner") {
  const pixels = imageData.data;
  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const luminance = red * .30 + green * .59 + blue * .11;

    let redGain = 1.06;
    let greenGain = 1.16;
    let blueGain = 1.34;
    let redLift = 2;
    let greenLift = 4;
    let blueLift = 9;

    if (kind === "outer") {
      redGain = 1.10;
      greenGain = 1.23;
      blueGain = 1.42;
      redLift = 3;
      greenLift = 5;
      blueLift = 12;
    } else if (kind === "middle") {
      redGain = 1.08;
      greenGain = 1.21;
      blueGain = 1.39;
      redLift = 4;
      greenLift = 6;
      blueLift = 12;
    } else if (kind === "inner") {
      redGain = 1.08;
      greenGain = 1.25;
      blueGain = 1.48;
      redLift = 9;
      greenLift = 10;
      blueLift = 16;
    }

    pixels[index] = Math.min(255, Math.round(red * redGain + luminance * .035 + redLift));
    pixels[index + 1] = Math.min(255, Math.round(green * greenGain + luminance * .065 + greenLift));
    pixels[index + 2] = Math.min(255, Math.round(blue * blueGain + luminance * .13 + blueLift));
  }
  return imageData;
}

function createBaseLayer(source: CanvasImageSource) {
  const canvas = createCanvas();
  const context = canvas.getContext("2d", { alpha: true, willReadFrequently: true });
  if (!context) return source;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, ORB_BUFFER_SIZE, ORB_BUFFER_SIZE);
  const imageData = context.getImageData(0, 0, ORB_BUFFER_SIZE, ORB_BUFFER_SIZE);
  context.putImageData(champagnePixels(imageData, "base"), 0, 0);
  return canvas;
}

function createMaskedLayer(
  source: CanvasImageSource,
  mask: CanvasImageSource,
  kind: "outer" | "middle" | "inner",
) {
  const canvas = createCanvas();
  const context = canvas.getContext("2d", { alpha: true, willReadFrequently: true });
  const maskCanvas = createCanvas();
  const maskContext = maskCanvas.getContext("2d", { alpha: true, willReadFrequently: true });
  if (!context || !maskContext) return source;

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, ORB_BUFFER_SIZE, ORB_BUFFER_SIZE);
  maskContext.imageSmoothingEnabled = true;
  maskContext.imageSmoothingQuality = "high";
  maskContext.drawImage(mask, 0, 0, ORB_BUFFER_SIZE, ORB_BUFFER_SIZE);

  const imageData = context.getImageData(0, 0, ORB_BUFFER_SIZE, ORB_BUFFER_SIZE);
  const maskData = maskContext.getImageData(0, 0, ORB_BUFFER_SIZE, ORB_BUFFER_SIZE).data;
  const pixels = imageData.data;
  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index + 3] = Math.max(maskData[index], maskData[index + 1], maskData[index + 2]);
  }
  context.putImageData(champagnePixels(imageData, kind), 0, 0);
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
  canvas.dataset.renderer = "canvas-ruthie-v8-3-preview-match";
  canvas.dataset.ruthieOrbVersion = "8.3-preview-match";
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
  let previousFrame = 0;

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
    const mobile = cssWidth < 700;
    const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.75 : 2.1);
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

  void loadImage(ORB_ASSET).then((image) => {
    if (disposed) return;
    const base = createBaseLayer(image);
    environment.images.base = base;
    loaded = true;
    delete canvas.dataset.renderError;

    const maskJobs = [
      ["outer", V83_MASK_OUTER],
      ["middle", V83_MASK_MIDDLE],
      ["inner", V83_MASK_INNER],
    ] as const;

    for (const [kind, source] of maskJobs) {
      void loadImage(source).then((mask) => {
        if (disposed) return;
        environment.images[kind] = createMaskedLayer(base, mask, kind);
      }).catch((error) => {
        console.warn(`Ruthie ${kind} mask load warning`, error);
        canvas.dataset.renderWarning = `mask-load-${kind}`;
      });
    }
  }).catch((error) => {
    console.error("Ruthie v8.3 base texture load error", error);
    canvas.dataset.renderError = "base-texture-load";
  });

  const draw = (now: number) => {
    if (disposed) return;
    frame = window.requestAnimationFrame(draw);
    const mobile = cssWidth < 700;
    const targetFps = mobile ? 50 : 60;
    if (now - previousFrame < 1000 / targetFps) return;
    previousFrame = now;

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
    if (mode === "listening") modeLevel = .31 + .74 * audio.level;
    else if (mode === "speaking") {
      const speakingLevel = outputAudio
        ? audio.level
        : clamp((Math.sin(time * 5.4) + Math.sin(time * 9.2) * .55 + 1.55) / 3.1, 0, 1);
      modeLevel = .38 + .62 * speakingLevel;
    } else if (mode === "processing") modeLevel = .70;
    else if (mode === "thinking") modeLevel = .53;
    else modeLevel = .24 + .055 * Math.sin(time * 1.25);

    const centerX = cssWidth / 2 + pointer.x * 6;
    const centerY = cssHeight / 2 - 28 + pointer.y * 4;
    const baseRadius = Math.min(cssWidth, cssHeight) * .365;

    let pulse = 1 + .013 * Math.sin(time * 1.15);
    if (mode === "listening") pulse = 1 + .088 * audio.level + Math.sin(time * 1.9) * .006;
    if (mode === "thinking") pulse = .96 + .011 * Math.sin(time * 2.2);
    if (mode === "processing") pulse = 1 + .015 * Math.sin(time * 3.2);
    if (mode === "speaking") pulse = 1.025 + .080 * audio.level + Math.sin(time * 2.1) * .005;
    environment.speakingPulse = pulse;
    environment.speechTempo = audio.tempo;

    context.save();
    context.translate(centerX, centerY + baseRadius * .89);
    context.scale(1, .17);
    radialGlow(environment, 0, 0, baseRadius * .88, .065 + modeLevel * .035);
    context.restore();
    radialGlow(environment, centerX, centerY, baseRadius * 1.08, .015 + modeLevel * .016);

    if (mode === "idle" || mode === "listening" || mode === "speaking") {
      drawOuterField(environment, centerX, centerY, baseRadius, time, modeLevel, mode);
    }

    if (mode === "listening") {
      for (let index = 0; index < 2; index += 1) {
        const unit = (time * .34 + index / 2) % 1;
        context.strokeStyle = `rgba(251, 243, 230,${(1 - unit) * (.018 + .025 * modeLevel)})`;
        context.lineWidth = .55;
        context.beginPath();
        context.arc(centerX, centerY, baseRadius * (1.01 + unit * .17), 0, Math.PI * 2);
        context.stroke();
      }
    }

    if (mode === "speaking") {
      for (let index = 0; index < 3; index += 1) {
        const unit = (time * .64 + index / 3) % 1;
        context.strokeStyle = `rgba(251, 243, 230,${(1 - unit) * (.055 + .065 * modeLevel)})`;
        context.lineWidth = .72 * (1 - unit) + .22;
        context.shadowBlur = 5;
        context.shadowColor = "rgba(200, 167, 125,.52)";
        context.beginPath();
        context.arc(centerX, centerY, baseRadius * (1.01 + unit * .22), 0, Math.PI * 2);
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
