"use client";

import { adminRequest, clearAdminApiCache } from "@/lib/adminApi";

export async function hardRefreshAdminResource<T>(path: string) {
  clearAdminApiCache(path.split("?")[0]);
  const value = await adminRequest<T>(path, {
    force: true,
    hardRefresh: true,
    ttlMs: 0,
    staleMs: 0,
  });
  return { value, acceptedAt: Date.now() };
}
