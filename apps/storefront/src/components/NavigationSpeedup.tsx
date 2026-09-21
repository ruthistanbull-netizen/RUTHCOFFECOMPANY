"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

const ACCOUNT_IDENTITY_ROUTES = new Set(["/api/account/register"]);

function normalizeInternalHref(href: string) {
  if (
    !href ||
    href.startsWith("#") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:")
  ) {
    return null;
  }

  try {
    const url = new URL(href, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    return `${url.pathname}${url.search || ""}`;
  } catch {
    return href.startsWith("/") ? href : null;
  }
}

function connectionAllowsPrefetch() {
  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  if (connection?.saveData) return false;
  return connection?.effectiveType !== "slow-2g" && connection?.effectiveType !== "2g";
}

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function requestEmail(init?: RequestInit) {
  if (typeof init?.body !== "string") return "";
  try {
    const body = JSON.parse(init.body) as {
      email?: unknown;
      customer?: { email?: unknown };
    };
    const value = body.customer?.email ?? body.email;
    return typeof value === "string" ? value.trim().toLocaleLowerCase("tr-TR") : "";
  } catch {
    return "";
  }
}

function requestCustomer(init?: RequestInit) {
  if (typeof init?.body !== "string") return null;
  try {
    const body = JSON.parse(init.body) as {
      customer?: { fullName?: unknown; phone?: unknown };
    };
    if (!body.customer) return null;
    return {
      fullName: typeof body.customer.fullName === "string" ? body.customer.fullName : "",
      phone: typeof body.customer.phone === "string" ? body.customer.phone : "",
    };
  } catch {
    return null;
  }
}

function accountLoginRequired(pathname: string, payload: unknown) {
  if (pathname !== "/api/account/register") return false;
  if (!payload || typeof payload !== "object") return false;

  const data = payload as { code?: unknown; error?: unknown };
  const code = typeof data.code === "string" ? data.code : "";
  const error = typeof data.error === "string" ? data.error : "";

  return code === "ACCOUNT_ALREADY_EXISTS"
    || error.includes("ACCOUNT_ALREADY_EXISTS")
    || error.includes("mevcut bir hesapla eşleşiyor");
}

export function NavigationSpeedup() {
  const router = useRouter();
  const pathname = usePathname();
  const prefetchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    let active = true;

    const patchedFetch: typeof window.fetch = async (...args) => {
      let url: URL | null = null;
      try {
        url = new URL(requestUrl(args[0]), window.location.origin);
      } catch {
        url = null;
      }

      if (url?.pathname === "/api/paytr/create-payment") {
        const headers = new Headers(args[1]?.headers);
        const authorization = headers.get("authorization");
        const customer = requestCustomer(args[1]);

        if (authorization) {
          const syncResponse = await originalFetch("/api/account/upsert", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: authorization,
            },
            cache: "no-store",
            body: JSON.stringify({
              fullName: customer?.fullName || "",
              phone: customer?.phone || "",
            }),
          });

          if (!syncResponse.ok) {
            const syncData = await syncResponse.json().catch(() => ({}));
            return new Response(JSON.stringify({
              ok: false,
              error: syncData.error || "Hesap bilgileri ödeme için doğrulanamadı.",
            }), {
              status: syncResponse.status || 400,
              headers: { "Content-Type": "application/json" },
            });
          }
        }
      }

      const response = await originalFetch(...args);

      try {
        if (!url || !ACCOUNT_IDENTITY_ROUTES.has(url.pathname)) return response;

        void response.clone().json().then((payload: unknown) => {
          if (!active || !accountLoginRequired(url!.pathname, payload)) return;
          if (window.location.pathname === "/login") return;

          const currentSearch = new URLSearchParams(window.location.search);
          const redirect = currentSearch.get("redirect") || "/account";
          const params = new URLSearchParams({
            redirect,
            reason: "account-exists",
          });
          const email = requestEmail(args[1]);
          if (email) params.set("email", email);
          window.location.assign(`/login?${params.toString()}`);
        }).catch(() => undefined);
      } catch {
        // Ağ yanıtı normal akışına devam eder.
      }

      return response;
    };

    window.fetch = patchedFetch;
    return () => {
      active = false;
      if (window.fetch === patchedFetch) window.fetch = originalFetch;
    };
  }, []);

  useEffect(() => {
    if (!connectionAllowsPrefetch()) return;
    const prefetched = prefetchedRef.current;

    const prefetch = (href: string | null) => {
      if (!href || href === pathname || prefetched.has(href)) return;
      if (href.startsWith("/checkout")) return;
      prefetched.add(href);
      try {
        router.prefetch(href);
      } catch {
        prefetched.delete(href);
      }
    };

    const handleIntent = (event: Event) => {
      const target = event.target as Element | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      prefetch(normalizeInternalHref(anchor.getAttribute("href") || ""));
    };

    // Next/Link already prefetches visible links. Only add intent prefetching here;
    // eager idle/touch prefetches were creating avoidable competing RSC requests.
    document.addEventListener("pointerover", handleIntent, { passive: true });
    document.addEventListener("focusin", handleIntent);

    return () => {
      document.removeEventListener("pointerover", handleIntent);
      document.removeEventListener("focusin", handleIntent);
    };
  }, [pathname, router]);

  return null;
}
