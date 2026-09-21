"use client";

import { useEffect } from "react";

type PreviewVariant = { sku?: string | null };
type PreviewProduct = {
  id?: string | null;
  slug?: string | null;
  name?: string | null;
  product_code?: string | null;
  sku?: string | null;
  price?: number | string | null;
  compare_at_price?: number | string | null;
  currency?: string | null;
  stock_status?: string | null;
  main_image_url?: string | null;
  image_urls?: string[] | null;
  variants?: PreviewVariant[] | null;
};

type PreviewWindow = {
  previous?: PreviewProduct | null;
  current?: PreviewProduct | null;
  next?: PreviewProduct | null;
};

function currentSlug() {
  const match = window.location.pathname.match(/^\/products\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function productCode(product: PreviewProduct | null | undefined) {
  if (!product) return "";
  return clean(
    product.product_code ||
      product.variants?.find((variant) => clean(variant?.sku))?.sku ||
      product.sku,
  );
}

function productImage(product: PreviewProduct | null | undefined) {
  if (!product) return "";
  return product.image_urls?.find(Boolean) || product.main_image_url || "";
}

function money(value: number | string | null | undefined, currency = "TRY") {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: currency || "TRY",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
      .format(amount)
      .replace("₺", "TL")
      .replace(/\u00a0/g, " ");
  } catch {
    return `${amount.toFixed(2)} ${currency || "TRY"}`;
  }
}

function makeBagIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("product-browser-preview-bag");
  for (const value of [
    "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z",
    "M3 6h18",
    "M16 10a4 4 0 0 1-8 0",
  ]) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", value);
    svg.append(path);
  }
  return svg;
}

function syncTitle(article: HTMLElement, product: PreviewProduct) {
  const title = article.querySelector<HTMLElement>(
    ".product-browser-preview-buy-row > strong",
  );
  if (!title) return;

  const name = clean(product.name);
  let textNode = Array.from(title.childNodes).find(
    (node) => node.nodeType === Node.TEXT_NODE,
  ) as Text | undefined;
  if (!textNode) {
    textNode = document.createTextNode(name);
    title.prepend(textNode);
  } else if (textNode.nodeValue !== name) {
    textNode.nodeValue = name;
  }

  const code = productCode(product);
  let codeNode = title.querySelector<HTMLElement>(".product-browser-preview-code");
  if (code && !codeNode) {
    codeNode = document.createElement("span");
    codeNode.className = "product-browser-preview-code";
    title.append(codeNode);
  }
  if (codeNode) {
    if (code) codeNode.textContent = `ÜRÜN KODU · ${code}`;
    else codeNode.remove();
  }
}

function syncPrice(article: HTMLElement, product: PreviewProduct) {
  const priceRoot = article.querySelector<HTMLElement>(".product-browser-preview-price");
  if (!priceRoot) return;

  const price = Number(product.price || 0);
  const compareAt = Number(product.compare_at_price || 0);
  const hasDiscount = Number.isFinite(compareAt) && compareAt > price && price > 0;
  const currency = clean(product.currency) || "TRY";

  priceRoot.classList.add("product-mobile-price");
  priceRoot.replaceChildren();

  if (hasDiscount) {
    const compare = document.createElement("del");
    compare.className = "product-purchase-compare";
    compare.textContent = money(compareAt, currency);

    const pill = document.createElement("span");
    pill.className = "product-purchase-sale-pill";
    const value = document.createElement("strong");
    value.textContent = money(price, currency);
    const discount = document.createElement("em");
    discount.textContent = `-%${Math.max(1, Math.round(((compareAt - price) / compareAt) * 100))}`;
    pill.append(value, discount);
    priceRoot.append(compare, pill);
    return;
  }

  const value = document.createElement("strong");
  value.className = "product-purchase-current";
  value.textContent = money(price, currency);
  priceRoot.append(value);
}

function syncAddButton(article: HTMLElement, product: PreviewProduct) {
  const add = article.querySelector<HTMLElement>(".product-browser-preview-add");
  if (!add) return;
  add.classList.add("product-mobile-add");
  add.replaceChildren(
    makeBagIcon(),
    document.createTextNode(
      product.stock_status === "out_of_stock" ? "Stokta Yok" : "Sepete Ekle",
    ),
  );
}

function syncImage(
  article: HTMLElement,
  product: PreviewProduct,
  center: boolean,
) {
  const media = article.querySelector<HTMLElement>(".product-browser-preview-media");
  if (!media) return;

  const liveImage = center
    ? document.querySelector<HTMLImageElement>(
        ".product-gallery-frame.is-mobile-vertical:not(.is-lightbox) .product-gallery-slide .product-gallery-image img",
      )
    : null;
  const desired =
    (center ? liveImage?.currentSrc || liveImage?.src || "" : "") ||
    productImage(product);
  if (!desired) return;

  const slug = clean(product.slug);
  const image = media.querySelector<HTMLImageElement>(":scope > img");
  const changedProduct = article.dataset.ruthPreviewDataSlug !== slug;
  const currentSource = image?.getAttribute("src") || "";

  if (!image || changedProduct || currentSource !== desired) {
    const next = document.createElement("img");
    next.src = desired;
    next.alt = "";
    next.loading = "eager";
    next.decoding = "async";
    next.fetchPriority = "high";
    next.draggable = false;
    if (image) image.replaceWith(next);
    else media.prepend(next);
  }

  article.dataset.ruthPreviewDataSlug = slug;
}

function syncArticle(
  article: HTMLElement,
  product: PreviewProduct | null | undefined,
  center: boolean,
) {
  if (!product) return;
  syncTitle(article, product);
  syncPrice(article, product);
  syncAddButton(article, product);
  syncImage(article, product, center);
}

export function ProductSwipePreviewDataGuard() {
  useEffect(() => {
    if (!window.matchMedia("(max-width: 767px)").matches) return;

    let activeSlug = "";
    let activeWindow: PreviewWindow | null = null;
    let request: AbortController | null = null;
    let frame = 0;

    const apply = () => {
      frame = 0;
      if (!activeWindow || activeSlug !== currentSlug()) return;
      const previews = Array.from(
        document.querySelectorAll<HTMLElement>(
          ".product-browser-track > .product-browser-preview",
        ),
      );
      const products = [activeWindow.previous, activeWindow.current, activeWindow.next];
      previews.forEach((article, index) =>
        syncArticle(article, products[index], index === 1),
      );
    };

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(apply);
    };

    const load = async (slug: string) => {
      if (!slug) return;
      request?.abort();
      const controller = new AbortController();
      request = controller;
      try {
        const response = await fetch(
          `/api/products/${encodeURIComponent(slug)}/browser-window`,
          {
            credentials: "same-origin",
            cache: "force-cache",
            signal: controller.signal,
            headers: { Accept: "application/json" },
          },
        );
        if (!response.ok) return;
        const payload = (await response.json()) as {
          ok?: boolean;
          window?: PreviewWindow | null;
        };
        if (!payload.ok || !payload.window?.current || currentSlug() !== slug) return;
        activeSlug = slug;
        activeWindow = payload.window;

        for (const product of [activeWindow.previous, activeWindow.current, activeWindow.next]) {
          const src = productImage(product);
          if (!src) continue;
          const image = new window.Image();
          image.decoding = "async";
          image.fetchPriority = "high";
          image.src = src;
          void image.decode().catch(() => undefined);
        }
        apply();
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    };

    const syncSlug = () => {
      const slug = currentSlug();
      if (!slug) return;
      if (slug !== activeSlug) void load(slug);
      else schedule();
    };

    const rootObserver = new MutationObserver(() => {
      // Run immediately when the transition stage is about to become visible;
      // this guarantees the incoming card carries the target product, not a
      // stale React preview from the product we are leaving.
      apply();
    });
    const root = document.querySelector<HTMLElement>(".product-browser-root");
    if (root) {
      rootObserver.observe(root, {
        attributes: true,
        attributeFilter: ["data-browser-phase"],
      });
    }

    const onPointerDown = () => {
      apply();
    };
    const onPointerMove = () => {
      const root = document.querySelector<HTMLElement>(".product-browser-root");
      if (root?.dataset.browserPhase === "dragging") apply();
    };

    const interval = window.setInterval(syncSlug, 250);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("popstate", syncSlug);
    window.addEventListener("pageshow", syncSlug);
    window.addEventListener("ruth:product-history-change", syncSlug);
    syncSlug();

    return () => {
      rootObserver.disconnect();
      request?.abort();
      window.clearInterval(interval);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("popstate", syncSlug);
      window.removeEventListener("pageshow", syncSlug);
      window.removeEventListener("ruth:product-history-change", syncSlug);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
