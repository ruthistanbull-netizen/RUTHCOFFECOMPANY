"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

type ViewTransitionLike = { finished?: Promise<unknown> };
type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void | Promise<void>) => ViewTransitionLike;
};

function modifiedClick(event: MouseEvent) {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

export function AdminRouteViewTransition() {
  const router = useRouter();
  const pathname = usePathname();
  const pendingPathRef = useRef<string | null>(null);
  const resolveRef = useRef<(() => void) | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!pendingPathRef.current || pendingPathRef.current !== pathname) return;
    const resolve = resolveRef.current;
    if (!resolve) return;

    const first = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
        pendingPathRef.current = null;
        resolveRef.current = null;
        resolve();
      });
    });
    return () => window.cancelAnimationFrame(first);
  }, [pathname]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || modifiedClick(event)) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      if (anchor.dataset.noViewTransition === "true") return;

      let next: URL;
      try {
        next = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (next.origin !== window.location.origin) return;
      if (next.pathname === window.location.pathname && next.search === window.location.search) return;

      const documentWithTransitions = document as ViewTransitionDocument;
      if (typeof documentWithTransitions.startViewTransition !== "function") return;

      event.preventDefault();
      event.stopPropagation();

      const href = `${next.pathname}${next.search}${next.hash}`;
      const transition = documentWithTransitions.startViewTransition(() => new Promise<void>((resolve) => {
        pendingPathRef.current = next.pathname;
        resolveRef.current = resolve;
        if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
        timeoutRef.current = window.setTimeout(() => {
          pendingPathRef.current = null;
          resolveRef.current = null;
          timeoutRef.current = null;
          resolve();
        }, 1800);
        router.push(href, { scroll: false });
      }));

      void transition?.finished?.catch(() => undefined);
    };

    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      pendingPathRef.current = null;
      resolveRef.current?.();
      resolveRef.current = null;
    };
  }, [router]);

  return (
    <style jsx global>{`
      main {
        view-transition-name: ruth-admin-page;
      }

      @keyframes ruth-admin-page-old {
        from { opacity: 1; transform: translateY(0); }
        to { opacity: 0; transform: translateY(-2px); }
      }

      @keyframes ruth-admin-page-new {
        from { opacity: 0; transform: translateY(3px); }
        to { opacity: 1; transform: translateY(0); }
      }

      ::view-transition-group(ruth-admin-page) {
        animation-duration: 220ms;
        animation-timing-function: cubic-bezier(.22, 1, .36, 1);
      }

      ::view-transition-old(ruth-admin-page) {
        animation: ruth-admin-page-old 130ms ease-out both;
      }

      ::view-transition-new(ruth-admin-page) {
        animation: ruth-admin-page-new 220ms cubic-bezier(.22, 1, .36, 1) both;
      }

      @media (prefers-reduced-motion: reduce) {
        ::view-transition-old(ruth-admin-page),
        ::view-transition-new(ruth-admin-page),
        ::view-transition-group(ruth-admin-page) {
          animation-duration: 1ms !important;
          transform: none !important;
        }
      }
    `}</style>
  );
}
