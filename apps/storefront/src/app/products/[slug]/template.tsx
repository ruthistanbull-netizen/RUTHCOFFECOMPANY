"use client";

import { useLayoutEffect, type ReactNode } from "react";

const SWIPE_HINT_SEEN_KEY = "ruth_product_swipe_hint_seen_v1";
const SWIPE_HINT_DESIGN_MIGRATION_KEY = "ruth_product_swipe_hint_design_v4_migrated";

export default function ProductTemplate({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    try {
      if (window.localStorage.getItem(SWIPE_HINT_DESIGN_MIGRATION_KEY) === "1") {
        return;
      }

      window.localStorage.removeItem(SWIPE_HINT_SEEN_KEY);
      window.localStorage.setItem(SWIPE_HINT_DESIGN_MIGRATION_KEY, "1");
    } catch {
      // Storage can be unavailable in strict privacy contexts.
    }
  }, []);

  return children;
}
