"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Product, ProductVariant } from "@/types/site";
import { trackRuthEvent } from "@/components/analytics/SiteAnalytics";

const STORAGE_KEY = "ruth-istanbul-cart";
const CART_CREATED_ACTIVE_KEY = "ruth-istanbul-cart-created-active";

export type CartItem = {
  key: string;
  id: string;
  slug: string;
  name: string;
  price: number;
  currency: string;
  image: string | null;
  material: string | null;
  finish: string;
  size: string;
  quantity: number;
  checkoutUrl: string | null;
};

type CartContextValue = {
  items: CartItem[];
  count: number;
  subtotal: number;
  isOpen: boolean;
  isReady: boolean;
  setIsOpen: (open: boolean) => void;
  addItem: (product: Product, quantity?: number, variant?: ProductVariant | null) => void;
  removeItem: (key: string) => void;
  updateQuantity: (key: string, quantity: number) => void;
  replaceCartItems: (items: CartItem[]) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function normalizePrice(price: Product["price"]) {
  const number = Number(price);
  return Number.isFinite(number) ? number : 0;
}

function firstAvailableVariant(product: Product) {
  const variants = product.variants || [];
  return variants.find((variant) => variant.stock_status !== "out_of_stock") || variants[0] || null;
}

function productToCartItem(product: Product, quantity: number, selectedVariant?: ProductVariant | null): CartItem {
  const variant = selectedVariant || firstAvailableVariant(product);
  const finish = variant?.options?.Renk || product.finish_color || "Standart";
  const size = variant?.option_summary || (product.is_adjustable ? "Ayarlanabilir" : "Standart");
  const price = variant?.price ?? product.price;

  return {
    key: `${product.id}:${variant?.id || "standard"}`,
    id: product.id,
    slug: product.slug,
    name: product.name,
    price: normalizePrice(price),
    currency: product.currency || "TRY",
    image: product.main_image_url,
    material: product.material,
    finish,
    size,
    quantity,
    checkoutUrl: variant?.ikas_url || product.ikas_url,
  };
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as CartItem[];
          if (Array.isArray(parsed)) setItems(parsed);
        }
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      } finally {
        setIsReady(true);
      }
    }, 0);

    return () => window.clearTimeout(hydrationTimer);
  }, []);

  useEffect(() => {
    if (!isReady) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));

    if (items.length === 0) {
      window.localStorage.removeItem(CART_CREATED_ACTIVE_KEY);
    }
  }, [isReady, items]);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  const addItem = useCallback((product: Product, quantity = 1, variant?: ProductVariant | null) => {
    const nextItem = productToCartItem(product, Math.max(1, quantity), variant);

    setItems((current) => {
      const cartAlreadyCounted = window.localStorage.getItem(CART_CREATED_ACTIVE_KEY) === "1";
      const isNewCart = current.length === 0 || !cartAlreadyCounted;
      const existing = current.find((item) => item.key === nextItem.key);
      const nextItems = !existing
        ? [...current, nextItem]
        : current.map((item) =>
            item.key === nextItem.key
              ? { ...item, quantity: item.quantity + nextItem.quantity }
              : item
          );

      if (isNewCart) {
        window.localStorage.setItem(CART_CREATED_ACTIVE_KEY, "1");
        trackRuthEvent("cart_created", {
          product_slug: product.slug,
          product_name: product.name,
          variant_id: variant?.id || null,
          quantity: nextItem.quantity,
          price: nextItem.price,
          cart_item_count: nextItems.length,
        });
      }

      trackRuthEvent("cart_add", {
        product_slug: product.slug,
        product_name: product.name,
        variant_id: variant?.id || null,
        quantity: nextItem.quantity,
        price: nextItem.price,
        cart_item_count: nextItems.length,
      });

      return nextItems;
    });
    setIsOpen(true);
  }, []);

  const removeItem = useCallback((key: string) => {
    setItems((current) => current.filter((item) => item.key !== key));
  }, []);

  const updateQuantity = useCallback((key: string, quantity: number) => {
    if (quantity <= 0) {
      setItems((current) => current.filter((item) => item.key !== key));
      return;
    }

    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, quantity } : item))
    );
  }, []);

  const replaceCartItems = useCallback((nextItems: CartItem[]) => {
    setItems(nextItems);
    if (nextItems.length > 0) {
      window.localStorage.setItem(CART_CREATED_ACTIVE_KEY, "1");
      setIsOpen(false);
    }
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const count = useMemo(
    () => items.reduce((total, item) => total + item.quantity, 0),
    [items]
  );
  const subtotal = useMemo(
    () => items.reduce((total, item) => total + item.price * item.quantity, 0),
    [items]
  );

  const value = useMemo(
    () => ({
      items,
      count,
      subtotal,
      isOpen,
      isReady,
      setIsOpen,
      addItem,
      removeItem,
      updateQuantity,
      replaceCartItems,
      clearCart,
    }),
    [
      addItem,
      clearCart,
      count,
      isOpen,
      isReady,
      items,
      removeItem,
      subtotal,
      updateQuantity,
      replaceCartItems,
    ]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside CartProvider");
  return context;
}
