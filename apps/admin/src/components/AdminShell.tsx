"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  Boxes,
  ChevronDown,
  ExternalLink,
  Layers3,
  LogOut,
  Mail,
  Menu,
  PackageOpen,
  Palette,
  PanelLeft,
  PanelLeftClose,
  Search,
  ShoppingBag,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { ROSTA_STORE_URL } from "@/lib/platform";

type NavItem = {
  href: string;
  label: string;
  group: string;
  icon: typeof BarChart3;
};

const groups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "GENEL",
    items: [
      { href: "/", label: "Başlangıç", group: "Genel", icon: BarChart3 },
    ],
  },
  {
    label: "TİCARET",
    items: [
      { href: "/products", label: "Ürünler", group: "Ticaret", icon: Boxes },
      { href: "/catalog", label: "Katalog", group: "Ticaret", icon: Layers3 },
      { href: "/inventory", label: "Stok", group: "Ticaret", icon: PackageOpen },
      { href: "/orders", label: "Siparişler", group: "Ticaret", icon: ShoppingBag },
      { href: "/customers", label: "Müşteriler", group: "Ticaret", icon: Users },
    ],
  },
  {
    label: "MAĞAZA",
    items: [
      { href: "/theme", label: "Mağaza Tasarımı", group: "Mağaza", icon: Palette },
      { href: "/email", label: "E-posta", group: "Mağaza", icon: Mail },
    ],
  },
];

const allItems = groups.flatMap((group) => group.items);

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="rosta-commerce-brand" aria-label="ROSTA Panel">
      <span className="rosta-commerce-brand-logo">
        <img src="/rosta-coffee-co.svg" alt="" />
      </span>
      {!compact ? (
        <span className="rosta-commerce-brand-copy">
          <strong>ROSTA</strong>
          <small>CONTROL ROOM</small>
        </span>
      ) : null}
    </Link>
  );
}

function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);

  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("tr-TR");
    if (!normalized) return allItems;
    return allItems.filter((item) =>
      `${item.label} ${item.group}`.toLocaleLowerCase("tr-TR").includes(normalized),
    );
  }, [query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelected((value) => Math.min(value + 1, Math.max(results.length - 1, 0)));
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelected((value) => Math.max(value - 1, 0));
      }
      if (event.key === "Enter") {
        const item = results[selected];
        if (!item) return;
        event.preventDefault();
        router.push(item.href);
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, results, router, selected]);

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            aria-label="Komut paletini kapat"
            className="rosta-command-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <div className="rosta-command-wrap">
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-label="Komut paleti"
              className="rosta-command"
              initial={{ opacity: 0, scale: 0.96, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -8 }}
              transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
            >
              <div className="rosta-command-search">
                <Search size={17} />
                <input
                  autoFocus
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setSelected(0);
                  }}
                  placeholder="Sayfa ara veya komut çalıştır…"
                />
              </div>
              <div className="rosta-command-results">
                {results.map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.href}
                      type="button"
                      className={index === selected ? "rosta-command-result is-active" : "rosta-command-result"}
                      onMouseEnter={() => setSelected(index)}
                      onClick={() => {
                        router.push(item.href);
                        onClose();
                      }}
                    >
                      <Icon size={17} />
                      <span>{item.label}</span>
                      <small>{item.group}</small>
                    </button>
                  );
                })}
                {!results.length ? <div className="admin-empty" style={{ minHeight: 120 }}>Sonuç bulunamadı.</div> : null}
              </div>
            </motion.section>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  );
}

function MobileDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            aria-label="Menüyü kapat"
            className="rosta-mobile-drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            className="rosta-mobile-drawer"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
          >
            <div className="rosta-mobile-drawer-head">
              <Link href="/" onClick={onClose} className="rosta-mobile-drawer-brand" aria-label="ROSTA Panel">
                <img src="/rosta-coffee-co.svg" alt="ROSTA Coffee Co." />
              </Link>
              <button type="button" className="rosta-commerce-icon-button" onClick={onClose} aria-label="Menüyü kapat">
                <X size={19} />
              </button>
            </div>
            <nav className="rosta-mobile-drawer-nav">
              {groups.map((group) => (
                <div key={group.label} className="rosta-commerce-nav-group">
                  <div className="rosta-commerce-nav-label">{group.label}</div>
                  <div className="rosta-commerce-nav-items">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const active = isActive(pathname, item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={onClose}
                          className={active ? "rosta-commerce-nav-link is-active" : "rosta-commerce-nav-link"}
                        >
                          <Icon />
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}

function MobileDock({ onMore }: { onMore: () => void }) {
  const pathname = usePathname();
  const direct = [
    { href: "/", label: "Başlangıç", icon: BarChart3 },
    { href: "/products", label: "Ürünler", icon: Boxes },
    { href: "/orders", label: "Siparişler", icon: ShoppingBag },
    { href: "/customers", label: "Müşteriler", icon: Users },
  ];

  return (
    <div className="rosta-mobile-dock-wrap">
      <nav className="rosta-mobile-dock" aria-label="ROSTA mobil menü">
        {direct.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className={active ? "rosta-mobile-dock-item is-active" : "rosta-mobile-dock-item"}>
              {active ? (
                <motion.span
                  layoutId="rosta-mobile-liquid-pill"
                  transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.78 }}
                  className="rosta-mobile-dock-pill"
                />
              ) : null}
              <motion.span
                animate={active ? { y: -1.5, scale: 1.08 } : { y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 430, damping: 27 }}
              >
                <Icon size={19} strokeWidth={active ? 2.35 : 1.9} />
              </motion.span>
              <span>{item.label}</span>
            </Link>
          );
        })}
        <button type="button" onClick={onMore} className="rosta-mobile-dock-item">
          <Menu size={19} />
          <span>Menü</span>
        </button>
      </nav>
    </div>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    GENEL: true,
    "TİCARET": true,
    "MAĞAZA": true,
  });

  useEffect(() => {
    const stored = window.localStorage.getItem("rosta-admin-sidebar-collapsed");
    setCollapsed(stored === "1");
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const current = allItems.find((item) => isActive(pathname, item.href)) || allItems[0];

  const toggleCollapsed = () => {
    setCollapsed((value) => {
      const next = !value;
      window.localStorage.setItem("rosta-admin-sidebar-collapsed", next ? "1" : "0");
      return next;
    });
  };

  const signOut = async () => {
    await getSupabaseBrowser().auth.signOut();
    window.location.reload();
  };

  return (
    <div className="rosta-commerce-shell">
      <aside className={collapsed ? "rosta-commerce-sidebar is-collapsed" : "rosta-commerce-sidebar"}>
        <Brand compact={collapsed} />
        <nav className="rosta-commerce-nav" aria-label="Panel ana menüsü">
          {groups.map((group) => {
            const open = expanded[group.label] ?? true;
            return (
              <div key={group.label} className="rosta-commerce-nav-group">
                <button
                  type="button"
                  className="rosta-commerce-nav-label"
                  onClick={() => setExpanded((value) => ({ ...value, [group.label]: !open }))}
                >
                  <span>{group.label}</span>
                  {!collapsed ? (
                    <motion.span animate={{ rotate: open ? 0 : -90 }} transition={{ duration: 0.16 }}>
                      <ChevronDown size={13} />
                    </motion.span>
                  ) : null}
                </button>
                <AnimatePresence initial={false}>
                  {open || collapsed ? (
                    <motion.div
                      className="rosta-commerce-nav-items"
                      initial={collapsed ? false : { height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
                    >
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        const active = isActive(pathname, item.href);
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            title={collapsed ? item.label : undefined}
                            className={active ? "rosta-commerce-nav-link is-active" : "rosta-commerce-nav-link"}
                          >
                            <Icon />
                            <span>{item.label}</span>
                          </Link>
                        );
                      })}
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            );
          })}
        </nav>
        <div className="rosta-commerce-sidebar-footer">
          <div className="rosta-commerce-sidebar-footer-row">
            <a href={ROSTA_STORE_URL} target="_blank" rel="noreferrer">
              <ExternalLink size={14} />
              {!collapsed ? "Storefront" : null}
            </a>
            <button type="button" onClick={signOut} aria-label="Çıkış Yap">
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      <div className={collapsed ? "rosta-commerce-main is-collapsed" : "rosta-commerce-main is-wide"}>
        <header className="rosta-commerce-header">
          <button type="button" className="rosta-commerce-icon-button lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Menüyü aç">
            <Menu size={19} />
          </button>
          <button type="button" className="rosta-commerce-icon-button hidden lg:grid" onClick={toggleCollapsed} aria-label="Kenar çubuğunu değiştir">
            {collapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
          </button>
          <span className="rosta-commerce-page-title">{current?.label || "Kontrol Merkezi"}</span>
          <Link href="/" className="rosta-commerce-mobile-brand" aria-label="ROSTA Panel">
            <img src="/rosta-coffee-co.svg" alt="ROSTA Coffee Co." />
          </Link>

          <button type="button" className="rosta-commerce-search" onClick={() => setSearchOpen(true)}>
            <Search size={16} />
            <span>Ara veya komut çalıştır…</span>
            <kbd>⌘K</kbd>
          </button>

          <a
            className="rosta-commerce-icon-button"
            href={ROSTA_STORE_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="Storefrontu aç"
          >
            <ExternalLink size={18} />
          </a>
          <button type="button" className="rosta-commerce-icon-button" onClick={signOut} aria-label="Çıkış Yap">
            <LogOut size={18} />
          </button>
        </header>

        <main className="rosta-commerce-content">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={pathname}
              className="rosta-route-surface"
              data-exact-base44-page={current?.href === "/" ? "overview" : current?.href?.replace("/", "") || "overview"}
              initial={{ opacity: 0.82, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0.72, y: -3 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <MobileDock onMore={() => setMobileOpen(true)} />
      <MobileDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} />
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
