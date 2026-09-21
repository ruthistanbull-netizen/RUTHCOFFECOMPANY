import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const experiencePath = fileURLToPath(
  new URL("../src/components/product/ProductDetailExperience.tsx", import.meta.url),
);
const productCardPath = fileURLToPath(
  new URL("../src/components/ProductCard.tsx", import.meta.url),
);

function replaceRequired(source, search, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!source.includes(search)) {
    throw new Error(`Mobile product fix failed: ${label} pattern was not found.`);
  }
  return source.replace(search, replacement);
}

function replaceRegexRequired(source, pattern, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!pattern.test(source)) {
    throw new Error(`Mobile product fix failed: ${label} pattern was not found.`);
  }
  return source.replace(pattern, replacement);
}

async function patchProductExperience() {
  let source = await readFile(experiencePath, "utf8");
  const original = source;

  source = replaceRequired(
    source,
    'import { useCallback, useEffect, useMemo, useRef, useState } from "react";',
    'import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";',
    "React layout effect import",
  );

  source = replaceRequired(
    source,
    `  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const [browserWindow, setBrowserWindow] = useState(initialWindow);

  const putProduct = useCallback((product: Product | null) => {`,
    `  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const [browserWindow, setBrowserWindow] = useState(initialWindow);
  // RUTH_PRODUCT_VISITED_TRAIL_V1: swipe-back follows the products the shopper actually viewed.
  const visitedTrailRef = useRef<Product[]>([initialWindow.current]);
  const visitedIndexRef = useRef(0);

  // RUTH_PRODUCT_CONTINUITY_V2: iOS Safari must not reuse listing scroll.
  useLayoutEffect(() => {
    const previousRestoration = window.history.scrollRestoration;
    let secondFrame: number | null = null;
    const scrollToTop = () => window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    window.history.scrollRestoration = "manual";
    scrollToTop();
    const firstFrame = window.requestAnimationFrame(() => {
      scrollToTop();
      secondFrame = window.requestAnimationFrame(scrollToTop);
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) window.cancelAnimationFrame(secondFrame);
      window.history.scrollRestoration = previousRestoration;
    };
  }, []);

  const putProduct = useCallback((product: Product | null) => {`,
    "initial product scroll reset and visited trail",
  );

  source = replaceRequired(
    source,
    `  const materializeWindow = useCallback(`,
    `  const visitedTarget = useCallback((direction: Direction): Product | null => {
    const trail = visitedTrailRef.current;
    const index = visitedIndexRef.current;
    if (direction === "previous" && index > 0) return trail[index - 1] || null;
    if (direction === "next" && index < trail.length - 1) return trail[index + 1] || null;
    return direction === "previous" ? browserWindowRef.current.previous : browserWindowRef.current.next;
  }, []);

  const moveVisitedCursor = useCallback((target: Product, direction: Direction) => {
    const trail = visitedTrailRef.current;
    const index = visitedIndexRef.current;
    if (direction === "previous") {
      if (index > 0 && trail[index - 1]?.slug === target.slug) {
        visitedIndexRef.current = index - 1;
        return;
      }
      visitedTrailRef.current = [target, ...trail];
      visitedIndexRef.current = 0;
      return;
    }
    if (index < trail.length - 1 && trail[index + 1]?.slug === target.slug) {
      visitedIndexRef.current = index + 1;
      return;
    }
    visitedTrailRef.current = [...trail.slice(0, index + 1), target];
    visitedIndexRef.current = index + 1;
  }, []);

  const materializeWindow = useCallback(`,
    "visited product trail helpers",
  );

  source = replaceRequired(
    source,
    `    (slug: string, signal?: AbortSignal) => {`,
    `    (slug: string) => {`,
    "non-abortable product window request",
  );
  source = replaceRequired(
    source,
    `          cache: "force-cache",
          signal,
          headers: { Accept: "application/json" },`,
    `          cache: "force-cache",
          headers: { Accept: "application/json" },`,
    "product window signal removal",
  );

  source = replaceRegexRequired(
    source,
    /  useEffect\(\(\) => \{\n    const controller = new AbortController\(\);[\s\S]*?  \}, \[browserWindow\.current\.slug, fetchWindow, preloadImage\]\);/,
    `  useEffect(() => {
    const host = window as IdleWindow;
    let timeoutHandle: number | null = null;
    let idleHandle: number | null = null;
    let cancelled = false;
    const syncLoadedWindow = (loaded: ProductBrowserWindow) => {
      if (cancelled || browserWindowRef.current.current.slug !== loaded.current.slug) return;
      const live = browserWindowRef.current;
      if (live.previous?.slug === loaded.previous?.slug && live.next?.slug === loaded.next?.slug) return;
      browserWindowRef.current = loaded;
      setBrowserWindow(loaded);
    };
    const warm = async () => {
      let current = browserWindowRef.current;
      const hydratedCurrent = await fetchWindow(current.current.slug);
      if (cancelled) return;
      if (hydratedCurrent && browserWindowRef.current.current.slug === current.current.slug) {
        current = hydratedCurrent;
        syncLoadedWindow(hydratedCurrent);
      }
      preloadImage(current.previous);
      preloadImage(current.next);
      const neighbors = [current.next, current.previous].filter((product): product is Product => Boolean(product));
      for (const neighbor of neighbors) {
        if (cancelled) return;
        const loaded = await fetchWindow(neighbor.slug);
        if (!loaded || cancelled || prefersReducedPreload()) continue;
        const far = neighbor.slug === current.next?.slug ? loaded.next : loaded.previous;
        preloadImage(far);
      }
    };
    if (host.requestIdleCallback) idleHandle = host.requestIdleCallback(() => void warm(), { timeout: 700 });
    else timeoutHandle = window.setTimeout(() => void warm(), 80);
    return () => {
      cancelled = true;
      if (timeoutHandle !== null) window.clearTimeout(timeoutHandle);
      if (idleHandle !== null) host.cancelIdleCallback?.(idleHandle);
    };
  }, [browserWindow.current.slug, fetchWindow, preloadImage]);`,
    "continuous active-window hydration",
  );

  source = replaceRegexRequired(
    source,
    /  const commitProduct = useCallback\([\s\S]*?    \[materializeWindow, setPhase, setVisualX, waitForProductImage\],\n  \);/,
    `  const commitProduct = useCallback(
    async (target: Product, direction: Direction, pushHistory = true) => {
      const targetWindowPromise = fetchWindow(target.slug);
      preloadImage(target);
      await waitForProductImage(target);
      moveVisitedCursor(target, direction);
      const nextWindow = materializeWindow(target.slug, direction) || ({
        previous: direction === "next" ? browserWindowRef.current.current : null,
        current: target,
        next: direction === "previous" ? browserWindowRef.current.current : null,
      } satisfies ProductBrowserWindow);
      flushSync(() => setBrowserWindow(nextWindow));
      browserWindowRef.current = nextWindow;
      if (pushHistory) window.history.pushState({ ruthProductSlug: target.slug }, "", \`/products/\${target.slug}\`);
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      setVisualX(0);
      setPhase("handoff");
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => setPhase("idle")));
      void targetWindowPromise.then((loaded) => {
        if (!loaded || browserWindowRef.current.current.slug !== target.slug) return;
        const live = browserWindowRef.current;
        if (live.previous?.slug === loaded.previous?.slug && live.next?.slug === loaded.next?.slug) return;
        browserWindowRef.current = loaded;
        setBrowserWindow(loaded);
        preloadImage(direction === "next" ? loaded.next : loaded.previous);
      });
    },
    [fetchWindow, materializeWindow, moveVisitedCursor, preloadImage, setPhase, setVisualX, waitForProductImage],
  );`,
    "continuous product commit with visited trail",
  );

  source = replaceRequired(
    source,
    `      const target =
        deltaX < 0
          ? browserWindowRef.current.next
          : browserWindowRef.current.previous;`,
    `      const target = visitedTarget(deltaX < 0 ? "next" : "previous");`,
    "gesture uses visited trail",
  );

  source = replaceRequired(
    source,
    `      const target =
        direction === "next"
          ? browserWindowRef.current.next
          : browserWindowRef.current.previous;`,
    `      const target = visitedTarget(direction);`,
    "gesture finish uses visited trail",
  );

  source = replaceRequired(
    source,
    `      const visibleX = target ? deltaX : deltaX * EDGE_RESISTANCE;

      gesture.currentX = visibleX;`,
    `      if (target) {
        preloadImage(target);
        void fetchWindow(target.slug);
      }
      const visibleX = target ? deltaX : deltaX * EDGE_RESISTANCE;

      gesture.currentX = visibleX;`,
    "gesture-time window warmup",
  );

  source = replaceRequired(
    source,
    `  }, [commitProduct, resetVisuals, setPhase, setVisualX]);`,
    `  }, [commitProduct, fetchWindow, preloadImage, resetVisuals, setPhase, setVisualX, visitedTarget]);`,
    "gesture effect dependencies",
  );

  source = replaceRequired(
    source,
    `  const product = browserWindow.current;
  const images = useMemo(() => productImages(product), [product]);`,
    `  const product = browserWindow.current;
  const previousSwipeProduct = visitedTarget("previous");
  const nextSwipeProduct = visitedTarget("next");
  const images = useMemo(() => productImages(product), [product]);`,
    "history-aware swipe previews",
  );

  source = replaceRequired(source, `<ProductBrowserPreview product={browserWindow.previous} />`, `<ProductBrowserPreview product={previousSwipeProduct} />`, "previous swipe preview follows visited trail");
  source = replaceRequired(source, `<ProductBrowserPreview product={browserWindow.next} />`, `<ProductBrowserPreview product={nextSwipeProduct} />`, "next swipe preview follows visited trail");
  source = replaceRequired(source, `      <div className="product-detail-page" key={product.id}>`, `      <div className="product-detail-page">`, "avoid full product page remount");

  if (source !== original) {
    await writeFile(experiencePath, source, "utf8");
    console.log("Applied mobile product continuity, visited-trail swipe and scroll fixes.");
  }
}

async function patchProductCard() {
  let source = await readFile(productCardPath, "utf8");
  const original = source;

  // ProductCard navigation changed in the current branch. The old prebuild
  // patch searched for a non-existent router.push block, causing Vercel to
  // fail before Next.js even started. The current card already uses router.push
  // directly, so make the navigation fix idempotent against both forms.
  const navigationPatterns = [
    {
      search: `router.push(href);`,
      replacement: `window.scrollTo({ top: 0, left: 0, behavior: "auto" });\n              router.push(href, { scroll: true });`,
    },
    {
      search: `router.push(href, { scroll: true });`,
      replacement: `router.push(href, { scroll: true });`,
    },
  ];

  const navigationTarget = navigationPatterns.find(({ search, replacement }) =>
    source.includes(replacement) || source.includes(search),
  );
  if (!navigationTarget) {
    throw new Error("Mobile product fix failed: product image navigation scroll pattern was not found.");
  }
  if (!source.includes(navigationTarget.replacement)) {
    source = source.replace(navigationTarget.search, navigationTarget.replacement);
  }

  const textSearch = `<Link href={href} className="product-card-text-link min-w-0 flex-1">`;
  const textReplacement = `<Link\n            href={href}\n            scroll\n            className="product-card-text-link min-w-0 flex-1"\n          >`;
  source = replaceRequired(source, textSearch, textReplacement, "product text navigation scroll");

  if (source !== original) {
    await writeFile(productCardPath, source, "utf8");
    console.log("Applied product card scroll-to-top fix.");
  }
}

await patchProductExperience();
await patchProductCard();
