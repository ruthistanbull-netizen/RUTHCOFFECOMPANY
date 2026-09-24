"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

export function PageIntro({
  eyebrow,
  title,
  description,
  align = "center",
  className = "",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 34 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.72, ease: "easeOut" }}
      className={`${align === "center" ? "text-center" : "text-left"} ${className}`}
    >
      {eyebrow && (
        <p className="mb-3 text-xs uppercase tracking-wide-luxe text-brick">
          {eyebrow}
        </p>
      )}
      <h1
        className="font-heading text-balance"
        style={{ fontSize: "clamp(2.2rem, 6vw, 4.5rem)", color: "var(--rosta-cream)" }}
      >
        {title}
      </h1>
      {description && (
        <p className={`mt-5 max-w-2xl leading-8 text-cream/70 ${align === "center" ? "mx-auto" : ""}`}>
          {description}
        </p>
      )}
    </motion.div>
  );
}

export function AnimatedBlock({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 34 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.72, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
