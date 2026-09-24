"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  BadgePercent,
  BellRing,
  Bot,
  Boxes,
  ChevronDown,
  CircleUserRound,
  Coins,
  CornerDownLeft,
  CreditCard,
  Gauge,
  Headphones,
  HeartHandshake,
  LayoutGrid,
  List,
  LogOut,
  Mail,
  Menu,
  MessageSquareText,
  Moon,
  PackagePlus,
  RefreshCw,
  RotateCcw,
  Search,
  ServerCog,
  Settings2,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Sun,
  Truck,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import styles from "./ControlRoomShellV2.module.css";

type NavItem = {
  href: string;
  label: string;
  shortLabel?: string;
  icon: LucideIcon;
  aliases?: string[];
  searchTerms?: string[];
  badge?: string;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    label: "Asistan",
    items: [
      { href: "/rosta-insight", label: "ROSTA Insight", shortLabel: "Sesli Insight", icon: Headphones, searchTerms: ["Yapay zeka", "AI", "Sesli asistan", "Voice", "Kamera", "Çeviri"], badge: "AI" },
      { href: "/rosta-insight/chat", label: "ROSTA Insight Chat", shortLabel: "Insight Chat", icon: MessageSquareText, searchTerms: ["Yapay zeka", "AI", "Chat", "Sohbet", "Dosya", "Fotoğraf"] },
    ],
  },
  {
    label: "Operasyon",
    items: [
      { href: "/", label: "Kontrol Merkezi", shortLabel: "Merkez", icon: Gauge },
      { href: "/orders", label: "Siparişler", icon: ShoppingBag },
      { href: "/payments", label: "Ödemeler ve İadeler", shortLabel: "Ödemeler", icon: CreditCard },
      { href: "/shipping", label: "Kargo Yönetimi", shortLabel: "Kargo", icon: Truck },
      { href: "/returns", label: "İade ve Değişim", shortLabel: "İadeler", icon: RotateCcw },
      { href: "/shipping/operations", label: "Kargo İstisnaları", shortLabel: "İstisnalar", icon: ServerCog, searchTerms: ["Operasyon İstisnaları"] },
    ],
  },
  {
    label: "Katalog",
    items: [
      { href: "/products", label: "Ürünler", icon: Boxes },
      { href: "/catalog", label: "Kategori ve Koleksiyonlar", shortLabel: "Katalog", icon: Sparkles, aliases: ["/categories", "/collections"] },
    ],
  },
  {
    label: "Müşteri",
    items: [
      { href: "/customers", label: "Müşteriler", icon: UsersRound },
      { href: "/crm", label: "CRM ve Hatırlatmalar", shortLabel: "CRM", icon: HeartHandshake },
      { href: "/rosta-points", label: "ROSTA Points", shortLabel: "Puanlar", icon: Coins },
    ],
  },
  {
    label: "Büyüme",
    items: [
      { href: "/marketing", label: "İndirim ve Kampanyalar", shortLabel: "Kampanyalar", icon: BadgePercent, aliases: ["/discounts"] },
      { href: "/email", label: "E-posta Merkezi", shortLabel: "E-posta", icon: Mail },
      { href: "/abandoned-carts", label: "Terk Edilmiş Sepetler", shortLabel: "Terk Sepet", icon: ShoppingCart },
      { href: "/reviews", label: "Yorumlar", icon: MessageSquareText },
    ],
  },
  {
    label: "Sistem",
    items: [
      { href: "/settings", label: "Site Ayarları ve Tema", shortLabel: "Site Ayarları", icon: Settings2, aliases: ["/theme"] },
      { href: "/notifications", label: "Bildirimler", icon: BellRing },
      { href: "/system", label: "Servis Sağlığı", shortLabel: "Sistem", icon: ServerCog },
    ],
  },
];

const allNavItems = navGroups.flatMap((group) => group.items.map((item) => ({ ...item, group: group.label })));

const mobilePrimary: NavItem[] = [
  { href: "/", label: "Merkez", icon: Gauge },
  { href: "/orders", label: "Sipariş", icon: ShoppingBag },
  { href: "/shipping", label: "Kargo", icon: Truck },
  { href: "/products", label: "Ürün", icon: Boxes },
];

const base44Ease: [number, number, number, number] = [0.32, 0.72, 0, 1];

function activeFor(pathname: string, item: NavItem) {
  if (item.href === "/") return pathname === "/";
  if (item.href === "/rosta-insight") return pathname === "/rosta-insight" || pathname.startsWith("/rosta-insight/voice") || pathname.startsWith("/rosta-insight/wake") || pathname === "/ruthie" || pathname.startsWith("/ruthie/voice") || pathname.startsWith("/ruthie/wake");
  if (item.href === "/rosta-insight/chat") return pathname === "/rosta-insight/chat" || pathname.startsWith("/rosta-insight/chat/") || pathname === "/ruthie/chat" || pathname.startsWith("/ruthie/chat/");
  if (pathname === item.href || pathname.startsWith(`${item.href}/`)) return true;
  return (item.aliases || []).some((alias) => pathname === alias || pathname.startsWith(`${alias}/`));
}

function routeTitle(pathname: string) {
  if (pathname === "/search") return { group: "Arama", title: "Panel Araması" };
  if (pathname === "/orders/new") return { group: "Operasyon", title: "Yeni Sipariş" };
  if (/^\/orders\/[^/]+\/timeline$/.test(pathname)) return { group: "Operasyon", title: "Sipariş Kayıt Zinciri" };

  for (const group of navGroups) {
    const found = group.items.find((item) => activeFor(pathname, item));
    if (found) return { group: group.label, title: found.label };
  }

  return { group: "ROSTA Coffee Co.", title: "Control Room" };
}

function PanelBrand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link className={styles.brand} href="/" aria-label="ROSTA Panel ana sayfa" onClick={onNavigate} data-panel-brand>
      <span className={styles.brandMark} aria-hidden="true">R</span>
      <span className={styles.brandCopy}>
        <strong>ROSTA Coffee Co.</strong>
        <small>Control Room</small>
      </span>
    </Link>
  );
}

export function ControlRoomShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const commandInputRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [paletteQuery, setPaletteQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [productsView, setProductsView] = useState<"grid" | "list">("grid");
  const [ruthieDockOpen, setRuthieDockOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(navGroups.map((group) => [group.label, true])),
  );
  const currentRoute = useMemo(() => routeTitle(pathname), [pathname]);

  const paletteResults = useMemo(() => {
    const normalized = paletteQuery.trim().toLocaleLowerCase("tr-TR");
    if (!normalized) return allNavItems.slice(0, 10);
    return allNavItems.filter((item) => {
      const haystack = [item.label, item.shortLabel, item.group, ...(item.searchTerms || [])]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("tr-TR");
      return haystack.includes(normalized);
    });
  }, [paletteQuery]);

  const hasSearchAction = paletteQuery.trim().length >= 2;
  const paletteItemCount = paletteResults.length + (hasSearchAction ? 1 : 0);

  const closePalette = useCallback(() => {
    setPaletteOpen(false);
    setPaletteQuery("");
    setSelectedIndex(0);
  }, []);

  const runPaletteItem = useCallback((index: number) => {
    if (index < paletteResults.length) {
      const item = paletteResults[index];
      if (item) {
        router.push(item.href);
        closePalette();
      }
      return;
    }

    const value = paletteQuery.trim();
    if (value.length >= 2) {
      router.push(`/search?q=${encodeURIComponent(value)}`);
      closePalette();
    }
  }, [closePalette, paletteQuery, paletteResults, router]);

  useEffect(() => {
    setMenuOpen(false);
    closePalette();
  }, [closePalette, pathname]);

  useEffect(() => {
    const stored = window.localStorage.getItem("ruth_admin_color_scheme") === "dark";
    const storedProductsView = window.localStorage.getItem("ruth_admin_products_view") === "list" ? "list" : "grid";
    setDarkMode(stored);
    setProductsView(storedProductsView);
    document.documentElement.dataset.adminColorScheme = stored ? "dark" : "light";
    document.documentElement.dataset.productsView = storedProductsView;
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setRuthieDockOpen(false);
        closePalette();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closePalette]);

  useEffect(() => {
    if (!paletteOpen) return;
    setSelectedIndex(0);
    const timer = window.setTimeout(() => commandInputRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [paletteOpen]);

  useEffect(() => {
    if (!paletteOpen) return;
    const onPaletteKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((current) => Math.min(current + 1, Math.max(0, paletteItemCount - 1)));
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((current) => Math.max(0, current - 1));
      }
      if (event.key === "Enter" && paletteItemCount > 0) {
        event.preventDefault();
        runPaletteItem(selectedIndex);
      }
    };
    window.addEventListener("keydown", onPaletteKeyDown);
    return () => window.removeEventListener("keydown", onPaletteKeyDown);
  }, [paletteItemCount, paletteOpen, runPaletteItem, selectedIndex]);

  useEffect(() => {
    if (!menuOpen && !paletteOpen && !ruthieDockOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [menuOpen, paletteOpen, ruthieDockOpen]);

  const closeMenu = () => setMenuOpen(false);
  const toggleMenu = () => setMenuOpen((open) => !open);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = query.trim();
    if (value.length < 2) return;
    closeMenu();
    router.push(`/search?q=${encodeURIComponent(value)}`);
  };

  const setProductView = (view: "grid" | "list") => {
    setProductsView(view);
    document.documentElement.dataset.productsView = view;
    window.localStorage.setItem("ruth_admin_products_view", view);
  };

  const toggleTheme = () => {
    setDarkMode((current) => {
      const next = !current;
      document.documentElement.dataset.adminColorScheme = next ? "dark" : "light";
      window.localStorage.setItem("ruth_admin_color_scheme", next ? "dark" : "light");
      return next;
    });
  };

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await getSupabaseBrowser().auth.signOut();
      window.sessionStorage.removeItem("ruth_admin_next_checked_until");
      router.replace("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className={styles.shell} data-admin-route={pathname} data-products-view={productsView}>
      <aside className={styles.sidebar} aria-label="Ana panel navigasyonu">
        <PanelBrand />

        <nav className={styles.desktopNav}>
          {navGroups.map((group) => {
            const expanded = expandedGroups[group.label] ?? true;
            return (
              <section className={styles.navGroup} key={group.label}>
                <button
                  className={styles.groupToggle}
                  type="button"
                  onClick={() => setExpandedGroups((current) => ({ ...current, [group.label]: !expanded }))}
                  aria-expanded={expanded}
                >
                  <span>{group.label}</span>
                  <ChevronDown className={expanded ? styles.groupChevronOpen : ""} aria-hidden="true" />
                </button>
                <AnimatePresence initial={false}>
                  {expanded ? (
                    <motion.div
                      className={styles.groupItems}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: base44Ease }}
                    >
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        const active = activeFor(pathname, item);
                        return (
                          <Link className={`${styles.navItem} ${active ? styles.active : ""}`} href={item.href} key={item.href} aria-current={active ? "page" : undefined}>
                            {active ? <span className={styles.activeRail} aria-hidden="true" /> : null}
                            <span className={styles.navIcon}><Icon aria-hidden="true" /></span>
                            <span>{item.label}</span>
                            {item.badge ? <em className={styles.navBadge}>{item.badge}</em> : null}
                          </Link>
                        );
                      })}
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </section>
            );
          })}
        </nav>

        <div className={styles.sidebarFooter}>
          <Link className={styles.adminIdentity} href="/settings">
            <span>RC</span>
            <span><strong>ROSTA COFFEE CO.</strong><small>Admin</small></span>
          </Link>
          <Link className={styles.newOrderButton} href="/orders/new"><PackagePlus aria-hidden="true" /><span>Manuel Sipariş</span></Link>
          <button className={styles.signOutButton} type="button" onClick={() => void signOut()} disabled={signingOut}>
            {signingOut ? <RefreshCw className={styles.spin} aria-hidden="true" /> : <LogOut aria-hidden="true" />}
            <span>Güvenli Çıkış</span>
          </button>
        </div>
      </aside>

      <div className={styles.workspace}>
        <header className={styles.topbar}>
          <button className={styles.mobileMenuButton} type="button" onClick={toggleMenu} aria-label={menuOpen ? "Panel menüsünü kapat" : "Panel menüsünü aç"} aria-expanded={menuOpen} aria-controls="control-room-mobile-menu">
            {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
          <div className={styles.breadcrumb}><small>{currentRoute.group}</small><strong>{currentRoute.title}</strong></div>
          <button className={styles.searchTrigger} type="button" onClick={() => setPaletteOpen(true)} aria-label="Ara veya komut çalıştır">
            <Search aria-hidden="true" />
            <span>Ara veya komut çalıştır…</span>
          </button>
          <div className={styles.topbarActions}>
            {pathname.startsWith("/products") ? (
              <div className={styles.viewSwitcher} role="group" aria-label="Ürün görünümü">
                <button className={productsView === "grid" ? styles.viewSwitcherActive : ""} type="button" onClick={() => setProductView("grid")} aria-pressed={productsView === "grid"}><LayoutGrid aria-hidden="true" /><span>Grid</span></button>
                <button className={productsView === "list" ? styles.viewSwitcherActive : ""} type="button" onClick={() => setProductView("list")} aria-pressed={productsView === "list"}><List aria-hidden="true" /><span>Liste</span></button>
              </div>
            ) : null}
            <button className={`${styles.iconAction} ${styles.ruthieAction}`} type="button" onClick={() => setRuthieDockOpen((open) => !open)} aria-label="ROSTA Insight hızlı panelini aç" aria-expanded={ruthieDockOpen}><Bot aria-hidden="true" /></button>
            <Link className={styles.iconAction} href="/notifications" aria-label="Bildirim ayarları"><BellRing aria-hidden="true" /><span className={styles.notificationDot} /></Link>
            <button className={styles.iconAction} type="button" onClick={toggleTheme} aria-label={darkMode ? "Açık temaya geç" : "Koyu temaya geç"} aria-pressed={darkMode}>
              {darkMode ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
            </button>
            <Link className={styles.profileAction} href="/settings"><span>R</span><strong>Yönetici</strong><CircleUserRound aria-hidden="true" /></Link>
          </div>
        </header>

        <main className={styles.content}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              className={styles.pageMotion}
              data-admin-page={pathname}
              key={pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.24, ease: base44Ease }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <nav className={styles.mobileBottom} aria-label="Mobil hızlı navigasyon">
        {mobilePrimary.map((item) => {
          const Icon = item.icon;
          const active = activeFor(pathname, item);
          return <Link className={active ? styles.active : ""} href={item.href} key={item.href} aria-current={active ? "page" : undefined}><span><Icon aria-hidden="true" /></span><em>{item.label}</em></Link>;
        })}
        <button className={menuOpen ? styles.active : ""} type="button" onClick={toggleMenu} aria-label={menuOpen ? "Tüm panel menüsünü kapat" : "Tüm panel menüsünü aç"} aria-expanded={menuOpen} aria-controls="control-room-mobile-menu">
          <span>{menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}</span><em>Menü</em>
        </button>
      </nav>

      <AnimatePresence>
        {ruthieDockOpen ? (
          <>
            <motion.button
              className={styles.ruthieDockBackdrop}
              type="button"
              onClick={() => setRuthieDockOpen(false)}
              aria-label="ROSTA Insight hızlı panelini kapat"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            />
            <motion.aside
              className={styles.ruthieDock}
              role="dialog"
              aria-modal="true"
              aria-label="ROSTA Insight hızlı paneli"
              initial={{ opacity: 0, scale: 0.94, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 14 }}
              transition={{ duration: 0.22, ease: base44Ease }}
            >
              <header>
                <span className={styles.ruthieDockOrb}><Sparkles aria-hidden="true" /></span>
                <div><strong>ROSTA Insight</strong><small>{currentRoute.title} sayfasında hazır</small></div>
                <button type="button" onClick={() => setRuthieDockOpen(false)} aria-label="ROSTA Insight hızlı panelini kapat"><X aria-hidden="true" /></button>
              </header>
              <div className={styles.ruthieDockBody}>
                <p>Bu sayfadaki işlemleri değiştirmeden ROSTA Insight sesli asistanına veya sohbete geçebilirsin.</p>
                <Link href="/rosta-insight/voice" onClick={() => setRuthieDockOpen(false)}><Headphones aria-hidden="true" /><span><strong>Sesli ROSTA Insight</strong><small>Konuşarak işlem ve analiz başlat</small></span></Link>
                <Link href="/rosta-insight/chat" onClick={() => setRuthieDockOpen(false)}><MessageSquareText aria-hidden="true" /><span><strong>ROSTA Insight Chat</strong><small>Dosya, fotoğraf ve panel bağlamıyla sohbet et</small></span></Link>
              </div>
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {paletteOpen ? (
          <motion.div className={styles.commandLayer} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            <button className={styles.commandBackdrop} type="button" onClick={closePalette} aria-label="Komut paletini kapat" />
            <motion.section
              className={styles.commandPanel}
              role="dialog"
              aria-modal="true"
              aria-label="Panel komut paleti"
              initial={{ scale: 0.96, opacity: 0, y: -8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: base44Ease }}
            >
              <div className={styles.commandInput}>
                <Search aria-hidden="true" />
                <input
                  ref={commandInputRef}
                  value={paletteQuery}
                  onChange={(event) => { setPaletteQuery(event.target.value); setSelectedIndex(0); }}
                  placeholder="Sayfa ara veya komut çalıştır…"
                  aria-label="Komut paleti araması"
                />
                <kbd>ESC</kbd>
              </div>
              <div className={styles.commandResults}>
                {paletteResults.map((item, index) => {
                  const Icon = item.icon;
                  const selected = selectedIndex === index;
                  return (
                    <button
                      className={`${styles.commandItem} ${selected ? styles.commandItemSelected : ""}`}
                      type="button"
                      key={`${item.group}-${item.href}`}
                      onMouseEnter={() => setSelectedIndex(index)}
                      onClick={() => runPaletteItem(index)}
                    >
                      <span><Icon aria-hidden="true" /></span>
                      <span><strong>{item.label}</strong><small>{item.group}</small></span>
                      {selected ? <CornerDownLeft aria-hidden="true" /> : null}
                    </button>
                  );
                })}
                {hasSearchAction ? (
                  <button
                    className={`${styles.commandItem} ${styles.commandSearchAction} ${selectedIndex === paletteResults.length ? styles.commandItemSelected : ""}`}
                    type="button"
                    onMouseEnter={() => setSelectedIndex(paletteResults.length)}
                    onClick={() => runPaletteItem(paletteResults.length)}
                  >
                    <span><Search aria-hidden="true" /></span>
                    <span><strong>Panelde ara: “{paletteQuery.trim()}”</strong><small>Sipariş, müşteri, ürün ve işlem kayıtları</small></span>
                    {selectedIndex === paletteResults.length ? <CornerDownLeft aria-hidden="true" /> : null}
                  </button>
                ) : null}
                {!paletteResults.length && !hasSearchAction ? <div className={styles.commandEmpty}>Sonuç bulunamadı.</div> : null}
              </div>
              <footer className={styles.commandFooter}><span>↑↓ Seç</span><span>↵ Aç</span><span>ESC Kapat</span></footer>
            </motion.section>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {menuOpen ? (
          <motion.div
            className={styles.mobileLayer}
            data-state="open"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.24, ease: base44Ease }}
          >
            <motion.button
              className={styles.mobileBackdrop}
              type="button"
              onClick={closeMenu}
              aria-label="Menüyü kapat"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
            />
            <motion.aside
              id="control-room-mobile-menu"
              className={styles.mobileDrawer}
              role="dialog"
              aria-modal="true"
              aria-label="Mobil panel menüsü"
              initial={{ x: "-104%" }}
              animate={{ x: 0 }}
              exit={{ x: "-104%" }}
              transition={{ type: "spring", damping: 32, stiffness: 320 }}
            >
              <header><PanelBrand onNavigate={closeMenu} /><button type="button" onClick={closeMenu} aria-label="Menüyü kapat"><X aria-hidden="true" /></button></header>
              <form className={styles.mobileSearch} onSubmit={submitSearch}><Search aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Panelde ara" aria-label="Mobil panel araması" /><button type="submit">Ara</button></form>
              <nav>
                {navGroups.map((group) => <section key={group.label}><h2>{group.label}</h2><div>{group.items.map((item) => { const Icon = item.icon; const active = activeFor(pathname, item); return <Link className={active ? styles.active : ""} href={item.href} key={item.href} aria-current={active ? "page" : undefined} onClick={closeMenu}><span><Icon aria-hidden="true" /></span><strong>{item.label}</strong>{item.badge ? <em>{item.badge}</em> : null}</Link>; })}</div></section>)}
              </nav>
              <footer><Link href="/orders/new" onClick={closeMenu}><PackagePlus aria-hidden="true" /> Manuel Sipariş</Link><button type="button" onClick={() => void signOut()} disabled={signingOut}><LogOut aria-hidden="true" /> Güvenli Çıkış</button></footer>
            </motion.aside>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
