"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  acceptedAdminResourcePaths,
  installAdminOperationalFreshnessCacheGuard,
  reconcileAdminResources,
} from "@/lib/adminOperationalFreshness";
import { performancePlanFor } from "@/lib/adminPerformancePlan";
import { normalizePanelRoute, panelSnapshotEligible } from "@/lib/panelSyncRegistry";

type CacheStaleEvent = {
  matches?: string[] | null;
};

const VISIBLE_SAFETY_RECONCILE_MS = 90_000;
const PASSIVE_RECONCILE_DEDUPE_MS = 1_500;

function resourcePathname(path: string) {
  try {
    return new URL(normalizePanelRoute(path), "https://admin.local").pathname;
  } catch {
    return path.split("?")[0] || path;
  }
}

function isManualRefreshControl(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  const control = target.closest('button, [role="button"]');
  if (!control) return false;
  const label = [
    control.getAttribute("aria-label"),
    control.getAttribute("title"),
    control.textContent,
  ].filter(Boolean).join(" ").toLocaleLowerCase("tr-TR");
  return label.includes("yenile") || label.includes("refresh");
}

/**
 * Reconciles snapshot-owned admin resources against authoritative data without
 * remounting the page tree.
 *
 * Products, Orders and Customers intentionally opt out through
 * panelSnapshotEligible(). Those core lists match the stable early-August model:
 * their page component owns one live request and one local state tree. A global
 * page-entry/focus/90s reconcile must never become a second owner for them.
 */
export function AdminLiveDataBoundary({ children }: { children: ReactNode }) {
  installAdminOperationalFreshnessCacheGuard();

  const pathname = usePathname();
  const lastPassiveReconcileAt = useRef(0);

  const relevant = useMemo(() => {
    const plan = performancePlanFor(pathname || "/");
    const apis = plan.apis
      .map((path) => normalizePanelRoute(path))
      .filter((path) => path && panelSnapshotEligible(path));
    const routes = new Set(apis);
    const pathnames = new Set([
      ...apis.map(resourcePathname),
      ...(plan.resourcePathnames || [])
        .map((path) => normalizePanelRoute(path))
        .filter((path) => path && panelSnapshotEligible(path))
        .map(resourcePathname),
    ]);
    return { apis, routes, pathnames };
  }, [pathname]);

  useEffect(() => {
    const appliesToVisiblePage = (rawPath: string) => {
      const path = normalizePanelRoute(rawPath);
      if (!path || !panelSnapshotEligible(path)) return false;
      const endpoint = resourcePathname(path);
      return relevant.routes.has(path) || relevant.pathnames.has(endpoint);
    };

    const visibleResources = () => {
      const dynamic = acceptedAdminResourcePaths().filter((path) => appliesToVisiblePage(path));
      return [...new Set([...relevant.apis, ...dynamic])];
    };

    const reconcile = (
      reason: "page-entry" | "window-focus" | "pwa-resume" | "safety-reconcile",
      force = false,
    ) => {
      const resources = visibleResources();
      if (!resources.length) return;

      const now = Date.now();
      if (!force && reason !== "page-entry" && now - lastPassiveReconcileAt.current < PASSIVE_RECONCILE_DEDUPE_MS) {
        return;
      }
      lastPassiveReconcileAt.current = now;
      void reconcileAdminResources(resources, { reason });
    };

    const onCacheStale = (event: Event) => {
      const resources = visibleResources();
      if (!resources.length) return;
      const matches = (event as CustomEvent<CacheStaleEvent>).detail?.matches;
      const affectsVisible = !matches?.length || resources.some((api) => matches.some((match) => api.includes(match)));
      if (!affectsVisible) return;
      void reconcileAdminResources(resources, {
        reason: "mutation-reconcile",
        supersede: true,
      });
    };

    const onManualRefresh = (event: Event) => {
      if (!isManualRefreshControl(event.target)) return;
      const resources = visibleResources();
      if (!resources.length) return;
      void reconcileAdminResources(resources, {
        reason: "manual-refresh",
        supersede: true,
      });
    };

    const onWindowFocus = () => reconcile("window-focus");
    const onVisibility = () => {
      if (document.visibilityState === "visible") reconcile("pwa-resume");
    };

    const safetyTimer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      reconcile("safety-reconcile", true);
    }, VISIBLE_SAFETY_RECONCILE_MS);

    window.addEventListener("ruth-admin-api-cache-stale", onCacheStale as EventListener);
    window.addEventListener("focus", onWindowFocus);
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("click", onManualRefresh, true);

    reconcile("page-entry", true);

    return () => {
      window.clearInterval(safetyTimer);
      window.removeEventListener("ruth-admin-api-cache-stale", onCacheStale as EventListener);
      window.removeEventListener("focus", onWindowFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("click", onManualRefresh, true);
    };
  }, [pathname, relevant]);

  return <>{children}</>;
}
