"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { adminWarmJson, clearAdminApiCache, hydrateAdminSnapshotBootstrap, seedAdminApiCache } from "@/lib/adminApi";
import { clearAdminDataContinuity, installAdminDataContinuityGuard } from "@/lib/adminDataContinuity";
import { clearAcceleratedAdminFetch, installAdminFetchAccelerator } from "@/lib/adminFetchAccelerator";
import {
  clearStableAdminResources,
  installAdminStableResourceLayer,
  seedStableAdminResource,
} from "@/lib/adminStableResourceLayer";
import { installClientPerformanceTelemetry, recordClientMetric } from "@/lib/clientTelemetry";
import { performancePlanFor } from "@/lib/adminPerformancePlan";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

const DATA_OWNER_MIGRATION_KEY = "ruth_admin_live_read_owner_v1";

function scheduleIdle(callback: () => void, timeout = 800) {
  const idle = (window as Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  }).requestIdleCallback;
  if (idle) {
    const id = idle(callback, { timeout });
    return () => (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(id);
  }
  const timer = window.setTimeout(callback, Math.min(timeout, 180));
  return () => window.clearTimeout(timer);
}

function pageRouteFromTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return "";
  const routeElement = target.closest<HTMLElement>("[data-admin-route]");
  const link = target.closest<HTMLAnchorElement>("a[href]");
  let route = routeElement?.dataset.adminRoute || "";
  if (!route && link) {
    const url = new URL(link.href, window.location.origin);
    if (url.origin !== window.location.origin) return "";
    route = url.pathname;
  }
  return route.split("?")[0] || "";
}

export function AdminPerformanceBootstrap() {
  installAdminFetchAccelerator();
  installAdminDataContinuityGuard({
    restore: (path, payload) => {
      seedAdminApiCache(path, payload, { ttlMs: 0 });
    },
    dropEmptySnapshot: (path) => {
      clearAdminApiCache(path);
      const pathname = new URL(path, "https://admin.local").pathname;
      clearAcceleratedAdminFetch(pathname);
    },
  });
  // Compatibility-only revision guard. It no longer intercepts fetch; adminApi is
  // the single owner of GET cache/read-model behavior.
  installAdminStableResourceLayer();

  const pathname = usePathname();
  const router = useRouter();
  const plan = useMemo(() => performancePlanFor(pathname || "/"), [pathname]);
  const warmedRoutes = useRef(new Map<string, number>());
  const navigationIntent = useRef<{ route: string; startedAt: number } | null>(null);

  // Do not clear operational caches on navigation. The canonical contract is now
  // stale-while-revalidate: paint the last verified payload immediately, while
  // database-triggered read models and background live reads keep it current.
  useEffect(() => installClientPerformanceTelemetry(), []);

  useEffect(() => {
    // Retire caches created by the old stacked fetch owners once on each browser.
    // From this point adminApi owns reads; the accelerator only serves raw legacy
    // callers and the continuity guard is fallback-only.
    let migrated = false;
    try { migrated = window.sessionStorage.getItem(DATA_OWNER_MIGRATION_KEY) === "1"; } catch {}
    if (!migrated) {
      clearStableAdminResources();
      clearAdminApiCache();
      clearAcceleratedAdminFetch();
      try { window.sessionStorage.setItem(DATA_OWNER_MIGRATION_KEY, "1"); } catch {}
      void hydrateAdminSnapshotBootstrap(true);
      return;
    }
    void hydrateAdminSnapshotBootstrap();
  }, []);

  useEffect(() => {
    // One realtime connection stays alive for the whole protected panel session.
    // The database worker writes a newer panel_read_models revision, this handler
    // puts that payload in adminApi first, then tells the visible page it can repaint
    // from the already-current cache without waiting for another database request.
    const supabase = getSupabaseBrowser();
    let subscribedOnce = false;
    const channel = supabase
      .channel("ruth-panel-read-models-v1")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "panel_read_models" },
        (change: any) => {
          const row = change?.new;
          const route = String(row?.route_path || "");
          const payload = row?.payload;
          if (!route || !payload || typeof payload !== "object" || payload.ok === false) return;
          const realtimeRevision = Number.isFinite(Number(row?.revision)) ? Number(row.revision) : null;
          const fresh = String(row?.status || "healthy") === "healthy"
            && (!row?.expires_at || new Date(row.expires_at).getTime() > Date.now());
          const accepted = seedStableAdminResource(route, payload, {
            revision: realtimeRevision,
            status: String(row?.status || "healthy"),
          });
          // The revision guard rejects out-of-order/empty snapshots; accepted data
          // is written only into the canonical adminApi cache.
          if (!accepted) return;
          seedAdminApiCache(route, payload, { ttlMs: fresh ? undefined : 0 });
          window.dispatchEvent(new CustomEvent("ruth-admin-realtime-data-updated", {
            detail: { path: route, revision: realtimeRevision },
          }));
        },
      )
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        if (subscribedOnce) {
          // A websocket reconnect can miss revisions while the app is offline.
          // Pull the compact server snapshot immediately before trusting the stream again.
          void hydrateAdminSnapshotBootstrap(true);
        }
        subscribedOnce = true;
      });
    return () => { void supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const durationMs = Number(navigation?.domContentLoadedEventEnd || navigation?.duration || 0);
    if (durationMs > 0) {
      recordClientMetric({
        route: pathname || "/",
        durationMs: Math.max(1, Math.round(durationMs)),
        ok: true,
        status: null,
        kind: "page-load",
        at: Date.now(),
      });
    }
  // Initial document load is recorded once; SPA transitions are handled below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const intent = navigationIntent.current;
    if (!intent || intent.route !== (pathname || "/")) return;
    navigationIntent.current = null;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        recordClientMetric({
          route: pathname || "/",
          durationMs: Math.max(1, Math.round(performance.now() - intent.startedAt)),
          ok: true,
          status: null,
          kind: "navigation",
          at: Date.now(),
        });
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [pathname]);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    let authBootstrapTimer = 0;
    const scheduleAuthBootstrap = (force: boolean) => {
      if (authBootstrapTimer) window.clearTimeout(authBootstrapTimer);
      // Supabase invokes auth callbacks while its internal auth lock is active.
      // Snapshot hydration calls adminAuthHeaders/getSession, so it must start only
      // after this callback returns; otherwise one auth event can deadlock every
      // product/customer/order request behind the same pending token promise.
      authBootstrapTimer = window.setTimeout(() => {
        authBootstrapTimer = 0;
        void hydrateAdminSnapshotBootstrap(force);
      }, 0);
    };

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        // Never carry one admin session's cached commerce/customer data into a
        // later login on the same device.
        clearStableAdminResources();
        clearAdminApiCache();
        clearAcceleratedAdminFetch();
        clearAdminDataContinuity();
        warmedRoutes.current.clear();
        try {
          window.sessionStorage.removeItem("ruth_admin_snapshot_bootstrap_v1");
          window.sessionStorage.removeItem(DATA_OWNER_MIGRATION_KEY);
        } catch {}
      }
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        scheduleAuthBootstrap(event === "SIGNED_IN");
      }
    });
    return () => {
      if (authBootstrapTimer) window.clearTimeout(authBootstrapTimer);
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      // The self-hosted database updates read models while the PWA is asleep. Pull
      // the latest verified snapshots back into the browser as soon as it returns.
      void hydrateAdminSnapshotBootstrap(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    router.prefetch(pathname || "/");
    const cancelWarm = scheduleIdle(() => {
      if (plan.apis.length) adminWarmJson(plan.apis);
    }, 80);
    const cancelLikely = scheduleIdle(() => {
      for (const route of (plan.likelyNext || []).slice(0, 3)) router.prefetch(route);
    }, 350);
    const cancelLikelyData = scheduleIdle(() => {
      for (const route of (plan.likelyNext || []).slice(0, 3)) {
        const nextPlan = performancePlanFor(route);
        if (nextPlan.apis.length) adminWarmJson(nextPlan.apis);
      }
    }, 500);
    return () => {
      cancelWarm();
      cancelLikely();
      cancelLikelyData();
    };
  }, [pathname, plan, router]);

  useEffect(() => {
    const warmRoute = (route: string) => {
      if (!route) return;
      const now = Date.now();
      const last = warmedRoutes.current.get(route) || 0;
      if (now - last < 15_000) return;
      warmedRoutes.current.set(route, now);
      router.prefetch(route);
      const targetPlan = performancePlanFor(route);
      if (targetPlan.apis.length) adminWarmJson(targetPlan.apis);
    };

    const prefetchTarget = (target: EventTarget | null) => warmRoute(pageRouteFromTarget(target));
    const markNavigationIntent = (target: EventTarget | null) => {
      const route = pageRouteFromTarget(target);
      if (!route || route === (pathname || "/")) return;
      warmRoute(route);
      const existing = navigationIntent.current;
      if (!existing || existing.route !== route || performance.now() - existing.startedAt > 2_000) {
        navigationIntent.current = { route, startedAt: performance.now() };
      }
    };
    const pointer = (event: PointerEvent) => prefetchTarget(event.target);
    const pointerDown = (event: PointerEvent) => markNavigationIntent(event.target);
    const focus = (event: FocusEvent) => prefetchTarget(event.target);
    const touch = (event: TouchEvent) => markNavigationIntent(event.target);

    document.addEventListener("pointerover", pointer, { passive: true });
    document.addEventListener("pointerdown", pointerDown, { passive: true });
    document.addEventListener("focusin", focus, { passive: true });
    document.addEventListener("touchstart", touch, { passive: true });
    return () => {
      document.removeEventListener("pointerover", pointer);
      document.removeEventListener("pointerdown", pointerDown);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("touchstart", touch);
    };
  }, [pathname, router]);

  useEffect(() => {
    if (typeof PerformanceObserver === "undefined") return;
    const observer = new PerformanceObserver((list) => {
      try {
        const entries = list.getEntries();
        if (!entries.length) return;
        const slow = entries
          .filter((entry) => entry.duration > 200)
          .slice(-10)
          .map((entry) => ({ name: entry.name.slice(0, 180), type: entry.entryType, duration: Math.round(entry.duration), at: Date.now() }));
        if (!slow.length) return;
        const key = "ruth_admin_perf_slow_v1";
        const previous = JSON.parse(window.sessionStorage.getItem(key) || "[]");
        window.sessionStorage.setItem(key, JSON.stringify([...previous, ...slow].slice(-60)));
      } catch {}
    });
    try { observer.observe({ type: "resource", buffered: true }); } catch {}
    return () => observer.disconnect();
  }, []);

  return null;
}
