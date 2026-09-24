// @ts-nocheck
import { ellipsePoint, type V83Environment, type V83Mode } from "./RuthieVoiceOrbV83Core";

export function drawOuterParticles(env: V83Environment, cx: number, cy: number, radius: number, time: number, mode: V83Mode, level: number) {
  const context = env.ctx;
  context.save();
  context.globalCompositeOperation = "screen";
  for (const particle of env.particles) {
    const angle = particle.angle + time * particle.speed * (mode === "processing" ? 1.35 : .34);
    const distance = radius * particle.radius;
    const x = cx + Math.cos(angle) * distance;
    const y = cy + Math.sin(angle) * distance * (mode === "processing" ? .34 : .84);
    const alpha = (mode === "processing" ? .13 : .035) + level * .18;
    const size = particle.size * (.65 + level * .8);
    context.fillStyle = `rgba(255,197,84,${alpha})`;
    context.shadowBlur = 8;
    context.shadowColor = "rgba(255,168,45,.72)";
    context.beginPath();
    context.arc(x, y, size, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

export function drawBackgroundStars(env: V83Environment, time: number, width: number, height: number) {
  const context = env.ctx;
  context.save();
  context.globalCompositeOperation = "screen";
  for (const star of env.backgroundStars) {
    const x = star.x * width;
    const y = star.y * height;
    const twinkle = .55 + .45 * Math.sin(time * star.twinkleSpeed + star.twinklePhase);
    const alpha = (.08 + twinkle * .18) * star.brightness;
    const size = star.size * (.8 + twinkle * .45);
    context.fillStyle = `rgba(255,222,165,${alpha})`;
    context.shadowBlur = 3 + star.brightness * 4;
    context.shadowColor = "rgba(255,214,150,.58)";
    context.beginPath();
    context.arc(x, y, size, 0, Math.PI * 2);
    context.fill();
    if (star.sparkle && twinkle > .82) {
      const cross = size * 1.8;
      context.strokeStyle = `rgba(255,245,220,${alpha * .62})`;
      context.lineWidth = .35;
      context.beginPath(); context.moveTo(x - cross, y); context.lineTo(x + cross, y); context.stroke();
      context.beginPath(); context.moveTo(x, y - cross); context.lineTo(x, y + cross); context.stroke();
    }
  }
  context.restore();
}

export function drawOrbitingStars(env: V83Environment, cx: number, cy: number, radius: number, time: number, level: number) {
  const context = env.ctx;
  const orbits = [
    { rx: radius * 1.06, ry: radius * .84, tilt: -.45 },
    { rx: radius * 1.16, ry: radius * .64, tilt: .12 },
    { rx: radius * 1.24, ry: radius * .50, tilt: -.95 },
    { rx: radius * 1.02, ry: radius * .92, tilt: .72 },
  ];
  context.save();
  context.translate(cx, cy);
  context.globalCompositeOperation = "screen";
  for (const star of env.orbitingStars) {
    const orbit = orbits[star.orbit];
    const angle = star.angle + time * star.speed;
    const twinkle = .58 + .42 * Math.sin(time * star.twinkleSpeed + star.twinklePhase);
    const x0 = Math.cos(angle) * orbit.rx;
    const y0 = Math.sin(angle) * orbit.ry;
    const x = x0 * Math.cos(orbit.tilt) - y0 * Math.sin(orbit.tilt);
    const y = x0 * Math.sin(orbit.tilt) + y0 * Math.cos(orbit.tilt);
    const alpha = (.12 + twinkle * .28) * star.brightness * (.72 + level * .25);
    const size = star.size * (.75 + twinkle * .55);
    context.fillStyle = `rgba(255,232,182,${alpha})`;
    context.shadowBlur = 6 + star.brightness * 6;
    context.shadowColor = "rgba(255,222,166,.92)";
    context.beginPath(); context.arc(x, y, size, 0, Math.PI * 2); context.fill();
    if (twinkle > .86) {
      const cross = size * 1.7;
      context.strokeStyle = `rgba(255,247,226,${alpha * .72})`;
      context.lineWidth = .34;
      context.beginPath(); context.moveTo(x - cross, y); context.lineTo(x + cross, y); context.stroke();
      context.beginPath(); context.moveTo(x, y - cross); context.lineTo(x, y + cross); context.stroke();
    }
  }
  context.restore();
}

export function drawOuterField(env: V83Environment, cx: number, cy: number, radius: number, time: number, level: number, mode: V83Mode) {
  const context = env.ctx;
  context.save();
  context.translate(cx, cy);
  context.globalCompositeOperation = "screen";
  const strandCount = mode === "speaking" || mode === "listening" ? 5 : 4;
  for (let strand = 0; strand < strandCount; strand += 1) {
    const angle = time * (.12 + strand * .020) + strand * 1.05;
    const baseRadius = radius * (.96 + strand * .028);
    const length = .95 + (strand % 2) * .34;
    const coreWidth = [.72, 1.1, .58, 1.35, .82][strand] || .9;
    const glowWidth = coreWidth * 4.4;
    const arcPhase = Math.sin(time * .42 + strand * .8) * .22;
    const start = angle + arcPhase;
    const end = start + length;
    context.save();
    context.rotate((strand % 2 === 0 ? 1 : -1) * .06 * Math.sin(time * .55 + strand));
    for (let pass = 0; pass < 3; pass += 1) {
      context.beginPath();
      for (let index = 0; index <= 76; index += 1) {
        const unit = index / 76;
        const currentAngle = start + (end - start) * unit;
        const wobble = Math.sin(unit * Math.PI * 2 + time * 1.05 + strand) * radius * .010
          + Math.sin(currentAngle * 3 + time * .62) * radius * .006;
        const currentRadius = baseRadius + wobble;
        const x = Math.cos(currentAngle) * currentRadius;
        const y = Math.sin(currentAngle) * currentRadius * (.97 + .03 * Math.sin(time * .35 + strand));
        if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
      }
      if (pass === 0) {
        context.strokeStyle = `rgba(255,194,90,${.020 + level * .028})`;
        context.lineWidth = glowWidth; context.shadowBlur = 14; context.shadowColor = "rgba(255,177,64,.34)";
      } else if (pass === 1) {
        context.strokeStyle = `rgba(255,214,130,${.10 + level * .075})`;
        context.lineWidth = coreWidth; context.shadowBlur = 9; context.shadowColor = "rgba(255,190,84,.62)";
      } else {
        context.strokeStyle = `rgba(255,244,208,${.05 + level * .028})`;
        context.lineWidth = Math.max(.35, coreWidth * .34); context.shadowBlur = 3; context.shadowColor = "rgba(255,241,210,.42)";
      }
      context.lineCap = "round"; context.lineJoin = "round"; context.stroke();
    }
    context.restore();
    for (let point = 0; point < 2; point += 1) {
      const unit = (time * (.09 + strand * .01) + point / 2 + strand * .16) % 1;
      const currentAngle = start + (end - start) * unit;
      const currentRadius = baseRadius
        + Math.sin(unit * Math.PI * 2 + time * 1.05 + strand) * radius * .010
        + Math.sin(currentAngle * 3 + time * .62) * radius * .006;
      const x = Math.cos(currentAngle) * currentRadius;
      const y = Math.sin(currentAngle) * currentRadius * (.97 + .03 * Math.sin(time * .35 + strand));
      context.fillStyle = `rgba(255,224,150,${.16 + (1 - unit) * .16})`;
      context.shadowBlur = 10; context.shadowColor = "rgba(255,194,84,.8)";
      context.beginPath(); context.arc(x, y, .7 + (1 - unit) * 1.15, 0, Math.PI * 2); context.fill();
    }
  }
  context.restore();
}

export function drawThinkingVortex(env: V83Environment, cx: number, cy: number, radius: number, time: number, level: number) {
  const context = env.ctx;
  context.save(); context.translate(cx, cy); context.globalCompositeOperation = "screen";
  for (let strand = 0; strand < 9; strand += 1) {
    context.strokeStyle = `rgba(255,192,83,${.04 + strand * .006 + level * .03})`;
    context.lineWidth = .68; context.beginPath();
    for (let index = 0; index < 86; index += 1) {
      const unit = index / 85;
      const angle = time * 1.28 + strand * .57 + unit * 8.5;
      const currentRadius = radius * (.91 - unit * .77);
      const x = Math.cos(angle) * currentRadius;
      const y = Math.sin(angle) * currentRadius * .66;
      if (index) context.lineTo(x, y); else context.moveTo(x, y);
    }
    context.stroke();
  }
  context.restore();
}

export function drawOrbitLayer(env: V83Environment, cx: number, cy: number, radius: number, time: number, front: boolean) {
  const context = env.ctx;
  const orbits = [
    { rx: radius * 1.22, ry: radius * .45, tilt: -.55, speed: .78, phase: .2, alpha: 1, spin: .20 },
    { rx: radius * 1.10, ry: radius * .59, tilt: .17, speed: -.64, phase: 1.8, alpha: .78, spin: -.15 },
    { rx: radius * .98, ry: radius * .72, tilt: -.98, speed: .52, phase: 3, alpha: .58, spin: .12 },
  ];
  context.save(); context.translate(cx, cy); context.globalCompositeOperation = "screen";
  for (const orbit of orbits) {
    context.save(); context.rotate(time * orbit.spin + orbit.phase * .08);
    const drawPass = (width: number, alpha: number, blur: number, offset: number) => {
      let drawing = false; context.beginPath();
      for (let index = 0; index <= 180; index += 1) {
        const angle = index / 180 * Math.PI * 2 + time * orbit.speed;
        const point = ellipsePoint(orbit.rx + offset, orbit.ry + offset * .32, orbit.tilt, angle, .005, time, orbit.phase);
        const visible = front ? point.depth >= -.04 : point.depth < -.04;
        if (visible) { if (!drawing) { context.moveTo(point.x, point.y); drawing = true; } else context.lineTo(point.x, point.y); }
        else drawing = false;
      }
      context.strokeStyle = `rgba(255,204,112,${alpha * orbit.alpha * (front ? 1 : .44)})`;
      context.lineWidth = width; context.lineCap = "round"; context.lineJoin = "round";
      context.shadowBlur = blur; context.shadowColor = "rgba(255,178,61,.78)"; context.stroke();
    };
    drawPass(9, .024, 18, 0); drawPass(2.9, .11, 11, 0); drawPass(.76, .30, 4, 0);
    drawPass(.48, .14, 2, 1.8); drawPass(.40, .11, 2, -1.7);
    const head = time * (orbit.speed > 0 ? 1.45 : -1.34) + orbit.phase;
    for (let index = 0; index < 12; index += 1) {
      const angle = head - index * (orbit.speed > 0 ? .085 : -.085);
      const point = ellipsePoint(orbit.rx, orbit.ry, orbit.tilt, angle, .005, time, orbit.phase);
      const visible = front ? point.depth >= -.04 : point.depth < -.04;
      if (!visible) continue;
      const fade = 1 - index / 12;
      context.fillStyle = `rgba(255,226,153,${fade * .46 * orbit.alpha * (front ? 1 : .46)})`;
      context.shadowBlur = 12; context.shadowColor = "rgba(255,190,82,.92)";
      context.beginPath(); context.arc(point.x, point.y, .75 + fade * 1.6, 0, Math.PI * 2); context.fill();
    }
    context.restore();
  }
  context.restore();
}
