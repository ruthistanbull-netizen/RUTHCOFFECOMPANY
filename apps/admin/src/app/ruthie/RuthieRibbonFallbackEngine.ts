export type RuthieRibbonFallbackPhase =
  | "connecting"
  | "listening"
  | "thinking"
  | "acting"
  | "speaking"
  | "error";

export type RuthieRibbonFallbackOptions = {
  getPhase: () => RuthieRibbonFallbackPhase;
  getMuted: () => boolean;
  stream?: MediaStream | null;
  inputStream?: MediaStream | null;
  outputStream?: MediaStream | null;
};

type AudioProbe = {
  context: AudioContext;
  analyser: AnalyserNode;
  frequency: Uint8Array;
  timeDomain: Uint8Array;
  level: number;
  bass: number;
  mid: number;
  treble: number;
};

type RibbonConfig = {
  phase: number;
  width: number;
  height: number;
  y: number;
  depth: number;
  speed: number;
  alpha: number;
  hueA: number;
  hueB: number;
  direction: number;
};

type Point = { x: number; y: number };

const RIBBONS: RibbonConfig[] = [
  { phase: 0.2, width: 1.06, height: 0.82, y: 0.0, depth: 1.0, speed: 0.46, alpha: 0.84, hueA: 190, hueB: 222, direction: 1 },
  { phase: 1.35, width: 0.98, height: 0.96, y: -0.12, depth: 0.82, speed: -0.34, alpha: 0.62, hueA: 214, hueB: 258, direction: -1 },
  { phase: 2.65, width: 0.78, height: 0.72, y: 0.08, depth: 1.12, speed: 0.62, alpha: 0.78, hueA: 186, hueB: 238, direction: 1 },
  { phase: 4.0, width: 0.94, height: 0.9, y: 0.18, depth: 0.76, speed: -0.42, alpha: 0.64, hueA: 258, hueB: 314, direction: -1 },
  { phase: 5.2, width: 1.0, height: 0.74, y: -0.04, depth: 0.62, speed: 0.3, alpha: 0.48, hueA: 282, hueB: 328, direction: 1 },
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, amount: number) {
  return a + (b - a) * amount;
}

function validStream(stream: MediaStream | null | undefined) {
  if (!stream) return null;
  return stream.getAudioTracks().some((track) => track.readyState === "live")
    ? stream
    : null;
}

function createAudioProbe(stream: MediaStream | null | undefined): AudioProbe | null {
  const source = validStream(stream);
  if (!source) return null;
  try {
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.8;
    context.createMediaStreamSource(source).connect(analyser);
    void context.resume().catch(() => undefined);
    return {
      context,
      analyser,
      frequency: new Uint8Array(analyser.frequencyBinCount),
      timeDomain: new Uint8Array(analyser.fftSize),
      level: 0,
      bass: 0,
      mid: 0,
      treble: 0,
    };
  } catch {
    return null;
  }
}

function average(data: Uint8Array, start: number, end: number) {
  const upper = Math.min(data.length, end);
  let sum = 0;
  for (let index = start; index < upper; index += 1) sum += data[index];
  return sum / Math.max(1, upper - start) / 255;
}

function readAudio(probe: AudioProbe | null, time: number, muted: boolean) {
  if (!probe || muted) {
    return {
      level: clamp(0.075 + Math.sin(time * 1.7) * 0.018 + Math.sin(time * 4.1) * 0.009, 0.04, 0.14),
      bass: 0.085 + Math.sin(time * 1.35) * 0.018,
      mid: 0.07 + Math.sin(time * 2.55) * 0.015,
      treble: 0.055 + Math.sin(time * 4.2) * 0.013,
    };
  }

  probe.analyser.getByteFrequencyData(probe.frequency);
  probe.analyser.getByteTimeDomainData(probe.timeDomain);
  let squareSum = 0;
  for (const sample of probe.timeDomain) {
    const centered = (sample - 128) / 128;
    squareSum += centered * centered;
  }
  const rms = Math.sqrt(squareSum / probe.timeDomain.length);
  probe.level = lerp(probe.level, clamp((rms - 0.01) * 5.7, 0, 1), 0.21);
  probe.bass = lerp(probe.bass, average(probe.frequency, 2, 18), 0.19);
  probe.mid = lerp(probe.mid, average(probe.frequency, 18, 74), 0.2);
  probe.treble = lerp(probe.treble, average(probe.frequency, 74, 154), 0.22);
  return {
    level: probe.level,
    bass: probe.bass,
    mid: probe.mid,
    treble: probe.treble,
  };
}

function phaseProfile(phase: RuthieRibbonFallbackPhase) {
  switch (phase) {
    case "listening":
      return { speed: 0.76, energy: 0.45, openness: 1.08, compression: 0, glow: 1 };
    case "thinking":
      return { speed: 1.22, energy: 0.6, openness: 0.92, compression: 0.26, glow: 1.08 };
    case "acting":
      return { speed: 1.5, energy: 0.78, openness: 1.0, compression: 0.14, glow: 1.16 };
    case "speaking":
      return { speed: 0.98, energy: 0.7, openness: 1.12, compression: 0, glow: 1.12 };
    case "error":
      return { speed: 0.2, energy: 0.28, openness: 0.88, compression: 0.22, glow: 0.62 };
    default:
      return { speed: 0.36, energy: 0.22, openness: 1, compression: 0.06, glow: 0.72 };
  }
}

function curvePoint(
  amount: number,
  time: number,
  config: RibbonConfig,
  energy: number,
  openness: number,
  compression: number,
  width: number,
  height: number,
): Point {
  const t = amount * Math.PI * 2 - Math.PI;
  const clock = time * config.speed + config.phase;
  const x = (
    Math.sin(t) * width * 0.42
    + Math.sin(t * 2 + config.phase) * width * 0.1
    + Math.cos(t * 3 - clock * 0.25) * width * 0.035
  ) * openness * (1 - compression * 0.12);
  const y =
    Math.sin(t * 2 + config.phase * 0.7 + clock * 0.28) * height * 0.19 * config.height
    + Math.cos(t * 3 - clock * 0.22) * height * 0.055
    + config.y * height
    + Math.sin(t * 5 + clock) * height * energy * 0.012;
  return { x, y };
}

function ribbonEdges(
  time: number,
  config: RibbonConfig,
  energy: number,
  openness: number,
  compression: number,
  width: number,
  height: number,
) {
  const upper: Point[] = [];
  const lower: Point[] = [];
  const center: Point[] = [];
  const count = 72;

  for (let index = 0; index <= count; index += 1) {
    const amount = index / count;
    const point = curvePoint(amount, time, config, energy, openness, compression, width, height);
    const before = curvePoint(Math.max(0, amount - 0.002), time, config, energy, openness, compression, width, height);
    const after = curvePoint(Math.min(1, amount + 0.002), time, config, energy, openness, compression, width, height);
    const dx = after.x - before.x;
    const dy = after.y - before.y;
    const length = Math.hypot(dx, dy) || 1;
    const normalX = -dy / length;
    const normalY = dx / length;
    const envelope = Math.pow(Math.max(0, Math.sin(amount * Math.PI)), 0.28);
    const twist = Math.sin(amount * Math.PI * 4 + time * config.speed + config.phase) * 0.2;
    const ribbonWidth = width * config.width * 0.105 * envelope * (1 + energy * 0.16);
    const perspective = 0.78 + config.depth * 0.18 + Math.cos(amount * Math.PI * 2 + config.phase) * 0.05;
    const offset = ribbonWidth * perspective * (1 + twist);
    upper.push({ x: point.x + normalX * offset, y: point.y + normalY * offset });
    lower.push({ x: point.x - normalX * offset, y: point.y - normalY * offset });
    center.push(point);
  }
  return { upper, lower, center };
}

function smoothPath(context: CanvasRenderingContext2D, points: Point[]) {
  if (!points.length) return;
  context.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    context.quadraticCurveTo(current.x, current.y, (current.x + next.x) / 2, (current.y + next.y) / 2);
  }
  const last = points[points.length - 1];
  context.lineTo(last.x, last.y);
}

function drawRibbon(
  context: CanvasRenderingContext2D,
  time: number,
  config: RibbonConfig,
  index: number,
  audio: ReturnType<typeof readAudio>,
  profile: ReturnType<typeof phaseProfile>,
  width: number,
  height: number,
) {
  const frequency = index % 3 === 0 ? audio.bass : index % 3 === 1 ? audio.mid : audio.treble;
  const energy = clamp(profile.energy + audio.level * 0.55 + frequency * 0.24, 0.1, 1);
  const edges = ribbonEdges(time, config, energy, profile.openness, profile.compression, width, height);

  const path = new Path2D();
  smoothPath(path as unknown as CanvasRenderingContext2D, edges.upper);
  for (let pointIndex = edges.lower.length - 1; pointIndex >= 0; pointIndex -= 1) {
    const point = edges.lower[pointIndex];
    path.lineTo(point.x, point.y);
  }
  path.closePath();

  const gradient = context.createLinearGradient(-width * 0.45, 0, width * 0.45, 0);
  gradient.addColorStop(0, `hsla(${config.hueA}, 100%, 62%, ${config.alpha * 0.88})`);
  gradient.addColorStop(0.42, `hsla(${(config.hueA + config.hueB) / 2}, 100%, 60%, ${config.alpha})`);
  gradient.addColorStop(0.72, `hsla(${config.hueB}, 100%, 64%, ${config.alpha * 0.92})`);
  gradient.addColorStop(1, `hsla(${Math.min(330, config.hueB + 18)}, 100%, 62%, ${config.alpha * 0.68})`);

  context.save();
  context.globalCompositeOperation = "screen";
  context.globalAlpha = 0.5 + config.depth * 0.28;
  context.fillStyle = gradient;
  context.shadowColor = `hsla(${config.hueA}, 100%, 64%, ${0.46 * profile.glow})`;
  context.shadowBlur = 28 * profile.glow;
  context.fill(path);

  context.globalAlpha = 0.16 + energy * 0.12;
  context.fillStyle = "rgba(210,238,255,.36)";
  context.shadowBlur = 10;
  context.fill(path);

  context.clip(path);
  context.shadowBlur = 0;
  context.lineWidth = 0.7;
  for (let lineIndex = 0; lineIndex < 18; lineIndex += 1) {
    const mix = lineIndex / 17;
    context.beginPath();
    for (let pointIndex = 0; pointIndex < edges.upper.length; pointIndex += 1) {
      const top = edges.upper[pointIndex];
      const bottom = edges.lower[pointIndex];
      const x = lerp(top.x, bottom.x, mix);
      const y = lerp(top.y, bottom.y, mix);
      if (pointIndex === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.strokeStyle = `hsla(${lerp(config.hueA, config.hueB, mix)}, 100%, 76%, ${0.12 + energy * 0.08})`;
    context.stroke();
  }

  context.globalAlpha = 0.34 + energy * 0.18;
  for (let pointIndex = 4; pointIndex < edges.center.length - 4; pointIndex += 4) {
    const point = edges.center[pointIndex];
    const amount = pointIndex / edges.center.length;
    const radius = 0.8 + (Math.sin(amount * 20 + time * 2 + config.phase) * 0.5 + 0.5) * 1.25;
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.fillStyle = amount < 0.55 ? "rgba(140,232,255,.9)" : "rgba(222,126,255,.82)";
    context.fill();
  }
  context.restore();
}

export function mountRuthieRibbonFallback(
  canvas: HTMLCanvasElement,
  options: RuthieRibbonFallbackOptions,
) {
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) throw new Error("Canvas2D ribbon fallback is unavailable.");

  const inputStream = options.inputStream || options.stream || null;
  const outputStream = options.outputStream || options.stream || null;
  const inputAudio = createAudioProbe(inputStream);
  const outputAudio = outputStream === inputStream ? inputAudio : createAudioProbe(outputStream);
  let disposed = false;
  let frame = 0;
  let width = 1;
  let height = 1;
  let dpr = 1;
  const startedAt = performance.now();

  canvas.dataset.renderer = "canvas2d-silk-ribbon-v5.2-fallback";
  canvas.dataset.ruthieOrbVersion = "silk-ribbon-panel-v5.2";
  canvas.dataset.renderStage = "ready";
  delete canvas.dataset.renderError;

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  const render = (now: number) => {
    if (disposed) return;
    const elapsed = (now - startedAt) / 1000;
    const phase = options.getPhase();
    const profile = phaseProfile(phase);
    const selected = phase === "speaking" ? outputAudio || inputAudio : inputAudio || outputAudio;
    const audio = readAudio(selected, elapsed, options.getMuted());

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    context.save();
    context.translate(width / 2, height * 0.5);

    const glow = context.createRadialGradient(0, 0, 0, 0, 0, Math.min(width, height) * 0.42);
    glow.addColorStop(0, `rgba(42,155,255,${0.12 + audio.level * 0.08})`);
    glow.addColorStop(0.5, "rgba(91,70,255,.055)");
    glow.addColorStop(0.78, "rgba(221,54,255,.028)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = glow;
    context.beginPath();
    context.arc(0, 0, Math.min(width, height) * 0.42, 0, Math.PI * 2);
    context.fill();

    context.save();
    context.globalCompositeOperation = "screen";
    context.lineWidth = 1;
    for (let orbit = 0; orbit < 4; orbit += 1) {
      context.save();
      context.rotate(elapsed * (orbit % 2 ? -0.018 : 0.022) * profile.speed + orbit * 0.4);
      context.setLineDash([width * 0.18, width * 0.08, width * 0.035, width * 0.12]);
      context.strokeStyle = orbit < 2 ? "rgba(70,201,255,.22)" : "rgba(195,71,255,.18)";
      context.beginPath();
      context.ellipse(0, 0, width * (0.31 + orbit * 0.022), height * (0.23 - orbit * 0.01), orbit * 0.16, -2.4, 2.7);
      context.stroke();
      context.restore();
    }
    context.restore();

    const renderWidth = Math.min(width * 1.04, 860);
    const renderHeight = Math.min(height * 0.98, 540);
    const ordered = [...RIBBONS].sort((a, b) => a.depth - b.depth);
    ordered.forEach((config, index) => {
      drawRibbon(context, elapsed, config, index, audio, profile, renderWidth, renderHeight);
    });

    context.restore();
    frame = requestAnimationFrame(render);
  };

  frame = requestAnimationFrame(render);

  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    for (const probe of new Set([inputAudio, outputAudio])) {
      if (probe) void probe.context.close().catch(() => undefined);
    }
  };
}
