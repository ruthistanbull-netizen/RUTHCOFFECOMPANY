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
  clipX: number;
  clipY: number;
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

const TAU = Math.PI * 2;
const FLOATS_PER_SPHERE = 6;
const OUTPUT_ACTIVITY_THRESHOLD = 0.012;
const OUTPUT_ACTIVITY_HOLD_MS = 1_350;
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const lerp = (a: number, b: number, amount: number) => a + (b - a) * amount;

const PROFILE: Record<RuthieJarvisPhase, SphereProfile> = {
  connecting: { radius: 1, rotation: 0.11, turbulence: 0.12, size: 0.94, alpha: 0.72, energy: 0.1 },
  listening: { radius: 0.93, rotation: 0.16, turbulence: 0.18, size: 1.04, alpha: 0.78, energy: 0.3 },
  thinking: { radius: 0.72, rotation: 0.48, turbulence: 0.38, size: 1.1, alpha: 0.84, energy: 0.68 },
  acting: { radius: 0.84, rotation: 0.37, turbulence: 0.31, size: 1.12, alpha: 0.85, energy: 0.64 },
  speaking: { radius: 0.82, rotation: 0.22, turbulence: 0.27, size: 1.18, alpha: 0.9, energy: 0.58 },
  error: { radius: 0.91, rotation: 0.08, turbulence: 0.7, size: 1.12, alpha: 0.92, energy: 0.78 },
};

const VERTEX_SHADER_SOURCE = `
attribute vec2 a_position;
attribute float a_size;
attribute float a_alpha;
attribute float a_front;
attribute float a_phase;

uniform float u_dpr;

varying float v_alpha;
varying float v_front;
varying float v_phase;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  gl_PointSize = a_size * u_dpr;
  v_alpha = a_alpha;
  v_front = a_front;
  v_phase = a_phase;
}
`;

const FRAGMENT_SHADER_SOURCE = `
precision mediump float;

uniform float u_time;
uniform float u_energy;
uniform float u_error;

varying float v_alpha;
varying float v_front;
varying float v_phase;

void main() {
  vec2 point = gl_PointCoord * 2.0 - 1.0;
  point.y = -point.y;
  float distanceFromCenter = length(point);
  if (distanceFromCenter > 1.0) discard;

  const float bodyRadius = 0.69;
  float bodyMask = 1.0 - smoothstep(bodyRadius - 0.035, bodyRadius, distanceFromCenter);
  float haloMask = exp(-7.8 * max(0.0, distanceFromCenter - bodyRadius)) * (1.0 - bodyMask);

  // Soft champagne gold: lower white clipping and a tighter, subtler halo.
  vec3 goldDark = vec3(0.026, 0.017, 0.005);
  vec3 goldMid = vec3(0.34, 0.22, 0.055);
  vec3 goldBright = vec3(0.82, 0.62, 0.22);
  vec3 goldWhite = vec3(0.96, 0.90, 0.72);

  vec3 errorDark = vec3(0.055, 0.004, 0.003);
  vec3 errorMid = vec3(0.58, 0.035, 0.018);
  vec3 errorBright = vec3(1.0, 0.22, 0.11);
  vec3 errorWhite = vec3(1.0, 0.84, 0.78);

  vec3 darkColor = mix(goldDark, errorDark, u_error);
  vec3 midColor = mix(goldMid, errorMid, u_error);
  vec3 brightColor = mix(goldBright, errorBright, u_error);
  vec3 whiteColor = mix(goldWhite, errorWhite, u_error);

  vec3 bodyColor = darkColor;
  float bodyAlpha = 0.0;

  if (bodyMask > 0.0) {
    vec2 sphereXY = point / bodyRadius;
    float sphereZ = sqrt(max(0.0, 1.0 - dot(sphereXY, sphereXY)));
    vec3 normal = normalize(vec3(sphereXY, sphereZ));
    vec3 lightDirection = normalize(vec3(-0.54, 0.64, 0.76));
    vec3 fillDirection = normalize(vec3(0.58, -0.42, 0.68));
    vec3 viewDirection = vec3(0.0, 0.0, 1.0);

    float diffuse = max(dot(normal, lightDirection), 0.0);
    float fillLight = max(dot(normal, fillDirection), 0.0);
    vec3 reflectedLight = reflect(-lightDirection, normal);
    float specular = pow(max(dot(reflectedLight, viewDirection), 0.0), 48.0);
    float tightSpecular = pow(max(dot(reflectedLight, viewDirection), 0.0), 118.0);
    float rim = pow(1.0 - sphereZ, 2.3);
    float lowerShadow = smoothstep(-0.72, 0.62, normal.y);
    float animatedSheen = 0.5 + 0.5 * sin(u_time * 1.7 + v_phase * 4.2);

    float lightMix = clamp(0.07 + diffuse * 0.76 + fillLight * 0.14, 0.0, 1.0);
    bodyColor = mix(darkColor, midColor, lightMix);
    bodyColor += brightColor * diffuse * (0.2 + u_energy * 0.09);
    bodyColor += brightColor * fillLight * 0.06;
    bodyColor += whiteColor * specular * (0.7 + u_energy * 0.34);
    bodyColor += whiteColor * tightSpecular * 0.78;
    bodyColor += brightColor * rim * (0.2 + u_energy * 0.12);
    bodyColor += brightColor * animatedSheen * 0.016 * u_energy;
    bodyColor *= mix(0.6, 0.96, lowerShadow);
    bodyColor *= 0.74 + v_front * 0.22;
    bodyAlpha = v_alpha * bodyMask;
  }

  vec3 haloColor = brightColor * (0.58 + v_front * 0.22);
  float haloAlpha = v_alpha * haloMask * (0.055 + u_energy * 0.04);
  vec3 finalColor = mix(haloColor, bodyColor, bodyMask);
  float finalAlpha = max(haloAlpha, bodyAlpha);
  gl_FragColor = vec4(finalColor, finalAlpha);
}
`;

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
    analyser.smoothingTimeConstant = 0.72;
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

function readAudioLevel(
  probe: AudioProbe | null,
  time: number,
  muted: boolean,
  idleFallback: boolean,
) {
  if (!probe || muted || probe.context.state === "closed") {
    return idleFallback
      ? clamp(0.055 + Math.sin(time * 1.7) * 0.016 + Math.sin(time * 4.1) * 0.008, 0, 0.12)
      : 0;
  }

  probe.analyser.getByteTimeDomainData(probe.timeDomain);
  let squareSum = 0;
  for (let index = 0; index < probe.timeDomain.length; index += 1) {
    const centered = (probe.timeDomain[index] - 128) / 128;
    squareSum += centered * centered;
  }
  const rms = Math.sqrt(squareSum / probe.timeDomain.length);
  const level = clamp((rms - 0.008) * 7.2);
  probe.smooth = lerp(probe.smooth, level, level > probe.smooth ? 0.34 : 0.12);
  return probe.smooth;
}

function buildNodes(ringCount: number, equatorSegments: number) {
  const nodes: NodeSeed[] = [];
  for (let ring = 0; ring <= ringCount; ring += 1) {
    const latitude = -Math.PI / 2 + (ring / ringCount) * Math.PI;
    const ringRadius = Math.max(0.045, Math.cos(latitude));
    const segmentCount = ring === 0 || ring === ringCount
      ? 1
      : Math.max(8, Math.round(equatorSegments * Math.pow(ringRadius, 0.82)));
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

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("shader-create-failed");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || "shader-compile-failed";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);
  const program = gl.createProgram();
  if (!program) throw new Error("program-create-failed");
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || "shader-link-failed";
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

export function mountRuthieJarvisParticleSpheres(
  canvas: HTMLCanvasElement,
  options: ParticleSphereMountOptions,
) {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: true,
    depth: false,
    premultipliedAlpha: false,
    powerPreference: "high-performance",
  });
  if (!gl) {
    canvas.dataset.renderError = "webgl-sphere-renderer-unavailable";
    return () => undefined;
  }

  let program: WebGLProgram;
  try {
    program = createProgram(gl);
  } catch (error) {
    canvas.dataset.renderError = error instanceof Error ? error.message : "webgl-sphere-program-failed";
    return () => undefined;
  }

  const positionLocation = gl.getAttribLocation(program, "a_position");
  const sizeLocation = gl.getAttribLocation(program, "a_size");
  const alphaLocation = gl.getAttribLocation(program, "a_alpha");
  const frontLocation = gl.getAttribLocation(program, "a_front");
  const phaseLocation = gl.getAttribLocation(program, "a_phase");
  const dprLocation = gl.getUniformLocation(program, "u_dpr");
  const timeLocation = gl.getUniformLocation(program, "u_time");
  const energyLocation = gl.getUniformLocation(program, "u_energy");
  const errorLocation = gl.getUniformLocation(program, "u_error");
  const buffer = gl.createBuffer();

  if (!buffer || positionLocation < 0 || sizeLocation < 0 || alphaLocation < 0 || frontLocation < 0 || phaseLocation < 0) {
    canvas.dataset.renderError = "webgl-sphere-bindings-failed";
    gl.deleteProgram(program);
    return () => undefined;
  }

  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const nodes = buildNodes(coarsePointer ? 28 : 38, coarsePointer ? 50 : 68);
  const projected: ProjectedSphere[] = nodes.map(() => ({
    clipX: 0,
    clipY: 0,
    front: 0,
    size: 1,
    alpha: 1,
    phase: 0,
    depth: 0,
  }));
  const vertexData = new Float32Array(nodes.length * FLOATS_PER_SPHERE);

  const inputStream = validStream(options.inputStream || options.stream);
  const outputStream = validStream(options.outputStream);
  const inputProbe = createAudioProbe(inputStream);
  const outputProbe = createAudioProbe(outputStream);

  let disposed = false;
  let frame = 0;
  let cssWidth = 1;
  let cssHeight = 1;
  let dpr = 1;
  let lastTime = performance.now();
  let lastOutputVoiceAt = Number.NEGATIVE_INFINITY;
  let outputEnvelope = 0;
  let rotationX = -0.08;
  let rotationY = 0;
  let rotationZ = 0;
  let currentProfile = { ...PROFILE.connecting };

  const pointRange = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array | number[];
  const maximumPointSize = Number(pointRange?.[1] || 64);

  canvas.dataset.renderer = "ruthie-webgl-particle-spheres";
  canvas.dataset.ruthieSphereLayer = "webgl-phong-v3-dense-soft";
  canvas.dataset.ruthiePalette = "soft-champagne-gold-v4";
  canvas.dataset.audioTracking = "assistant-output-rms-hysteresis-v1";
  delete canvas.dataset.renderError;

  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  const stride = FLOATS_PER_SPHERE * Float32Array.BYTES_PER_ELEMENT;
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(sizeLocation);
  gl.vertexAttribPointer(sizeLocation, 1, gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);
  gl.enableVertexAttribArray(alphaLocation);
  gl.vertexAttribPointer(alphaLocation, 1, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT);
  gl.enableVertexAttribArray(frontLocation);
  gl.vertexAttribPointer(frontLocation, 1, gl.FLOAT, false, stride, 4 * Float32Array.BYTES_PER_ELEMENT);
  gl.enableVertexAttribArray(phaseLocation);
  gl.vertexAttribPointer(phaseLocation, 1, gl.FLOAT, false, stride, 5 * Float32Array.BYTES_PER_ELEMENT);

  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    cssWidth = Math.max(1, rect.width);
    cssHeight = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, coarsePointer ? 1.5 : 2.1);
    const width = Math.max(1, Math.round(cssWidth * dpr));
    const height = Math.max(1, Math.round(cssHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
  };

  const resumeAudio = () => {
    for (const probe of new Set([inputProbe, outputProbe])) {
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

    const rawDelta = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
    const delta = reducedMotion ? Math.min(rawDelta, 1 / 30) : rawDelta;
    lastTime = now;
    const time = now / 1000;
    const requestedPhase = options.getPhase();

    const inputLevel = readAudioLevel(inputProbe, time, options.getMuted(), true);
    const measuredOutputLevel = readAudioLevel(outputProbe, time, false, false);
    if (measuredOutputLevel > OUTPUT_ACTIVITY_THRESHOLD) {
      lastOutputVoiceAt = now;
    }
    outputEnvelope = lerp(
      outputEnvelope,
      measuredOutputLevel,
      measuredOutputLevel > outputEnvelope ? 0.38 : 0.08,
    );

    const outputRecentlyActive = Boolean(outputProbe)
      && (measuredOutputLevel > OUTPUT_ACTIVITY_THRESHOLD || now - lastOutputVoiceAt < OUTPUT_ACTIVITY_HOLD_MS);
    const phase: RuthieJarvisPhase = requestedPhase === "error"
      ? "error"
      : requestedPhase === "speaking" || outputRecentlyActive
        ? "speaking"
        : requestedPhase;

    canvas.dataset.effectivePhase = phase;
    canvas.dataset.outputAudioActive = outputRecentlyActive ? "true" : "false";

    const target = PROFILE[phase] || PROFILE.connecting;
    const interpolation = 1 - Math.pow(0.001, delta);
    for (const key of Object.keys(currentProfile) as Array<keyof SphereProfile>) {
      currentProfile[key] = lerp(currentProfile[key], target[key], interpolation * 0.34);
    }

    const audioLevel = phase === "speaking"
      ? Math.max(outputEnvelope, requestedPhase === "speaking" ? 0.075 : 0.045)
      : inputLevel;
    const motionScale = reducedMotion ? 0.35 : 1;
    rotationY += delta * currentProfile.rotation * motionScale;
    rotationX = lerp(rotationX, -0.08 + Math.sin(time * 0.19) * 0.025, 0.035);
    rotationZ = lerp(rotationZ, Math.sin(time * 0.13) * 0.022, 0.035);

    const centerX = cssWidth / 2;
    const centerY = cssHeight / 2 - Math.min(12, cssHeight * 0.025);
    const baseRadius = Math.min(cssWidth, cssHeight) * (coarsePointer ? 0.345 : 0.37);
    const radiusAudio = audioLevel * (phase === "speaking" ? 0.15 : 0.075);
    const radius = baseRadius * currentProfile.radius * (1 + radiusAudio);
    const cameraDistance = 3.45;

    for (let index = 0; index < nodes.length; index += 1) {
      const seed = nodes[index];
      const radialWave = Math.sin(time * (0.85 + currentProfile.rotation * 1.2) + seed.phase * 1.7)
        * currentProfile.turbulence * 0.045;
      const secondaryWave = Math.sin(time * 1.9 + seed.y * 5.2 + seed.phase)
        * currentProfile.turbulence * 0.024;
      const voiceWave = phase === "speaking"
        ? Math.sin(time * 7.2 + seed.phase * 2.3) * audioLevel * 0.105 + audioLevel * 0.065
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
      const screenX = centerX + rotated.x * scale;
      const screenY = centerY + rotated.y * scale;
      const front = clamp((normalizedZ + 1) * 0.5);
      const depthSize = lerp(0.72, 1.42, front);
      const twinkle = 0.97 + Math.sin(time * 2.15 + seed.phase * 3.7) * 0.035;
      const statePulse = phase === "speaking"
        ? 1 + audioLevel * (0.34 + (index % 7) * 0.012)
        : phase === "thinking" || phase === "acting"
          ? 1 + Math.sin(time * 3.2 + seed.phase) * 0.045
          : 1;
      const baseSphereSize = coarsePointer ? 5.8 : 8.4;
      const desiredSize = baseSphereSize * currentProfile.size * depthSize * statePulse * twinkle;
      const cssMaximum = maximumPointSize / Math.max(1, dpr);

      projected[index] = {
        clipX: screenX / cssWidth * 2 - 1,
        clipY: 1 - screenY / cssHeight * 2,
        front,
        size: Math.min(cssMaximum, desiredSize),
        alpha: currentProfile.alpha * clamp((normalizedZ + 1.35) / 2.35, 0.25, 0.94),
        phase: seed.phase,
        depth: normalizedZ,
      };
    }

    projected.sort((left, right) => left.depth - right.depth);
    for (let index = 0; index < projected.length; index += 1) {
      const point = projected[index];
      const offset = index * FLOATS_PER_SPHERE;
      vertexData[offset] = point.clipX;
      vertexData[offset + 1] = point.clipY;
      vertexData[offset + 2] = point.size;
      vertexData[offset + 3] = point.alpha;
      vertexData[offset + 4] = point.front;
      vertexData[offset + 5] = point.phase;
    }

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.DYNAMIC_DRAW);
    gl.uniform1f(dprLocation, dpr);
    gl.uniform1f(timeLocation, time);
    gl.uniform1f(energyLocation, clamp(currentProfile.energy + audioLevel * 0.36));
    gl.uniform1f(errorLocation, phase === "error" ? 1 : 0);
    gl.drawArrays(gl.POINTS, 0, projected.length);
  };

  frame = window.requestAnimationFrame(render);

  return () => {
    disposed = true;
    window.cancelAnimationFrame(frame);
    observer.disconnect();
    window.removeEventListener("pointerdown", resumeAudio);
    window.removeEventListener("keydown", resumeAudio);
    for (const probe of new Set([inputProbe, outputProbe])) {
      void probe?.context.close().catch(() => undefined);
    }
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
    gl.clear(gl.COLOR_BUFFER_BIT);
  };
}
