"use client";

import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { AnimatePresence, motion, useDragControls, type PanInfo } from "framer-motion";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { adminRequest } from "@/lib/adminApi";

type VariantLine = {
  name: string;
  quantity: number;
};

type Preview = {
  src: string;
  productName: string;
  variants: VariantLine[];
};

type GalleryPayload = {
  ok: boolean;
  images?: string[];
};

function readQuantity(row: HTMLElement) {
  const quantityInput = row.querySelector<HTMLInputElement>('input[type="number"]');
  if (quantityInput) return Math.max(1, Number(quantityInput.value || 1));

  const text = row.textContent || "";
  const match = text.match(/(\d+)\s*adet/i);
  return Math.max(1, Number(match?.[1] || 1));
}

function readProductRow(row: HTMLElement) {
  const info = row.children.item(1) as HTMLElement | null;
  if (!info) return null;

  const lines = Array.from(info.querySelectorAll("p"));
  const productName = lines[0]?.textContent?.trim() || "";
  const variantName = lines[1]?.textContent?.trim() || "Standart";
  if (!productName) return null;

  return {
    productName,
    variantName: variantName || "Standart",
    quantity: readQuantity(row),
  };
}

function belongsToOrderProducts(element: HTMLElement) {
  let node: HTMLElement | null = element;
  for (let depth = 0; node && depth < 7; depth += 1, node = node.parentElement) {
    if ((node.textContent || "").includes("Sipariş Ürünleri")) return true;
  }
  return false;
}

export function OrderProductLightboxEnhancer() {
  const pathname = usePathname();
  const dragControls = useDragControls();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [gallery, setGallery] = useState<string[]>([]);
  const [activeSrc, setActiveSrc] = useState("");
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const sync = () => setMobile(window.innerWidth < 768);
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  useEffect(() => {
    if (pathname !== "/orders") return;

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const image = target.closest("img");
      const button = target.closest<HTMLButtonElement>("button");
      if (!image || !button || !button.contains(image)) return;

      const row = button.parentElement;
      const list = row?.parentElement;
      if (!(row instanceof HTMLElement) || !(list instanceof HTMLElement)) return;
      if (!list.classList.contains("space-y-2")) return;
      if (!belongsToOrderProducts(row)) return;

      const clicked = readProductRow(row);
      if (!clicked) return;

      const grouped = new Map<string, number>();
      for (const child of Array.from(list.children)) {
        if (!(child instanceof HTMLElement)) continue;
        const item = readProductRow(child);
        if (!item || item.productName !== clicked.productName) continue;
        grouped.set(item.variantName, (grouped.get(item.variantName) || 0) + item.quantity);
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const src = (image as HTMLImageElement).currentSrc || (image as HTMLImageElement).src;
      setPreview({
        src,
        productName: clicked.productName,
        variants: Array.from(grouped.entries()).map(([name, quantity]) => ({ name, quantity })),
      });
      setGallery([src]);
      setActiveSrc(src);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [pathname]);

  useEffect(() => {
    if (!preview) return;
    let cancelled = false;
    const initial = preview.src;
    void adminRequest<GalleryPayload>(`/api/products/gallery?name=${encodeURIComponent(preview.productName)}`, {
      ttlMs: 60_000,
      staleMs: 5 * 60_000,
    }).then((payload) => {
      if (cancelled) return;
      const images = [initial, ...(payload.images || [])]
        .filter(Boolean)
        .filter((value, index, array) => array.indexOf(value) === index);
      setGallery(images);
      setActiveSrc((current) => current || images[0] || initial);
    }).catch(() => {
      if (!cancelled) setGallery([initial]);
    });
    return () => { cancelled = true; };
  }, [preview]);

  useEffect(() => {
    if (!preview) return;
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreview(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [preview]);

  const totalQuantity = useMemo(
    () => preview?.variants.reduce((sum, variant) => sum + variant.quantity, 0) || 0,
    [preview],
  );

  const finishDrag = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (!mobile) return;
    if (info.offset.y > 110 || info.velocity.y > 700) setPreview(null);
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {preview ? (
        <div className="fixed inset-0 z-[2147483646] flex items-end justify-center p-0 md:items-center md:p-6" aria-label={`${preview.productName} ürün görseli`}>
          <motion.button
            type="button"
            aria-label="Önizlemeyi kapat"
            onClick={() => setPreview(null)}
            className="absolute inset-0 bg-black/45"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />

          <motion.section
            role="dialog"
            aria-modal="true"
            data-admin-close-motion="native"
            initial={mobile ? { y: "100%", opacity: 0 } : { y: 18, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={mobile ? { y: "100%", opacity: 0 } : { y: 14, opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 330, damping: 31, mass: 0.78 }}
            drag={mobile ? "y" : false}
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.72 }}
            onDragEnd={finishDrag}
            className="relative flex h-[94dvh] w-full flex-col overflow-hidden rounded-t-[28px] border border-white/40 bg-surface-primary shadow-overlay md:h-[min(88dvh,820px)] md:w-[min(94vw,1320px)] md:rounded-[28px]"
          >
            <div
              className="absolute left-1/2 top-2 z-30 h-6 w-24 -translate-x-1/2 cursor-grab touch-none md:hidden"
              onPointerDown={(event) => dragControls.start(event)}
              data-popup-drag-handle
            >
              <span className="mx-auto mt-1 block h-1 w-10 rounded-full bg-border-strong" />
            </div>

            <button
              type="button"
              onClick={() => setPreview(null)}
              aria-label="Kapat"
              data-admin-close-control="true"
              className="absolute right-3 top-3 z-40 grid h-10 w-10 place-items-center rounded-full border border-border-subtle bg-surface-primary/95 text-main shadow-card transition active:scale-95 md:right-4 md:top-4"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="min-h-0 flex-1 overflow-y-auto md:overflow-hidden">
              <div className="flex min-h-full flex-col md:grid md:h-full md:grid-cols-[minmax(0,1fr)_260px] md:grid-rows-[minmax(0,1fr)_auto]">
                <div className="min-h-[54dvh] overflow-hidden bg-surface-secondary px-3 pb-3 pt-10 md:col-start-1 md:row-start-1 md:min-h-0 md:p-7">
                  <div className="flex h-full min-h-[50dvh] items-center justify-center overflow-hidden rounded-2xl md:min-h-0">
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.img
                        key={activeSrc || preview.src}
                        src={activeSrc || preview.src}
                        alt={preview.productName}
                        initial={{ opacity: 0, scale: 0.985 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.99 }}
                        transition={{ duration: 0.18 }}
                        className="block max-h-[58dvh] max-w-full object-contain md:max-h-[66dvh] md:max-w-[92%]"
                      />
                    </AnimatePresence>
                  </div>
                </div>

                <div className="border-t border-border-subtle bg-surface-primary p-4 md:col-start-2 md:row-start-1 md:min-h-0 md:overflow-y-auto md:border-l md:border-t-0 md:p-4 md:pt-16">
                  {gallery.length > 1 ? (
                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-subtle">Diğer fotoğraflar</p>
                      <div className="flex gap-2 overflow-x-auto pb-1 md:grid md:grid-cols-1 md:overflow-visible">
                        {gallery.map((src, index) => {
                          const active = src === (activeSrc || preview.src);
                          return (
                            <button
                              key={`${src}:${index}`}
                              type="button"
                              onClick={() => setActiveSrc(src)}
                              aria-label={`${preview.productName} fotoğraf ${index + 1}`}
                              className={`h-24 w-20 shrink-0 overflow-hidden rounded-xl border bg-surface-secondary transition md:h-32 md:w-full ${active ? "border-accent ring-2 ring-accent/15" : "border-border-subtle hover:border-accent/60"}`}
                            >
                              <img src={src} alt="" className="h-full w-full object-contain" loading="lazy" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="hidden h-full items-center justify-center text-center md:flex">
                      <p className="max-w-[170px] text-[10px] leading-4 text-subtle">Bu ürün için başka fotoğraf bulunmuyor.</p>
                    </div>
                  )}
                </div>

                <div className="border-t border-border-subtle bg-surface-primary p-4 pb-[max(18px,env(safe-area-inset-bottom))] md:col-span-2 md:row-start-2 md:px-6 md:py-4">
                  <div className="grid gap-4 md:grid-cols-[minmax(240px,.7fr)_minmax(0,1.3fr)] md:items-end">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-subtle">Sipariş ürünü</p>
                      <h3 className="mt-1 pr-12 text-lg font-bold leading-tight text-main">{preview.productName}</h3>
                      <p className="mt-1 text-xs text-muted">Bu siparişte toplam <strong className="text-main">{totalQuantity} adet</strong></p>
                    </div>

                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-subtle">Varyant ve adet</p>
                      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {preview.variants.map((variant) => (
                          <div key={variant.name} className="flex items-center justify-between gap-3 rounded-[13px] bg-surface-secondary px-3 py-2.5">
                            <span className="min-w-0 flex-1 text-xs font-semibold text-main">{variant.name}</span>
                            <span className="shrink-0 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-black text-accent">{variant.quantity} adet</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.section>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
