"use client";

import { useCallback } from "react";

/**
 * ProductGallery previously reported its active image to the route-level swipe
 * overlay. The persistent product browser no longer needs that overlay, but the
 * stable hook keeps ProductGallery independent from the navigation container.
 */
export function useProductSwipeActiveImage(_productId: string) {
  return useCallback((_imageUrl: string) => undefined, []);
}
