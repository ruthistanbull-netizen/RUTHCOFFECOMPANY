"use client";

import { useRef, useMemo, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Configuration options for the gradient orb.
 * All fields are optional and fall back to sensible defaults.
 */
export type GradientOrbConfig = {
  /** CSS color string for the canvas background. Use "transparent" for no background. @default "transparent" */
  background?: string;
  /** Hue rotation in degrees applied to all gradient colors. @default 0 */
  hue?: number;
  /** Constant rotation speed of the orb (radians/sec). @default 0.3 */
  rotationSpeed?: number;
  /** Scale of the noise pattern inside the orb. @default 0.65 */
  noiseScale?: number;
  /** Inner radius of the orb glow (0–1). @default 0.1 */
  innerRadius?: number;
};

/**
 * Visual activity is rendered inside the fragment shader instead of with a
 * CSS transform/filter on the WebGL element. Keeping the DOM geometry fixed
 * prevents press/listening animations from affecting the draggable orb's
 * screen-space position.
 */
export type GradientOrbActivity =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "acting"
  | "speaking"
  | "error";

const defaults: Required<GradientOrbConfig> = {
  background: "transparent",
  hue: 0,
  rotationSpeed: 0.3,
  noiseScale: 0.65,
  innerRadius: 0.1,
};

/**
 * GLSL vertex shader — pass-through that outputs clip-space positions
 * directly from a fullscreen triangle in NDC.
 */
const vertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/**
 * GLSL fragment shader — renders a glowing orb with three noise-mixed colors,
 * hue rotation, breathing pulse, constant rotation and phase-safe visual
 * scaling performed entirely in shader space.
 */
const fragmentShader = /* glsl */ `
  precision highp float;

  uniform float iTime;
  uniform vec3 iResolution;
  uniform float hue;
  uniform float rot;
  uniform float noiseScale;
  uniform float innerRadius;
  uniform float visualScale;
  uniform float phaseBrightness;
  uniform float phaseHue;
  uniform float phaseAlpha;

  varying vec2 vUv;

  // --- YIQ color space hue rotation ---

  vec3 rgb2yiq(vec3 c) {
    return vec3(
      dot(c, vec3(0.299, 0.587, 0.114)),
      dot(c, vec3(0.596, -0.274, -0.322)),
      dot(c, vec3(0.211, -0.523, 0.312))
    );
  }

  vec3 yiq2rgb(vec3 c) {
    return vec3(
      c.x + 0.956 * c.y + 0.621 * c.z,
      c.x - 0.272 * c.y - 0.647 * c.z,
      c.x - 1.106 * c.y + 1.703 * c.z
    );
  }

  vec3 adjustHue(vec3 color, float hueDeg) {
    float hueRad = radians(hueDeg);
    vec3 yiq = rgb2yiq(color);
    float cosA = cos(hueRad);
    float sinA = sin(hueRad);
    yiq.yz = vec2(yiq.y * cosA - yiq.z * sinA, yiq.y * sinA + yiq.z * cosA);
    return yiq2rgb(yiq);
  }

  // --- 3D simplex noise (hash-based) ---

  vec3 hash33(vec3 p3) {
    p3 = fract(p3 * vec3(0.1031, 0.11369, 0.13787));
    p3 += dot(p3, p3.yxz + 19.19);
    return -1.0 + 2.0 * fract(vec3(p3.x + p3.y, p3.x + p3.z, p3.y + p3.z) * p3.zyx);
  }

  float snoise3(vec3 p) {
    const float K1 = 0.333333333;
    const float K2 = 0.166666667;
    vec3 i = floor(p + (p.x + p.y + p.z) * K1);
    vec3 d0 = p - (i - (i.x + i.y + i.z) * K2);
    vec3 e = step(vec3(0.0), d0 - d0.yzx);
    vec3 i1 = e * (1.0 - e.zxy);
    vec3 i2 = 1.0 - e.zxy * (1.0 - e);
    vec3 d1 = d0 - (i1 - K2);
    vec3 d2 = d0 - (i2 - K1);
    vec3 d3 = d0 - 0.5;
    vec4 h = max(0.6 - vec4(dot(d0, d0), dot(d1, d1), dot(d2, d2), dot(d3, d3)), 0.0);
    vec4 n = h * h * h * h * vec4(
      dot(d0, hash33(i)),
      dot(d1, hash33(i + i1)),
      dot(d2, hash33(i + i2)),
      dot(d3, hash33(i + 1.0))
    );
    return dot(vec4(31.316), n);
  }

  // --- Orb rendering ---

  vec4 extractAlpha(vec3 colorIn) {
    float a = max(max(colorIn.r, colorIn.g), colorIn.b);
    return vec4(colorIn.rgb / (a + 1e-5), a);
  }

  const vec3 baseColor0 = vec3(0.788, 0.290, 0.251); // ROSTA Brick B (#C94A40)
  const vec3 baseColor1 = vec3(0.784, 0.655, 0.490); // ROSTA Kraft (#C8A77D)
  const vec3 baseColor2 = vec3(0.220, 0.145, 0.110); // ROSTA Espresso (#38251C)
  const vec3 baseColor3 = vec3(0.067, 0.067, 0.067); // ROSTA Carbon (#111111)

  float light1(float intensity, float attenuation, float dist) {
    return intensity / (1.0 + dist * attenuation);
  }

  float light2(float intensity, float attenuation, float dist) {
    return intensity / (1.0 + dist * dist * attenuation);
  }

  vec4 draw(vec2 uv) {
    float effectiveHue = hue + phaseHue;
    vec3 color0 = adjustHue(baseColor0, effectiveHue);
    vec3 color1 = adjustHue(baseColor1, effectiveHue);
    vec3 color2 = adjustHue(baseColor2, effectiveHue);
    vec3 color3 = adjustHue(baseColor3, effectiveHue);

    float len = length(uv);
    float invLen = len > 0.0 ? 1.0 / len : 0.0;

    float pulse = sin(iTime * 1.5) * 0.02;

    float n0 = snoise3(vec3(uv * noiseScale, iTime * 0.5)) * 0.5 + 0.5;

    float r0 = mix(mix(innerRadius + pulse, 1.0, 0.4), mix(innerRadius + pulse, 1.0, 0.6), n0);

    float d0 = distance(uv, (r0 * invLen) * uv);
    float v0 = light1(1.0, 10.0, d0);
    v0 *= smoothstep(r0 * 1.05, r0, len);
    float cl = cos(atan(uv.y, uv.x) + iTime * 2.0) * 0.5 + 0.5;

    float a = iTime * -1.0;
    vec2 pos = vec2(cos(a), sin(a)) * r0;
    float d = distance(uv, pos);
    float v1 = light2(1.5, 5.0, d);
    v1 *= light1(1.0, 50.0, d0);

    float v2 = smoothstep(1.0, mix(innerRadius, 1.0, n0 * 0.5), len);
    float v3 = smoothstep(innerRadius, mix(innerRadius, 1.0, 0.5), len);

    vec3 col = mix(color1, color2, cl);
    col = mix(col, color0, n0);
    col = mix(color3, col, v0);
    col = (col + v1) * v2 * v3;
    col = clamp(col, 0.0, 1.0);

    return extractAlpha(col);
  }

  void main() {
    vec2 center = iResolution.xy * 0.5;
    float size = min(iResolution.x, iResolution.y);
    vec2 uv = (vUv * iResolution.xy - center) / size * 2.0;

    // Scaling the shader coordinate system changes only the drawn orb size.
    // The canvas, button, fixed-position layer and pointer coordinates never move.
    uv /= max(visualScale, 0.85);

    float s = sin(rot);
    float c = cos(rot);
    uv = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y);

    vec4 col = draw(uv);
    float outAlpha = clamp(col.a * phaseAlpha, 0.0, 1.0);
    vec3 outColor = clamp(col.rgb * phaseBrightness, 0.0, 1.0);
    gl_FragColor = vec4(outColor * outAlpha, outAlpha);
  }
`;

function activityVisual(activity: GradientOrbActivity, elapsed: number) {
  let visualScale = 1;
  let phaseBrightness = 1;
  let phaseHue = 0;
  let phaseAlpha = 1;

  if (activity === "listening") {
    // Starts at exactly 1.0 on press, then swells from the center. No DOM scale.
    const swell = 0.5 - 0.5 * Math.cos(elapsed * 7.4);
    visualScale = 1 + swell * 0.07;
    phaseBrightness = 1 + swell * 0.16;
    phaseHue = -4 * swell;
  } else if (activity === "thinking") {
    const wave = Math.sin(elapsed * 3.1);
    visualScale = 1 + wave * 0.018;
    phaseBrightness = 0.98 + (wave + 1) * 0.035;
    phaseHue = 4 + (wave + 1) * 4;
  } else if (activity === "acting") {
    const beat = Math.pow(Math.abs(Math.sin(elapsed * 7.2)), 5);
    visualScale = 1 + beat * 0.028;
    phaseBrightness = 1 + beat * 0.18;
    phaseHue = -7 * beat;
  } else if (activity === "speaking") {
    const wave = Math.sin(elapsed * 10.5);
    visualScale = 1 + wave * 0.022;
    phaseBrightness = 1.06 + Math.max(0, wave) * 0.1;
    phaseHue = -2 + wave * 2;
  } else if (activity === "connecting") {
    const pulse = 0.5 - 0.5 * Math.cos(elapsed * 4.6);
    visualScale = 0.985 + pulse * 0.015;
    phaseBrightness = 0.9 + pulse * 0.1;
    phaseAlpha = 0.72 + pulse * 0.28;
  } else if (activity === "error") {
    const pulse = 0.5 - 0.5 * Math.cos(elapsed * 4.2);
    visualScale = 0.99 + pulse * 0.01;
    phaseBrightness = 0.8 + pulse * 0.12;
    phaseHue = 18 + pulse * 8;
    phaseAlpha = 0.8 + pulse * 0.2;
  }

  return { visualScale, phaseBrightness, phaseHue, phaseAlpha };
}

/** Internal scene component for the gradient fullscreen shader. */
function GradientScene({
  hue,
  rotationSpeed,
  noiseScale,
  innerRadius,
  activity,
}: Required<Omit<GradientOrbConfig, "background">> & { activity: GradientOrbActivity }) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { size, viewport } = useThree();
  const rotRef = useRef(0);
  const lastTimeRef = useRef(0);
  const activityRef = useRef<GradientOrbActivity>(activity);
  const activityStartedAtRef = useRef(0);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
    );
    geo.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    return geo;
  }, []);

  useEffect(() => {
    return () => geometry.dispose();
  }, [geometry]);

  const uniforms = useMemo(
    () => ({
      iTime: { value: 0 },
      iResolution: { value: new THREE.Vector3(size.width, size.height, 1) },
      hue: { value: hue },
      rot: { value: 0 },
      noiseScale: { value: noiseScale },
      innerRadius: { value: innerRadius },
      visualScale: { value: 1 },
      phaseBrightness: { value: 1 },
      phaseHue: { value: 0 },
      phaseAlpha: { value: 1 },
    }),
    // `size` is intentionally omitted — iResolution is mutated in-place each
    // frame via useFrame rather than triggering a uniform object re-creation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hue, noiseScale, innerRadius],
  );

  useFrame((state) => {
    if (!materialRef.current) return;

    const t = state.clock.elapsedTime;
    if (lastTimeRef.current === 0) lastTimeRef.current = t;
    const dt = Math.max(0, t - lastTimeRef.current);
    lastTimeRef.current = t;

    if (activityRef.current !== activity) {
      activityRef.current = activity;
      activityStartedAtRef.current = t;
    }

    const elapsedInActivity = Math.max(0, t - activityStartedAtRef.current);
    const visual = activityVisual(activity, elapsedInActivity);

    rotRef.current += dt * rotationSpeed;

    const u = materialRef.current.uniforms;
    if (
      !u.iTime || !u.hue || !u.rot || !u.iResolution
      || !u.visualScale || !u.phaseBrightness || !u.phaseHue || !u.phaseAlpha
    ) return;

    u.iTime.value = t;
    u.hue.value = hue;
    u.rot.value = rotRef.current;
    u.visualScale.value = visual.visualScale;
    u.phaseBrightness.value = visual.phaseBrightness;
    u.phaseHue.value = visual.phaseHue;
    u.phaseAlpha.value = visual.phaseAlpha;
    u.iResolution.value.set(
      size.width * viewport.dpr,
      size.height * viewport.dpr,
      size.width / size.height,
    );
  });

  return (
    <mesh geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  );
}

/**
 * Glowing shader orb with noise-based 3-color mixing, YIQ hue rotation,
 * breathing pulse, constant rotation and optional activity animation — all
 * rendered on GPU as a single fullscreen triangle.
 */
export function GradientOrb({
  config,
  className = "",
  activity = "idle",
}: {
  config?: GradientOrbConfig;
  className?: string;
  activity?: GradientOrbActivity;
}) {
  const { background, hue, rotationSpeed, noiseScale, innerRadius } = {
    ...defaults,
    ...config,
  };
  const transparentBackground = background === "transparent";

  return (
    <div className={`w-full h-full ${className}`} style={{ background }}>
      {/* Keep the WebGL canvas alpha-enabled and cap DPR to avoid mobile GPU stalls. */}
      <Canvas
        dpr={[1, 1.5]}
        frameloop="always"
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          if (transparentBackground) gl.setClearColor(0x000000, 0);
        }}
      >
        {!transparentBackground && <color attach="background" args={[background]} />}
        <GradientScene
          hue={hue}
          rotationSpeed={rotationSpeed}
          noiseScale={noiseScale}
          innerRadius={innerRadius}
          activity={activity}
        />
      </Canvas>
    </div>
  );
}