"use client";

import {
  reconcileAdminResource,
  reconcileAdminResources,
} from "@/lib/adminOperationalFreshness";

export function hardRefreshAdminResource<T = any>(path: string) {
  return reconcileAdminResource<T>(path, {
    reason: "manual-refresh",
    supersede: true,
  });
}

export function reconcileAfterAdminMutation(paths: string[]) {
  return reconcileAdminResources(paths, {
    reason: "mutation-reconcile",
    supersede: true,
  });
}
