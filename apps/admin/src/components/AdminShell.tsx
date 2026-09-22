"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { BarChart3, Boxes, Coffee, Layers3, LogOut, PackageOpen, Palette, ShoppingBag, Users } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { ROSTA_STORE_URL } from "@/lib/platform";

const links = [
  { href: "/", label: "Başlangıç", icon: BarChart3 },
  { href: "/products", label: "Ürünler", icon: Boxes },
  { href: "/catalog", label: "Katalog", icon: Layers3 },
  { href: "/inventory", label: "Stok", icon: PackageOpen },
  { href: "/orders", label: "Siparişler", icon: ShoppingBag },
  { href: "/customers", label: "Müşteriler", icon: Users },
  { href: "/theme", label: "Mağaza Tasarımı", icon: Palette },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link href="/" className="admin-sidebar-brand" aria-label="ROSTA Panel">
          <span className="admin-sidebar-mark"><Coffee size={18} /></span>
          <span><strong>ROSTA</strong><small>COFFEE CO.</small></span>
        </Link>

        <nav className="admin-nav">
          {links.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={active ? "admin-nav-link is-active" : "admin-nav-link"}>
                <Icon size={17} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="admin-sidebar-footer">
          <a href={ROSTA_STORE_URL} target="_blank" rel="noreferrer">Storefrontu Aç</a>
          <button onClick={() => getSupabaseBrowser().auth.signOut()}><LogOut size={15} />Çıkış Yap</button>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <div><span className="admin-status-dot" />CANLI MAĞAZA</div>
          <strong>ROSTA CONTROL ROOM</strong>
        </header>
        <main className="admin-content">{children}</main>
      </div>
    </div>
  );
}
