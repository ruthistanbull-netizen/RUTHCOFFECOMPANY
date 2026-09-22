import type { RuthieJarvisPhase } from "./RuthieVoiceOrbJarvisEngine";

type ParticleSphereMountOptions = {
  getPhase: () => RuthieJarvisPhase;
  getMuted: () => boolean;
  stream?: MediaStream | null;
  inputStream?: MediaStream | null;
  outputStream?: MediaStream | null;
};

type Vec3 = { x: number; y: number; z: number };
type NodeSeed = Vec3 & { phase: number };
type ProjectedSphere = {
  x: number;
  y: number;
  front: number;
  size: number;
  alpha: number;
  phase: number;
  depth: number;
};

type AudioProbe = {
  context: AudioContext;
  analyser: AnalyserNode;
  timeDomain: Uint8Array<ArrayBuffer>;
  smooth: number;
};

type SphereProfile = {
  radius: number;
  rotation: number;
  turbulence: number;
  size: number;
  alpha: number;
  energy: number;
};

type Rgb = readonly [number, number, number];
type SpherePalette = {
  dark: Rgb;
  mid: Rgb;
  bright: Rgb;
  white: Rgb;
};

const TAU = Math.PI * 2;
const FRAME_INTERVAL = 1000 / 30;
const SPEAKING_HOLD_MS = 1_350;
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const lerp = (a: number, b: number, amount: number) => a + (b - a) * amount;

const PROFILE: Record<RuthieJarvisPhase, SphereProfile> = {
  connecting: { radius: 1, rotation: 0.11, turbulence: 0.12, size: 0.94, alpha: 0.72, energy: 0.1 },
  listening: { radius: 0.93, rotation: 0.16, turbulence: 0.18, size: 1.04, alpha: 0.78, energy: 0.3 },
  thinking: { radius: 0.72, rotation: 0.48, turbulence: 0.38, size: 1.1, alpha: 0.84, energy: 0.68 },
  acting: { radius: 0.84, rotation: 0.37, turbulence: 0.31, size: 1.12, alpha: 0.85, energy: 0.64 },
  speaking: { radius: 0.82, rotation: 0.19, turbulence: 0.24, size: 1.18, alpha: 0.9, energy: 0.54 },
  error: { radius: 0.91, rotation: 0.08, turbulence: 0.7, size: 1.12, alpha: 0.92, energy: 0.78 },
};

const GOLD_PALETTE: SpherePalette = {
  dark: [31, 21, 8],
  mid: [128, 91, 43],
  bright: [205, 168, 96],
  white: [244, 229, 190],
};

const ERROR_PALETTE: SpherePalette = {
  dark: [52, 5, 4],
  mid: [157, 33, 22],
  bright: [255, 104, 61],
  white: [255, 225, 212],
};

function rgba(color: Rgb, alpha: number) {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
}

function validStream(stream: MediaStream | null | undefined) {
  if (!stream) return null;
  return stream.getAudioTracks().some((track) => track.readyState === "live") ? stream : null;
}

function createAudioProbe(stream: MediaStream | null | undefined): AudioProbe | null {
  const sourceStream = validStream(stream);
  if (!sourceStream) return null;
  try {
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.78;
    context.createMediaStreamSource(sourceStream).connect(analyser);
    void context.resume().catch(() => undefined);
    return {
      context,
      analyser,
      timeDomain: new Uint8Array(new ArrayBuffer(analyser.fftSize)),
      smooth: 0,
    };
  } catch {
    return null;
  }
}

function readAudioLevel(probe: AudioProbe | null, muted: boolean) {
  if (!probe || muted) return 0;
  probe.analyser.getByteTimeDomainData(probe.timeDomain);
  let squareSum = 0;
  for (let index = 0; index < probe.timeDomain.length; index += 1) {
    const centered = (probe.timeDomain[index] - 128) / 128;
    squareSum += centered * centered;
  }
  const rms = Math.sqrt(squareSum / probe.timeDomain.length);
  const level = clamp((rms - 0.008) * 7.2);
  probe.smooth = lerp(probe.smooth, level, 0.24);
  return probe.smooth;
}

function buildNodes(ringCount: number, equatorSegments: number) {
  const nodes: NodeSeed[] = [];
  for (let ring = 0; ring <= ringCount; ring += 1) {
    const latitude = -Math.PI / 2 + (ring / ringCount) * Math.PI;
    const ringRadius = Math.max(0.05, Math.cos(latitude));
    const segmentCount = ring === 0 || ring === ringCount
      ? 1
      : Math.max(7, Math.round(equatorSegments * Math.pow(ringRadius, 0.82)));
    const offset = (ring % 2) * (Math.PI / Math.max(1, segmentCount));

    for (let segment = 0; segment < segmentCount; segment += 1) {
      const angle = (segment / segmentCount) * TAU + offset;
      const jitter = 1 + Math.sin(ring * 12.17 + segment * 7.91) * 0.012;
      nodes.push({
        x: Math.cos(angle) * ringRadius * jitter,
        y: Math.sin(latitude) * jitter,
        z: Math.sin(angle) * ringRadius * jitter,
        phase: (ring * 0.731 + segment * 1.173) % TAU,
      });
    }
  }
  return nodes;
}

function rotatePoint(point: Vec3, xRotation: number, yRotation: number, zRotation: number): Vec3 {
  const cosY = Math.cos(yRotation);
  const sinY = Math.sin(yRotation);
  const x1 = point.x * cosY + point.z * sinY;
  const z1 = -point.x * sinY + point.z * cosY;

  const cosX = Math.cos(xRotation);
  const sinX = Math.sin(xRotation);
  const y2 = point.y * cosX - z1 * sinX;
  const z2 = point.y * sinX + z1 * cosX;

  const cosZ = Math.cos(zRotation);
  const sinZ = Math.sin(zRotation);
  return {
    x: x1 * cosZ - y2 * sinZ,
    y: x1 * sinZ + y2 * cosZ,
    z: z2,
  };
}

function createLitSphereSprite(palette: SpherePalette, intensity: number) {
  const sprite = document.createElement("canvas");
  sprite.width = 96;
  sprite.height = 96;
  const context = sprite.getContext("2d");
  if (!context) return sprite;

  const glow = context.createRadialGradient(48, 48, 10, 48, 48, 46);
  glow.addColorStop(0, rgba(palette.bright, 0.13 * intensity));
  glow.addColorStop(0.48, rgba(palette.bright, 0.05 * intensity));
  glow.addColorStop(1, rgba(palette.bright, 0));
  context.fillStyle = glow;
  context.fillRect(0, 0, 96, 96);

  const body = context.createRadialGradient(34, 31, 2, 49, 50, 30);
  body.addColorStop(0, rgba(palette.white, 0.88));
  body.addColorStop(0.13, rgba(palette.white, 0.84));
  body.addColorStop(0.32, rgba(palette.bright, 0.88));
  body.addColorStop(0.62, rgba(palette.mid, 0.93));
  body.addColorStop(0.86, rgba(palette.dark, 0.96));
  body.addColorStop(1, rgba(palette.dark, 0.88));
  context.fillStyle = body;
  context.beginPath();
  context.arc(48, 48, 29, 0, TAU);
  context.fill();

  const lowerShade = context.createLinearGradient(48, 30, 48, 76);
  lowerShade.addColorStop(0, "rgba(0, 0, 0, 0)");
  lowerShade.addColorStop(0.62, "rgba(0, 0, 0, 0.05)");
  lowerShade.addColorStop(1, `rgba(0, 0, 0, ${0.34 - intensity * 0.05})`);
  context.fillStyle = lowerShade;
  context.beginPath();
  context.arc(48, 48, 29, 0, TAU);
  context.fill();

  context.strokeStyle = rgba(palette.bright, 0.18 + intensity * 0.13);
  context.lineWidth = 1;
  context.beginPath();
  context.arc(48, 48, 28.3, 0, TAU);
  context.stroke();

  context.fillStyle = rgba(palette.white, 0.34 + intensity * 0.17);
  context.beginPath();
  context.ellipse(35, 33, 7.2, 4, -0.58, 0, TAU);
  context.fill();

  context.fillStyle = rgba(palette.white, 0.16 + intensity * 0.1);
  context.beginPath();
  context.arc(31, 40, 2, 0, TAU);
  context.fill();

  return sprite;
}

function createSpriteSet(palette: SpherePalette) {
  return [0.42, 0.58, 0.74, 0.9].map((intensity) => createLitSphereSprite(palette, intensity));
}

export function mountRuthieJarvisParticleSpheres2D(
  canvas: HTMLCanvasElement,
  options: ParticleSphereMountOptions,
) {
  const context = canvas.getContext("2d", { alpha: true, desynchronized: true });
  if (!context) {
    canvas.dataset.renderError = "canvas2d-sphere-renderer-unavailable";
    return () => undefined;
  }

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const nodes = buildNodes(24, 44);
  const projected: ProjectedSphere[] = nodes.map(() => ({
    x: 0,
    y: 0,
    front: 0,
    size: 1,
    alpha: 1,
    phase: 0,
    depth: 0,
  }));
  const goldSprites = createSpriteSet(GOLD_PALETTE);
  const errorSprites = createSpriteSet(ERROR_PALETTE);

  const inputStream = validStream(options.inputStream || options.stream || options.outputStream);
  const outputStream = validStream(options.outputStream || options.inputStream || options.stream);
  const inputProbe = createAudioProbe(inputStream);
  const outputProbe = outputStream === inputStream ? inputProbe : createAudioProbe(outputStream);

  let disposed = false;
  let frame = 0;
  let cssWidth = 1;
  let cssHeight = 1;
  let dpr = 1;
  let lastTime = performance.now();
  let lastPaint = 0;
  let speakingUntil = 0;
  let rotationX = -0.08;
  let rotationY = 0;
  let rotationZ = 0;
  let currentProfile = { ...PROFILE.connecting };

  canvas.dataset.renderer = "ruthie-canvas2d-particle-spheres";
  canvas.dataset.ruthieSphereLayer = "canvas2d-lit-spheres-v2-dense-soft";
  canvas.dataset.renderReady = "false";
  delete canvas.dataset.renderError;

  const resize = () => {
    const rectangle = canvas.getBoundingClientRect();
    cssWidth = Math.max(1, rectangle.width);
    cssHeight = Math.max(1, rectangle.height);
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = Math.max(1, Math.round(cssWidth * dpr));
    const height = Math.max(1, Math.round(cssHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.imageSmoothingEnabled = true;
  };

  const resumeAudio = () => {
    const probes = new Set([inputProbe, outputProbe]);
    for (const probe of probes) {
      if (probe?.context.state === "suspended") void probe.context.resume().catch(() => undefined);
    }
  };

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  window.addEventListener("pointerdown", resumeAudio, { passive: true });
  window.addEventListener("keydown", resumeAudio);
  resize();

  const render = (now: number) => {
    if (disposed) return;
    frame = window.requestAnimationFrame(render);
    if (now - lastPaint < FRAME_INTERVAL) return;

    const rawDelta = Math.min(0.06, Math.max(0.001, (now - lastTime) / 1000));
    const delta = reducedMotion ? Math.min(rawDelta, 1 / 24) : rawDelta;
    lastTime = now;
    lastPaint = now;
    const time = now / 1000;
    const rawPhase = options.getPhase();

    const measuredOutput = readAudioLevel(outputProbe, false);
    const syntheticOutput = !outputProbe && rawPhase === "speaking"
      ? clamp(0.2 + Math.sin(time * 4.8) * 0.08 + Math.sin(time * 8.9) * 0.04, 0.08, 0.34)
      : 0;
    const outputLevel = Math.max(measuredOutput, syntheticOutput);
    if (rawPhase === "speaking" || outputLevel > 0.018) speakingUntil = now + SPEAKING_HOLD_MS;
    const outputAudioActive = rawPhase !== "error" && now < speakingUntil;
    const phase: RuthieJarvisPhase = outputAudioActive ? "speaking" : rawPhase;
    const target = PROFILE[phase] || PROFILE.connecting;
    const interpolation = 1 - Math.pow(0.001, delta);

    for (const key of Object.keys(currentProfile) as Array<keyof SphereProfile>) {
      currentProfile[key] = lerp(currentProfile[key], target[key], interpolation * 0.34);
    }

    const measuredInput = readAudioLevel(inputProbe, options.getMuted());
    const syntheticInput = !inputProbe && phase === "listening"
      ? clamp(0.055 + Math.sin(time * 1.7) * 0.016 + Math.sin(time * 4.1) * 0.008, 0, 0.12)
      : 0;
    const inputLevel = Math.max(measuredInput, syntheticInput);
    const audioLevel = phase === "speaking" ? Math.max(outputLevel, 0.055) : inputLevel;

    canvas.dataset.effectivePhase = phase;
    canvas.dataset.outputAudioActive = outputAudioActive ? "true" : "false";

    const motionScale = reducedMotion ? 0.35 : 1;
    rotationY += delta * currentProfile.rotation * motionScale;
    rotationX = lerp(rotationX, -0.08 + Math.sin(time * 0.19) * 0.025, 0.035);
    rotationZ = lerp(rotationZ, Math.sin(time * 0.13) * 0.022, 0.035);

    const centerX = cssWidth / 2;
    const centerY = cssHeight / 2 - Math.min(12, cssHeight * 0.025);
    const baseRadius = Math.min(cssWidth, cssHeight) * 0.345;
    const radiusAudio = audioLevel * (phase === "speaking" ? 0.13 : 0.075);
    const radius = baseRadius * currentProfile.radius * (1 + radiusAudio);
    const cameraDistance = 3.45;

    for (let index = 0; index < nodes.length; index += 1) {
      const seed = nodes[index];
      const radialWave = Math.sin(time * (0.85 + currentProfile.rotation * 1.2) + seed.phase * 1.7)
        * currentProfile.turbulence * 0.045;
      const secondaryWave = Math.sin(time * 1.9 + seed.y * 5.2 + seed.phase)
        * currentProfile.turbulence * 0.024;
      const voiceWave = phase === "speaking"
        ? Math.sin(time * 7.2 + seed.phase * 2.3) * audioLevel * 0.095 + audioLevel * 0.06
        : phase === "listening"
          ? Math.sin(time * 3.5 + seed.phase) * audioLevel * 0.072
          : 0;
      const thinkingVortex = phase === "thinking" ? Math.sin(seed.y * 8 + time * 2.4) * 0.035 : 0;
      const actingBand = phase === "acting" ? Math.sin(seed.y * 10 - time * 3.1) * 0.032 : 0;
      const glitch = phase === "error"
        ? (Math.sin(time * 42 + seed.phase * 9) > 0.82 ? Math.sin(seed.phase * 13 + time * 17) * 0.075 : 0)
        : 0;
      const pointRadius = radius * (1 + radialWave + secondaryWave + voiceWave + thinkingVortex + actingBand + glitch);
      let x = seed.x * pointRadius;
      let y = seed.y * pointRadius;
      let z = seed.z * pointRadius;

      if (phase === "thinking") {
        const twist = seed.y * 0.58 + time * 0.36;
        const cosine = Math.cos(twist);
        const sine = Math.sin(twist);
        const twistedX = x * cosine + z * sine;
        z = -x * sine + z * cosine;
        x = twistedX;
      } else if (phase === "acting") {
        x *= 1 + Math.abs(seed.y) * 0.08;
        y *= 0.94 + Math.sin(time * 2.8 + seed.phase) * 0.018;
      }

      const rotated = rotatePoint({ x, y, z }, rotationX, rotationY, rotationZ);
      const normalizedZ = rotated.z / Math.max(1, radius);
      const perspective = cameraDistance / (cameraDistance - normalizedZ * 0.62);
      const scale = clamp(perspective, 0.66, 1.45);
      const front = clamp((normalizedZ + 1) * 0.5);
      const depthSize = lerp(0.7, 1.38, front);
      const twinkle = 0.97 + Math.sin(time * 2.15 + seed.phase * 3.7) * 0.035;
      const statePulse = phase === "speaking"
        ? 1 + audioLevel * (0.28 + (index % 7) * 0.01)
        : phase === "thinking" || phase === "acting"
          ? 1 + Math.sin(time * 3.2 + seed.phase) * 0.045
          : 1;

      projected[index] = {
        x: centerX + rotated.x * scale,
        y: centerY + rotated.y * scale,
        front,
        size: 8.2 * currentProfile.size * depthSize * statePulse * twinkle,
        alpha: currentProfile.alpha * clamp((normalizedZ + 1.35) / 2.35, 0.26, 0.94),
        phase: seed.phase,
        depth: normalizedZ,
      };
    }

    projected.sort((left, right) => left.depth - right.depth);
    context.clearRect(0, 0, cssWidth, cssHeight);
    context.globalCompositeOperation = "source-over";

    const sprites = phase === "error" ? errorSprites : goldSprites;
    for (let index = 0; index < projected.length; index += 1) {
      const point = projected[index];
      let variant = point.front < 0.24 ? 0 : point.front < 0.53 ? 1 : point.front < 0.79 ? 2 : 3;
      if (phase === "speaking" && audioLevel > 0.12 && index % 13 === 0) variant = 3;
      const sprite = sprites[variant];
      const drawSize = point.size * (variant === 3 ? 1.05 : 1);
      context.globalAlpha = point.alpha;
      context.drawImage(sprite, point.x - drawSize / 2, point.y - drawSize / 2, drawSize, drawSize);
    }

    context.globalAlpha = 1;
    if (canvas.dataset.renderReady !== "true") canvas.dataset.renderReady = "true";
  };

  frame = window.requestAnimationFrame(render);

  return () => {
    disposed = true;
    window.cancelAnimationFrame(frame);
    observer.disconnect();
    window.removeEventListener("pointerdown", resumeAudio);
    window.removeEventListener("keydown", resumeAudio);
    const probes = new Set([inputProbe, outputProbe]);
    for (const probe of probes) void probe?.context.close().catch(() => undefined);
    context.clearRect(0, 0, cssWidth, cssHeight);
  };
}
