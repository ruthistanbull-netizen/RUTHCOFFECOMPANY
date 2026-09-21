"use client";

import { useMemo } from "react";

function seededValue(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

export default function GoldParticles({
  count = 12,
  className = "",
}: {
  count?: number;
  className?: string;
}) {
  const particles = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        id: i,
        left: seededValue(i * 6 + 1) * 100,
        top: seededValue(i * 6 + 2) * 100,
        size: 1 + seededValue(i * 6 + 3) * 2.5,
        duration: 8 + seededValue(i * 6 + 4) * 10,
        delay: seededValue(i * 6 + 5) * 5,
        opacity: 0.15 + seededValue(i * 6 + 6) * 0.25,
      })),
    [count]
  );

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      {particles.map((particle) => (
        <span
          key={particle.id}
          className="absolute rounded-full"
          style={{
            left: `${particle.left}%`,
            top: `${particle.top}%`,
            width: particle.size,
            height: particle.size,
            background: "var(--gold)",
            opacity: particle.opacity,
            animation: `particle-float ${particle.duration}s ease-in-out ${particle.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}
