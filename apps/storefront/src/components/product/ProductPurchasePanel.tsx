"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Minus, Plus, ShoppingBag, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { formatPrice } from "@/lib/formatPrice";
import type { Product, ProductVariant } from "@/types/site";

export type ProductDetailItem = {
  id: string;
  label: string;
  content: string;
};

type CartState = "ready" | "succeeded" | "continue";

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function optionNames(variants: ProductVariant[]) {
  const names: string[] = [];
  for (const variant of variants) {
    for (const name of Object.keys(variant.options || {})) {
      if (!name.startsWith("__") && !names.includes(name)) names.push(name);
    }
  }
  return names;
}

function exactOptionMatch(
  variant: ProductVariant,
  selected: Record<string, string>,
) {
  return Object.entries(selected).every(
    ([name, value]) => !value || variant.options?.[name] === value,
  );
}

function isAvailable(variant: ProductVariant) {
  return (
    variant.is_active !== false &&
    variant.stock_status !== "out_of_stock" &&
    Number(variant.stock ?? 1) > 0
  );
}

export function ProductPurchasePanel({
  product,
  details,
}: {
  product: Product;
  details: ProductDetailItem[];
}) {
  const variants = useMemo(
    () => (product.variants || []).filter((variant) => variant.is_active !== false),
    [product.variants],
  );
  const availableVariants = useMemo(
    () => variants.filter(isAvailable),
    [variants],
  );
  const visibleVariants = availableVariants.length ? availableVariants : variants;
  const names = useMemo(() => optionNames(visibleVariants), [visibleVariants]);
  const hasSelectableVariants = names.length > 0 && visibleVariants.length > 1;
  const { addItem, setIsOpen: setCartOpen } = useCart();

  const [quantity, setQuantity] = useState(1);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [desktopPicker, setDesktopPicker] = useState(false);
  const [desktopDetail, setDesktopDetail] = useState(details[0]?.id || "");
  const [activeDetail, setActiveDetail] = useState(details[0]?.id || "");
  const [detailExpanded, setDetailExpanded] = useState(true);
  const [cartState, setCartState] = useState<CartState>("ready");

  const successTimer = useRef<number | null>(null);

  const clearTimers = () => {
    if (successTimer.current) window.clearTimeout(successTimer.current);
    successTimer.current = null;
  };

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const update = () => setDesktopPicker(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    document.documentElement.classList.add("rosta-product-purchase-active");
    return () => document.documentElement.classList.remove("rosta-product-purchase-active");
  }, []);

  useEffect(() => {
    clearTimers();
    setQuantity(1);
    setSelectedOptions({});
    setPickerOpen(false);
    setDesktopDetail(details[0]?.id || "");
    setActiveDetail(details[0]?.id || "");
    setDetailExpanded(true);
    setCartState("ready");
  }, [details, product.id]);

  useEffect(() => () => clearTimers(), []);

  useEffect(() => {
    if (!pickerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [pickerOpen]);

  const allOptionsSelected =
    !hasSelectableVariants || names.every((name) => Boolean(selectedOptions[name]));
  const selectedVariant = useMemo(() => {
    if (!visibleVariants.length) return null;
    if (!hasSelectableVariants) return visibleVariants[0] || null;
    if (!allOptionsSelected) return null;
    return (
      visibleVariants.find((variant) => exactOptionMatch(variant, selectedOptions)) ||
      null
    );
  }, [allOptionsSelected, hasSelectableVariants, selectedOptions, visibleVariants]);

  useEffect(() => {
    if (!selectedVariant?.image_url) return;
    window.dispatchEvent(
      new CustomEvent("rosta:variant-image", {
        detail: { productId: product.id, imageUrl: selectedVariant.image_url },
      }),
    );
  }, [product.id, selectedVariant?.image_url]);

  const unavailable =
    product.stock_status === "out_of_stock" ||
    (variants.length > 0 && availableVariants.length === 0);
  const selectedPrice = Number(selectedVariant?.price ?? product.price ?? 0);
  const compareAt = Number(product.compare_at_price ?? 0);
  const hasDiscount =
    Number.isFinite(compareAt) && compareAt > selectedPrice && selectedPrice > 0;
  const discountPercentage = hasDiscount
    ? Math.max(1, Math.round(((compareAt - selectedPrice) / compareAt) * 100))
    : 0;
  const currentDetail =
    details.find((item) => item.id === activeDetail) || details[0];

  const optionValues = (optionName: string) => {
    const matching = visibleVariants.filter((variant) =>
      names.every((name) => {
        if (name === optionName) return true;
        const selected = selectedOptions[name];
        return !selected || variant.options?.[name] === selected;
      }),
    );
    return unique(matching.map((variant) => variant.options?.[optionName]));
  };

  const optionPossible = (optionName: string, value: string) => {
    const optionIndex = names.indexOf(optionName);
    const previousNames = optionIndex > 0 ? names.slice(0, optionIndex) : [];
    return visibleVariants.some(
      (variant) =>
        isAvailable(variant) &&
        variant.options?.[optionName] === value &&
        previousNames.every((name) => {
          const selected = selectedOptions[name];
          return !selected || variant.options?.[name] === selected;
        }),
    );
  };

  const selectOption = (name: string, value: string) => {
    const optionIndex = names.indexOf(name);
    setSelectedOptions((current) => {
      const next = { ...current, [name]: value };
      for (const laterName of names.slice(optionIndex + 1)) delete next[laterName];
      return next;
    });
  };

  const completeAdd = () => {
    if (
      unavailable ||
      cartState === "succeeded" ||
      !allOptionsSelected ||
      (hasSelectableVariants && !selectedVariant)
    )
      return;

    clearTimers();
    try {
      addItem(product, quantity, selectedVariant);
      setPickerOpen(false);
      setCartState("succeeded");
      successTimer.current = window.setTimeout(
        () => setCartState("continue"),
        1050,
      );
    } catch {
      setCartState("ready");
    }
  };

  const requestAdd = () => {
    if (unavailable || cartState === "succeeded") return;
    if (cartState === "continue") {
      setCartOpen(true);
      return;
    }
    if (hasSelectableVariants && !selectedVariant) {
      setPickerOpen(true);
      return;
    }
    completeAdd();
  };

  const actionLabel = unavailable
    ? "TÜKENDİ"
    : cartState === "succeeded"
      ? "Sepete Eklendi"
      : cartState === "continue"
        ? "Sepeti Gör · Devam"
        : "Sepete Ekle";

  const actionIcon =
    cartState === "succeeded" || cartState === "continue" ? (
      <Check size={16} />
    ) : (
      <ShoppingBag size={16} />
    );

  const salePrice = (
    <>
      {hasDiscount ? (
        <>
          <del className="product-purchase-compare">
            {formatPrice(compareAt, product.currency || "TRY")}
          </del>
          <span className="product-purchase-sale-pill">
            <strong>{formatPrice(selectedPrice, product.currency || "TRY")}</strong>
            <em>-%{discountPercentage}</em>
          </span>
        </>
      ) : (
        <strong className="product-purchase-current">
          {formatPrice(selectedPrice, product.currency || "TRY")}
        </strong>
      )}
    </>
  );

  return (
    <>
      <style>{`
        .product-purchase-desktop{margin-top:28px}.product-desktop-details{border-top:1px solid rgba(184,151,106,.24);border-bottom:1px solid rgba(184,151,106,.24)}.product-desktop-detail+.product-desktop-detail{border-top:1px solid rgba(184,151,106,.2)}.product-desktop-detail-trigger{display:flex;width:100%;min-height:52px;align-items:center;justify-content:space-between;cursor:pointer;border:0;padding:0;background:transparent;color:inherit;font-family:inherit;font-size:10px;font-weight:400;letter-spacing:.15em;text-align:left;text-transform:uppercase}.product-desktop-detail-trigger span{position:relative;width:14px;height:14px;flex:0 0 14px}.product-desktop-detail-trigger span:before,.product-desktop-detail-trigger span:after{content:"";position:absolute;background:currentColor}.product-desktop-detail-trigger span:before{top:6px;left:0;width:14px;height:1px}.product-desktop-detail-trigger span:after{top:0;left:6px;width:1px;height:14px;transition:opacity 260ms ease,transform 360ms cubic-bezier(.22,1,.36,1)}.product-desktop-detail.is-open .product-desktop-detail-trigger span:after{opacity:0;transform:rotate(90deg)}.product-desktop-detail-content{overflow:hidden}.product-desktop-detail-content p{margin:0;padding:0 0 20px;color:var(--muted-foreground);font-size:12px;line-height:1.75;white-space:pre-line}.product-desktop-action{display:flex;width:100%;min-height:58px;align-items:center;justify-content:center;gap:10px;margin-top:18px;border:1px solid var(--ink);background:var(--ink);color:var(--cream);font-size:10px;letter-spacing:.18em;text-transform:uppercase;transition:background 260ms ease,color 260ms ease,transform 260ms cubic-bezier(.22,1,.36,1),box-shadow 260ms ease}.product-desktop-action.is-success{border-color:var(--gold-dark);background:var(--cream);color:var(--ink)}.product-desktop-action-price{display:inline-flex;align-items:center;gap:8px;margin-left:4px;letter-spacing:0;text-transform:none}.product-purchase-compare{color:var(--muted-foreground);font-size:9px}.product-desktop-action .product-purchase-compare{color:#fff;font-size:11px;font-weight:500;opacity:.84;text-decoration-color:rgba(255,255,255,.8);text-decoration-thickness:1px;text-underline-offset:2px}.product-desktop-action.is-success .product-purchase-compare{color:var(--ink);opacity:.68;text-decoration-color:color-mix(in srgb,var(--ink) 68%,transparent)}.product-purchase-current{font-size:13px;font-weight:600}.product-purchase-sale-pill{display:inline-flex;align-items:center;gap:5px;border-radius:2px;background:#b40016;padding:5px 7px;color:#fff;line-height:1}.product-purchase-sale-pill strong{font-size:12px;font-weight:600}.product-purchase-sale-pill em{font-size:8px;font-style:normal;letter-spacing:.02em}.product-mobile-details-inline,.product-purchase-mobile{display:none}.product-variant-overlay{background:rgba(33,25,18,.48);backdrop-filter:blur(5px)}.product-variant-sheet{background:var(--cream);color:var(--ink);box-shadow:0 -28px 80px rgba(33,25,18,.2)}.product-variant-option{position:relative;min-height:48px;border:1px solid rgba(184,151,106,.32);background:var(--ivory);font-size:10px;letter-spacing:.11em;text-transform:uppercase}.product-variant-option.is-active{border-color:var(--ink);background:var(--ink);color:var(--cream)}.product-variant-confirm{display:flex;width:100%;min-height:54px;align-items:center;justify-content:center;gap:10px;margin-top:24px;border:0;background:var(--ink);color:var(--cream);font-size:10px;letter-spacing:.17em;text-transform:uppercase}.product-variant-confirm:disabled,.product-desktop-action:disabled,.product-mobile-add:disabled{cursor:not-allowed;opacity:.38}@media(min-width:768px){.product-variant-sheet{height:100%;max-width:430px;border-left:1px solid rgba(184,151,106,.32);box-shadow:-32px 0 90px rgba(33,25,18,.18)}.product-desktop-action:not(:disabled):hover{transform:translateY(-1px);box-shadow:0 12px 28px rgba(33,25,18,.16)}}@media(max-width:767px){.product-purchase-desktop{display:none}.product-mobile-details-inline{display:block;width:100%;margin-top:10px;border-top:1px solid rgba(184,151,106,.22);border-bottom:1px solid rgba(184,151,106,.22);background:var(--cream)}.product-mobile-detail-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));width:100%}.product-mobile-detail-tabs button{display:flex;min-width:0;min-height:48px;align-items:center;justify-content:center;border:0;border-right:1px solid rgba(184,151,106,.18);padding:6px 3px;background:transparent;color:var(--muted-foreground);font-size:clamp(6.8px,2vw,8.5px);font-weight:500;line-height:1.24;letter-spacing:.025em;text-align:center;text-transform:uppercase;white-space:normal}.product-mobile-detail-tabs button:last-child{border-right:0}.product-mobile-detail-tabs button.is-active{background:color-mix(in srgb,var(--cream) 86%,var(--gold) 14%);color:var(--ink);box-shadow:inset 0 -2px 0 var(--gold-dark)}.product-mobile-detail-copy{overflow:hidden;border-top:1px solid rgba(184,151,106,.18);padding:15px 16px 17px;background:var(--cream)}.product-mobile-detail-copy p{max-width:58ch;margin:0;color:var(--muted-foreground);font-size:11px;line-height:1.68}.product-purchase-mobile{position:fixed!important;z-index:118!important;right:0!important;bottom:0!important;left:0!important;display:block!important;width:100%!important;border-top:1px solid rgba(184,151,106,.3);background:var(--cream)!important;box-shadow:0 -18px 48px rgba(33,25,18,.16);padding-bottom:env(safe-area-inset-bottom);transform:none!important;-webkit-transform:none!important;opacity:1!important;visibility:visible!important;animation:none!important;transition:none!important;backface-visibility:hidden;-webkit-backface-visibility:hidden;contain:layout paint;isolation:isolate}.product-mobile-buy-row{display:flex;min-height:58px;align-items:center;justify-content:space-between;gap:12px;padding:15px 18px 10px}.product-mobile-buy-row h1{min-width:0;overflow:hidden;margin:0;font-size:clamp(.9rem,4.1vw,1.08rem);font-weight:500;line-height:1.2;text-overflow:ellipsis;white-space:nowrap}.product-mobile-price{display:flex;flex-shrink:0;align-items:center;justify-content:flex-end;gap:6px;font-size:13px}.product-mobile-price .product-purchase-compare{font-size:8.5px}.product-mobile-price .product-purchase-sale-pill{padding:5px 6px}.product-mobile-price .product-purchase-sale-pill strong{font-size:11px}.product-mobile-price .product-purchase-sale-pill em{font-size:7px}.product-mobile-add{display:flex;width:calc(100% - 36px);min-height:56px;align-items:center;justify-content:center;gap:9px;margin:0 18px 14px;border:1px solid var(--ink);background:var(--ink);color:var(--cream);font-size:10px;letter-spacing:.19em;text-transform:uppercase;transition:background 280ms ease,color 280ms ease,border-color 280ms ease}.product-mobile-add:active{transform:none}.product-mobile-add.is-success{border-color:var(--gold-dark);background:var(--cream);color:var(--ink)}.product-variant-sheet{max-height:88dvh;border-radius:18px 18px 0 0}.product-secondary-content{padding-bottom:calc(150px + env(safe-area-inset-bottom))}}
      `}</style>

      <div className="product-purchase-desktop">
        <div className="product-desktop-details">
          {details.map((item) => {
            const open = desktopDetail === item.id;
            return (
              <section key={item.id} className={`product-desktop-detail ${open ? "is-open" : ""}`}>
                <button
                  type="button"
                  className="product-desktop-detail-trigger"
                  aria-expanded={open}
                  aria-controls={`desktop-product-detail-${item.id}`}
                  onClick={() => setDesktopDetail((current) => current === item.id ? "" : item.id)}
                >
                  {item.label}
                  <span aria-hidden="true" />
                </button>
                <AnimatePresence initial={false}>
                  {open ? (
                    <motion.div
                      key={item.id}
                      id={`desktop-product-detail-${item.id}`}
                      className="product-desktop-detail-content"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <motion.p
                        initial={{ y: -7, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: -5, opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                      >
                        {item.content}
                      </motion.p>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </section>
            );
          })}
        </div>
        <button
          type="button"
          disabled={unavailable || cartState === "succeeded"}
          onClick={requestAdd}
          className={`product-desktop-action ${cartState === "succeeded" || cartState === "continue" ? "is-success" : ""}`}
        >
          {actionIcon}
          {actionLabel}
          <span className="product-desktop-action-price">{salePrice}</span>
        </button>
      </div>

      <section className="product-mobile-details-inline" aria-label="Ürün bilgileri">
        <div className="product-mobile-detail-tabs" role="tablist" aria-label="Ürün bilgileri">
          {details.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={detailExpanded && activeDetail === item.id}
              aria-controls={`product-detail-${item.id}`}
              onClick={() => {
                if (activeDetail === item.id && detailExpanded) {
                  setDetailExpanded(false);
                  return;
                }
                setActiveDetail(item.id);
                setDetailExpanded(true);
              }}
              className={detailExpanded && activeDetail === item.id ? "is-active" : ""}
              data-product-page-swipe-ignore
            >
              {item.label}
            </button>
          ))}
        </div>
        <AnimatePresence initial={false} mode="wait">
          {detailExpanded && currentDetail ? (
            <motion.div
              key={currentDetail.id}
              id={`product-detail-${currentDetail.id}`}
              role="tabpanel"
              className="product-mobile-detail-copy"
              initial={{ height: 0, opacity: 0, y: -7 }}
              animate={{ height: "auto", opacity: 1, y: 0 }}
              exit={{ height: 0, opacity: 0, y: -5 }}
              transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
            >
              <p>{currentDetail.content}</p>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </section>

      <aside className="product-purchase-mobile" data-product-page-swipe-ignore>
        <div className="product-mobile-buy-row">
          <h1>{product.name}</h1>
          <div className="product-mobile-price">{salePrice}</div>
        </div>
        <button
          type="button"
          disabled={unavailable || cartState === "succeeded"}
          onClick={requestAdd}
          className={`product-mobile-add ${cartState === "succeeded" || cartState === "continue" ? "is-success" : ""}`}
        >
          {actionIcon}
          {actionLabel}
        </button>
      </aside>

      <AnimatePresence>
        {pickerOpen ? (
          <motion.div
            className="product-variant-overlay fixed inset-0 z-[140] flex items-end justify-center sm:items-stretch sm:justify-end"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPickerOpen(false)}
            data-product-page-swipe-ignore
          >
            <motion.div
              className="product-variant-sheet w-full overflow-y-auto px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-5 sm:px-7 sm:pb-8 sm:pt-7"
              initial={desktopPicker ? { x: "100%" } : { y: "100%" }}
              animate={{ x: 0, y: 0 }}
              exit={desktopPicker ? { x: "100%" } : { y: "100%" }}
              transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-7 flex items-start justify-between gap-4 border-b border-gold/20 pb-5">
                <div>
                  <p className="text-[9px] uppercase tracking-[0.22em] text-gold-dark">Seçenekleri Belirle</p>
                  <h2 className="mt-2 font-heading text-2xl text-ink">{product.name}</h2>
                  <div className="mt-2 flex items-center gap-2 text-sm text-muted-ruth">{salePrice}</div>
                </div>
                <button type="button" onClick={() => setPickerOpen(false)} className="grid h-10 w-10 place-items-center border border-gold/25" aria-label="Kapat">
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-7">
                {names.map((name) => (
                  <fieldset key={name}>
                    <legend className="mb-3 text-[10px] uppercase tracking-[0.18em] text-gold-dark">{name}</legend>
                    <div className="grid grid-cols-2 gap-2">
                      {optionValues(name).map((value) => {
                        const active = selectedOptions[name] === value;
                        const possible = optionPossible(name, value);
                        return (
                          <button
                            key={value}
                            type="button"
                            disabled={!possible}
                            onClick={() => selectOption(name, value)}
                            className={`product-variant-option ${active ? "is-active" : ""}`}
                          >
                            {value}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                ))}
              </div>

              <div className="mt-8 flex items-center justify-between border-t border-gold/20 pt-5">
                <span className="text-[10px] uppercase tracking-[0.18em] text-muted-ruth">Adet</span>
                <div className="flex items-center gap-2 border border-gold/25 px-2 py-1">
                  <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} className="grid h-8 w-8 place-items-center" aria-label="Adedi azalt"><Minus size={14} /></button>
                  <output className="w-6 text-center text-sm">{quantity}</output>
                  <button type="button" onClick={() => setQuantity((value) => Math.min(10, value + 1))} className="grid h-8 w-8 place-items-center" aria-label="Adedi artır"><Plus size={14} /></button>
                </div>
              </div>

              <button
                type="button"
                disabled={!allOptionsSelected || !selectedVariant || cartState === "succeeded"}
                onClick={completeAdd}
                className="product-variant-confirm"
              >
                {actionIcon}
                {allOptionsSelected ? actionLabel : "Tüm Seçenekleri Belirleyin"}
              </button>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
