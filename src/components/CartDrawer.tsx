"use client";
import Link from "next/link";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { Minus, Plus, ShoppingBag, X } from "lucide-react";
import { useCart } from "./CartProvider";
import { formatPrice } from "@/lib/format";

export function CartDrawer() {
  const { items, count, subtotal, open, setOpen, update, remove } = useCart();
  return <AnimatePresence>
    {open && <motion.div className="cart-backdrop" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={() => setOpen(false)}>
      <motion.aside className="cart-drawer" initial={{x:"100%"}} animate={{x:0}} exit={{x:"100%"}} transition={{duration:.28,ease:[.22,1,.36,1]}} onClick={(e)=>e.stopPropagation()}>
        <div className="cart-head"><span><ShoppingBag size={17}/> SEPETİM {count ? `(${count})` : ""}</span><button onClick={()=>setOpen(false)} aria-label="Sepeti kapat"><X/></button></div>
        {items.length === 0 ? <div className="cart-empty"><ShoppingBag size={28}/><h3>Sepetin henüz boş</h3><p>Ruth Coffee seçkisini keşfet.</p><Link className="button-dark" href="/shop" onClick={()=>setOpen(false)}>KAHVELERİ KEŞFET</Link></div> : <>
          <div className="cart-items">{items.map((item)=><div className="cart-item" key={`${item.product.id}-${item.weight}-${item.grind}`}>
            <Link href={`/product/${item.product.slug}`} onClick={()=>setOpen(false)}><Image src={item.product.image} alt={item.product.name} width={90} height={120}/></Link>
            <div><div className="cart-item-title-row"><div><strong>{item.product.name}</strong><small>{item.weight} · {item.grind}</small></div><button onClick={()=>remove(item.product.id)}><X size={14}/></button></div>
            <div className="cart-item-bottom"><div className="qty"><button onClick={()=>update(item.product.id,item.quantity-1)}><Minus size={12}/></button><span>{item.quantity}</span><button onClick={()=>update(item.product.id,item.quantity+1)}><Plus size={12}/></button></div><strong>{formatPrice(item.product.price*item.quantity)}</strong></div></div>
          </div>)}</div>
          <div className="cart-foot"><div><span>Ara toplam</span><strong>{formatPrice(subtotal)}</strong></div><p>Kargo ve ödeme seçenekleri checkout aşamasında tamamlanır.</p><Link className="button-dark button-block" href="/checkout" onClick={()=>setOpen(false)}>ÖDEMEYE GEÇ</Link><button className="text-button" onClick={()=>setOpen(false)}>ALIŞVERİŞE DEVAM ET</button></div>
        </>}
      </motion.aside>
    </motion.div>}
  </AnimatePresence>;
}
