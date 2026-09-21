"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Minus, Plus, ShoppingBag, X } from "lucide-react";
import { useOverlayBehavior } from "@ruth-commerce/ui";
import { formatPrice } from "@/lib/formatPrice";
import { useCart } from "@/components/cart/CartProvider";
import { trackRuthEvent } from "@/components/analytics/SiteAnalytics";

export function CartDrawer() {
  const { items, count, subtotal, isOpen, setIsOpen, removeItem, updateQuantity } = useCart();
  const overlay = useOverlayBehavior({
    active: isOpen,
    onClose: () => setIsOpen(false),
    dismissalPolicy: "light-dismiss",
  });

  useEffect(() => {
    if (isOpen) trackRuthEvent("cart_open", { item_count: count, subtotal });
  }, [count, isOpen, subtotal]);

  useEffect(() => {
    const root = document.documentElement;
    if (isOpen) root.classList.add("ruth-cart-open");
    else root.classList.remove("ruth-cart-open");
    return () => root.classList.remove("ruth-cart-open");
  }, [isOpen]);

  return (
    <>
      <style>{`
        .ruth-cart-drawer {
          z-index: 2147483000 !important;
          isolation: isolate;
        }

        html.ruth-cart-open .product-purchase-mobile,
        html.ruth-cart-open .product-page-swipe-stage,
        html.ruth-cart-open .whatsapp-floating-bubble,
        html.ruth-cart-open .rewards-floating-bubble {
          opacity: 0 !important;
          visibility: hidden !important;
          pointer-events: none !important;
        }
      `}</style>

      <AnimatePresence>
        {isOpen ? (
          <motion.div
            className="ruth-cart-drawer fixed inset-0 bg-ink/45 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            data-dismissal-policy={overlay.dismissalPolicy}
            onClick={overlay.onBackdropClick}
          >
            <motion.aside
              ref={overlay.containerRef}
              role="dialog"
              aria-modal="true"
              aria-label="Sepet"
              tabIndex={-1}
              className="absolute bottom-0 right-0 top-0 z-[1] flex w-full flex-col bg-cream sm:w-[430px]"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="flex items-center justify-between border-b border-gold/15 px-5 py-5 sm:px-6">
                <div className="flex items-center gap-3">
                  <ShoppingBag size={17} className="text-gold-dark" />
                  <h2 className="font-heading text-sm uppercase tracking-wide-luxe">Sepetim {count > 0 ? `(${count})` : ""}</h2>
                </div>
                <button data-autofocus type="button" onClick={() => setIsOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-black/5" aria-label="Sepeti kapat"><X size={20} /></button>
              </div>

              {items.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
                  <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-gold/20"><ShoppingBag size={23} className="text-gold-dark" /></div>
                  <p className="font-heading text-xl">Sepetin henüz boş</p>
                  <p className="mt-3 max-w-xs text-sm leading-6 text-muted-ruth">Günlük anlarına eşlik edecek parçaları keşfet.</p>
                  <Link href="/products" onClick={() => setIsOpen(false)} className="mt-7 rounded-full bg-ink px-8 py-4 text-xs uppercase tracking-wide-luxe text-cream">Ürünleri Keşfet</Link>
                </div>
              ) : (
                <>
                  <div className="flex-1 overflow-y-auto px-5 py-2 sm:px-6">
                    {items.map((item) => (
                      <div key={item.key} className="grid grid-cols-[76px_minmax(0,1fr)] gap-4 border-b border-gold/10 py-5">
                        <Link href={`/products/${item.slug}`} onClick={() => setIsOpen(false)} className="aspect-[3/4] w-[76px] shrink-0 overflow-hidden rounded-xl bg-white">
                          {item.image ? <img src={item.image} alt={item.name} className="h-full w-full object-contain" loading="lazy" decoding="async" /> : <div className="ruth-card-gradient flex h-full w-full items-center justify-center p-2 text-center"><span className="font-heading text-xs text-white/90">{item.name}</span></div>}
                        </Link>

                        <div className="min-w-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <Link href={`/products/${item.slug}`} onClick={() => setIsOpen(false)} className="font-heading text-sm leading-5 text-ink">{item.name}</Link>
                              <p className="mt-1 break-words text-xs leading-5 text-muted-ruth">{[item.finish, item.size].filter(Boolean).join(" · ") || "Standart"}</p>
                            </div>
                            <button type="button" onClick={() => removeItem(item.key)} className="shrink-0 text-muted-ruth transition hover:text-ink" aria-label={`${item.name} ürününü sepetten kaldır`}><X size={15} /></button>
                          </div>

                          <div className="mt-4 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-1 rounded-full border border-gold/25 px-1 py-0.5">
                              <button type="button" onClick={() => updateQuantity(item.key, item.quantity - 1)} className="flex h-7 w-7 items-center justify-center rounded-full transition hover:bg-black/5" aria-label="Adedi azalt"><Minus size={11} /></button>
                              <span className="w-5 text-center text-sm">{item.quantity}</span>
                              <button type="button" onClick={() => updateQuantity(item.key, item.quantity + 1)} className="flex h-7 w-7 items-center justify-center rounded-full transition hover:bg-black/5" aria-label="Adedi artır"><Plus size={11} /></button>
                            </div>
                            <p className="shrink-0 font-heading text-sm">{formatPrice(item.price * item.quantity, item.currency)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-gold/15 bg-ivory px-5 py-5 sm:px-6">
                    <div className="flex items-center justify-between"><span className="text-sm text-muted-ruth">Ara toplam</span><span className="font-heading text-xl">{formatPrice(subtotal, "TRY")}</span></div>
                    <p className="mt-2 text-xs leading-5 text-muted-ruth">Kargo bilgileri sitede alınır, kart ödemesi PayTR güvenli ekranında tamamlanır.</p>
                    <Link href="/checkout" onClick={() => setIsOpen(false)} className="mt-5 block w-full rounded-full bg-ink py-4 text-center text-xs uppercase tracking-wide-luxe text-cream transition hover:bg-gold-dark">Ödemeye Geç</Link>
                    <button type="button" onClick={() => setIsOpen(false)} className="mt-2 w-full py-3 text-xs uppercase tracking-wide-luxe text-muted-ruth">Alışverişe Devam Et</button>
                  </div>
                </>
              )}
            </motion.aside>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
