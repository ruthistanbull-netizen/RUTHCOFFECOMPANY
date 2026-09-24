export const VERTEX_SHADER = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const FRAGMENT_SHADER = `
precision highp float;

uniform vec2 u_resolution;
uniform vec2 u_pointer;
uniform float u_time;
uniform float u_phase;
uniform float u_loudness;
uniform float u_tempo;
uniform float u_low;
uniform float u_mid;
uniform float u_high;
uniform float u_compact;
uniform sampler2D u_orb;

#define PI 3.141592653589793
#define TAU 6.283185307179586

float saturate(float value) {
  return clamp(value, 0.0, 1.0);
}

float phaseIs(float target) {
  return 1.0 - step(0.49, abs(u_phase - target));
}

float hash21(vec2 point) {
  point = fract(point * vec2(123.34, 456.21));
  point += dot(point, point + 45.32);
  return fract(point.x * point.y);
}

vec2 rotate2d(vec2 point, float angle) {
  float sine = sin(angle);
  float cosine = cos(angle);
  return mat2(cosine, -sine, sine, cosine) * point;
}

vec3 screenBlend(vec3 base, vec3 layer) {
  return 1.0 - (1.0 - base) * (1.0 - layer);
}

vec4 sampleLayer(sampler2D image, vec2 uv, float angle, float scaleValue) {
  vec2 local = rotate2d((uv - 0.5) * scaleValue, angle) + 0.5;
  return texture2D(image, local);
}

vec4 withLumaAlpha(vec4 sampleValue) {
  float luminance = max(sampleValue.r, max(sampleValue.g, sampleValue.b));
  sampleValue.a = smoothstep(0.018, 0.115, luminance);
  return sampleValue;
}

float angleDistance(float a, float b) {
  return abs(atan(sin(a - b), cos(a - b)));
}

float ellipseDistance(vec2 point, vec2 axes) {
  return abs(length(point / axes) - 1.0) * min(axes.x, axes.y);
}

vec3 addStar(vec3 colorValue, vec2 point, vec2 starPoint, float sizeValue, float brightness) {
  vec2 delta = point - starPoint;
  float distanceValue = length(delta);
  float core = exp(-distanceValue * distanceValue / max(0.000001, sizeValue * sizeValue));
  float rayX = exp(-abs(delta.x) / max(0.00001, sizeValue * 0.22)) * exp(-abs(delta.y) / max(0.00001, sizeValue * 3.4));
  float rayY = exp(-abs(delta.y) / max(0.00001, sizeValue * 0.22)) * exp(-abs(delta.x) / max(0.00001, sizeValue * 3.4));
  float intensity = core + (rayX + rayY) * 0.22;
  return screenBlend(colorValue, vec3(1.0, 0.87, 0.61) * intensity * brightness);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec2 point = uv - 0.5;
  point.x *= u_resolution.x / max(1.0, u_resolution.y);
  point += u_pointer * vec2(0.018, -0.014);

  float connecting = phaseIs(0.0);
  float listening = phaseIs(1.0);
  float thinking = phaseIs(2.0);
  float acting = phaseIs(3.0);
  float speaking = phaseIs(4.0);
  float errorState = phaseIs(5.0);

  vec3 result = vec3(0.0);
  float alpha = 0.0;

  vec2 starGrid = uv * vec2(44.0, 44.0);
  vec2 starCell = floor(starGrid);
  vec2 starLocal = fract(starGrid) - 0.5;
  float starRandom = hash21(starCell);
  if (starRandom > 0.925) {
    vec2 randomOffset = vec2(hash21(starCell + 11.7), hash21(starCell + 31.4)) - 0.5;
    float starDistance = length(starLocal - randomOffset * 0.68);
    float twinkle = 0.48 + 0.52 * sin(u_time * (0.35 + hash21(starCell + 7.0) * 1.25) + starRandom * 18.0);
    float starSize = mix(0.022, 0.075, hash21(starCell + 17.0));
    float starGlow = exp(-starDistance * starDistance / (starSize * starSize));
    float starBrightness = mix(0.16, 0.72, hash21(starCell + 4.0)) * (0.62 + twinkle * 0.56);
    result = screenBlend(result, vec3(1.0, 0.86, 0.61) * starGlow * starBrightness);
    alpha = max(alpha, starGlow * starBrightness);
  }

  float angle = atan(point.y, point.x);
  float distanceFromCenter = length(point);
  float orbRadius = mix(0.365, 0.345, u_compact);

  float idleBreath = sin(u_time * 1.15) * 0.010 + sin(u_time * 0.52 + 1.2) * 0.004;
  float growth = 1.0 + idleBreath;
  growth += listening * (0.018 + u_loudness * 0.118);
  growth += speaking * (0.022 + u_loudness * 0.088);
  growth += acting * sin(u_time * 2.5) * 0.010;
  growth -= thinking * 0.035;

  float tempoSpeed = 0.82 + u_tempo * 1.45;
  float growthSync = 0.78 + saturate((growth - 0.98) * 5.0) * 0.22;
  float slimeAmount = u_tempo * growthSync * (listening * 0.021 + speaking * 0.028);
  float topBottom = pow(abs(sin(angle)), 1.7);
  float blob = 1.0;
  blob += slimeAmount * (
    sin(angle * 2.0 + u_time * tempoSpeed * 1.1) * 0.52 +
    sin(angle * 3.0 - u_time * tempoSpeed * 0.74) * 0.29 +
    sin(angle * 5.0 + u_time * tempoSpeed * 0.36) * 0.13
  );
  blob += slimeAmount * topBottom * sin(u_time * tempoSpeed * 2.25 + sign(sin(angle)) * 1.15) * 0.62;

  float deformedRadius = orbRadius * growth * blob;

  for (int index = 0; index < 5; index++) {
    float fi = float(index);
    float centerAngle = u_time * (0.085 + fi * 0.014) + fi * 1.29;
    float span = 0.52 + mod(fi, 2.0) * 0.20;
    float arcMask = 1.0 - smoothstep(span, span + 0.14, angleDistance(angle, centerAngle));
    float lineRadius = deformedRadius + orbRadius * (0.010 + fi * 0.011);
    lineRadius += sin(angle * 3.0 + u_time * 0.62 + fi) * orbRadius * 0.004;
    float variableWidth = mix(0.00065, 0.0019, 0.5 + 0.5 * sin(angle * (3.5 + fi * 0.32) + u_time * 0.8 + fi));
    float lineValue = exp(-abs(distanceFromCenter - lineRadius) / variableWidth) * arcMask;
    float glowValue = exp(-abs(distanceFromCenter - lineRadius) / (variableWidth * 5.2)) * arcMask;
    result = screenBlend(result, vec3(1.0, 0.67, 0.25) * glowValue * 0.045);
    result = screenBlend(result, vec3(1.0, 0.84, 0.52) * lineValue * (0.12 + fi * 0.016));
    alpha = max(alpha, max(lineValue * 0.22, glowValue * 0.08));
  }

  if (acting > 0.5) {
    for (int index = 0; index < 3; index++) {
      float fi = float(index);
      float orientation = mix(-0.58, 0.82, fi / 2.0) + u_time * (fi == 1.0 ? -0.22 : 0.16 + fi * 0.035);
      vec2 orbitPoint = rotate2d(point, orientation);
      vec2 axes = vec2(
        orbRadius * mix(1.15, 0.94, fi / 2.0),
        orbRadius * mix(0.43, 0.72, fi / 2.0)
      ) * growth;
      float lineDistance = ellipseDistance(orbitPoint, axes);
      float orbitGlow = exp(-lineDistance / 0.0075);
      float orbitLine = exp(-lineDistance / 0.00135);
      result = screenBlend(result, vec3(1.0, 0.64, 0.20) * orbitGlow * (0.055 - fi * 0.009));
      result = screenBlend(result, vec3(1.0, 0.85, 0.52) * orbitLine * (0.25 - fi * 0.045));
      alpha = max(alpha, orbitGlow * 0.15);

      float packetAngle = u_time * (1.15 + fi * 0.24) * (fi == 1.0 ? -1.0 : 1.0) + fi * 2.0;
      vec2 packetLocal = vec2(cos(packetAngle) * axes.x, sin(packetAngle) * axes.y);
      vec2 packetPoint = rotate2d(packetLocal, -orientation);
      float packetTwinkle = 0.72 + 0.28 * sin(u_time * 7.0 + fi);
      result = addStar(result, point, packetPoint, 0.006 + fi * 0.0012, 0.78 * packetTwinkle);
      alpha = max(alpha, exp(-length(point - packetPoint) * 130.0) * 0.68);
    }
  }

  for (int index = 0; index < 9; index++) {
    float fi = float(index);
    float orbitIndex = mod(fi, 4.0);
    float speed = 0.18 + fi * 0.035;
    float starAngle = u_time * speed * (mod(fi, 2.0) < 0.5 ? -1.0 : 1.0) + fi * 1.76;
    vec2 axes = vec2(
      orbRadius * (1.02 + orbitIndex * 0.045),
      orbRadius * (0.64 + orbitIndex * 0.075)
    ) * growth;
    float tilt = -0.72 + orbitIndex * 0.48;
    vec2 starLocalPoint = vec2(cos(starAngle) * axes.x, sin(starAngle) * axes.y);
    vec2 starPoint = rotate2d(starLocalPoint, tilt);
    float starTwinkle = 0.52 + 0.48 * sin(u_time * (0.8 + fi * 0.13) + fi * 2.1);
    result = addStar(result, point, starPoint, 0.0028 + mod(fi, 3.0) * 0.0011, (0.24 + starTwinkle * 0.42));
    alpha = max(alpha, exp(-length(point - starPoint) * 190.0) * (0.18 + starTwinkle * 0.32));
  }

  vec2 orbPoint = point / max(0.0001, deformedRadius);
  float orbDistance = length(orbPoint);
  if (orbDistance < 1.08) {
    vec2 textureUv = 0.5 + orbPoint * 0.465;
    float speedMultiplier = mix(1.0, 1.7, thinking) + acting * 0.35;

    float layerRadius = length(orbPoint);
    float outerMask = smoothstep(0.42, 0.63, layerRadius) * (1.0 - smoothstep(0.90, 1.055, layerRadius));
    float middleMask = smoothstep(0.08, 0.32, layerRadius) * (1.0 - smoothstep(0.66, 0.87, layerRadius));
    float innerMask = 1.0 - smoothstep(0.38, 0.56, layerRadius);

    vec4 baseSample = withLumaAlpha(sampleLayer(u_orb, textureUv, u_time * 0.008, 1.0));
    vec4 outerSample = withLumaAlpha(sampleLayer(u_orb, textureUv, u_time * 0.070 * speedMultiplier, 1.0));
    vec4 middleSample = withLumaAlpha(sampleLayer(u_orb, textureUv, -u_time * 0.105 * speedMultiplier, 1.0));
    vec4 innerSample = withLumaAlpha(sampleLayer(u_orb, textureUv, u_time * 0.155 * speedMultiplier, 1.0));

    outerSample *= outerMask;
    middleSample *= middleMask;
    innerSample *= innerMask;

    vec3 orbColor = vec3(0.0);
    orbColor = screenBlend(orbColor, baseSample.rgb * baseSample.a * 0.82);
    orbColor = screenBlend(orbColor, outerSample.rgb * outerSample.a * (0.58 + u_high * 0.14));
    orbColor = screenBlend(orbColor, middleSample.rgb * middleSample.a * (0.50 + u_mid * 0.16));
    orbColor = screenBlend(orbColor, innerSample.rgb * innerSample.a * (0.46 + u_low * 0.18));

    vec2 corePoint = orbPoint - vec2(0.0, -0.19);
    float core = exp(-length(corePoint) * (7.2 - u_loudness * 1.5));
    orbColor = screenBlend(orbColor, vec3(1.0, 0.71, 0.28) * core * (0.24 + u_loudness * 0.26));

    float edgeFade = 1.0 - smoothstep(0.91, 1.055, orbDistance);
    float textureAlpha = max(max(baseSample.a, outerSample.a), max(middleSample.a, innerSample.a));
    float orbAlpha = edgeFade * saturate(textureAlpha * 1.14 + core * 0.18);
    orbColor = mix(orbColor, vec3(1.0, 0.16, 0.055) * max(orbColor.r, 0.2), errorState * 0.68);

    result = screenBlend(result, orbColor * orbAlpha);
    alpha = max(alpha, orbAlpha);
  }

  float aura = exp(-pow(distanceFromCenter / max(0.001, deformedRadius * 1.22), 3.1));
  result = screenBlend(result, vec3(0.84, 0.39, 0.06) * aura * (0.026 + u_loudness * 0.018));
  alpha = max(alpha, aura * 0.035);

  gl_FragColor = vec4(result, saturate(alpha));
}
`;
