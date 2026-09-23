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
import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import {
  exactAllNavItems,
  exactCurrentItem,
  exactItemIsActive,
  exactMobileNav,
  exactNavStructure,
} from "./nav-config";
import {
  ExactIconButton,
  ExactToastProvider,
  exactCx,
} from "./primitives";

function ExactSidebar({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  return (
    <aside className={exactCx(
      "hidden lg:flex flex-col h-screen sticky top-0 bg-surface-secondary/80 backdrop-blur-xl border-r border-border-subtle z-sidebar transition-all duration-300",
      collapsed ? "w-[68px]" : "w-[248px]",
    )}>
      <div className="flex items-center gap-2.5 px-4 h-16 shrink-0 border-b border-border-subtle">
        <div className="flex items-center justify-center h-9 w-9 rounded-[var(--radius-small)] bg-gradient-to-br from-[hsl(var(--accent))] to-[hsl(var(--accent-hover))] shrink-0">
          <span className="text-white font-bold text-sm">R</span>
        </div>
        {!collapsed ? (
          <div className="min-w-0">
            <p className="text-sm font-bold text-main leading-tight truncate">ROSTA Coffee</p>
            <p className="text-[10px] text-subtle leading-tight">Control Room</p>
          </div>
        ) : null}
      </div>

      <nav className="flex-1 overflow-y-auto no-scrollbar py-3 px-2 space-y-0.5">
        {exactNavStructure.map((group) => {
          const isExpanded = expanded[group.label] ?? true;
          const visibleItems = collapsed ? group.items.slice(0, 1) : group.items;
          return (
            <div key={group.label} className="mb-1">
              {!collapsed ? (
                <button
                  type="button"
                  onClick={() => setExpanded((current) => ({ ...current, [group.label]: !isExpanded }))}
                  className="flex items-center justify-between w-full px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-subtle hover:text-muted transition-colors"
                >
                  {group.label}
                  <ChevronDown className={exactCx("h-3 w-3 transition-transform", !isExpanded && "-rotate-90")} />
                </button>
              ) : (
                <div className="h-px bg-border-subtle my-2 mx-1" />
              )}

              <AnimatePresence initial={false}>
                {isExpanded || collapsed ? (
                  <motion.div
                    initial={collapsed ? false : { height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
                    className="overflow-hidden"
                  >
                    {visibleItems.map((item) => {
                      const active = exactItemIsActive(pathname, item);
                      const Icon = item.icon;
                      return (
                        <Link
                          key={`${group.label}:${item.path}`}
                          href={item.path}
                          aria-current={active ? "page" : undefined}
                          title={collapsed ? item.label : undefined}
                          className={exactCx(
                            "flex items-center gap-2.5 px-2.5 h-9 radius-small text-sm font-medium transition-all duration-150 relative group",
                            active ? "bg-accent-soft text-accent" : "text-muted hover:text-main hover:bg-surface-tertiary",
                            collapsed && "justify-center",
                          )}
                        >
                          {active && !collapsed ? <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-accent" /> : null}
                          <Icon className="h-[17px] w-[17px] shrink-0" />
                          {!collapsed ? <span className="truncate text-[13px]">{item.label}</span> : null}
                          {!collapsed && item.badge ? <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-accent text-white">{item.badge}</span> : null}
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

      {!collapsed ? (
        <div className="p-3 border-t border-border-subtle shrink-0">
          <div className="flex items-center gap-2.5 p-2 radius-small bg-surface-tertiary">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-accent to-[hsl(var(--accent-hover))] flex items-center justify-center text-white text-xs font-semibold shrink-0">RO</div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-main truncate">ROSTA Coffee Co.</p>
              <p className="text-[10px] text-subtle truncate">Admin</p>
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

function ExactTopHeader({
  collapsed,
  onToggleSidebar,
  onOpenSearch,
  onOpenMore,
  dark,
  onToggleDark,
}: {
  collapsed: boolean;
  onToggleSidebar: () => void;
  onOpenSearch: () => void;
  onOpenMore: () => void;
  dark: boolean;
  onToggleDark: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const currentItem = exactCurrentItem(pathname);

  return (
    <header className="sticky top-0 z-header h-16 bg-surface-primary/80 backdrop-blur-xl border-b border-border-subtle flex items-center gap-2 px-3 md:px-4">
      <ExactIconButton icon={Menu} label="Daha fazla" variant="ghost" size="icon-sm" className="lg:hidden" onClick={onOpenMore} />
      <ExactIconButton
        icon={collapsed ? PanelLeft : PanelLeftClose}
        label="Kenar çubuğunu değiştir"
        variant="ghost"
        size="icon-sm"
        className="hidden lg:flex"
        onClick={onToggleSidebar}
      />

      <div className="hidden md:flex items-center gap-2 min-w-0">
        <span className="text-sm font-semibold text-main truncate">{currentItem?.label || "Kontrol Merkezi"}</span>
      </div>

      <button
        type="button"
        onClick={onOpenSearch}
        className="flex items-center gap-2 ml-auto mr-1 h-9 px-3 md:w-64 md:ml-auto bg-surface-secondary border border-border-subtle radius-control text-subtle hover:text-muted hover:border-border-strong transition-all text-sm"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="hidden md:inline text-xs">Ara veya komut çalıştır…</span>
        <kbd className="hidden md:inline-flex items-center gap-0.5 ml-auto text-[10px] font-mono bg-surface-tertiary px-1.5 py-0.5 rounded-md text-subtle">⌘K</kbd>
      </button>

      <ExactIconButton icon={Sparkles} label="Ruthie AI" variant="ghost" size="icon-sm" className="text-accent" onClick={() => router.push("/ruthie")} />
      <div className="relative">
        <ExactIconButton icon={Bell} label="Bildirimler" variant="ghost" size="icon-sm" onClick={() => router.push("/notifications")} />
        <span className="pointer-events-none absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-danger ring-2 ring-surface-primary" />
      </div>
      <ExactIconButton icon={dark ? Sun : Moon} label="Temayı değiştir" variant="ghost" size="icon-sm" onClick={onToggleDark} />
    </header>
  );
}

function ExactCommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("tr-TR");
    if (!normalized) return exactAllNavItems.slice(0, 8);
    return exactAllNavItems.filter((item) => `${item.label} ${item.group}`.toLocaleLowerCase("tr-TR").includes(normalized));
  }, [query]);

  const select = useCallback((index: number) => {
    const item = results[index];
    if (!item) return;
    router.push(item.path);
    onClose();
  }, [onClose, results, router]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelectedIndex(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((index) => Math.min(index + 1, Math.max(0, results.length - 1)));
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((index) => Math.max(index - 1, 0));
      }
      if (event.key === "Enter") select(selectedIndex);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, open, results.length, select, selectedIndex]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-command flex items-start justify-center pt-[15vh] px-4">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
          />
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: -8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
            className="relative w-full max-w-xl bg-surface-primary shadow-overlay rounded-[var(--radius-card)] overflow-hidden"
          >
            <div className="flex items-center gap-3 px-4 h-14 border-b border-border-subtle">
              <Search className="h-4 w-4 text-subtle" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => { setQuery(event.target.value); setSelectedIndex(0); }}
                placeholder="Sayfa ara veya komut çalıştır…"
                className="flex-1 bg-transparent text-sm text-main placeholder:text-subtle focus:outline-none"
              />
              <kbd className="text-[10px] font-mono bg-surface-tertiary px-1.5 py-0.5 rounded-md text-subtle">ESC</kbd>
            </div>
            <div className="max-h-[50vh] overflow-y-auto py-2">
              {results.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-subtle">Sonuç bulunamadı</div>
              ) : results.map((item, index) => {
                const Icon = item.icon;
                return (
                  <button
                    key={`${item.group}:${item.path}`}
                    type="button"
                    onMouseEnter={() => setSelectedIndex(index)}
                    onClick={() => select(index)}
                    className={exactCx("w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors", index === selectedIndex ? "bg-accent-soft" : "hover:bg-surface-secondary")}
                  >
                    <Icon className={exactCx("h-4 w-4", index === selectedIndex ? "text-accent" : "text-subtle")} />
                    <span className={exactCx("text-sm", index === selectedIndex ? "text-accent font-medium" : "text-main")}>{item.label}</span>
                    <small className="ml-auto text-[10px] text-subtle">{item.group}</small>
                    {index === selectedIndex ? <CornerDownLeft className="h-3.5 w-3.5 text-subtle" /> : null}
                  </button>
                );
              })}
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

function ExactMobileBottomNav() {
  const pathname = usePathname();
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-header bg-surface-primary/90 backdrop-blur-xl border-t border-border-subtle">
      <div className="flex items-stretch justify-around px-2 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
        {exactMobileNav.map((item) => {
          const active = exactItemIsActive(pathname, item);
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              href={item.path}
              className={exactCx(
                "flex flex-col items-center justify-center gap-0.5 min-h-[52px] min-w-[44px] px-2 py-1 rounded-[var(--radius-small)] transition-all",
                active ? "text-accent" : "text-subtle",
              )}
            >
              <div className={exactCx("flex items-center justify-center h-7 w-12 rounded-[var(--radius-small)] transition-all", active && "bg-accent-soft")}>
                <Icon className="h-[18px] w-[18px]" />
              </div>
              <span className="text-[9px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function ExactMobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-drawer lg:hidden"
          />
          <motion.div
            initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
            className="fixed top-0 left-0 bottom-0 w-[280px] bg-surface-primary z-drawer lg:hidden flex flex-col"
          >
            <div className="flex items-center justify-between px-4 h-16 border-b border-border-subtle shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-[var(--radius-small)] bg-gradient-to-br from-[hsl(var(--accent))] to-[hsl(var(--accent-hover))] flex items-center justify-center">
                  <span className="text-white font-bold text-xs">R</span>
                </div>
                <span className="text-sm font-bold text-main">Ruth Commerce</span>
              </div>
              <ExactIconButton icon={X} label="Kapat" variant="ghost" size="icon-sm" onClick={onClose} />
            </div>
            <nav className="flex-1 overflow-y-auto py-3 px-2 no-scrollbar">
              {exactNavStructure.map((group) => (
                <div key={group.label} className="mb-2">
                  <p className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-subtle">{group.label}</p>
                  {group.items.map((item) => {
                    const active = exactItemIsActive(pathname, item);
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.path}
                        href={item.path}
                        onClick={onClose}
                        className={exactCx(
                          "flex items-center gap-2.5 px-2.5 h-9 radius-small text-sm font-medium transition-colors",
                          active ? "bg-accent-soft text-accent" : "text-muted hover:text-main hover:bg-surface-tertiary",
                        )}
                      >
                        <Icon className="h-[17px] w-[17px] shrink-0" />
                        <span className="text-[13px]">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

export function ExactBase44Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("ruth_base44_theme") === "dark";
    setDark(stored);
    document.documentElement.classList.toggle("dark", stored);
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      }
      if (event.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => { setMobileNavOpen(false); }, [pathname]);

  const toggleDark = () => {
    setDark((current) => {
      const next = !current;
      document.documentElement.classList.toggle("dark", next);
      window.localStorage.setItem("ruth_base44_theme", next ? "dark" : "light");
      return next;
    });
  };

  const signOut = async () => {
    await getSupabaseBrowser()?.auth.signOut().catch(() => undefined);
    router.replace("/login");
    router.refresh();
  };

  return (
    <ExactToastProvider>
      <div className="flex min-h-screen bg-background" data-base44-exact-shell>
        <ExactSidebar collapsed={collapsed} />
        <div className="flex-1 flex flex-col min-w-0">
          <ExactTopHeader
            collapsed={collapsed}
            onToggleSidebar={() => setCollapsed((current) => !current)}
            onOpenSearch={() => setPaletteOpen(true)}
            onOpenMore={() => setMobileNavOpen(true)}
            dark={dark}
            onToggleDark={toggleDark}
          />
          <main className="flex-1 px-3 md:px-4 py-4 pb-24 lg:pb-4 max-w-[1600px] w-full mx-auto">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={pathname}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
        <ExactMobileBottomNav />
        <ExactCommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
        <ExactMobileDrawer open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
        <button type="button" onClick={() => void signOut()} className="sr-only" aria-label="Oturumu kapat" />
      </div>
    </ExactToastProvider>
  );
}
