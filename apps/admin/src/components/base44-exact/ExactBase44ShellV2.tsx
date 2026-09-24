"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  ChevronDown,
  CornerDownLeft,
  Menu,
  Moon,
  PanelLeft,
  PanelLeftClose,
  Search,
  Sparkles,
  Sun,
  X,
} from "lucide-react";
import { useOverlayBehavior } from "@ruth-commerce/ui";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import {
  exactAllNavItems,
  exactCurrentItem,
  exactItemIsActive,
  exactMobileNav,
  exactNavStructure,
} from "./nav-config";
import { ExactNotificationBell, ExactNotificationProvider, ExactUnifiedToastLayer } from "./ExactNotificationCenter";
import { ExactIconButton, ExactToastProvider, exactCx } from "./primitives";

function Brand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <Link
      href="/"
      aria-label="ROSTA Coffee Co."
      className={exactCx(
        "flex min-w-0 items-center",
        collapsed ? "justify-center" : "h-full w-full justify-center",
      )}
    >
      <div
        className={exactCx(
          "flex shrink-0 items-center justify-center overflow-hidden",
          collapsed
            ? "h-10 w-10 rounded-[var(--radius-small)] bg-white shadow-sm ring-1 ring-black/5"
            : "h-[58px] w-full max-w-[202px] bg-transparent",
        )}
      >
        <img
          src="/rosta-coffee-co.svg"
          alt="ROSTA Coffee Co."
          draggable={false}
          className={collapsed ? "h-8 w-8 object-contain" : "block h-full w-full object-contain object-center"}
        />
      </div>
    </Link>
  );
}

function MobileDrawerBrand({ onClick }: { onClick: () => void }) {
  return (
    <Link
      href="/"
      aria-label="ROSTA Coffee Co. ana sayfası"
      onClick={onClick}
      className="relative block h-14 w-[176px] shrink-0 overflow-hidden"
    >
      <img
        src="/rosta-coffee-co.svg"
        alt="ROSTA Coffee Co."
        width={1000}
        height={500}
        draggable={false}
        className="block h-auto w-full -translate-y-[17px] select-none object-contain dark:drop-shadow-[0_0_4px_rgba(251,243,230,0.62)]"
      />
    </Link>
  );
}

function Sidebar({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  return (
    <aside className={exactCx("sticky top-0 z-sidebar hidden h-screen flex-col border-r border-border-subtle bg-surface-secondary/80 backdrop-blur-xl transition-all duration-300 lg:flex", collapsed ? "w-[68px]" : "w-[248px]")}>
      <div className={exactCx("flex h-16 shrink-0 items-center border-b border-border-subtle px-4", collapsed && "justify-center px-2")}><Brand collapsed={collapsed} /></div>
      <nav className="no-scrollbar flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {exactNavStructure.map((group) => {
          const isExpanded = expanded[group.label] ?? true;
          const visibleItems = collapsed ? group.items.slice(0, 1) : group.items;
          return <div key={group.label} className="mb-1">
            {!collapsed ? <button type="button" onClick={() => setExpanded((current) => ({ ...current, [group.label]: !isExpanded }))} className="ruth-type-label flex w-full items-center justify-between px-2.5 py-1.5 font-semibold uppercase tracking-wide text-subtle transition-colors hover:text-muted">{group.label}<ChevronDown className={exactCx("h-3 w-3 transition-transform", !isExpanded && "-rotate-90")} /></button> : <div className="mx-1 my-2 h-px bg-border-subtle" />}
            <AnimatePresence initial={false}>{isExpanded || collapsed ? <motion.div initial={collapsed ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }} className="overflow-hidden">{visibleItems.map((item) => { const active = exactItemIsActive(pathname, item); const Icon = item.icon; return <Link key={`${group.label}:${item.path}`} href={item.path} aria-current={active ? "page" : undefined} title={collapsed ? item.label : undefined} className={exactCx("ruth-type-control group relative flex h-9 items-center gap-2.5 px-2.5 radius-small transition-all duration-150", active ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-tertiary hover:text-main", collapsed && "justify-center")}>
              {active && !collapsed ? <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-accent" /> : null}<Icon className="h-[17px] w-[17px] shrink-0" />{!collapsed ? <span className="truncate">{item.label}</span> : null}{!collapsed && item.badge ? <span className="ruth-type-caption ml-auto rounded-full bg-accent px-1.5 py-0.5 font-bold text-white">{item.badge}</span> : null}
            </Link>; })}</motion.div> : null}</AnimatePresence>
          </div>;
        })}
      </nav>
    </aside>
  );
}

function TopHeader({ collapsed, onToggleSidebar, onOpenSearch, onOpenMore, dark, onToggleDark }: { collapsed: boolean; onToggleSidebar: () => void; onOpenSearch: () => void; onOpenMore: () => void; dark: boolean; onToggleDark: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const currentItem = exactCurrentItem(pathname);
  return <header className="sticky top-0 z-header flex h-16 items-center gap-2 border-b border-border-subtle bg-surface-primary/80 px-3 backdrop-blur-xl md:px-4">
    <ExactIconButton icon={Menu} label="Menüyü aç" variant="ghost" size="icon-sm" className="lg:hidden" onClick={onOpenMore} />
    <ExactIconButton icon={collapsed ? PanelLeft : PanelLeftClose} label="Kenar çubuğunu değiştir" variant="ghost" size="icon-sm" className="hidden lg:flex" onClick={onToggleSidebar} />
    <span className="ruth-type-card-title hidden truncate text-main md:block">{currentItem?.label || "Kontrol Merkezi"}</span>
    <button type="button" onClick={onOpenSearch} className="ruth-type-control ml-auto mr-1 flex h-11 items-center gap-2 border border-border-subtle bg-surface-secondary px-3 text-subtle radius-control transition-all hover:border-border-strong hover:text-muted md:h-9 md:w-64"><Search className="h-4 w-4 shrink-0" /><span className="hidden md:inline">Ara veya komut çalıştır…</span></button>
    <ExactIconButton icon={Sparkles} label="ROSTA Insight" variant="ghost" size="icon-sm" className="text-accent" onClick={() => router.push("/rosta-insight")} />
    <ExactNotificationBell />
    <ExactIconButton icon={dark ? Sun : Moon} label="Temayı değiştir" variant="ghost" size="icon-sm" onClick={onToggleDark} />
  </header>;
}

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const overlay = useOverlayBehavior({ active: open, onClose, dismissalPolicy: "light-dismiss" });
  const results = useMemo(() => { const normalized = query.trim().toLocaleLowerCase("tr-TR"); return normalized ? exactAllNavItems.filter((item) => `${item.label} ${item.group}`.toLocaleLowerCase("tr-TR").includes(normalized)) : exactAllNavItems.slice(0, 10); }, [query]);
  const select = useCallback((index: number) => { const item = results[index]; if (!item) return; router.push(item.path); onClose(); }, [onClose, results, router]);
  useEffect(() => { if (!open) return; setQuery(""); setSelectedIndex(0); }, [open]);
  const onInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") { event.preventDefault(); setSelectedIndex((index) => Math.min(index + 1, Math.max(0, results.length - 1))); return; }
    if (event.key === "ArrowUp") { event.preventDefault(); setSelectedIndex((index) => Math.max(index - 1, 0)); return; }
    if (event.key === "Enter") { event.preventDefault(); select(selectedIndex); }
  };
  if (typeof document === "undefined") return null;
  return createPortal(<AnimatePresence>{open ? <div className="fixed inset-0 z-command flex items-start justify-center px-4 pt-[15vh]" data-dismissal-policy={overlay.dismissalPolicy}><motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={overlay.onBackdropClick} className="absolute inset-0 bg-background/75 backdrop-blur-[2px]" /><motion.div ref={overlay.containerRef} initial={{ scale: 0.96, opacity: 0, y: -8 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0, y: -8 }} transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }} className="relative w-[min(420px,calc(100vw-32px))] max-w-[420px] md:w-[min(86vw,960px)] md:max-w-none overflow-hidden bg-surface-primary shadow-overlay rounded-[var(--radius-card)]" role="dialog" aria-modal="true" aria-label="Komut paleti" tabIndex={-1}><div className="flex h-14 items-center gap-3 border-b border-border-subtle px-4"><Search className="h-4 w-4 text-subtle" /><input data-autofocus value={query} onKeyDown={onInputKeyDown} onChange={(event) => { setQuery(event.target.value); setSelectedIndex(0); }} placeholder="Sayfa ara veya komut çalıştır…" className="ruth-type-control flex-1 bg-transparent text-main placeholder:text-subtle focus:outline-none" /><kbd className="ruth-type-code rounded-md bg-surface-tertiary px-1.5 py-0.5 text-subtle">ESC</kbd></div><div className="max-h-[50vh] overflow-y-auto py-2">{results.length ? results.map((item, index) => { const Icon = item.icon; return <button key={`${item.group}:${item.path}`} type="button" onMouseEnter={() => setSelectedIndex(index)} onClick={() => select(index)} className={exactCx("flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors md:min-h-0", index === selectedIndex ? "bg-accent-soft" : "hover:bg-surface-secondary")}><Icon className={exactCx("h-4 w-4", index === selectedIndex ? "text-accent" : "text-subtle")} /><span className={exactCx("ruth-type-control", index === selectedIndex ? "font-medium text-accent" : "text-main")}>{item.label}</span><small className="ruth-type-caption ml-auto text-subtle">{item.group}</small>{index === selectedIndex ? <CornerDownLeft className="h-3.5 w-3.5 text-subtle" /> : null}</button>; }) : <div className="ruth-type-body px-4 py-8 text-center text-subtle">Sonuç bulunamadı</div>}</div></motion.div></div> : null}</AnimatePresence>, document.body);
}

function MobileBottomNav() {
  const pathname = usePathname();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-header px-3 pb-[max(0.65rem,env(safe-area-inset-bottom))] lg:hidden">
      <nav
        aria-label="Mobil ana menü"
        className="pointer-events-auto relative mx-auto w-full max-w-[460px] overflow-hidden rounded-[30px] border border-border-subtle bg-surface-secondary/95 p-1.5 shadow-overlay backdrop-blur-[24px]"
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-surface-tertiary/70 via-transparent to-accent/5" />
        <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-border-strong to-transparent" />
        <div className="pointer-events-none absolute -bottom-12 left-1/2 h-24 w-56 -translate-x-1/2 rounded-full bg-accent/15 blur-3xl" />

        <div className="relative flex items-stretch">
          {exactMobileNav.map((item) => {
            const active = exactItemIsActive(pathname, item);
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                href={item.path}
                aria-current={active ? "page" : undefined}
                className="relative min-w-0 flex-1"
              >
                <motion.div
                  whileTap={{ scale: 0.92 }}
                  transition={{ type: "spring", stiffness: 520, damping: 30 }}
                  className={exactCx(
                    "relative flex min-h-[58px] w-full flex-col items-center justify-center gap-0.5 rounded-[23px] px-1 py-1.5",
                    active ? "text-accent" : "text-muted",
                  )}
                >
                  {active ? (
                    <motion.span
                      layoutId="exact-mobile-liquid-pill"
                      transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.78 }}
                      className="absolute inset-x-1 inset-y-0 overflow-hidden rounded-[22px] border border-accent/40 bg-accent-soft shadow-[0_8px_24px_rgba(17,17,17,0.34)]"
                    >
                      <span className="absolute inset-0 bg-gradient-to-br from-accent/20 via-accent/5 to-transparent" />
                      <span className="absolute left-[14%] right-[14%] top-0 h-px bg-gradient-to-r from-transparent via-accent/55 to-transparent" />
                      <span className="absolute -right-3 -top-5 h-12 w-12 rounded-full bg-accent/20 blur-xl" />
                    </motion.span>
                  ) : null}

                  <motion.span
                    animate={active ? { y: -1.5, scale: 1.08 } : { y: 0, scale: 1 }}
                    transition={{ type: "spring", stiffness: 430, damping: 27 }}
                    className="relative z-10 flex h-7 w-9 items-center justify-center"
                  >
                    <Icon className="h-[19px] w-[19px]" strokeWidth={active ? 2.35 : 1.9} />
                  </motion.span>
                  <motion.span
                    animate={active ? { opacity: 1, y: 0 } : { opacity: 0.72, y: 0.5 }}
                    transition={{ duration: 0.18 }}
                    className={exactCx("ruth-type-caption relative z-10 max-w-full truncate leading-none", active ? "font-semibold" : "font-medium")}
                  >
                    {item.label}
                  </motion.span>
                </motion.div>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const overlay = useOverlayBehavior({ active: open, onClose, dismissalPolicy: "light-dismiss" });
  if (typeof document === "undefined") return null;
  return createPortal(<AnimatePresence>{open ? <><motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={overlay.onBackdropClick} className="fixed inset-0 z-drawer bg-background/75 backdrop-blur-[2px] lg:hidden" /><motion.aside ref={overlay.containerRef} initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ type: "spring", damping: 32, stiffness: 320 }} className="fixed bottom-0 left-0 top-0 z-drawer flex w-[286px] flex-col bg-surface-primary lg:hidden" role="dialog" aria-modal="true" aria-label="Mobil menü" tabIndex={-1} data-dismissal-policy={overlay.dismissalPolicy}><div className="flex h-[calc(4.5rem+env(safe-area-inset-top))] shrink-0 items-end justify-between border-b border-border-subtle px-4 pb-2"><MobileDrawerBrand onClick={onClose} /><ExactIconButton icon={X} label="Menüyü kapat" variant="ghost" size="icon-sm" onClick={onClose} /></div><nav className="no-scrollbar flex-1 overflow-y-auto px-3 py-4">{exactNavStructure.map((group) => <div key={group.label} className="mb-4"><p className="ruth-type-label mb-1 px-2 font-semibold uppercase tracking-wide text-subtle">{group.label}</p>{group.items.map((item) => { const active = exactItemIsActive(pathname, item); const Icon = item.icon; return <Link key={item.path} href={item.path} onClick={onClose} className={exactCx("ruth-type-control flex h-11 items-center gap-3 px-3 radius-small", active ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-surface-secondary hover:text-main")}><Icon className="h-[17px] w-[17px]" /><span className="truncate">{item.label}</span>{item.badge ? <span className="ruth-type-caption ml-auto rounded-full bg-accent px-1.5 py-0.5 font-bold text-white">{item.badge}</span> : null}</Link>; })}</div>)}</nav></motion.aside></> : null}</AnimatePresence>, document.body);
}

export function ExactBase44ShellV2({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => { const stored = window.localStorage.getItem("ruth_exact_sidebar_collapsed") === "1"; setCollapsed(stored); const darkStored = window.localStorage.getItem("ruth_exact_dark") === "1"; setDark(darkStored); document.documentElement.classList.toggle("dark", darkStored); }, []);
  useEffect(() => { const handler = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(true); } }; window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, []);

  const toggleSidebar = () => setCollapsed((value) => { const next = !value; window.localStorage.setItem("ruth_exact_sidebar_collapsed", next ? "1" : "0"); return next; });
  const toggleDark = () => setDark((value) => { const next = !value; window.localStorage.setItem("ruth_exact_dark", next ? "1" : "0"); document.documentElement.classList.toggle("dark", next); return next; });

  return <ExactToastProvider><ExactNotificationProvider><div className="min-h-screen bg-background text-main lg:flex"><Sidebar collapsed={collapsed} /><div className="min-w-0 flex-1"><TopHeader collapsed={collapsed} onToggleSidebar={toggleSidebar} onOpenSearch={() => setSearchOpen(true)} onOpenMore={() => setMobileOpen(true)} dark={dark} onToggleDark={toggleDark} /><main className="mx-auto w-full max-w-[1600px] px-3 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-4 md:px-5 lg:pb-8 lg:pt-5">{children}</main></div><MobileBottomNav /><MobileDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} /><CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} /></div><ExactUnifiedToastLayer /></ExactNotificationProvider></ExactToastProvider>;
}
