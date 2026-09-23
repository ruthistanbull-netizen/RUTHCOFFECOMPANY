"use client";

import * as React from "react";
import styles from "./GlassButton.module.css";

export type GlassButtonSize = "default" | "sm" | "lg" | "icon";

export interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: GlassButtonSize;
  contentClassName?: string;
  active?: boolean;
}

function cn(...inputs: Array<string | undefined | null | false>) {
  return inputs.filter(Boolean).join(" ");
}

export const GlassButton = React.forwardRef<HTMLButtonElement, GlassButtonProps>(
  ({ className, children, size = "default", contentClassName, active = false, ...props }, ref) => (
    <span className={cn(styles.wrap, styles[`wrap_${size}`], className)} data-glass-button-wrap="true">
      <button
        ref={ref}
        className={cn(styles.button, styles[`button_${size}`], active && styles.active)}
        data-glass-button="true"
        {...props}
      >
        <span className={cn(styles.text, styles[`text_${size}`], contentClassName)}>{children}</span>
      </button>
      <span className={styles.shadow} aria-hidden="true" />
    </span>
  ),
);

GlassButton.displayName = "GlassButton";
