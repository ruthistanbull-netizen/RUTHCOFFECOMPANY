"use client";

import { MotionConfig } from "framer-motion";
import { ruthTransition } from "@ruth-commerce/ui/motion";
import type { ReactNode } from "react";

export function StorefrontMotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={ruthTransition("normal")}>
      {children}
    </MotionConfig>
  );
}
