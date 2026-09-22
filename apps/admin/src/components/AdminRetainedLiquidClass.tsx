"use client";

import { useEffect } from "react";

const BODY_CLASS = "ruth-admin-liquid-v3";

/**
 * Keeps the body hook required by the retained Liquid Glass surfaces only:
 * top header/search and date/time picker layers. Global card/control/sidebar
 * liquid annotations intentionally stay disabled.
 */
export function AdminRetainedLiquidClass() {
  useEffect(() => {
    document.body.classList.add(BODY_CLASS);
    return () => document.body.classList.remove(BODY_CLASS);
  }, []);

  return null;
}
