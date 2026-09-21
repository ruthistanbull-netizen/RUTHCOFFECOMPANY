export const ruthMotionEase: [number, number, number, number] = [0.22, 1, 0.36, 1];

export const ruthMotion = {
  duration: {
    none: 0,
    fast: 0.12,
    normal: 0.22,
    slow: 0.38,
  },
  milliseconds: {
    none: 0,
    fast: 120,
    normal: 220,
    slow: 380,
  },
  distance: {
    subtle: 6,
    standard: 12,
    emphatic: 24,
  },
  scale: {
    pressed: 0.97,
    enter: 0.985,
    media: 1.018,
  },
  ease: ruthMotionEase,
  stagger: 0.035,
} as const;

export function ruthTransition(speed: keyof typeof ruthMotion.duration = "normal") {
  return {
    duration: ruthMotion.duration[speed],
    ease: ruthMotionEase,
  };
}

export const ruthPageMotion = {
  initial: { opacity: 0, y: ruthMotion.distance.subtle },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -ruthMotion.distance.subtle },
} as const;

export const ruthOverlayMotion = {
  initial: { opacity: 0, y: ruthMotion.distance.standard, scale: ruthMotion.scale.enter },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: ruthMotion.distance.subtle, scale: ruthMotion.scale.enter },
} as const;
