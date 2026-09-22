/*
 * Adapted directly from @ogtirth/liquid-glass-oss@0.1.0 (MIT).
 * This keeps the package's shader/refraction pipeline while exposing a small
 * imperative renderer that can be shared by the existing Ruth admin DOM.
 */

export type LiquidGlassVariant = "clear" | "frosted" | "dark" | "prism" | "dome";

export type LiquidGlassSettings = {
  blur: number;
  refraction: number;
  chromaticAberration: number;
  distortion: number;
  edgeHighlight: number;
  specular: number;
  fresnel: number;
  radius: number;
  depth: number;
  brightness: number;
  saturation: number;
  darkTint: number;
  tintStrength: number;
  opacity: number;
  bevel: number;
  lensWidth: number;
  lensHeight: number;
  liquidMotion: number;
  liquidSpring: number;
  liquidDamping: number;
};

const PRESETS: Record<LiquidGlassVariant, LiquidGlassSettings> = {
  clear: {
    blur: 0.16,
    refraction: 0.78,
    chromaticAberration: 0.035,
    distortion: 0.028,
    edgeHighlight: 0.16,
    specular: 0.11,
    fresnel: 1,
    radius: 22,
    depth: 40,
    brightness: 0.04,
    saturation: 0.02,
    darkTint: 0.02,
    tintStrength: 0.06,
    opacity: 1,
    bevel: 0,
    lensWidth: 54,
    lensHeight: 34,
    liquidMotion: 0.13,
    liquidSpring: 0.052,
    liquidDamping: 0.85,
  },
  frosted: {
    blur: 0.52,
    refraction: 0.58,
    chromaticAberration: 0.035,
    distortion: 0.025,
    edgeHighlight: 0.11,
    specular: 0.08,
    fresnel: 0.95,
    radius: 22,
    depth: 36,
    brightness: 0.04,
    saturation: -0.08,
    darkTint: 0.09,
    tintStrength: 0.12,
    opacity: 1,
    bevel: 0,
    lensWidth: 54,
    lensHeight: 34,
    liquidMotion: 0.13,
    liquidSpring: 0.052,
    liquidDamping: 0.85,
  },
  dark: {
    blur: 0.42,
    refraction: 0.62,
    chromaticAberration: 0.045,
    distortion: 0.026,
    edgeHighlight: 0.12,
    specular: 0.09,
    fresnel: 1,
    radius: 22,
    depth: 38,
    brightness: -0.08,
    saturation: -0.12,
    darkTint: 0.42,
    tintStrength: 0.42,
    opacity: 1,
    bevel: 0,
    lensWidth: 54,
    lensHeight: 34,
    liquidMotion: 0.13,
    liquidSpring: 0.052,
    liquidDamping: 0.85,
  },
  prism: {
    blur: 0.2,
    refraction: 0.9,
    chromaticAberration: 0.16,
    distortion: 0.055,
    edgeHighlight: 0.18,
    specular: 0.14,
    fresnel: 1.12,
    radius: 22,
    depth: 48,
    brightness: 0.05,
    saturation: 0.12,
    darkTint: 0.02,
    tintStrength: 0.04,
    opacity: 1,
    bevel: 0,
    lensWidth: 54,
    lensHeight: 34,
    liquidMotion: 0.16,
    liquidSpring: 0.052,
    liquidDamping: 0.85,
  },
  dome: {
    blur: 0.25,
    refraction: 0.86,
    chromaticAberration: 0.065,
    distortion: 0.045,
    edgeHighlight: 0.2,
    specular: 0.16,
    fresnel: 1.15,
    radius: 999,
    depth: 52,
    brightness: 0.06,
    saturation: 0.06,
    darkTint: 0.02,
    tintStrength: 0.05,
    opacity: 1,
    bevel: 0,
    lensWidth: 54,
    lensHeight: 34,
    liquidMotion: 0.16,
    liquidSpring: 0.052,
    liquidDamping: 0.85,
  },
};

export function resolveLiquidGlassSettings(
  variant: LiquidGlassVariant = "frosted",
  overrides: Partial<LiquidGlassSettings> = {},
): LiquidGlassSettings {
  return { ...PRESETS[variant], ...overrides };
}

const vertexShader = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const fragmentShader = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform vec2 u_textureResolution;
uniform vec4 u_backgroundRect;
uniform vec2 u_center;
uniform vec2 u_size;
uniform float u_radius;
uniform float u_blur;
uniform float u_refraction;
uniform float u_chromaticAberration;
uniform float u_distortion;
uniform float u_edgeHighlight;
uniform float u_specular;
uniform float u_fresnel;
uniform float u_depth;
uniform float u_brightness;
uniform float u_saturation;
uniform float u_darkTint;
uniform float u_tintStrength;
uniform float u_opacity;
uniform float u_bevel;
uniform float u_stretch;
uniform float u_pressed;
uniform vec2 u_scale;
uniform float u_rotation;
uniform float u_backgroundSampling;
uniform vec3 u_trackColor;
uniform vec3 u_trackColor2;
uniform float u_trackMix;

#define PI 3.141592653589793

float roundedBoxSDF(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + vec2(r);
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

vec2 rotate2D(vec2 p, float a) {
  float s = sin(a);
  float c = cos(a);
  return mat2(c, -s, s, c) * p;
}

vec2 backgroundUV(vec2 screenUV) {
  if (u_backgroundSampling < 0.5) return screenUV;
  vec2 px = screenUV * u_resolution;
  vec2 origin = u_backgroundRect.xy;
  vec2 size = max(u_backgroundRect.zw, vec2(1.0));
  return (px - origin) / size;
}

vec4 textureSafe(vec2 uv) {
  return texture(u_texture, clamp(uv, vec2(0.001), vec2(0.999)));
}

vec4 sampleBackground(vec2 screenUV) {
  return textureSafe(backgroundUV(screenUV));
}

vec4 blurBackground(vec2 screenUV, float amount) {
  if (amount <= 0.001) return sampleBackground(screenUV);
  vec2 texel = 1.0 / max(u_resolution, vec2(1.0));
  float radius = mix(0.7, 9.0, clamp(amount, 0.0, 1.0));
  vec2 ox = vec2(texel.x * radius, 0.0);
  vec2 oy = vec2(0.0, texel.y * radius);
  vec2 od1 = vec2(texel.x * radius * 0.7071, texel.y * radius * 0.7071);
  vec2 od2 = vec2(-texel.x * radius * 0.7071, texel.y * radius * 0.7071);
  vec4 c = sampleBackground(screenUV) * 0.20;
  c += sampleBackground(screenUV + ox) * 0.10;
  c += sampleBackground(screenUV - ox) * 0.10;
  c += sampleBackground(screenUV + oy) * 0.10;
  c += sampleBackground(screenUV - oy) * 0.10;
  c += sampleBackground(screenUV + od1) * 0.10;
  c += sampleBackground(screenUV - od1) * 0.10;
  c += sampleBackground(screenUV + od2) * 0.10;
  c += sampleBackground(screenUV - od2) * 0.10;
  return c;
}

vec3 adjustColor(vec3 color, float brightness, float saturation) {
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(vec3(luma), color, 1.0 + saturation);
  color += brightness;
  return color;
}

void main() {
  vec2 fragPx = v_uv * u_resolution;
  vec2 p = fragPx - u_center;
  p = rotate2D(p, -u_rotation);
  p /= max(u_scale, vec2(0.001));

  float stretchX = 1.0 + max(u_stretch, 0.0) * 0.82;
  float stretchY = 1.0 - max(u_stretch, 0.0) * 0.24;
  if (u_stretch < 0.0) {
    stretchX = 1.0 + u_stretch * 0.25;
    stretchY = 1.0 - u_stretch * 0.38;
  }
  p.x /= max(stretchX, 0.1);
  p.y /= max(stretchY, 0.1);

  vec2 halfSize = max(u_size * 0.5, vec2(1.0));
  float maxRadius = min(halfSize.x, halfSize.y);
  float radius = min(u_radius, maxRadius);
  float sdf = roundedBoxSDF(p, halfSize, radius);
  float aa = max(fwidth(sdf), 0.75);
  float mask = 1.0 - smoothstep(-aa, aa, sdf);
  if (mask <= 0.001) {
    outColor = vec4(0.0);
    return;
  }

  float edgeDistance = max(-sdf, 0.0);
  float edgeWidth = mix(3.0, 14.0, clamp(u_depth / 60.0, 0.0, 1.0));
  float edge = 1.0 - smoothstep(0.0, edgeWidth, edgeDistance);
  float inner = smoothstep(0.0, edgeWidth * 1.5, edgeDistance);

  vec2 normalized = p / max(halfSize, vec2(1.0));
  float radial = clamp(length(normalized), 0.0, 1.5);
  vec2 normal2 = normalize(normalized + vec2(1e-5));

  float bulge = pow(max(1.0 - radial * radial, 0.0), 0.72);
  float edgeCurve = pow(edge, 1.15);
  float pressBoost = mix(1.0, 0.88, u_pressed);
  float refractPx = u_refraction * mix(5.0, 30.0, clamp(u_depth / 60.0, 0.0, 1.0));
  refractPx *= pressBoost;
  vec2 refractOffset = normal2 * refractPx * (0.18 + 0.82 * edgeCurve);
  refractOffset += normalized * bulge * refractPx * 0.18;

  float wobble = u_distortion * 28.0;
  vec2 wobbleOffset = vec2(
    sin(normalized.y * 7.0 + normalized.x * 2.0),
    cos(normalized.x * 6.0 - normalized.y * 2.5)
  ) * wobble * (0.16 + edgeCurve * 0.84);

  vec2 offsetPx = refractOffset + wobbleOffset;
  vec2 screenUV = fragPx / u_resolution;
  vec2 refractedUV = screenUV + offsetPx / u_resolution;

  float caPx = u_chromaticAberration * 34.0 * (0.18 + edgeCurve * 0.82);
  vec2 ca = normal2 * caPx / u_resolution;

  vec4 centerSample = blurBackground(refractedUV, u_blur);
  vec4 redSample = blurBackground(refractedUV + ca, u_blur);
  vec4 blueSample = blurBackground(refractedUV - ca, u_blur);
  vec3 glassColor = vec3(redSample.r, centerSample.g, blueSample.b);

  glassColor = adjustColor(glassColor, u_brightness, u_saturation);
  glassColor = mix(glassColor, glassColor * (1.0 - u_darkTint), clamp(u_tintStrength, 0.0, 1.0));

  if (u_trackMix > 0.001) {
    vec3 track = mix(u_trackColor, u_trackColor2, clamp(v_uv.x, 0.0, 1.0));
    glassColor = mix(glassColor, track, clamp(u_trackMix, 0.0, 1.0));
  }

  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  vec3 normal3 = normalize(vec3(normal2 * (0.62 + u_bevel * 0.4) * edgeCurve, 0.82));
  float fresnelTerm = pow(1.0 - clamp(dot(normal3, viewDir), 0.0, 1.0), 2.2);
  fresnelTerm *= u_fresnel;

  vec3 lightDir = normalize(vec3(-0.42, -0.72, 0.78));
  vec3 halfVector = normalize(lightDir + viewDir);
  float spec = pow(max(dot(normal3, halfVector), 0.0), 34.0) * u_specular * 2.4;

  float topLight = smoothstep(0.45, -0.9, normalized.y) * edgeCurve;
  float leftLight = smoothstep(0.75, -0.8, normalized.x) * edgeCurve;
  float lowerShade = smoothstep(0.15, 1.0, normalized.y) * edgeCurve;

  glassColor += vec3(1.0) * (fresnelTerm * u_edgeHighlight * 0.68);
  glassColor += vec3(1.0) * spec;
  glassColor += vec3(1.0) * topLight * u_edgeHighlight * 0.22;
  glassColor += vec3(0.96, 0.98, 1.0) * leftLight * u_edgeHighlight * 0.12;
  glassColor -= vec3(0.05, 0.06, 0.08) * lowerShade * 0.22;

  float innerHighlight = (1.0 - smoothstep(edgeWidth * 0.55, edgeWidth * 2.0, edgeDistance));
  glassColor += vec3(1.0) * innerHighlight * u_edgeHighlight * 0.08;

  float alpha = mask * clamp(u_opacity, 0.0, 1.0);
  outColor = vec4(glassColor, alpha);
}`;

function compileShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Unable to create Liquid Glass shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || "Unknown shader compile error";
    gl.deleteShader(shader);
    throw new Error(log);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexShader);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShader);
  const program = gl.createProgram();
  if (!program) throw new Error("Unable to create Liquid Glass program");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) || "Unknown program link error";
    gl.deleteProgram(program);
    throw new Error(log);
  }
  return program;
}

type UniformMap = Record<string, WebGLUniformLocation | null>;

const UNIFORMS = [
  "u_texture", "u_resolution", "u_textureResolution", "u_backgroundRect",
  "u_center", "u_size", "u_radius", "u_blur", "u_refraction",
  "u_chromaticAberration", "u_distortion", "u_edgeHighlight", "u_specular",
  "u_fresnel", "u_depth", "u_brightness", "u_saturation", "u_darkTint",
  "u_tintStrength", "u_opacity", "u_bevel", "u_stretch", "u_pressed",
  "u_scale", "u_rotation", "u_backgroundSampling", "u_trackColor",
  "u_trackColor2", "u_trackMix",
] as const;

export class LiquidGlassRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly texture: WebGLTexture;
  private readonly vao: WebGLVertexArrayObject;
  private readonly uniforms: UniformMap;
  private settings: LiquidGlassSettings;
  private image = new Image();
  private imageReady = false;
  private source = "";
  private width = 1;
  private height = 1;
  private dpr = 1;
  private centerX = 0.5;
  private centerY = 0.5;
  private stretch = 0;
  private pressed = false;
  private scaleX = 1;
  private scaleY = 1;
  private rotation = 0;
  private useBackgroundSampling = true;
  private backgroundRect = { x: 0, y: 0, width: 1, height: 1 };
  private trackColor: [number, number, number] = [1, 1, 1];
  private trackColor2: [number, number, number] = [1, 1, 1];
  private trackMix = 0;

  constructor(canvas: HTMLCanvasElement, imageSource: string, settings = resolveLiquidGlassSettings()) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    });
    if (!gl) throw new Error("WebGL2 is required for Liquid Glass OSS");
    this.gl = gl;
    this.program = createProgram(gl);
    this.settings = settings;

    const vao = gl.createVertexArray();
    const buffer = gl.createBuffer();
    if (!vao || !buffer) throw new Error("Unable to create Liquid Glass geometry");
    this.vao = vao;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const position = gl.getAttribLocation(this.program, "a_position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const texture = gl.createTexture();
    if (!texture) throw new Error("Unable to create Liquid Glass texture");
    this.texture = texture;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255,255,255,0]));

    this.uniforms = Object.fromEntries(UNIFORMS.map((name) => [name, gl.getUniformLocation(this.program, name)]));
    this.image.crossOrigin = "anonymous";
    this.image.decoding = "async";
    this.image.onload = () => {
      this.imageReady = true;
      this.uploadImage();
      this.draw();
    };
    this.image.onerror = () => { this.imageReady = false; };
    this.setImage(imageSource);
  }

  setImage(source: string) {
    if (!source || source === this.source) return;
    this.source = source;
    this.imageReady = false;
    this.image.src = source;
  }

  setSettings(settings: LiquidGlassSettings) {
    this.settings = settings;
    this.draw();
  }

  setBackgroundSampling(enabled: boolean) {
    this.useBackgroundSampling = enabled;
    this.updateBackgroundRect();
    this.draw();
  }

  setTrack(mix: number) {
    this.trackMix = Math.min(1, Math.max(0, mix));
    this.draw();
  }

  setTrackColors(first: [number, number, number], second: [number, number, number] = first) {
    this.trackColor = first;
    this.trackColor2 = second;
    this.draw();
  }

  setGeometry(
    centerX: number,
    centerY: number,
    stretch = 0,
    pressed = false,
    scaleX = 1,
    scaleY = 1,
    rotation = 0,
  ) {
    this.centerX = centerX;
    this.centerY = centerY;
    this.stretch = stretch;
    this.pressed = pressed;
    this.scaleX = scaleX;
    this.scaleY = scaleY;
    this.rotation = rotation;
    this.draw();
  }

  resize(width: number, height: number) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.max(1, Math.round(this.width * this.dpr));
    const pixelHeight = Math.max(1, Math.round(this.height * this.dpr));
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
      this.canvas.style.width = `${this.width}px`;
      this.canvas.style.height = `${this.height}px`;
      this.gl.viewport(0, 0, pixelWidth, pixelHeight);
    }
    this.updateBackgroundRect();
    this.draw();
  }

  dispose() {
    this.image.onload = null;
    this.image.onerror = null;
    this.gl.deleteTexture(this.texture);
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteProgram(this.program);
  }

  private uploadImage() {
    if (!this.imageReady || !this.image.naturalWidth || !this.image.naturalHeight) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.image);
  }

  private updateBackgroundRect() {
    if (!this.useBackgroundSampling || !this.canvas.isConnected) {
      this.backgroundRect = { x: 0, y: 0, width: this.width, height: this.height };
      return;
    }
    const background = document.querySelector<HTMLElement>("[data-liquid-glass-background]");
    if (!background) {
      this.backgroundRect = { x: 0, y: 0, width: this.width, height: this.height };
      return;
    }
    const canvasRect = this.canvas.getBoundingClientRect();
    const rootRect = background.getBoundingClientRect();
    this.backgroundRect = {
      x: rootRect.left - canvasRect.left,
      y: rootRect.top - canvasRect.top,
      width: rootRect.width,
      height: rootRect.height,
    };
  }

  draw() {
    if (!this.canvas.width || !this.canvas.height) return;
    const gl = this.gl;
    const s = this.settings;
    this.updateBackgroundRect();
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);

    const uniform1f = (name: string, value: number) => {
      const location = this.uniforms[name];
      if (location) gl.uniform1f(location, value);
    };
    const uniform2f = (name: string, a: number, b: number) => {
      const location = this.uniforms[name];
      if (location) gl.uniform2f(location, a, b);
    };
    const uniform3f = (name: string, a: number, b: number, c: number) => {
      const location = this.uniforms[name];
      if (location) gl.uniform3f(location, a, b, c);
    };
    const uniform4f = (name: string, a: number, b: number, c: number, d: number) => {
      const location = this.uniforms[name];
      if (location) gl.uniform4f(location, a, b, c, d);
    };

    const textureUniform = this.uniforms.u_texture;
    if (textureUniform) gl.uniform1i(textureUniform, 0);
    uniform2f("u_resolution", this.canvas.width, this.canvas.height);
    uniform2f("u_textureResolution", this.image.naturalWidth || 1, this.image.naturalHeight || 1);
    uniform4f(
      "u_backgroundRect",
      this.backgroundRect.x * this.dpr,
      this.backgroundRect.y * this.dpr,
      this.backgroundRect.width * this.dpr,
      this.backgroundRect.height * this.dpr,
    );
    uniform2f("u_center", this.centerX * this.dpr, (this.height - this.centerY) * this.dpr);
    uniform2f("u_size", this.width * this.dpr, this.height * this.dpr);
    uniform1f("u_radius", s.radius * this.dpr);
    uniform1f("u_blur", s.blur);
    uniform1f("u_refraction", s.refraction);
    uniform1f("u_chromaticAberration", s.chromaticAberration);
    uniform1f("u_distortion", s.distortion);
    uniform1f("u_edgeHighlight", s.edgeHighlight);
    uniform1f("u_specular", s.specular);
    uniform1f("u_fresnel", s.fresnel);
    uniform1f("u_depth", s.depth * this.dpr);
    uniform1f("u_brightness", s.brightness);
    uniform1f("u_saturation", s.saturation);
    uniform1f("u_darkTint", s.darkTint);
    uniform1f("u_tintStrength", s.tintStrength);
    uniform1f("u_opacity", s.opacity);
    uniform1f("u_bevel", s.bevel);
    uniform1f("u_stretch", this.stretch);
    uniform1f("u_pressed", this.pressed ? 1 : 0);
    uniform2f("u_scale", this.scaleX, this.scaleY);
    uniform1f("u_rotation", this.rotation);
    uniform1f("u_backgroundSampling", this.useBackgroundSampling ? 1 : 0);
    uniform3f("u_trackColor", ...this.trackColor);
    uniform3f("u_trackColor2", ...this.trackColor2);
    uniform1f("u_trackMix", this.trackMix);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}
