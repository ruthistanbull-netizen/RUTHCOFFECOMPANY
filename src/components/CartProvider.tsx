"use client";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { CoffeeProduct } from "@/data/coffee";

type CartItem = { product: CoffeeProduct; quantity: number; weight: string; grind: string };
type CartContextValue = {
  items: CartItem[];
  count: number;
  subtotal: number;
  open: boolean;
  setOpen: (value: boolean) => void;
  add: (product: CoffeeProduct, weight?: string, grind?: string) => void;
  update: (id: string, quantity: number) => void;
  remove: (id: string) => void;
};
const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "ruth-coffee-cart";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {}
    setReady(true);
  }, []);
  useEffect(() => { if (ready) localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }, [items, ready]);

  const add = (product: CoffeeProduct, weight = product.weights[0], grind = "Whole Bean") => {
    setItems((current) => {
      const key = `${product.id}:${weight}:${grind}`;
      const existing = current.find((item) => `${item.product.id}:${item.weight}:${item.grind}` === key);
      return existing
        ? current.map((item) => `${item.product.id}:${item.weight}:${item.grind}` === key ? { ...item, quantity: item.quantity + 1 } : item)
        : [...current, { product, quantity: 1, weight, grind }];
    });
    setOpen(true);
  };
  const update = (id: string, quantity: number) => setItems((current) => current.flatMap((item) => item.product.id === id ? quantity > 0 ? [{ ...item, quantity }] : [] : [item]));
  const remove = (id: string) => setItems((current) => current.filter((item) => item.product.id !== id));
  const count = useMemo(() => items.reduce((a, b) => a + b.quantity, 0), [items]);
  const subtotal = useMemo(() => items.reduce((a, b) => a + b.product.price * b.quantity, 0), [items]);
  return <CartContext.Provider value={{ items, count, subtotal, open, setOpen, add, update, remove }}>{children}</CartContext.Provider>;
}
export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart must be used inside CartProvider");
  return value;
}
