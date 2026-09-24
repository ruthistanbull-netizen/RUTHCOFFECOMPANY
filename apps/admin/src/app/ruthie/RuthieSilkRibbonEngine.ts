export type RuthieSilkPhase =
  | "connecting"
  | "listening"
  | "thinking"
  | "acting"
  | "speaking"
  | "error";

export type RuthieSilkOptions = {
  getPhase: () => RuthieSilkPhase;
  getMuted: () => boolean;
  stream?: MediaStream | null;
  inputStream?: MediaStream | null;
  outputStream?: MediaStream | null;
  compact?: boolean;
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

type Program = {
  value: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
};

type Geometry = {
  vao: WebGLVertexArrayObject;
  vertex: WebGLBuffer;
  index?: WebGLBuffer;
  count: number;
};

type Ribbon = {
  seed: number;
  width: number;
  amplitude: number;
  depth: number;
  twist: number;
  y: number;
  z: number;
  scale: number;
  speed: number;
  opacity: number;
  palette: number;
  thickness: number;
  response: [number, number, number];
  rotation: [number, number, number];
};

type Profile = {
  speed: number;
  energy: number;
  open: number;
  fold: number;
  orbit: number;
  glow: number;
};

const CYAN: [number, number, number] = [0.02, 0.75, 1.0];
const ICE: [number, number, number] = [0.68, 0.95, 1.0];
const BLUE: [number, number, number] = [0.08, 0.22, 1.0];
const VIOLET: [number, number, number] = [0.48, 0.12, 1.0];
const MAGENTA: [number, number, number] = [1.0, 0.1, 0.78];

const SILK_VERTEX = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aUv;

uniform mat4 uMatrix;
uniform float uTime;
uniform float uEnergy;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uSeed;
uniform float uWidth;
uniform float uAmplitude;
uniform float uDepth;
uniform float uTwist;
uniform float uYOffset;
uniform float uZOffset;
uniform float uScale;
uniform float uSpeed;
uniform float uThickness;
uniform float uShell;
uniform float uOpen;
uniform float uFold;
uniform vec2 uPointer;
uniform vec3 uRotation;
uniform vec3 uResponse;

out vec2 vUv;
out vec3 vWorld;
out vec3 vNormal;
out vec3 vTangent;
out float vEdge;
out float vPulse;
out float vFoldLight;
out float vDepth;
out float vNoise;

const float PI = 3.141592653589793;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0)), f.x),
    f.y
  );
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.55;
  for (int i = 0; i < 4; i++) {
    value += noise2(p) * amplitude;
    p = p * 2.03 + vec2(4.7, 8.2);
    amplitude *= 0.5;
  }
  return value;
}

mat3 rx(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c);
}

mat3 ry(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c);
}

mat3 rz(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 1.0);
}

vec3 ribbonCurve(float t, float clock) {
  float a = t * PI;
  float organic = fbm(vec2(t * 1.8 + uSeed, clock * 0.08)) - 0.5;
  float openAmount = 1.0 + uOpen * 0.12;
  float x = (
    sin(a) * 2.08
    + sin(a * 2.0 + uSeed * 0.72) * 0.48
    + cos(a * 3.0 - clock * 0.16) * 0.12
  ) * openAmount;
  float y = (
    sin(a * 2.0 + uSeed * 0.48) * 0.78
    + cos(a * 3.0 - clock * 0.23 + uSeed) * 0.22
    + organic * 0.2
  ) * uAmplitude;
  float z = (
    cos(a + uSeed * 0.31) * 0.72
    + sin(a * 3.0 - clock * 0.2 + uSeed) * 0.34
    + organic * 0.18
  ) * uDepth;
  x *= mix(1.0, 0.82, uFold);
  y += sin(a + uSeed) * uFold * 0.22;
  z += cos(a * 2.0 - uSeed) * uFold * 0.25;
  return vec3(x, y, z);
}

void main() {
  float u = aUv.x;
  float v = aUv.y * 2.0 - 1.0;
  float t = u * 2.0 - 1.0;
  float clock = uTime * uSpeed + uSeed;

  vec3 center = ribbonCurve(t, clock);
  vec3 tangent = normalize(ribbonCurve(t + 0.004, clock) - ribbonCurve(t - 0.004, clock));
  vec3 reference = abs(tangent.z) < 0.88 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
  vec3 side = normalize(cross(reference, tangent));
  vec3 normal = normalize(cross(tangent, side));

  float audioBand = dot(vec3(uBass, uMid, uTreble), uResponse);
  float twist = t * uTwist
    + sin(t * 2.2 + clock * 0.42) * 1.05
    + sin(t * 5.0 - clock * 0.19 + uSeed) * 0.19
    + audioBand * sin(t * 6.4 + clock) * 0.22;
  vec3 across = normalize(side * cos(twist) + normal * sin(twist));
  vec3 faceNormal = normalize(-side * sin(twist) + normal * cos(twist));

  float envelope = pow(max(0.0, sin(u * PI)), 0.18);
  float width = uWidth * envelope * (1.0 + uOpen * 0.09 + uEnergy * 0.08 + audioBand * 0.1);
  float crossSection = sqrt(max(0.0, 1.0 - v * v));
  float camber = sin(v * PI) * (0.18 + sin(t * 3.2 - clock) * 0.045);
  float fabric = (fbm(vec2(t * 2.8 + clock * 0.1, v * 2.4 + uSeed)) - 0.5) * 0.045;
  fabric += sin(v * PI * 2.0 + t * 2.6 - clock) * 0.022;
  float audioFold = audioBand * sin(t * 5.7 + v * 2.2 + clock) * 0.05;

  vec3 position = center;
  position += across * (v * width);
  position += faceNormal * (camber + fabric + audioFold + uShell * uThickness * crossSection);
  position += faceNormal * sin(t * 4.0 - clock * 0.38 + v) * uEnergy * 0.022;
  position.y += uYOffset;
  position.z += uZOffset;

  mat3 rotation = rz(uRotation.z) * ry(uRotation.y) * rx(uRotation.x);
  position = rotation * (position * uScale);
  tangent = normalize(rotation * tangent);
  faceNormal = normalize(rotation * faceNormal) * sign(uShell == 0.0 ? 1.0 : uShell);
  position.xy += uPointer * vec2(0.085, -0.055) * (0.4 + uScale * 0.6);

  vUv = aUv;
  vWorld = position;
  vNormal = faceNormal;
  vTangent = tangent;
  vEdge = abs(v);
  vPulse = 0.5 + 0.5 * sin(t * 8.2 - clock * 1.45 + v * 1.8 + uSeed);
  vFoldLight = abs(camber + fabric) + crossSection * uThickness;
  vDepth = clamp(0.58 + position.z * 0.12, 0.28, 1.0);
  vNoise = fbm(vec2(t * 3.5 + uSeed, v * 2.3 + clock * 0.045));
  gl_Position = uMatrix * vec4(position, 1.0);
}
`;

const SILK_FRAGMENT = `#version 300 es
precision highp float;

in vec2 vUv;
in vec3 vWorld;
in vec3 vNormal;
in vec3 vTangent;
in float vEdge;
in float vPulse;
in float vFoldLight;
in float vDepth;
in float vNoise;

uniform float uOpacity;
uniform float uEnergy;
uniform float uPalette;
uniform float uPass;
uniform float uGlow;
uniform vec3 uCyan;
uniform vec3 uBlue;
uniform vec3 uViolet;
uniform vec3 uMagenta;
uniform vec3 uIce;

out vec4 outColor;

float lineMask(float value, float count, float width) {
  float cell = abs(fract(value * count) - 0.5);
  return 1.0 - smoothstep(width, width + 0.05, cell);
}

vec3 palette(float value) {
  float p = fract(value);
  if (p < 0.32) return mix(uCyan, uBlue, p / 0.32);
  if (p < 0.68) return mix(uBlue, uViolet, (p - 0.32) / 0.36);
  return mix(uViolet, uMagenta, (p - 0.68) / 0.32);
}

void main() {
  vec3 normal = normalize(vNormal);
  vec3 tangent = normalize(vTangent);
  vec3 viewDirection = normalize(vec3(0.0, 0.08, 5.8) - vWorld);
  vec3 lightDirection = normalize(vec3(-0.46, 0.72, 0.52));
  vec3 halfDirection = normalize(lightDirection + viewDirection);

  float facing = abs(dot(normal, viewDirection));
  float fresnel = pow(1.0 - facing, 2.0);
  float diffuse = 0.42 + 0.58 * max(dot(normal, lightDirection), 0.0);
  float anisotropic = pow(max(dot(tangent, halfDirection), 0.0), 12.0);
  float transmission = pow(max(dot(-normal, lightDirection), 0.0), 1.25);
  float rim = smoothstep(0.64, 1.0, vEdge);
  float sideFade = 1.0 - smoothstep(0.82, 1.03, vEdge);
  float endFade = smoothstep(0.0, 0.045, vUv.x) * smoothstep(0.0, 0.045, 1.0 - vUv.x);

  vec3 color = palette(vUv.x * 0.72 + uPalette + vNoise * 0.035);
  color = mix(color, uIce, fresnel * 0.38 + anisotropic * 0.24);
  float broadSheen = pow(0.5 + 0.5 * sin(vUv.x * 12.0 - vUv.y * 2.0 + vWorld.z), 5.0);
  float traveling = pow(0.5 + 0.5 * sin(vUv.x * 20.0 - vUv.y * 3.0 - vPulse * 2.0), 16.0);

  if (uPass < 0.5) {
    float light = diffuse * 0.68
      + fresnel * 0.92
      + anisotropic * 0.58
      + transmission * 0.32
      + broadSheen * 0.16
      + vFoldLight * 0.2;
    vec3 body = color * (0.64 + light);
    body += uIce * (fresnel * 0.16 + anisotropic * 0.13);
    body += color * uEnergy * vPulse * 0.055;
    body = min(body, vec3(1.14));
    float alpha = (
      0.34
      + facing * 0.15
      + fresnel * 0.23
      + transmission * 0.09
      + broadSheen * 0.05
    ) * sideFade * endFade * uOpacity * vDepth;
    if (alpha < 0.012) discard;
    outColor = vec4(body, alpha);
    return;
  }

  if (uPass < 1.5) {
    float longitude = lineMask(vUv.x + uPalette * 0.015, 58.0, 0.04);
    float latitude = lineMask(vUv.y + vNoise * 0.008, 22.0, 0.05);
    float nodes = longitude * latitude;
    float detail = longitude * 0.21
      + latitude * 0.075
      + nodes * 0.62
      + rim * (0.22 + fresnel * 0.5)
      + fresnel * 0.2
      + anisotropic * 0.2
      + traveling * (0.05 + uEnergy * 0.1);
    vec3 detailColor = color * (0.86 + detail * 1.15);
    detailColor += uIce * (fresnel * 0.28 + rim * 0.13 + nodes * 0.16);
    float alpha = detail * sideFade * endFade * uOpacity * 0.72 * vDepth;
    if (alpha < 0.01) discard;
    outColor = vec4(min(detailColor, vec3(1.08)), alpha);
    return;
  }

  float aura = (fresnel * 0.72 + rim * 0.42 + anisotropic * 0.2)
    * sideFade * endFade * uGlow * vDepth;
  if (aura < 0.01) discard;
  outColor = vec4(mix(color, uIce, 0.52), aura * 0.34);
}
`;

const ORBIT_VERTEX = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPosition;
uniform mat4 uMatrix;
uniform float uTime;
uniform float uRotation;
uniform vec3 uTilt;
uniform vec2 uPointer;
out float vFade;
mat3 rx(float a){float c=cos(a),s=sin(a);return mat3(1,0,0,0,c,s,0,-s,c);}
mat3 ry(float a){float c=cos(a),s=sin(a);return mat3(c,0,-s,0,1,0,s,0,c);}
mat3 rz(float a){float c=cos(a),s=sin(a);return mat3(c,s,0,-s,c,0,0,0,1);}
void main(){
  vec3 p=rz(uRotation+uTime*.05)*ry(uTilt.y)*rx(uTilt.x)*aPosition;
  p.xy+=uPointer*.05;
  gl_Position=uMatrix*vec4(p,1.0);
  vFade=.42+.58*sin((aPosition.x+aPosition.y)*2.0+uTime);
}`;

const ORBIT_FRAGMENT = `#version 300 es
precision highp float;
in float vFade;
uniform vec3 uColor;
uniform float uOpacity;
out vec4 outColor;
void main(){outColor=vec4(uColor,uOpacity*(.24+vFade*.76));}`;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, amount: number) {
  return a + (b - a) * amount;
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Ruthie V5 shader allocation failed.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || "Unknown shader error.";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
  names: string[],
): Program {
  const value = gl.createProgram();
  if (!value) throw new Error("Ruthie V5 program allocation failed.");
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(value, vertex);
  gl.attachShader(value, fragment);
  gl.linkProgram(value);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(value, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(value) || "Unknown shader link error.";
    gl.deleteProgram(value);
    throw new Error(message);
  }
  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  for (const name of names) uniforms[name] = gl.getUniformLocation(value, name);
  return { value, uniforms };
}

function createRibbonGeometry(gl: WebGL2RenderingContext, compact: boolean): Geometry {
  const longitudinal = compact ? 124 : 210;
  const lateral = compact ? 32 : 56;
  const vertices: number[] = [];
  const indices: number[] = [];
  for (let y = 0; y <= lateral; y += 1) {
    for (let x = 0; x <= longitudinal; x += 1) {
      vertices.push(x / longitudinal, y / lateral);
    }
  }
  const row = longitudinal + 1;
  for (let y = 0; y < lateral; y += 1) {
    for (let x = 0; x < longitudinal; x += 1) {
      const a = y * row + x;
      const b = a + row;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const vao = gl.createVertexArray();
  const vertex = gl.createBuffer();
  const index = gl.createBuffer();
  if (!vao || !vertex || !index) throw new Error("Ruthie V5 geometry allocation failed.");
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vertex);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return { vao, vertex, index, count: indices.length };
}

function createOrbit(
  gl: WebGL2RenderingContext,
  radiusX: number,
  radiusY: number,
  start: number,
  arc: number,
  segments: number,
): Geometry {
  const values: number[] = [];
  for (let index = 0; index <= segments; index += 1) {
    const amount = index / segments;
    const angle = start + arc * amount;
    values.push(
      Math.cos(angle) * radiusX,
      Math.sin(angle) * radiusY,
      Math.sin(amount * Math.PI * 3.0) * 0.035,
    );
  }
  const vao = gl.createVertexArray();
  const vertex = gl.createBuffer();
  if (!vao || !vertex) throw new Error("Ruthie V5 orbit allocation failed.");
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vertex);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(values), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return { vao, vertex, count: segments + 1 };
}

function validStream(stream: MediaStream | null | undefined) {
  if (!stream) return null;
  return stream.getAudioTracks().some((track) => track.readyState === "live") ? stream : null;
}

function createAudioProbe(stream: MediaStream | null | undefined): AudioProbe | null {
  const live = validStream(stream);
  if (!live) return null;
  try {
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.8;
    context.createMediaStreamSource(live).connect(analyser);
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
      level: clamp(0.075 + Math.sin(time * 1.7) * 0.017 + Math.sin(time * 4.1) * 0.009, 0.04, 0.14),
      bass: 0.085 + Math.sin(time * 1.35) * 0.018,
      mid: 0.07 + Math.sin(time * 2.55) * 0.015,
      treble: 0.055 + Math.sin(time * 4.2) * 0.013,
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
  probe.level = lerp(probe.level, clamp((rms - 0.01) * 5.7, 0, 1), 0.21);
  probe.bass = lerp(probe.bass, average(probe.frequency, 2, 18), 0.19);
  probe.mid = lerp(probe.mid, average(probe.frequency, 18, 74), 0.2);
  probe.treble = lerp(probe.treble, average(probe.frequency, 74, 154), 0.22);
  return { level: probe.level, bass: probe.bass, mid: probe.mid, treble: probe.treble };
}

function normalize3(value: [number, number, number]): [number, number, number] {
  const length = Math.hypot(value[0], value[1], value[2]) || 1;
  return [value[0] / length, value[1] / length, value[2] / length];
}

function cross3(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function perspective(fov: number, aspect: number, near: number, far: number) {
  const f = 1 / Math.tan(fov / 2);
  const range = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (near + far) * range, -1,
    0, 0, near * far * range * 2, 0,
  ]);
}

function lookAt(
  eye: [number, number, number],
  target: [number, number, number],
  up: [number, number, number],
) {
  const z = normalize3([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
  const x = normalize3(cross3(up, z));
  const y = cross3(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]),
    -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]),
    -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]),
    1,
  ]);
}

function multiply(a: Float32Array, b: Float32Array) {
  const output = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      output[column * 4 + row] =
        a[row] * b[column * 4]
        + a[4 + row] * b[column * 4 + 1]
        + a[8 + row] * b[column * 4 + 2]
        + a[12 + row] * b[column * 4 + 3];
    }
  }
  return output;
}

function profile(phase: RuthieSilkPhase): Profile {
  switch (phase) {
    case "listening":
      return { speed: 0.72, energy: 0.46, open: 0.22, fold: 0.04, orbit: 0.78, glow: 0.82 };
    case "thinking":
      return { speed: 1.16, energy: 0.6, open: -0.08, fold: 0.38, orbit: 1.46, glow: 0.9 };
    case "acting":
      return { speed: 1.42, energy: 0.78, open: 0.06, fold: 0.24, orbit: 1.82, glow: 1.0 };
    case "speaking":
      return { speed: 0.94, energy: 0.7, open: 0.34, fold: 0.06, orbit: 1.02, glow: 1.0 };
    case "error":
      return { speed: 0.18, energy: 0.3, open: -0.14, fold: 0.3, orbit: 0.2, glow: 0.4 };
    default:
      return { speed: 0.34, energy: 0.22, open: 0, fold: 0.08, orbit: 0.38, glow: 0.62 };
  }
}

function ribbonConfigs(compact: boolean): Ribbon[] {
  const mobile = compact ? 0.92 : 1;
  return [
    { seed: 0.24, width: 1.05, amplitude: 1.0, depth: 1.0, twist: 2.7, y: 0.02, z: 0.72, scale: 1.13 * mobile, speed: 0.46, opacity: 1.06, palette: 0.0, thickness: 0.12, response: [0.72, 0.2, 0.08], rotation: [-0.13, -0.19, -0.04] },
    { seed: 1.58, width: 0.96, amplitude: 1.08, depth: 1.12, twist: 3.15, y: 0.28, z: -0.1, scale: 1.05 * mobile, speed: -0.34, opacity: 0.82, palette: 0.18, thickness: 0.11, response: [0.18, 0.68, 0.14], rotation: [0.16, 0.2, 0.1] },
    { seed: 3.02, width: 0.7, amplitude: 0.84, depth: 1.2, twist: 3.85, y: -0.05, z: 1.02, scale: 1.0 * mobile, speed: 0.64, opacity: 1.0, palette: 0.08, thickness: 0.095, response: [0.1, 0.42, 0.48], rotation: [-0.2, -0.25, 0.24] },
    { seed: 4.42, width: 0.9, amplitude: 1.05, depth: 1.02, twist: 2.95, y: -0.36, z: 0.06, scale: 1.06 * mobile, speed: -0.42, opacity: 0.86, palette: 0.62, thickness: 0.115, response: [0.15, 0.56, 0.29], rotation: [0.14, 0.17, -0.18] },
    { seed: 5.68, width: 1.02, amplitude: 0.92, depth: 1.14, twist: 2.52, y: 0.12, z: -0.88, scale: 1.02 * mobile, speed: 0.3, opacity: 0.58, palette: 0.76, thickness: 0.125, response: [0.5, 0.34, 0.16], rotation: [0.23, -0.14, -0.1] },
    { seed: 7.08, width: 0.5, amplitude: 0.76, depth: 0.94, twist: 4.45, y: -0.14, z: 1.28, scale: 0.96 * mobile, speed: 0.76, opacity: 0.92, palette: 0.3, thickness: 0.08, response: [0.05, 0.23, 0.72], rotation: [-0.24, 0.09, 0.34] },
  ];
}

export function mountRuthieSilkRibbon(
  canvas: HTMLCanvasElement,
  options: RuthieSilkOptions,
) {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: true,
    depth: true,
    premultipliedAlpha: false,
    powerPreference: "high-performance",
  });
  if (!gl) throw new Error("WebGL2 is unavailable.");

  const compact = options.compact ?? window.matchMedia("(max-width: 760px)").matches;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const silkProgram = createProgram(gl, SILK_VERTEX, SILK_FRAGMENT, [
    "uMatrix", "uTime", "uEnergy", "uBass", "uMid", "uTreble", "uSeed",
    "uWidth", "uAmplitude", "uDepth", "uTwist", "uYOffset", "uZOffset",
    "uScale", "uSpeed", "uThickness", "uShell", "uOpen", "uFold", "uPointer",
    "uRotation", "uResponse", "uOpacity", "uPalette", "uPass", "uGlow",
    "uCyan", "uBlue", "uViolet", "uMagenta", "uIce",
  ]);
  const orbitProgram = createProgram(gl, ORBIT_VERTEX, ORBIT_FRAGMENT, [
    "uMatrix", "uTime", "uRotation", "uTilt", "uPointer", "uColor", "uOpacity",
  ]);

  const geometry = createRibbonGeometry(gl, compact);
  const orbits = [
    createOrbit(gl, 3.45, 2.1, -2.74, 4.15, compact ? 92 : 154),
    createOrbit(gl, 3.65, 1.78, -0.68, 3.42, compact ? 82 : 138),
    createOrbit(gl, 3.0, 2.48, 1.55, 2.92, compact ? 72 : 122),
  ];
  const ribbons = ribbonConfigs(compact).sort((a, b) => a.z - b.z);

  const inputStream = options.inputStream || options.stream || null;
  const outputStream = options.outputStream || options.stream || null;
  const inputAudio = createAudioProbe(inputStream);
  const outputAudio = outputStream === inputStream ? inputAudio : createAudioProbe(outputStream);

  let disposed = false;
  let frame = 0;
  let width = 1;
  let height = 1;
  let pointerX = 0;
  let pointerY = 0;
  let pointerTargetX = 0;
  let pointerTargetY = 0;
  let smoothSpeed = 0.34;
  let smoothEnergy = 0.22;
  let smoothOpen = 0;
  let smoothFold = 0.08;
  let smoothOrbit = 0.38;
  let smoothGlow = 0.62;
  const startedAt = performance.now();

  canvas.dataset.renderer = "webgl2-glsl-silk-ribbon-v5";
  canvas.dataset.ruthieOrbVersion = "silk-ribbon-panel-v5";
  canvas.dataset.renderStage = "ready";
  delete canvas.dataset.renderError;

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, compact ? 1.35 : 1.8);
    width = Math.max(1, Math.round(rect.width * pixelRatio));
    height = Math.max(1, Math.round(rect.height * pixelRatio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
  };

  const pointerMove = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    pointerTargetX = ((event.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * 2;
    pointerTargetY = ((event.clientY - rect.top) / Math.max(1, rect.height) - 0.5) * 2;
  };
  const pointerLeave = () => {
    pointerTargetX = 0;
    pointerTargetY = 0;
  };
  const resumeAudio = () => {
    for (const probe of new Set([inputAudio, outputAudio])) {
      if (probe?.context.state === "suspended") void probe.context.resume().catch(() => undefined);
    }
  };

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  canvas.addEventListener("pointermove", pointerMove, { passive: true });
  canvas.addEventListener("pointerleave", pointerLeave, { passive: true });
  window.addEventListener("pointerdown", resumeAudio, { passive: true });
  window.addEventListener("keydown", resumeAudio);
  resize();

  gl.enable(gl.BLEND);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.disable(gl.CULL_FACE);

  const applySilk = (
    matrix: Float32Array,
    elapsed: number,
    audio: ReturnType<typeof readAudio>,
    pass: 0 | 1 | 2,
    shell: number,
  ) => {
    gl.useProgram(silkProgram.value);
    gl.uniformMatrix4fv(silkProgram.uniforms.uMatrix, false, matrix);
    gl.uniform1f(silkProgram.uniforms.uTime, elapsed * smoothSpeed);
    gl.uniform1f(silkProgram.uniforms.uEnergy, smoothEnergy);
    gl.uniform1f(silkProgram.uniforms.uBass, audio.bass);
    gl.uniform1f(silkProgram.uniforms.uMid, audio.mid);
    gl.uniform1f(silkProgram.uniforms.uTreble, audio.treble);
    gl.uniform1f(silkProgram.uniforms.uShell, shell);
    gl.uniform1f(silkProgram.uniforms.uOpen, smoothOpen);
    gl.uniform1f(silkProgram.uniforms.uFold, smoothFold);
    gl.uniform1f(silkProgram.uniforms.uPass, pass);
    gl.uniform1f(silkProgram.uniforms.uGlow, smoothGlow);
    gl.uniform2f(silkProgram.uniforms.uPointer, pointerX, pointerY);
    gl.uniform3f(silkProgram.uniforms.uCyan, ...CYAN);
    gl.uniform3f(silkProgram.uniforms.uBlue, ...BLUE);
    gl.uniform3f(silkProgram.uniforms.uViolet, ...VIOLET);
    gl.uniform3f(silkProgram.uniforms.uMagenta, ...MAGENTA);
    gl.uniform3f(silkProgram.uniforms.uIce, ...ICE);
    gl.bindVertexArray(geometry.vao);
  };

  const drawRibbons = (
    matrix: Float32Array,
    elapsed: number,
    audio: ReturnType<typeof readAudio>,
    pass: 0 | 1 | 2,
    shell: number,
  ) => {
    applySilk(matrix, elapsed, audio, pass, shell);
    for (const ribbon of ribbons) {
      gl.uniform1f(silkProgram.uniforms.uSeed, ribbon.seed);
      gl.uniform1f(silkProgram.uniforms.uWidth, ribbon.width);
      gl.uniform1f(silkProgram.uniforms.uAmplitude, ribbon.amplitude);
      gl.uniform1f(silkProgram.uniforms.uDepth, ribbon.depth);
      gl.uniform1f(silkProgram.uniforms.uTwist, ribbon.twist);
      gl.uniform1f(silkProgram.uniforms.uYOffset, ribbon.y);
      gl.uniform1f(silkProgram.uniforms.uZOffset, ribbon.z);
      gl.uniform1f(silkProgram.uniforms.uScale, ribbon.scale);
      gl.uniform1f(silkProgram.uniforms.uSpeed, ribbon.speed);
      gl.uniform1f(silkProgram.uniforms.uThickness, ribbon.thickness);
      gl.uniform1f(silkProgram.uniforms.uOpacity, ribbon.opacity * (0.96 + smoothEnergy * 0.12));
      gl.uniform1f(silkProgram.uniforms.uPalette, ribbon.palette);
      gl.uniform3f(silkProgram.uniforms.uRotation, ...ribbon.rotation);
      gl.uniform3f(silkProgram.uniforms.uResponse, ...ribbon.response);
      gl.drawElements(gl.TRIANGLES, geometry.count, gl.UNSIGNED_INT, 0);
    }
  };

  const render = (now: number) => {
    if (disposed) return;
    const elapsed = (now - startedAt) / 1000;
    const phase = options.getPhase();
    const target = profile(phase);
    const selectedAudio = phase === "speaking" ? outputAudio || inputAudio : inputAudio || outputAudio;
    const audio = readAudio(selectedAudio, elapsed, options.getMuted());
    const motion = reducedMotion ? 0.16 : 1;

    smoothSpeed = lerp(smoothSpeed, target.speed * motion, 0.035);
    smoothEnergy = lerp(smoothEnergy, clamp(target.energy + audio.level * 0.58, 0.12, 1), 0.07);
    smoothOpen = lerp(smoothOpen, target.open, 0.04);
    smoothFold = lerp(smoothFold, target.fold, 0.04);
    smoothOrbit = lerp(smoothOrbit, target.orbit * motion, 0.04);
    smoothGlow = lerp(smoothGlow, target.glow, 0.04);
    pointerX = lerp(pointerX, pointerTargetX, reducedMotion ? 0.018 : 0.055);
    pointerY = lerp(pointerY, pointerTargetY, reducedMotion ? 0.018 : 0.055);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const aspect = width / Math.max(1, height);
    const cameraZ = compact ? 6.55 : 5.85;
    const matrix = multiply(
      perspective(compact ? Math.PI / 3.02 : Math.PI / 3.24, aspect, 0.1, 30),
      lookAt(
        [pointerX * 0.09, 0.08 - pointerY * 0.055, cameraZ],
        [0, compact ? 0.1 : 0.0, 0],
        [0, 1, 0],
      ),
    );

    gl.depthMask(false);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.useProgram(orbitProgram.value);
    gl.uniformMatrix4fv(orbitProgram.uniforms.uMatrix, false, matrix);
    gl.uniform1f(orbitProgram.uniforms.uTime, elapsed * smoothOrbit);
    gl.uniform2f(orbitProgram.uniforms.uPointer, pointerX, pointerY);
    const orbitColors = [CYAN, VIOLET, MAGENTA];
    for (let index = 0; index < orbits.length; index += 1) {
      gl.uniform1f(orbitProgram.uniforms.uRotation, (index % 2 ? -1 : 1) * elapsed * (0.02 + index * 0.007) * smoothOrbit);
      gl.uniform3f(orbitProgram.uniforms.uTilt, -0.25 + index * 0.18, 0.16 - index * 0.1, 0);
      gl.uniform3f(orbitProgram.uniforms.uColor, ...orbitColors[index]);
      gl.uniform1f(orbitProgram.uniforms.uOpacity, 0.09 + smoothEnergy * 0.08);
      gl.bindVertexArray(orbits[index].vao);
      gl.drawArrays(gl.LINE_STRIP, 0, orbits[index].count);
    }

    gl.depthMask(false);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    drawRibbons(matrix, elapsed, audio, 0, -1);
    drawRibbons(matrix, elapsed, audio, 0, 1);

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    drawRibbons(matrix, elapsed, audio, 1, 1);
    drawRibbons(matrix, elapsed, audio, 2, 1);

    gl.bindVertexArray(null);
    frame = requestAnimationFrame(render);
  };

  frame = requestAnimationFrame(render);

  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    canvas.removeEventListener("pointermove", pointerMove);
    canvas.removeEventListener("pointerleave", pointerLeave);
    window.removeEventListener("pointerdown", resumeAudio);
    window.removeEventListener("keydown", resumeAudio);
    for (const probe of new Set([inputAudio, outputAudio])) {
      if (probe) void probe.context.close().catch(() => undefined);
    }
    gl.deleteProgram(silkProgram.value);
    gl.deleteProgram(orbitProgram.value);
    gl.deleteVertexArray(geometry.vao);
    gl.deleteBuffer(geometry.vertex);
    if (geometry.index) gl.deleteBuffer(geometry.index);
    for (const orbit of orbits) {
      gl.deleteVertexArray(orbit.vao);
      gl.deleteBuffer(orbit.vertex);
    }
  };
}
