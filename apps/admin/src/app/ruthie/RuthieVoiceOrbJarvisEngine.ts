export type RuthieJarvisPhase =
  | "connecting"
  | "listening"
  | "thinking"
  | "acting"
  | "speaking"
  | "error";

export type RuthieJarvisMountOptions = {
  getPhase: () => RuthieJarvisPhase;
  getMuted: () => boolean;
  stream?: MediaStream | null;
  inputStream?: MediaStream | null;
  outputStream?: MediaStream | null;
};

type Vec3 = { x: number; y: number; z: number };
type ProjectedNode = Vec3 & { sx: number; sy: number; scale: number; alpha: number };
type NodeSeed = Vec3 & { phase: number; ring: number; angle: number };
type Link = { a: number; b: number; strength: number; phase: number };
type Electron = { link: number; progress: number; speed: number; offset: number };

type AudioProbe = {
  context: AudioContext;
  analyser: AnalyserNode;
  frequency: Uint8Array<ArrayBuffer>;
  timeDomain: Uint8Array<ArrayBuffer>;
  smooth: { level: number; bass: number; mid: number; treble: number; tempo: number };
  previousLevel: number;
};

type AudioBands = {
  level: number;
  bass: number;
  mid: number;
  treble: number;
  tempo: number;
};

type PhaseProfile = {
  radius: number;
  rotation: number;
  turbulence: number;
  linkAlpha: number;
  particleAlpha: number;
  particleScale: number;
  electronAlpha: number;
  hue: number;
  saturation: number;
  lightness: number;
};

const TAU = Math.PI * 2;
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const lerp = (a: number, b: number, amount: number) => a + (b - a) * amount;
const ease = (value: number) => 1 - Math.pow(1 - clamp(value), 3);

const PROFILE: Record<RuthieJarvisPhase, PhaseProfile> = {
  connecting: {
    radius: 1,
    rotation: 0.11,
    turbulence: 0.12,
    linkAlpha: 0.15,
    particleAlpha: 0.58,
    particleScale: 0.92,
    electronAlpha: 0.08,
    hue: 201,
    saturation: 70,
    lightness: 67,
  },
  listening: {
    radius: 0.93,
    rotation: 0.16,
    turbulence: 0.18,
    linkAlpha: 0.33,
    particleAlpha: 0.74,
    particleScale: 1.05,
    electronAlpha: 0.15,
    hue: 194,
    saturation: 82,
    lightness: 72,
  },
  thinking: {
    radius: 0.72,
    rotation: 0.48,
    turbulence: 0.38,
    linkAlpha: 0.68,
    particleAlpha: 0.82,
    particleScale: 0.88,
    electronAlpha: 0.95,
    hue: 213,
    saturation: 88,
    lightness: 72,
  },
  acting: {
    radius: 0.84,
    rotation: 0.37,
    turbulence: 0.31,
    linkAlpha: 0.58,
    particleAlpha: 0.85,
    particleScale: 1,
    electronAlpha: 0.84,
    hue: 36,
    saturation: 88,
    lightness: 70,
  },
  speaking: {
    radius: 0.82,
    rotation: 0.19,
    turbulence: 0.24,
    linkAlpha: 0.52,
    particleAlpha: 0.9,
    particleScale: 1.12,
    electronAlpha: 0.26,
    hue: 205,
    saturation: 78,
    lightness: 78,
  },
  error: {
    radius: 0.91,
    rotation: 0.08,
    turbulence: 0.7,
    linkAlpha: 0.3,
    particleAlpha: 0.82,
    particleScale: 1.04,
    electronAlpha: 0.04,
    hue: 5,
    saturation: 84,
    lightness: 64,
  },
};

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
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.72;
    context.createMediaStreamSource(sourceStream).connect(analyser);
    void context.resume().catch(() => undefined);
    return {
      context,
      analyser,
      frequency: new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)),
      timeDomain: new Uint8Array(new ArrayBuffer(analyser.fftSize)),
      smooth: { level: 0, bass: 0, mid: 0, treble: 0, tempo: 0 },
      previousLevel: 0,
    };
  } catch {
    return null;
  }
}

function averageRange(data: Uint8Array<ArrayBuffer>, start: number, end: number) {
  const safeStart = Math.max(0, Math.min(data.length, start));
  const safeEnd = Math.max(safeStart + 1, Math.min(data.length, end));
  let sum = 0;
  for (let index = safeStart; index < safeEnd; index += 1) sum += data[index];
  return sum / (safeEnd - safeStart) / 255;
}

function readAudio(probe: AudioProbe | null, time: number, muted: boolean): AudioBands {
  if (!probe || muted) {
    const idle = 0.055 + Math.sin(time * 1.7) * 0.016 + Math.sin(time * 4.1) * 0.008;
    return {
      level: clamp(idle, 0, 0.12),
      bass: clamp(idle * 1.08),
      mid: clamp(idle * 0.84),
      treble: clamp(idle * 0.52),
      tempo: clamp(0.12 + Math.sin(time * 2.3) * 0.04),
    };
  }

  probe.analyser.getByteFrequencyData(probe.frequency);
  probe.analyser.getByteTimeDomainData(probe.timeDomain);

  let squareSum = 0;
  for (let index = 0; index < probe.timeDomain.length; index += 1) {
    const centered = (probe.timeDomain[index] - 128) / 128;
    squareSum += centered * centered;
  }
  const rms = Math.sqrt(squareSum / probe.timeDomain.length);
  const level = clamp((rms - 0.012) * 5.9);
  const bass = clamp((averageRange(probe.frequency, 1, 11) - 0.035) * 1.65);
  const mid = clamp((averageRange(probe.frequency, 11, 52) - 0.025) * 1.45);
  const treble = clamp((averageRange(probe.frequency, 52, 126) - 0.018) * 1.35);
  const tempo = clamp(Math.abs(level - probe.previousLevel) * 8.5);
  probe.previousLevel = lerp(probe.previousLevel, level, 0.28);

  probe.smooth.level = lerp(probe.smooth.level, level, 0.24);
  probe.smooth.bass = lerp(probe.smooth.bass, bass, 0.22);
  probe.smooth.mid = lerp(probe.smooth.mid, mid, 0.2);
  probe.smooth.treble = lerp(probe.smooth.treble, treble, 0.18);
  probe.smooth.tempo = lerp(probe.smooth.tempo, tempo, 0.2);
  return { ...probe.smooth };
}

function buildMesh(ringCount: number, equatorSegments: number) {
  const nodes: NodeSeed[] = [];
  const rings: number[][] = [];

  for (let ring = 0; ring <= ringCount; ring += 1) {
    const latitude = -Math.PI / 2 + (ring / ringCount) * Math.PI;
    const radius = Math.max(0.045, Math.cos(latitude));
    const segmentCount = ring === 0 || ring === ringCount
      ? 1
      : Math.max(8, Math.round(equatorSegments * Math.pow(radius, 0.82)));
    const indices: number[] = [];
    const offset = (ring % 2) * (Math.PI / Math.max(1, segmentCount));

    for (let segment = 0; segment < segmentCount; segment += 1) {
      const angle = (segment / segmentCount) * TAU + offset;
      const jitter = 1 + Math.sin(ring * 12.17 + segment * 7.91) * 0.012;
      indices.push(nodes.length);
      nodes.push({
        x: Math.cos(angle) * radius * jitter,
        y: Math.sin(latitude) * jitter,
        z: Math.sin(angle) * radius * jitter,
        phase: (ring * 0.731 + segment * 1.173) % TAU,
        ring,
        angle,
      });
    }
    rings.push(indices);
  }

  const links: Link[] = [];
  const addLink = (a: number, b: number, strength: number, phase: number) => {
    if (a === b) return;
    links.push({ a, b, strength, phase });
  };

  for (let ring = 0; ring < rings.length; ring += 1) {
    const current = rings[ring];
    if (current.length > 2) {
      for (let index = 0; index < current.length; index += 1) {
        addLink(current[index], current[(index + 1) % current.length], 0.72, index * 0.17 + ring);
        if (index % 4 === 0) addLink(current[index], current[(index + 2) % current.length], 0.32, index * 0.29);
      }
    }

    const next = rings[ring + 1];
    if (!next) continue;
    for (let index = 0; index < current.length; index += 1) {
      const currentNode = nodes[current[index]];
      let best = next[0];
      let second = next[0];
      let bestDistance = Infinity;
      let secondDistance = Infinity;
      for (const candidate of next) {
        const candidateNode = nodes[candidate];
        const raw = Math.abs(currentNode.angle - candidateNode.angle);
        const angularDistance = Math.min(raw, TAU - raw);
        if (angularDistance < bestDistance) {
          second = best;
          secondDistance = bestDistance;
          best = candidate;
          bestDistance = angularDistance;
        } else if (angularDistance < secondDistance) {
          second = candidate;
          secondDistance = angularDistance;
        }
      }
      addLink(current[index], best, 0.82, ring * 0.43 + index * 0.13);
      if (index % 3 === 0 && second !== best) addLink(current[index], second, 0.38, ring * 0.19 + index * 0.21);
    }
  }

  return { nodes, links };
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

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function drawWaveform(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  phase: RuthieJarvisPhase,
  audio: AudioBands,
  time: number,
  hue: number,
) {
  const bars = width < 520 ? 31 : 45;
  const maxWidth = Math.min(width * 0.54, 420);
  const gap = maxWidth / bars;
  const centerX = width / 2;
  const baseY = height - Math.max(22, height * 0.045);
  const active = phase === "listening" || phase === "speaking" || phase === "acting";
  context.save();
  context.globalCompositeOperation = "lighter";
  context.lineCap = "round";
  for (let index = 0; index < bars; index += 1) {
    const normalized = index / Math.max(1, bars - 1);
    const centerWeight = Math.sin(normalized * Math.PI);
    const synthetic = 0.22 + Math.sin(time * 4.8 + index * 0.63) * 0.12 + Math.sin(time * 8.1 - index * 0.29) * 0.07;
    const energy = active
      ? clamp(audio.level * 0.9 + audio.mid * 0.55 + audio.treble * 0.25 + synthetic * 0.18)
      : clamp(synthetic * 0.23);
    const barHeight = 2 + centerWeight * (4 + energy * Math.min(34, height * 0.06));
    const x = centerX + (index - (bars - 1) / 2) * gap;
    context.strokeStyle = `hsla(${hue}, 88%, 72%, ${0.09 + centerWeight * (active ? 0.38 : 0.14)})`;
    context.lineWidth = width < 520 ? 1.15 : 1.4;
    context.beginPath();
    context.moveTo(x, baseY - barHeight / 2);
    context.lineTo(x, baseY + barHeight / 2);
    context.stroke();
  }
  context.restore();
}

export function mountRuthieJarvisNeuralCore(
  canvas: HTMLCanvasElement,
  options: RuthieJarvisMountOptions,
) {
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) {
    canvas.dataset.renderError = "canvas-unavailable";
    return () => undefined;
  }

  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mesh = buildMesh(coarsePointer ? 22 : 31, coarsePointer ? 38 : 54);
  const projected = mesh.nodes.map<ProjectedNode>(() => ({ x: 0, y: 0, z: 0, sx: 0, sy: 0, scale: 1, alpha: 1 }));
  const electrons: Electron[] = Array.from({ length: coarsePointer ? 10 : 18 }, (_, index) => ({
    link: (index * 97) % Math.max(1, mesh.links.length),
    progress: (index / Math.max(1, (coarsePointer ? 10 : 18) - 1)) % 1,
    speed: 0.035 + (index % 5) * 0.006,
    offset: index * 0.41,
  }));

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
  let rotationX = -0.08;
  let rotationY = 0;
  let rotationZ = 0;
  let pointerX = 0;
  let pointerY = 0;
  let pointerTargetX = 0;
  let pointerTargetY = 0;
  let currentProfile = { ...PROFILE.connecting };

  canvas.dataset.renderer = "ruthie-jarvis-neural-core-canvas";
  canvas.dataset.ruthieOrbVersion = "jarvis-neural-core-v1";
  delete canvas.dataset.renderError;

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    cssWidth = Math.max(1, rect.width);
    cssHeight = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, coarsePointer ? 1.6 : 2.1);
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
    const rect = canvas.getBoundingClientRect();
    pointerTargetX = ((event.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * 2;
    pointerTargetY = ((event.clientY - rect.top) / Math.max(1, rect.height) - 0.5) * 2;
  };

  const resetPointer = () => {
    pointerTargetX = 0;
    pointerTargetY = 0;
  };

  const resumeAudio = () => {
    const probes = new Set([inputProbe, outputProbe]);
    for (const probe of probes) {
      if (probe?.context.state === "suspended") void probe.context.resume().catch(() => undefined);
    }
  };

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  canvas.addEventListener("pointermove", onPointerMove, { passive: true });
  canvas.addEventListener("pointerleave", resetPointer, { passive: true });
  window.addEventListener("pointerdown", resumeAudio, { passive: true });
  window.addEventListener("keydown", resumeAudio);
  resize();

  const render = (now: number) => {
    if (disposed) return;
    frame = window.requestAnimationFrame(render);
    const rawDelta = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
    const delta = reducedMotion ? Math.min(rawDelta, 1 / 30) : rawDelta;
    lastTime = now;
    const time = now / 1000;
    const phase = options.getPhase();
    const target = PROFILE[phase] || PROFILE.connecting;
    const interpolation = 1 - Math.pow(0.001, delta);

    for (const key of Object.keys(currentProfile) as Array<keyof PhaseProfile>) {
      currentProfile[key] = lerp(currentProfile[key], target[key], interpolation * 0.34);
    }

    const selectedProbe = phase === "speaking" ? outputProbe : inputProbe;
    const audio = readAudio(selectedProbe, time, options.getMuted());
    const phaseEnergy = phase === "thinking" ? 0.68
      : phase === "acting" ? 0.62
        : phase === "speaking" ? 0.34 + audio.level * 0.78
          : phase === "listening" ? 0.2 + audio.level * 0.88
            : phase === "error" ? 0.76
              : 0.12;

    pointerX = lerp(pointerX, pointerTargetX, 0.055);
    pointerY = lerp(pointerY, pointerTargetY, 0.055);
    const motionScale = reducedMotion ? 0.35 : 1;
    rotationY += delta * currentProfile.rotation * motionScale;
    rotationX = lerp(rotationX, -0.08 + pointerY * 0.13 + Math.sin(time * 0.19) * 0.025, 0.035);
    rotationZ = lerp(rotationZ, pointerX * -0.08 + Math.sin(time * 0.13) * 0.022, 0.035);

    context.clearRect(0, 0, cssWidth, cssHeight);
    const centerX = cssWidth / 2 + pointerX * Math.min(12, cssWidth * 0.018);
    const centerY = cssHeight / 2 - Math.min(12, cssHeight * 0.025) + pointerY * Math.min(7, cssHeight * 0.012);
    const baseRadius = Math.min(cssWidth, cssHeight) * (coarsePointer ? 0.345 : 0.37);
    const hue = currentProfile.hue;
    const radius = baseRadius * currentProfile.radius * (1 + audio.bass * (phase === "speaking" ? 0.12 : 0.07));
    const cameraDistance = 3.45;

    const ambient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius * 1.6);
    ambient.addColorStop(0, `hsla(${hue}, 82%, 64%, ${0.055 + phaseEnergy * 0.045})`);
    ambient.addColorStop(0.46, `hsla(${hue}, 78%, 56%, ${0.025 + phaseEnergy * 0.025})`);
    ambient.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = ambient;
    context.fillRect(centerX - radius * 1.7, centerY - radius * 1.7, radius * 3.4, radius * 3.4);

    if (phase === "listening" || phase === "speaking") {
      context.save();
      context.globalCompositeOperation = "lighter";
      for (let ring = 0; ring < 3; ring += 1) {
        const progress = (time * (phase === "speaking" ? 0.52 : 0.34) + ring / 3) % 1;
        context.strokeStyle = `hsla(${hue}, 90%, 75%, ${(1 - progress) * (0.035 + audio.level * 0.11)})`;
        context.lineWidth = 0.8 + (1 - progress) * 0.8;
        context.beginPath();
        context.arc(centerX, centerY, radius * (1.01 + progress * 0.27), 0, TAU);
        context.stroke();
      }
      context.restore();
    }

    for (let index = 0; index < mesh.nodes.length; index += 1) {
      const seed = mesh.nodes[index];
      const radialWave = Math.sin(time * (0.85 + currentProfile.rotation * 1.2) + seed.phase * 1.7) * currentProfile.turbulence * 0.045;
      const secondaryWave = Math.sin(time * 1.9 + seed.y * 5.2 + seed.phase) * currentProfile.turbulence * 0.024;
      const voiceWave = phase === "speaking"
        ? Math.sin(time * 7.2 + seed.phase * 2.3) * audio.mid * 0.095 + audio.bass * 0.06
        : phase === "listening"
          ? Math.sin(time * 3.5 + seed.phase) * audio.level * 0.072
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
        const cos = Math.cos(twist);
        const sin = Math.sin(twist);
        const tx = x * cos + z * sin;
        z = -x * sin + z * cos;
        x = tx;
      } else if (phase === "acting") {
        x *= 1 + Math.abs(seed.y) * 0.08;
        y *= 0.94 + Math.sin(time * 2.8 + seed.phase) * 0.018;
      }

      const rotated = rotatePoint({ x, y, z }, rotationX, rotationY, rotationZ);
      const normalizedZ = rotated.z / Math.max(1, radius);
      const perspective = cameraDistance / (cameraDistance - normalizedZ * 0.62);
      const scale = clamp(perspective, 0.66, 1.45);
      projected[index] = {
        ...rotated,
        sx: centerX + rotated.x * scale,
        sy: centerY + rotated.y * scale,
        scale,
        alpha: clamp((normalizedZ + 1.35) / 2.35, 0.18, 1),
      };
    }

    context.save();
    context.globalCompositeOperation = "lighter";
    const linkPulse = phase === "thinking" || phase === "acting" ? 0.5 + Math.sin(time * 4.2) * 0.5 : 0.55;
    for (let index = 0; index < mesh.links.length; index += 1) {
      const link = mesh.links[index];
      const a = projected[link.a];
      const b = projected[link.b];
      if (a.z < -radius * 0.82 && b.z < -radius * 0.82) continue;
      const depth = clamp((a.alpha + b.alpha) / 2);
      const shimmer = 0.68 + Math.sin(time * 1.75 + link.phase) * 0.18;
      const alpha = currentProfile.linkAlpha * link.strength * depth * shimmer * (0.58 + phaseEnergy * 0.48);
      if (alpha < 0.015) continue;
      context.strokeStyle = `hsla(${hue + (phase === "acting" ? linkPulse * 11 : 0)}, ${currentProfile.saturation}%, ${currentProfile.lightness}%, ${alpha * 0.37})`;
      context.lineWidth = 0.35 + depth * 0.55 + phaseEnergy * 0.18;
      context.beginPath();
      context.moveTo(a.sx, a.sy);
      context.lineTo(b.sx, b.sy);
      context.stroke();
    }

    const sorted = projected.map((point, index) => ({ point, index })).sort((left, right) => left.point.z - right.point.z);
    for (const item of sorted) {
      const point = item.point;
      const seed = mesh.nodes[item.index];
      const twinkle = 0.76 + Math.sin(time * 2.1 + seed.phase * 3.7) * 0.2;
      const size = (0.72 + point.scale * 1.18) * currentProfile.particleScale * (1 + audio.treble * 0.32);
      const alpha = currentProfile.particleAlpha * point.alpha * twinkle;
      context.fillStyle = `hsla(${hue + Math.sin(seed.phase) * 8}, ${currentProfile.saturation}%, ${currentProfile.lightness + point.alpha * 9}%, ${alpha})`;
      context.beginPath();
      context.arc(point.sx, point.sy, size, 0, TAU);
      context.fill();
      if (point.alpha > 0.72 && item.index % 13 === 0) {
        context.fillStyle = `hsla(${hue}, 90%, 88%, ${alpha * 0.34})`;
        context.beginPath();
        context.arc(point.sx, point.sy, size * 2.6, 0, TAU);
        context.fill();
      }
    }

    for (let index = 0; index < electrons.length; index += 1) {
      const electron = electrons[index];
      electron.progress = (electron.progress + delta * electron.speed * (0.7 + currentProfile.rotation * 2.8)) % 1;
      if (electron.progress < delta * electron.speed * (0.7 + currentProfile.rotation * 2.8)) {
        electron.link = (electron.link + 73 + index * 17) % Math.max(1, mesh.links.length);
      }
      const link = mesh.links[electron.link];
      if (!link) continue;
      const a = projected[link.a];
      const b = projected[link.b];
      const travel = ease(electron.progress);
      const x = lerp(a.sx, b.sx, travel);
      const y = lerp(a.sy, b.sy, travel);
      const depth = lerp(a.alpha, b.alpha, travel);
      const alpha = currentProfile.electronAlpha * depth * (0.72 + Math.sin(time * 4 + electron.offset) * 0.2);
      if (alpha < 0.02) continue;
      const electronHue = phase === "acting" && index % 3 === 0 ? 39 : hue;
      context.fillStyle = `hsla(${electronHue}, 95%, 88%, ${alpha})`;
      context.shadowColor = `hsla(${electronHue}, 95%, 72%, ${alpha})`;
      context.shadowBlur = 9 + phaseEnergy * 8;
      context.beginPath();
      context.arc(x, y, 1.05 + depth * 0.9, 0, TAU);
      context.fill();
    }
    context.shadowBlur = 0;

    if (phase === "acting" || phase === "thinking") {
      const orbitCount = phase === "acting" ? 3 : 2;
      for (let orbit = 0; orbit < orbitCount; orbit += 1) {
        context.save();
        context.translate(centerX, centerY);
        context.rotate(time * (0.18 + orbit * 0.04) * (orbit % 2 === 0 ? 1 : -1) + orbit * 1.2);
        context.scale(1, 0.34 + orbit * 0.09);
        context.strokeStyle = `hsla(${phase === "acting" ? 39 : hue}, 88%, 72%, ${0.075 + phaseEnergy * 0.055 - orbit * 0.01})`;
        context.lineWidth = 0.85;
        context.setLineDash([Math.max(5, radius * 0.045), Math.max(8, radius * 0.075)]);
        context.lineDashOffset = -time * (12 + orbit * 6);
        context.beginPath();
        context.arc(0, 0, radius * (1.08 + orbit * 0.115), 0, TAU);
        context.stroke();
        context.restore();
      }
      context.setLineDash([]);
    }

    const core = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius * 0.33);
    core.addColorStop(0, `hsla(${hue}, 95%, 88%, ${0.12 + phaseEnergy * 0.13 + audio.level * 0.11})`);
    core.addColorStop(0.24, `hsla(${hue}, 92%, 66%, ${0.07 + phaseEnergy * 0.07})`);
    core.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = core;
    context.beginPath();
    context.arc(centerX, centerY, radius * 0.34, 0, TAU);
    context.fill();

    if (phase === "error") {
      context.globalCompositeOperation = "screen";
      context.fillStyle = `rgba(225, 96, 107, ${0.025 + Math.sin(time * 18) * 0.012})`;
      for (let line = 0; line < 4; line += 1) {
        const y = centerY - radius * 0.7 + ((time * 97 + line * 71) % (radius * 1.4));
        roundedRect(context, centerX - radius * 0.83, y, radius * 1.66, 1 + (line % 2), 1);
        context.fill();
      }
    }
    context.restore();

    drawWaveform(context, cssWidth, cssHeight, phase, audio, time, hue);
  };

  frame = window.requestAnimationFrame(render);

  return () => {
    disposed = true;
    window.cancelAnimationFrame(frame);
    observer.disconnect();
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerleave", resetPointer);
    window.removeEventListener("pointerdown", resumeAudio);
    window.removeEventListener("keydown", resumeAudio);
    const probes = new Set([inputProbe, outputProbe]);
    for (const probe of probes) void probe?.context.close().catch(() => undefined);
    context.clearRect(0, 0, cssWidth, cssHeight);
  };
}
