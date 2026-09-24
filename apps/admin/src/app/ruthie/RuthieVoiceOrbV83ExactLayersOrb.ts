// @ts-nocheck
import {
  ORB_BUFFER_SIZE,
  drawImageLayerTo,
  lerp,
  radialGlowTo,
  type V83Environment,
  type V83Mode,
} from "./RuthieVoiceOrbV83Core";

function drawIntegratedRibbons(
  env: V83Environment,
  cx: number,
  cy: number,
  radius: number,
  time: number,
  mode: V83Mode,
  level: number,
) {
  const context = env.orbCtx;
  context.save();
  context.beginPath();
  context.arc(cx, cy, radius * .95, 0, Math.PI * 2);
  context.clip();
  context.translate(cx, cy);
  context.globalCompositeOperation = "screen";

  const count = 3;
  const twist = mode === "thinking" ? .86 : mode === "processing" ? 1.05 : mode === "speaking" ? 1.18 : 1;

  for (let strand = 0; strand < count; strand += 1) {
    const offset = (strand - (count - 1) / 2) / (count - 1);
    const yBase = offset * radius * .48;
    const phase = time * (.39 + strand * .075) + strand * 1.55;
    const amplitudeX = radius * (.24 + strand * .025) * (.86 + level * .16);
    const amplitudeY = radius * (mode === "thinking" ? .06 : .085);

    const drawRibbon = (width: number, alpha: number, blur: number) => {
      context.beginPath();
      for (let index = 0; index <= 110; index += 1) {
        const unit = index / 110;
        const envelope = .30 + Math.sin(unit * Math.PI) * .55;
        const x = lerp(-radius * .62, radius * .60, unit)
          + Math.sin(phase + unit * 4.8 * twist) * amplitudeX * envelope
          + Math.sin(phase * 1.22 - unit * 7.1) * radius * .018;
        const y = yBase
          + Math.sin(phase * .86 + unit * 4.1) * amplitudeY * (.48 + Math.sin(unit * Math.PI) * .72)
          + Math.sin((unit - .5) * Math.PI) * radius * .035;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.strokeStyle = `rgba(255,207,112,${alpha})`;
      context.lineWidth = width;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.shadowBlur = blur;
      context.shadowColor = "rgba(255,177,58,.58)";
      context.stroke();
    };

    drawRibbon(11 - strand * 1.5, .025 + strand * .008 + level * .018, 18);
    drawRibbon(3.1 - strand * .35, .075 + strand * .014 + level * .045, 10);
    drawRibbon(.72, .10 + strand * .012 + level * .04, 3);
  }

  context.restore();
}

export function renderWholeOrbExact(
  env: V83Environment,
  time: number,
  mode: V83Mode,
  level: number,
  pulse: number,
) {
  const context = env.orbCtx;
  const center = ORB_BUFFER_SIZE / 2;
  const radius = ORB_BUFFER_SIZE * .315;
  const size = radius * 2.46;

  context.clearRect(0, 0, ORB_BUFFER_SIZE, ORB_BUFFER_SIZE);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.save();
  context.beginPath();
  context.arc(center, center, radius * 1.035, 0, Math.PI * 2);
  context.clip();

  // HTML v8.3 ile birebir katman sırası ve opaklıkları.
  drawImageLayerTo(context, env.images.base, center, center, size, time * .004, pulse, .46);
  drawImageLayerTo(
    context,
    env.images.outer,
    center,
    center,
    size,
    time * (mode === "processing" ? .16 : .04),
    pulse * (1 + .018 * Math.sin(time * 1.6)),
    .78 + level * .11,
  );
  drawImageLayerTo(
    context,
    env.images.middle,
    center,
    center,
    size,
    -time * (mode === "thinking" ? .18 : .061),
    pulse * (.995 + .015 * Math.cos(time * 2.1)),
    .70 + level * .14,
  );

  drawIntegratedRibbons(env, center, center + radius * .01, radius * .86, time, mode, level);

  drawImageLayerTo(
    context,
    env.images.inner,
    center,
    center,
    size,
    time * (mode === "thinking" ? .28 : .082),
    pulse * (mode === "thinking" ? .82 : 1),
    .55 + level * .09,
  );
  drawImageLayerTo(context, env.images.outer, center, center, size * 1.013, -time * .018, pulse, .16, 3);
  drawImageLayerTo(context, env.images.middle, center, center, size * .99, time * .085, pulse, .11, 1.5);

  context.save();
  context.globalCompositeOperation = "screen";
  for (let index = 0; index < 76; index += 1) {
    const seed = index * 12.9898;
    const angle = seed % 6.283 + time * (.12 + (index % 7) * .012);
    const distance = radius * (.18 + ((index * 37) % 100) / 100 * .73);
    const x = center + Math.cos(angle) * distance;
    const y = center + Math.sin(angle) * distance * .78;
    context.fillStyle = `rgba(255,195,82,${.025 + level * .035})`;
    context.shadowBlur = 7;
    context.shadowColor = "rgba(255,170,50,.7)";
    context.beginPath();
    context.arc(x, y, .45 + (index % 4) * .22, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();

  const coreRadius = radius * (mode === "thinking" ? .31 : .22) * (1 + level * .16);
  radialGlowTo(context, center, center + radius * .18, coreRadius, .75 + level * .30);
  radialGlowTo(context, center, center + radius * .18, coreRadius * .35, .88);
  context.restore();
}

export function drawWholeOrbExact(
  env: V83Environment,
  cx: number,
  cy: number,
  radius: number,
  time: number,
  mode: V83Mode,
  level: number,
  speechTempo: number,
) {
  const context = env.ctx;
  const tempo = mode === "speaking" ? speechTempo : 0;
  const reactiveTime = time * (mode === "speaking" ? .95 + tempo * 1.30 : 1);
  const destinationSize = radius * 2.54;

  // İki piksellik yatay dilimleme yok: scanline üretmeden bütün katman tek parça çizilir.
  const xScale = mode === "speaking"
    ? 1 + Math.sin(reactiveTime * 2.05) * (.006 + tempo * .008)
    : mode === "listening"
      ? 1 + Math.sin(time * 1.65) * .008
      : 1 + Math.sin(time * .72) * .0025;
  const yScale = mode === "speaking"
    ? 1 + Math.cos(reactiveTime * 1.85) * (.007 + tempo * .009)
    : mode === "listening"
      ? 1 + Math.cos(time * 1.45) * .010
      : 1 + Math.cos(time * .66) * .0025;
  const driftX = Math.sin(reactiveTime * 1.18) * radius * (mode === "speaking" ? .010 : .004);
  const driftY = Math.cos(reactiveTime * .94) * radius * (mode === "speaking" ? .006 : .003);
  const rotation = Math.sin(reactiveTime * .53) * (mode === "speaking" ? .006 : .0025);

  context.save();
  context.translate(cx + driftX, cy + driftY);
  context.rotate(rotation);
  context.scale(xScale, yScale);
  context.globalCompositeOperation = "screen";
  context.globalAlpha = 1;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.filter = "none";
  context.drawImage(
    env.orbBuffer,
    -destinationSize / 2,
    -destinationSize / 2,
    destinationSize,
    destinationSize,
  );
  context.restore();
}
