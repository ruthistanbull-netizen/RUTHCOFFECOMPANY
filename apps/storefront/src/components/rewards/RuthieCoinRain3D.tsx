"use client";

import { useEffect, useRef } from "react";

type CoinConfig = {
  x: number;
  z: number;
  scale: number;
  offset: number;
  sway: number;
  phase: number;
  spinX: number;
  spinY: number;
  spinZ: number;
  baseRotX: number;
  baseRotY: number;
  baseRotZ: number;
};

type CoinMesh = {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  count: number;
};

const coins: CoinConfig[] = [
  { x: -2.95, z: -0.8, scale: 0.72, offset: 0.12, sway: 0.08, phase: 0.3, spinX: 11.2, spinY: 8.4, spinZ: 6.8, baseRotX: 0.2, baseRotY: 0.9, baseRotZ: 0.4 },
  { x: -2.55, z: -0.2, scale: 0.88, offset: 0.46, sway: 0.16, phase: 1.3, spinX: 9.2, spinY: 12.4, spinZ: 5.4, baseRotX: 0.7, baseRotY: 0.2, baseRotZ: -0.3 },
  { x: -2.1, z: 0.25, scale: 0.96, offset: 0.84, sway: 0.1, phase: 2.1, spinX: 13.4, spinY: 9.8, spinZ: 4.6, baseRotX: -0.5, baseRotY: 1.1, baseRotZ: 0.6 },
  { x: -1.72, z: -0.7, scale: 0.78, offset: 0.28, sway: 0.13, phase: 0.8, spinX: 10.3, spinY: 7.6, spinZ: 6.1, baseRotX: 0.9, baseRotY: 0.4, baseRotZ: -0.6 },
  { x: -1.35, z: 0.55, scale: 1.04, offset: 1.05, sway: 0.18, phase: 1.6, spinX: 12.8, spinY: 10.9, spinZ: 6.7, baseRotX: 0.2, baseRotY: 0.7, baseRotZ: 0.5 },
  { x: -0.95, z: -0.1, scale: 0.82, offset: 0.58, sway: 0.12, phase: 2.6, spinX: 8.6, spinY: 11.5, spinZ: 7.2, baseRotX: -0.9, baseRotY: 0.1, baseRotZ: 0.7 },
  { x: -0.52, z: 0.85, scale: 0.98, offset: 1.22, sway: 0.14, phase: 1.1, spinX: 14.2, spinY: 9.6, spinZ: 5.1, baseRotX: 0.4, baseRotY: 0.5, baseRotZ: -0.4 },
  { x: -0.15, z: -0.55, scale: 0.74, offset: 0.74, sway: 0.09, phase: 0.2, spinX: 10.9, spinY: 13.6, spinZ: 5.4, baseRotX: -0.2, baseRotY: 1.3, baseRotZ: 0.9 },
  { x: 0.18, z: 0.3, scale: 1.08, offset: 0.09, sway: 0.19, phase: 2.9, spinX: 11.4, spinY: 8.8, spinZ: 6.4, baseRotX: 0.5, baseRotY: 0.9, baseRotZ: -0.7 },
  { x: 0.56, z: -0.85, scale: 0.86, offset: 1.36, sway: 0.11, phase: 0.6, spinX: 9.1, spinY: 12.9, spinZ: 4.9, baseRotX: -0.8, baseRotY: 0.2, baseRotZ: 0.1 },
  { x: 0.95, z: 0.7, scale: 0.92, offset: 0.42, sway: 0.16, phase: 2.2, spinX: 13.8, spinY: 9.7, spinZ: 5.8, baseRotX: 0.7, baseRotY: 1.0, baseRotZ: 0.4 },
  { x: 1.32, z: -0.2, scale: 0.8, offset: 1.54, sway: 0.12, phase: 1.7, spinX: 10.2, spinY: 14.1, spinZ: 6.9, baseRotX: -0.5, baseRotY: 0.3, baseRotZ: -0.8 },
  { x: 1.68, z: 0.45, scale: 1.02, offset: 0.96, sway: 0.15, phase: 0.9, spinX: 12.4, spinY: 10.3, spinZ: 5.6, baseRotX: 0.3, baseRotY: 0.8, baseRotZ: 0.5 },
  { x: 2.04, z: -0.7, scale: 0.76, offset: 0.22, sway: 0.08, phase: 2.4, spinX: 8.7, spinY: 11.2, spinZ: 6.2, baseRotX: -1.0, baseRotY: 0.6, baseRotZ: 0.2 },
  { x: 2.42, z: 0.16, scale: 0.88, offset: 1.68, sway: 0.11, phase: 1.4, spinX: 14.0, spinY: 8.5, spinZ: 4.7, baseRotX: 0.6, baseRotY: 1.1, baseRotZ: -0.5 },
  { x: 2.8, z: -0.35, scale: 0.7, offset: 0.63, sway: 0.07, phase: 2.8, spinX: 9.6, spinY: 12.1, spinZ: 5.0, baseRotX: -0.4, baseRotY: 0.5, baseRotZ: 0.7 },
];

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Shader oluşturulamadı");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || "Bilinmeyen shader hatası";
    gl.deleteShader(shader);
    throw new Error(log);
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext) {
  const vertex = compileShader(
    gl,
    gl.VERTEX_SHADER,
    `
      attribute vec3 aPosition;
      attribute vec3 aNormal;
      attribute vec2 aUv;
      uniform mat4 uModel;
      uniform mat4 uViewProj;
      uniform mat3 uNormalMatrix;
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying vec2 vUv;
      void main() {
        vec4 world = uModel * vec4(aPosition, 1.0);
        vWorld = world.xyz;
        vNormal = normalize(uNormalMatrix * aNormal);
        vUv = aUv;
        gl_Position = uViewProj * world;
      }
    `
  );

  const fragment = compileShader(
    gl,
    gl.FRAGMENT_SHADER,
    `
      precision mediump float;
      uniform sampler2D uCoinMap;
      uniform vec3 uCamera;
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying vec2 vUv;
      void main() {
        vec3 normal = normalize(vNormal);
        vec3 lightA = normalize(vec3(0.55, 0.88, 0.7));
        vec3 lightB = normalize(vec3(-0.7, 0.25, 0.5));
        vec3 viewDir = normalize(uCamera - vWorld);
        float diffuse = max(dot(normal, lightA), 0.0) * 0.72 + max(dot(normal, lightB), 0.0) * 0.28;
        vec3 halfDir = normalize(lightA + viewDir);
        float spec = pow(max(dot(normal, halfDir), 0.0), 42.0);
        vec4 tex = texture2D(uCoinMap, vUv);
        vec3 base = mix(vec3(0.70, 0.42, 0.10), tex.rgb, tex.a);
        vec3 color = base * (0.48 + diffuse * 0.76) + vec3(1.0, 0.78, 0.28) * spec * 0.72;
        gl_FragColor = vec4(color, tex.a);
      }
    `
  );

  const program = gl.createProgram();
  if (!program) throw new Error("Program oluşturulamadı");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || "WebGL link hatası");
  }
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  return program;
}

function createCoinTexture(gl: WebGLRenderingContext) {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.clearRect(0, 0, size, size);
  const bg = ctx.createRadialGradient(size * 0.34, size * 0.28, 8, size * 0.5, size * 0.5, size * 0.48);
  bg.addColorStop(0, "#fff4bd");
  bg.addColorStop(0.18, "#f7d96f");
  bg.addColorStop(0.44, "#d9a437");
  bg.addColorStop(0.78, "#96611d");
  bg.addColorStop(1, "#654013");
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.49, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(size / 2, size / 2);
  for (let i = 0; i < 34; i++) {
    ctx.rotate((Math.PI * 2) / 34);
    ctx.fillStyle = i % 2 ? "rgba(255, 232, 128, .18)" : "rgba(91, 58, 16, .22)";
    ctx.fillRect(-3, -size * 0.48, 6, size * 0.065);
  }
  ctx.restore();

  ctx.strokeStyle = "rgba(255, 239, 156, .92)";
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.375, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(94, 58, 14, .32)";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.31, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,.18)";
  ctx.beginPath();
  ctx.ellipse(size * 0.35, size * 0.29, size * 0.15, size * 0.09, -0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${size * 0.30}px Georgia`;
  ctx.fillStyle = "#e8bd55";
  ctx.shadowColor = "rgba(77, 46, 10, .55)";
  ctx.shadowBlur = 10;
  ctx.fillText("R", size / 2, size / 2 + 8);
  ctx.shadowBlur = 0;
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(111, 68, 15, .42)";
  ctx.strokeText("R", size / 2, size / 2 + 8);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255, 240, 170, .4)";
  ctx.strokeText("R", size / 2, size / 2 + 6);

  const texture = gl.createTexture();
  if (!texture) return null;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return texture;
}

function createCoinMesh(segments = 72): CoinMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const radius = 0.54;
  const depth = 0.14;
  const frontZ = depth / 2;
  const backZ = -depth / 2;

  const push = (x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number) => {
    positions.push(x, y, z);
    normals.push(nx, ny, nz);
    uvs.push(u, v);
  };

  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const x0 = Math.cos(a0) * radius;
    const y0 = Math.sin(a0) * radius;
    const x1 = Math.cos(a1) * radius;
    const y1 = Math.sin(a1) * radius;

    push(0, 0, frontZ, 0, 0, 1, 0.5, 0.5);
    push(x0, y0, frontZ, 0, 0, 1, 0.5 + x0 / (radius * 2), 0.5 + y0 / (radius * 2));
    push(x1, y1, frontZ, 0, 0, 1, 0.5 + x1 / (radius * 2), 0.5 + y1 / (radius * 2));

    push(0, 0, backZ, 0, 0, -1, 0.5, 0.5);
    push(x1, y1, backZ, 0, 0, -1, 0.5 + x1 / (radius * 2), 0.5 + y1 / (radius * 2));
    push(x0, y0, backZ, 0, 0, -1, 0.5 + x0 / (radius * 2), 0.5 + y0 / (radius * 2));

    const n0x = Math.cos(a0), n0y = Math.sin(a0);
    const n1x = Math.cos(a1), n1y = Math.sin(a1);
    const u0 = i / segments;
    const u1 = (i + 1) / segments;
    push(x0, y0, frontZ, n0x, n0y, 0, u0, 0.06);
    push(x0, y0, backZ, n0x, n0y, 0, u0, 0.94);
    push(x1, y1, backZ, n1x, n1y, 0, u1, 0.94);
    push(x0, y0, frontZ, n0x, n0y, 0, u0, 0.06);
    push(x1, y1, backZ, n1x, n1y, 0, u1, 0.94);
    push(x1, y1, frontZ, n1x, n1y, 0, u1, 0.06);
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    count: positions.length / 3,
  };
}

function mat4Identity() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function mat4Multiply(a: number[], b: number[]) {
  const out = new Array(16).fill(0);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    out[c * 4 + r] =
      a[0 * 4 + r] * b[c * 4 + 0] +
      a[1 * 4 + r] * b[c * 4 + 1] +
      a[2 * 4 + r] * b[c * 4 + 2] +
      a[3 * 4 + r] * b[c * 4 + 3];
  }
  return out;
}

function mat4Translate(x: number, y: number, z: number) {
  const m = mat4Identity();
  m[12] = x; m[13] = y; m[14] = z;
  return m;
}

function mat4Scale(s: number) {
  const m = mat4Identity();
  m[0] = s; m[5] = s; m[10] = s;
  return m;
}

function mat4RotX(a: number) {
  const c = Math.cos(a), s = Math.sin(a);
  return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
}

function mat4RotY(a: number) {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
}

function mat4RotZ(a: number) {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function mat4Perspective(fovy: number, aspect: number, near: number, far: number) {
  const f = 1 / Math.tan(fovy / 2);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0];
}

function mat4LookAt(eye: number[], center: number[], up: number[]) {
  const zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
  const zl = Math.hypot(zx, zy, zz) || 1;
  const z = [zx / zl, zy / zl, zz / zl];
  const xx = up[1] * z[2] - up[2] * z[1], xy = up[2] * z[0] - up[0] * z[2], xz = up[0] * z[1] - up[1] * z[0];
  const xl = Math.hypot(xx, xy, xz) || 1;
  const x = [xx / xl, xy / xl, xz / xl];
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]), -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]), -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]), 1];
}

function normalMatrixFromModel(m: number[]) {
  return [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
}

function easeInQuad(t: number) {
  return t * t;
}

export function RuthieCoinRain3D() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: true, alpha: true, premultipliedAlpha: false });
    if (!gl) return;

    let frame = 0;
    let disposed = false;
    let started = performance.now();

    try {
      const program = createProgram(gl);
      const texture = createCoinTexture(gl);
      const mesh = createCoinMesh();
      if (!texture) return;

      const positionBuffer = gl.createBuffer();
      const normalBuffer = gl.createBuffer();
      const uvBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.uvs, gl.STATIC_DRAW);

      const locPosition = gl.getAttribLocation(program, "aPosition");
      const locNormal = gl.getAttribLocation(program, "aNormal");
      const locUv = gl.getAttribLocation(program, "aUv");
      const locModel = gl.getUniformLocation(program, "uModel");
      const locViewProj = gl.getUniformLocation(program, "uViewProj");
      const locNormalMatrix = gl.getUniformLocation(program, "uNormalMatrix");
      const locCamera = gl.getUniformLocation(program, "uCamera");
      const locCoinMap = gl.getUniformLocation(program, "uCoinMap");

      const render = () => {
        if (disposed) return;
        const rect = canvas.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        const width = Math.max(1, Math.floor(rect.width * dpr));
        const height = Math.max(1, Math.floor(rect.height * dpr));
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }

        gl.viewport(0, 0, width, height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(program);

        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.enableVertexAttribArray(locPosition);
        gl.vertexAttribPointer(locPosition, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
        gl.enableVertexAttribArray(locNormal);
        gl.vertexAttribPointer(locNormal, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
        gl.enableVertexAttribArray(locUv);
        gl.vertexAttribPointer(locUv, 2, gl.FLOAT, false, 0, 0);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(locCoinMap, 0);

        const aspect = width / Math.max(1, height);
        const camera = [0, 0.18, 8.2];
        const view = mat4LookAt(camera, [0, 0.08, 0], [0, 1, 0]);
        const proj = mat4Perspective((34 * Math.PI) / 180, aspect, 0.1, 30);
        const viewProj = mat4Multiply(proj, view);
        gl.uniformMatrix4fv(locViewProj, false, new Float32Array(viewProj));
        gl.uniform3fv(locCamera, new Float32Array(camera));

        const elapsed = (performance.now() - started) / 1000;
        const cycle = 4.8;
        for (const coin of coins) {
          const raw = ((elapsed + coin.offset) % cycle) / cycle;
          const fall = easeInQuad(raw);
          const x = coin.x + Math.sin(raw * Math.PI * 2 + coin.phase) * coin.sway;
          const y = 4.2 - fall * 8.8;
          const z = coin.z + Math.cos(raw * Math.PI * 4 + coin.phase) * 0.22;

          let model = mat4Translate(x, y, z);
          model = mat4Multiply(model, mat4RotX(coin.baseRotX + raw * coin.spinX));
          model = mat4Multiply(model, mat4RotY(coin.baseRotY + raw * coin.spinY));
          model = mat4Multiply(model, mat4RotZ(coin.baseRotZ + raw * coin.spinZ));
          model = mat4Multiply(model, mat4Scale(coin.scale));
          gl.uniformMatrix4fv(locModel, false, new Float32Array(model));
          gl.uniformMatrix3fv(locNormalMatrix, false, new Float32Array(normalMatrixFromModel(model)));
          gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
        }

        frame = requestAnimationFrame(render);
      };

      frame = requestAnimationFrame(render);
    } catch {
      // WebGL desteklenmeyen cihazlarda animasyon sessizce kapanır; yazı ve puan alanı kalır.
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
    };
  }, []);

  return <canvas ref={canvasRef} className="ruthie-success-coin-canvas" aria-hidden="true" />;
}
