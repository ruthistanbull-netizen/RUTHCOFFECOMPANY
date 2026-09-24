"use client";

import { forwardRef } from "react";
import type { LucideProps } from "lucide-react";

/**
 * Technical compatibility name retained so the current Ruth-derived AI surfaces
 * do not need a risky import migration. The rendered mark is ROSTA Insight's
 * coffee-bean + sparkle symbol.
 */
export const RuthieBrandIcon = forwardRef<SVGSVGElement, LucideProps>(function RuthieBrandIcon(
  { color = "currentColor", size = 24, className, strokeWidth = 1.8, ...props },
  ref,
) {
  return (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={props["aria-hidden"] ?? true}
      {...props}
    >
      <path d="M7.1 17.4c-2.7-2.7-2.6-7.3.3-10.2 2.9-2.9 7.5-3 10.2-.3 2.7 2.7 2.6 7.3-.3 10.2-2.9 2.9-7.5 3-10.2.3Z" />
      <path d="M8.2 16.3c2.1-.7 3.2-2 3.8-3.8.7-2 .5-3.8 2.9-5.3" />
      <path d="M18.4 3.4v3.2M16.8 5h3.2" />
      <path d="M4.4 17.8v2.4M3.2 19h2.4" />
    </svg>
  );
});

RuthieBrandIcon.displayName = "RostaInsightBrandIcon";
