"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, Search, ShoppingBag, UserRound, X, ArrowUpRight } from "lucide-react";
import { menuGroups } from "@/data/coffee";
import { useCart } from "./CartProvider";

export function Header() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { count, setOpen } = useCart();

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 24);
    fn();
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const supportsOverlay = pathname === "/" || pathname === "/consulting" || pathname === "/wholesale" || pathname === "/shop";
  const solidHeader = scrolled || menuOpen || searchOpen || !supportsOverlay;

  return <>
    <header className={`site-header ${solidHeader ? "is-solid" : "is-overlay"}`}>
      <div className="header-inner">
        <button className="header-icon menu-button" onClick={() => setMenuOpen(true)} aria-label="Menüyü aç"><Menu /></button>
        <nav className="desktop-header-links"><Link href="/consulting">CONSULTING</Link><Link href="/shop">SHOP</Link></nav>
        <Link href="/" className="wordmark" aria-label="Ruth Coffee Company">RUTH <span>COFFEE COMPANY</span></Link>
        <div className="header-actions">
          <button onClick={() => setSearchOpen(true)} aria-label="Ara"><Search /></button>
          <Link className="account-icon" href="/account" aria-label="Hesap"><UserRound /></Link>
          <button className="cart-icon" onClick={() => setOpen(true)} aria-label="Sepet"><ShoppingBag /><em>{count}</em></button>
        </div>
      </div>
    </header>

    <AnimatePresence>{menuOpen && <motion.div className="menu-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="menu-panel" initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ duration: .45, ease: [.22, 1, .36, 1] }}>
        <div className="menu-top"><strong>RUTH COFFEE COMPANY</strong><button onClick={() => setMenuOpen(false)}><X /></button></div>
        <div className="menu-grid">{menuGroups.map((group, index) => <div className="menu-group" key={group.label}>
          <span>{String(index + 1).padStart(2, "0")} / {group.label}</span>
          {group.links.map(([label, href]) => <Link key={label} href={href} onClick={() => setMenuOpen(false)}>{label}<ArrowUpRight size={15} /></Link>)}
        </div>)}</div>
        <div className="menu-photo"><img src="/images/coffee-consulting.webp" alt="Ruth Coffee consulting" /><span>COFFEE, CONSIDERED FROM EVERY ANGLE.</span></div>
      </motion.div>
      <motion.button className="menu-scrim" aria-label="Menüyü kapat" onClick={() => setMenuOpen(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
    </motion.div>}</AnimatePresence>

    <AnimatePresence>{searchOpen && <motion.div className="search-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="search-inner">
        <div className="search-top"><span>SEARCH RUTH</span><button onClick={() => setSearchOpen(false)}><X /></button></div>
        <input autoFocus placeholder="Kahve, origin, espresso..." />
        <div className="search-suggestions"><span>POPÜLER</span><Link href="/shop?category=espresso">Espresso</Link><Link href="/shop?category=filter">Filter</Link><Link href="/wholesale">Wholesale</Link></div>
      </div>
    </motion.div>}</AnimatePresence>
  </>;
}
