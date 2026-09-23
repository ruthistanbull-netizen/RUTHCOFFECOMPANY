"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { adminRequest } from "@/lib/adminApi";

type ProductCodeResponse = {
  ok?: boolean;
  product?: { id: string; name?: string; product_code?: string | null } | null;
};

function selectedProductId() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("id") || "";
}

export function AdminProductCodePresenter() {
  const [productId, setProductId] = useState("");
  const [code, setCode] = useState("");
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let lastId = "";
    let frame = 0;

    const sync = () => {
      frame = 0;
      const modal = document.querySelector<HTMLElement>(
        '[data-exact-workspace-modal][data-workspace-kind="product"][role="dialog"]',
      );
      const nextId = modal ? selectedProductId() : "";
      const heading = modal?.querySelector<HTMLElement>("h2");
      const nextTarget = heading?.parentElement || null;

      setTarget((current) => (current === nextTarget ? current : nextTarget));
      if (nextId !== lastId) {
        lastId = nextId;
        setProductId(nextId);
        if (!nextId) setCode("");
      }
    };

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(sync);
    };

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    const interval = window.setInterval(schedule, 300);
    window.addEventListener("popstate", schedule);
    schedule();

    return () => {
      observer.disconnect();
      window.clearInterval(interval);
      window.removeEventListener("popstate", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    setCode("");

    void adminRequest<ProductCodeResponse>(
      `/api/products/product-code?product_id=${encodeURIComponent(productId)}`,
      { force: true, ttlMs: 0, staleMs: 0 },
    )
      .then((result) => {
        if (cancelled) return;
        setCode(String(result.product?.product_code || ""));
      })
      .catch(() => {
        if (!cancelled) setCode("");
      });

    return () => {
      cancelled = true;
    };
  }, [productId]);

  if (!target || !code) return null;

  return createPortal(
    <div
      data-ruth-product-code
      className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-full border border-border-subtle bg-surface-secondary px-2 py-0.5 text-[9px] font-medium tracking-[0.08em] text-muted"
      aria-label={`Ürün kodu ${code}`}
    >
      <span>ÜRÜN KODU</span>
      <strong className="font-semibold tabular-nums text-main">{code}</strong>
    </div>,
    target,
  );
}
