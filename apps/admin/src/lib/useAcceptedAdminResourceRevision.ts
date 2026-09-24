"use client";

import { useEffect, useRef, useState } from "react";
import { adminRequest } from "@/lib/adminApi";
import {
  acceptedAdminResourcePaths,
  currentAcceptedAdminPayload,
} from "@/lib/adminOperationalFreshness";

type AcceptedResourceKind = "products" | "orders" | "customers";

type FreshnessAcceptedDetail = {
  path?: string;
  value?: unknown;
  sequence?: number;
  confirmedEmpty?: boolean;
};

type RealtimeResourceDetail = {
  path?: string;
  revision?: number | null;
};

const RESOURCE_PATHNAMES: Record<AcceptedResourceKind, string> = {
  products: "/api/products",
  orders: "/api/orders",
  customers: "/api/customers/list",
};

function pathnameOf(path: string) {
  try {
    return new URL(path, "https://admin.local").pathname;
  } catch {
    return path.split("?")[0] || path;
  }
}

function resourcePayload(kind: AcceptedResourceKind, value: unknown) {
  const payload = value && typeof value === "object" ? value as Record<string, unknown> : {};
  if (kind === "products") {
    return {
      products: Array.isArray(payload.products) ? payload.products : [],
      collections: Array.isArray(payload.collections) ? payload.collections : [],
      categories: Array.isArray(payload.categories) ? payload.categories : [],
    };
  }
  if (kind === "orders") {
    return { orders: Array.isArray(payload.orders) ? payload.orders : [] };
  }
  return {
    customers: Array.isArray(payload.customers) ? payload.customers : [],
    summary: payload.summary ?? null,
    pagination: payload.pagination ?? null,
  };
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${value.length}:${(hash >>> 0).toString(36)}`;
}

function signatureOf(kind: AcceptedResourceKind, value: unknown) {
  try {
    return stableHash(JSON.stringify(resourcePayload(kind, value)));
  } catch {
    return "";
  }
}

function interactionLocked() {
  if (typeof document === "undefined") return false;
  const active = document.activeElement as HTMLElement | null;
  if (active?.matches('input, textarea, select, [contenteditable="true"]')) return true;
  if (document.querySelector('[role="dialog"], [aria-modal="true"], [data-exact-workspace-modal]')) return true;
  if (document.querySelector('[data-base44-exact-page] input[type="checkbox"]:checked')) return true;
  return false;
}

/**
 * Resource-level Shopify/Linear bridge for legacy page-local React state.
 *
 * 1) snapshot/cache can paint instantly;
 * 2) a revision-guarded panel_read_models realtime event repaints immediately from
 *    the cache that AdminPerformanceBootstrap seeded just before the event;
 * 3) the direct authoritative freshness reconcile remains the final authority and
 *    repaints again only when its business payload differs from the realtime paint;
 * 4) active edits/dialogs/selections defer repaint until the interaction is safe.
 *
 * This keeps the admin shell mounted and avoids the old full-page refresh loop.
 */
export function useAcceptedAdminResourceRevision(kind: AcceptedResourceKind) {
  const [revision, setRevision] = useState(0);
  const lastSignatureRef = useRef("");
  const pendingSignatureRef = useRef("");
  const lastRealtimeRevisionRef = useRef("");
  const targetPathname = RESOURCE_PATHNAMES[kind];

  useEffect(() => {
    let frame = 0;
    let active = true;

    // If this resource was already authoritatively accepted before the host mounted,
    // use it as the baseline. adminOperationalFreshness has already seeded the same
    // payload into adminApi, so the first page load will consume the correct value.
    for (const path of acceptedAdminResourcePaths()) {
      if (pathnameOf(path) !== targetPathname) continue;
      const value = currentAcceptedAdminPayload(path);
      const signature = signatureOf(kind, value);
      if (signature) lastSignatureRef.current = signature;
    }

    const commit = (signature: string) => {
      if (!active || !signature || signature === lastSignatureRef.current) return;
      lastSignatureRef.current = signature;
      pendingSignatureRef.current = "";
      setRevision((current) => current + 1);
    };

    const queue = (signature: string) => {
      if (!signature || signature === lastSignatureRef.current) return;
      if (interactionLocked()) {
        pendingSignatureRef.current = signature;
        return;
      }
      commit(signature);
    };

    const flushPending = () => {
      if (frame || !pendingSignatureRef.current) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        if (!active || interactionLocked()) return;
        commit(pendingSignatureRef.current);
      });
    };

    const onAccepted = (event: Event) => {
      const detail = (event as CustomEvent<FreshnessAcceptedDetail>).detail;
      const path = String(detail?.path || "");
      if (pathnameOf(path) !== targetPathname) return;
      queue(signatureOf(kind, detail?.value));
    };

    const onRealtime = (event: Event) => {
      const detail = (event as CustomEvent<RealtimeResourceDetail>).detail;
      const path = String(detail?.path || "");
      if (pathnameOf(path) !== targetPathname) return;

      const numericRevision = Number(detail?.revision);
      const revisionToken = Number.isFinite(numericRevision)
        ? `${path}:${numericRevision}`
        : `${path}:unversioned`;
      if (revisionToken === lastRealtimeRevisionRef.current) return;
      lastRealtimeRevisionRef.current = revisionToken;

      // AdminPerformanceBootstrap seeds the revision-guarded realtime payload into
      // adminApi before dispatching this event. Reading through adminRequest therefore
      // returns the already-current cache immediately; it does not add a second DB wait.
      void adminRequest(path)
        .then((value) => {
          if (!active) return;
          queue(signatureOf(kind, value));
        })
        .catch(() => {
          // Realtime is an acceleration path only. The page-entry/focus/safety
          // authoritative reconcile remains the correctness fallback.
        });
    };

    window.addEventListener("ruth-admin-freshness-accepted", onAccepted as EventListener);
    window.addEventListener("ruth-admin-realtime-data-updated", onRealtime as EventListener);
    document.addEventListener("focusout", flushPending, true);
    document.addEventListener("pointerup", flushPending, true);
    document.addEventListener("change", flushPending, true);
    document.addEventListener("keydown", flushPending, true);

    return () => {
      active = false;
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("ruth-admin-freshness-accepted", onAccepted as EventListener);
      window.removeEventListener("ruth-admin-realtime-data-updated", onRealtime as EventListener);
      document.removeEventListener("focusout", flushPending, true);
      document.removeEventListener("pointerup", flushPending, true);
      document.removeEventListener("change", flushPending, true);
      document.removeEventListener("keydown", flushPending, true);
    };
  }, [kind, targetPathname]);

  return revision;
}
