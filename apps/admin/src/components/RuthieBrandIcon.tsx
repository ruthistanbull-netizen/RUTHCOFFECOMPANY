"use client";

import { forwardRef } from "react";
import type { LucideProps } from "lucide-react";

/**
 * Shared ROSTA Insight mark.
 * Technical compatibility name is retained because many Ruth-derived surfaces
 * already import this component. The rendered artwork is a clean coffee bean.
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
      <path d="M17.9 4.5c3.1 3.1 2.7 8.6-.9 12.2-3.6 3.6-9.1 4-12.2.9-3.1-3.1-2.7-8.6.9-12.2 3.6-3.6 9.1-4 12.2-.9Z" />
      <path d="M6.3 17.1c2.4-.7 4.2-2.1 5.2-4.2 1.2-2.5.8-4.8 4.8-6.9" />
    </svg>
  );
});

RuthieBrandIcon.displayName = "RostaInsightBrandIcon";
