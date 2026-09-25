"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Search, ShoppingBag, UserRound, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useCart } from "@/components/cart/CartProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { ROSTA_WORDMARK_SRC } from "@/components/brand/rostaWordmark";
import {
  defaultThemeCustomizerSettings,
  type ThemeCustomizerSettings,
  type ThemeNavItem,
} from "@/lib/themeCustomizer";
import { categoryHref } from "@/lib/catalogCategories";
import type { Category, Collection } from "@/types/site";

type NavChild = { label: string; path: string };
type NavItem = ThemeNavItem & { children?: NavChild[] };

const COLLECTION_DRAG_THRESHOLD = 12;

function uniqueChildren(items: NavChild[]) {
  const byPath = new Map<string, NavChild>();
  for (const item of items) {
    const key = item.path.replace(/\/+$/, "").toLocaleLowerCase("tr-TR");
    if (!byPath.has(key)) byPath.set(key, item);
  }
  return [...byPath.values()];
}

function orderedPhotoCollections(collections: Collection[]) {
  return collections.filter((item) => item.cover_image_url);
}

function ZaraMenuIcon({ open = false }: { open?: boolean }) {
  return (
    <span
      className="ruth-zara-hamburger"
      data-open={open ? "true" : "false"}
      aria-hidden="true"
    >
      <span className="ruth-zara-hamburger__line ruth-zara-hamburger__line--top" />
      <span className="ruth-zara-hamburger__line ruth-zara-hamburger__line--bottom" />
    </span>
  );
}

function PhotoCollectionsRail({
  collections,
  closeMenu,
  placement,
}: {
  collections: Collection[];
  closeMenu: () => void;
  placement: "desktop" | "mobile";
}) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const pointerId = useRef<number | null>(null);
  const startX = useRef(0);
  const startScroll = useRef(0);
  const dragged = useRef(false);
  const visibleCollections = useMemo(
    () => orderedPhotoCollections(collections),
    [collections],
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || event.button !== 0 || !railRef.current) return;
    pointerId.current = event.pointerId;
    startX.current = event.clientX;
    startScroll.current = railRef.current.scrollLeft;
    dragged.current = false;
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rail = railRef.current;
    if (pointerId.current !== event.pointerId || !rail) return;
    const distance = event.clientX - startX.current;

    if (!dragged.current && Math.abs(distance) <= COLLECTION_DRAG_THRESHOLD) return;

    if (!dragged.current) {
      dragged.current = true;
      rail.dataset.dragging = "true";
      try {
        rail.setPointerCapture(event.pointerId);
      } catch {}
    }

    rail.scrollLeft = startScroll.current - distance;
    event.preventDefault();
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rail = railRef.current;
    if (pointerId.current !== event.pointerId || !rail) return;
    pointerId.current = null;
    delete rail.dataset.dragging;
    try {
      if (rail.hasPointerCapture(event.pointerId)) rail.releasePointerCapture(event.pointerId);
    } catch {}
  };

  if (!visibleCollections.length) return null;

  return (
    <div
      ref={railRef}
      className={`ruth-menu-collection-rail ruth-menu-collection-rail--${placement}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      aria-label="Fotoğraflı koleksiyonlar"
    >
      {visibleCollections.map((collection) => (
        <Link
          key={collection.id}
          href={`/collections/${collection.slug}`}
          onClick={(event) => {
            if (dragged.current) {
              event.preventDefault();
              dragged.current = false;
              return;
            }
            closeMenu();
          }}
          className="ruth-menu-collection-card"
          draggable={false}
        >
          <span className="ruth-menu-collection-card__media">
            <img
              src={collection.cover_image_url || ""}
              alt=""
              draggable={false}
            />
          </span>
          <span className="ruth-menu-collection-card__label">{collection.name}</span>
        </Link>
      ))}
    </div>
  );
}

function MenuLinkPanel({
  item,
  closeMenu,
}: {
  item: NavItem | null;
  closeMenu: () => void;
}) {
  if (!item) return null;
  const children = item.children || [];

  return (
    <div className="ruth-zara-menu-copy">
      <Link
        href={item.path}
        onClick={closeMenu}
        className="ruth-zara-menu-copy__title"
      >
        {item.label}
      </Link>

      <div className="ruth-zara-menu-copy__group">
        <span className="ruth-zara-menu-copy__index">
          |01| {children.length ? item.label : "Bağlantı"}
        </span>
        <div className="ruth-zara-menu-copy__links">
          {children.length ? (
            children.map((child) => (
              <Link
                key={child.path}
                href={child.path}
                onClick={closeMenu}
                className="ruth-zara-menu-copy__link"
              >
                {child.label}
              </Link>
            ))
          ) : (
            <Link
              href={item.path}
              onClick={closeMenu}
              className="ruth-zara-menu-copy__link"
            >
              Sayfaya Git
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function MainMenuTabs({
  items,
  activeId,
  setActiveId,
  panelId,
  layoutScope,
}: {
  items: NavItem[];
  activeId: string | null;
  setActiveId: (id: string) => void;
  panelId: string;
  layoutScope: "desktop" | "mobile";
}) {
  return (
    <div
      className="ruth-zara-main-tabs"
      role="tablist"
      aria-label="Ana menü"
      aria-orientation="vertical"
    >
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={panelId}
            className="ruth-zara-main-tab"
            onMouseEnter={() => setActiveId(item.id)}
            onFocus={() => setActiveId(item.id)}
            onClick={() => setActiveId(item.id)}
          >
            {active ? (
              <motion.span
                layoutId={`ruth-zara-menu-dot-${layoutScope}`}
                className="ruth-zara-main-tab__dot"
                transition={{ duration: 0.45, ease: [0.76, 0, 0.24, 1] }}
              />
            ) : null}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function DesktopMenuAccordion({
  items,
  openId,
  setOpenId,
  closeMenu,
}: {
  items: NavItem[];
  openId: string | null;
  setOpenId: (id: string | null) => void;
  closeMenu: () => void;
}) {
  return (
    <nav className="ruth-zara-desktop-accordion" aria-label="Ana menü">
      {items.map((item) => {
        const children = item.children || [];
        const expanded = children.length > 0 && item.id === openId;

        return (
          <div key={item.id} className="ruth-zara-desktop-item">
            <div className="ruth-zara-desktop-row">
              <Link
                href={item.path}
                onClick={closeMenu}
                className="ruth-zara-desktop-link"
              >
                {item.label}
              </Link>
              {children.length ? (
                <button
                  type="button"
                  className="ruth-zara-desktop-toggle"
                  aria-label={`${item.label} alt menüsünü ${expanded ? "kapat" : "aç"}`}
                  aria-expanded={expanded}
                  onClick={() => setOpenId(expanded ? null : item.id)}
                >
                  <span aria-hidden="true">{expanded ? "−" : "+"}</span>
                </button>
              ) : null}
            </div>

            <AnimatePresence initial={false}>
              {expanded ? (
                <motion.div
                  className="ruth-zara-desktop-children"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
                >
                  {children.map((child) => (
                    <Link
                      key={child.path}
                      href={child.path}
                      onClick={closeMenu}
                      className="ruth-zara-desktop-child"
                    >
                      {child.label}
                    </Link>
                  ))}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        );
      })}
    </nav>
  );
}

function AccountMenu() {
  const [open, setOpen] = useState(false);
  const { isLoggedIn, signOut } = useAuth();
  const links = isLoggedIn
    ? [
        { label: "Hesabım", path: "/account" },
        { label: "Siparişlerim", path: "/account/orders" },
        { label: "Adreslerim", path: "/account/addresses" },
      ]
    : [
        { label: "Giriş Yap", path: "/login" },
        { label: "Kayıt Ol", path: "/register" },
      ];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-10 w-10 items-center justify-center"
        aria-label="Hesap menüsü"
        aria-expanded={open}
      >
        <UserRound size={20} strokeWidth={1.35} />
      </button>
      <AnimatePresence>
        {open ? (
          <>
            <button
              type="button"
              className="fixed inset-0 z-[72] cursor-default"
              aria-label="Hesap menüsünü kapat"
              onClick={() => setOpen(false)}
            />
            <motion.div
              className="absolute right-0 top-full z-[73] mt-2 w-52 border border-kraft/40 bg-carbon-soft px-3 py-3 text-cream shadow-[0_18px_50px_color-mix(in_srgb,var(--rosta-carbon)_52%,transparent)]"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 5 }}
            >
              {links.map((link) => (
                <Link
                  key={link.path}
                  href={link.path}
                  onClick={() => setOpen(false)}
                  className="block py-2.5 text-[11px] uppercase tracking-[0.16em]"
                >
                  {link.label}
                </Link>
              ))}
              {isLoggedIn ? (
                <button
                  type="button"
                  onClick={async () => {
                    await signOut();
                    window.location.href = "/";
                  }}
                  className="block w-full py-2.5 text-left text-[11px] uppercase tracking-[0.16em]"
                >
                  Çıkış Yap
                </button>
              ) : null}
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function Header({
  themeSettings = defaultThemeCustomizerSettings,
  categories = [],
  collections = [],
}: {
  themeSettings?: ThemeCustomizerSettings;
  categories?: Category[];
  collections?: Collection[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { count, setIsOpen: setCartOpen } = useCart();
  const { isLoggedIn } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [desktopOpenMenuId, setDesktopOpenMenuId] = useState<string | null>(null);
  const [overHomeEditorial, setOverHomeEditorial] = useState(() => pathname === "/");

  const productPage = pathname.startsWith("/products/");
  const homePage = pathname === "/";
  const transparentProductHeader = productPage && !scrolled && !menuOpen && !searchOpen;
  const transparentHomeHeader = homePage && overHomeEditorial && !menuOpen && !searchOpen;
  const contrastHeader = transparentProductHeader || transparentHomeHeader;
  const menuControlColor = "#FBF3E6";
  const menuToneStyle = {
    "--ruth-menu-control-color": menuControlColor,
    "--ruth-menu-logo-filter": "brightness(0) invert(1)",
  } as CSSProperties;

  const categoryLinks = useMemo(
    () => categories.map((category) => ({
      label: category.name,
      path: categoryHref(category.public_slug || category.slug),
    })),
    [categories],
  );
  const collectionLinks = useMemo(
    () => orderedPhotoCollections(collections).map((collection) => ({
      label: collection.name,
      path: `/collections/${collection.slug}`,
    })),
    [collections],
  );
  const menuItems = useMemo<NavItem[]>(() => {
    const links = themeSettings.header.links.length
      ? themeSettings.header.links
      : defaultThemeCustomizerSettings.header.links;
    return links.map((item) => {
      const key = `${item.id} ${item.path} ${item.label}`.toLocaleLowerCase("tr-TR");
      if (
        item.path === "/categories" ||
        key.includes("kategori") ||
        key.includes("categor")
      ) return { ...item, children: uniqueChildren(categoryLinks) };
      if (
        item.path === "/collections" ||
        key.includes("koleksiyon") ||
        key.includes("collection")
      ) return { ...item, children: uniqueChildren(collectionLinks) };
      return item;
    });
  }, [categoryLinks, collectionLinks, themeSettings.header.links]);

  const activeItem =
    menuItems.find((item) => item.id === activeMenuId) ||
    menuItems.find((item) => item.children?.length) ||
    menuItems[0] ||
    null;

  useEffect(() => {
    const updateHeaderState = () => {
      setScrolled(window.scrollY > Math.min(220, window.innerWidth * 0.42));
      if (pathname !== "/") {
        setOverHomeEditorial(false);
        return;
      }
      const editorial = document.getElementById("home-editorial");
      const headerHeight = window.innerWidth >= 1024 ? 92 : 64;
      setOverHomeEditorial(
        Boolean(editorial && editorial.getBoundingClientRect().bottom > headerHeight),
      );
    };

    updateHeaderState();
    window.addEventListener("scroll", updateHeaderState, { passive: true });
    window.addEventListener("resize", updateHeaderState);
    return () => {
      window.removeEventListener("scroll", updateHeaderState);
      window.removeEventListener("resize", updateHeaderState);
    };
  }, [pathname]);

  useEffect(() => {
    setMenuOpen(false);
    setSearchOpen(false);
    setDesktopOpenMenuId(null);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) {
      setDesktopOpenMenuId(null);
      return;
    }
    const firstWithChildren = menuItems.find((item) => item.children?.length);
    setActiveMenuId(
      (current) => current || firstWithChildren?.id || menuItems[0]?.id || null,
    );
  }, [menuItems, menuOpen]);

  useEffect(() => {
    if (!menuOpen && !searchOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [menuOpen, searchOpen]);

  useEffect(() => {
    if (!menuOpen && !searchOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      setSearchOpen(false);
      setDesktopOpenMenuId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen, searchOpen]);

  const closeMenu = () => {
    setMenuOpen(false);
    setDesktopOpenMenuId(null);
  };
  const openSearchFromMenu = () => {
    closeMenu();
    setSearchOpen(true);
  };
  const openCartFromMenu = () => {
    closeMenu();
    setCartOpen(true);
  };
  const submitSearch = () => {
    const query = searchValue.trim();
    if (!query) return;
    setSearchOpen(false);
    router.push(`/products?search=${encodeURIComponent(query)}`);
  };

  return (
    <>
      <style>{`
        .site-app-shell{--announcement-height:0px!important}.has-announcement-bar{padding-top:0!important}.ruth-zara-header{height:64px;color:var(--rosta-cream);background:var(--rosta-carbon);border-bottom:1px solid color-mix(in srgb,var(--rosta-kraft) 24%,transparent);transition:background-color 450ms ease-in-out,border-color 450ms ease-in-out,box-shadow 450ms ease-in-out,backdrop-filter 450ms ease-in-out}.ruth-zara-header.is-scrolled{background:color-mix(in srgb,var(--rosta-carbon) 96%,transparent);border-color:color-mix(in srgb,var(--rosta-kraft) 42%,transparent);box-shadow:0 2px 18px color-mix(in srgb,var(--rosta-carbon) 44%,transparent);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px)}.ruth-zara-header.is-contrast{background:transparent;border-color:transparent;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none}.ruth-zara-header.is-contrast .ruth-zara-header-inner{color:var(--rosta-cream);mix-blend-mode:normal}.ruth-zara-header.is-contrast .header-wordmark{filter:brightness(0) invert(1)}.ruth-zara-header-inner{height:64px;padding-inline:16px}.ruth-zara-header-inner :where(button,a){color:inherit}.ruth-zara-header:not(.is-contrast) .ruth-zara-header-actions,.ruth-zara-header:not(.is-contrast) .ruth-zara-header-actions :where(button,a,svg){color:var(--rosta-cream)!important;stroke:currentColor!important;opacity:1!important}.ruth-zara-header.is-contrast .ruth-zara-header-actions button[aria-label="Ara"],.ruth-zara-header.is-contrast .ruth-zara-header-actions button[aria-label="Ara"] svg{color:var(--ruth-home-header-search-ink,var(--rosta-cream))!important;stroke:currentColor!important;opacity:1!important}.ruth-zara-header.is-contrast .ruth-zara-header-actions button[aria-label="Hesap menüsü"],.ruth-zara-header.is-contrast .ruth-zara-header-actions button[aria-label="Hesap menüsü"] svg{color:var(--ruth-home-header-account-ink,var(--rosta-cream))!important;stroke:currentColor!important;opacity:1!important}.ruth-zara-header.is-contrast .ruth-zara-header-actions button[aria-label^="Sepet"],.ruth-zara-header.is-contrast .ruth-zara-header-actions button[aria-label^="Sepet"] svg{color:var(--ruth-home-header-cart-ink,var(--rosta-cream))!important;stroke:currentColor!important;opacity:1!important}.header-wordmark-link{align-items:center}.header-wordmark{display:block;width:110px;height:auto;max-height:54px;filter:brightness(0) invert(1)}.ruth-zara-menu-slot{display:block;width:48px;height:64px}.ruth-zara-menu-button{display:flex;width:48px;height:64px;align-items:center;justify-content:flex-start;color:var(--rosta-cream);-webkit-tap-highlight-color:transparent}.ruth-zara-menu-button--contrast{color:var(--rosta-cream);mix-blend-mode:normal}.ruth-zara-menu-button--menu-open{color:var(--ruth-menu-control-color)!important;mix-blend-mode:normal!important}.ruth-zara-hamburger{position:relative;display:flex;width:32px;height:12px;flex-direction:column;justify-content:space-between}.site-app-shell .ruth-zara-menu-button .ruth-zara-hamburger>span{display:block!important}.site-app-shell .ruth-zara-menu-button .ruth-zara-hamburger::before,.site-app-shell .ruth-zara-menu-button .ruth-zara-hamburger::after{content:none!important;display:none!important}.ruth-zara-hamburger__line{display:block;width:100%;height:1px;background:currentColor;transform-origin:center;transition:transform 500ms ease-in-out}.ruth-zara-hamburger[data-open=true] .ruth-zara-hamburger__line--top{transform:translateY(5.5px) rotate(45deg)}.ruth-zara-hamburger[data-open=true] .ruth-zara-hamburger__line--bottom{transform:translateY(-5.5px) rotate(-45deg)}
        .ruth-zara-menu-surface{--ruth-menu-left:clamp(232px,calc(3.77vw + 200px),274px);--ruth-menu-right:clamp(272px,calc(5.75vw + 194px),304px);--ink:var(--rosta-cream);--cream:var(--rosta-carbon);--gold:var(--rosta-brick-b);--gold-dark:var(--rosta-brick-b);background:var(--rosta-carbon);color:var(--rosta-cream);font-family:var(--font-body)}.ruth-zara-menu-content{position:relative;width:100%;height:100%}.ruth-zara-menu-logo{position:absolute;top:15px;left:var(--ruth-menu-left);z-index:2;display:block;width:clamp(199px,14.6vw,281px);height:auto;aspect-ratio:1208/536}.ruth-zara-menu-logo img{display:block;width:100%;height:100%;filter:var(--ruth-menu-logo-filter,brightness(0));object-fit:contain;object-position:left center}.ruth-zara-menu-actions{position:absolute;top:28px;right:32px;z-index:3;width:135px;color:var(--ink);font-size:13px;font-weight:400;line-height:22px;text-align:right;text-transform:uppercase}.ruth-zara-menu-actions__search{display:flex;width:135px;height:28px;align-items:flex-start;justify-content:flex-end;padding-bottom:5px;border-bottom:1px solid currentColor}.ruth-zara-menu-actions__links{display:flex;margin-top:104px;flex-direction:column;align-items:flex-end}.ruth-zara-menu-actions__links>*{display:flex;min-height:32px;align-items:center;justify-content:flex-end;padding-block:5px}
        .ruth-zara-menu-desktop{position:absolute;top:175px;right:var(--ruth-menu-right);bottom:48px;left:calc(var(--ruth-menu-left) - 20px);display:grid;min-height:0;grid-template-columns:minmax(280px,360px) minmax(0,1fr);column-gap:clamp(28px,4vw,64px);overflow:hidden}.ruth-zara-desktop-accordion{min-width:0;overflow-y:auto;padding:0 8px 20px 20px;scrollbar-width:thin;scrollbar-color:transparent transparent}.ruth-zara-desktop-item{width:100%}.ruth-zara-desktop-row{display:grid;grid-template-columns:minmax(0,1fr) 34px;align-items:start;column-gap:8px;min-height:31px}.ruth-zara-desktop-link{display:block;min-width:0;color:var(--ink);font-family:var(--font-heading);font-size:24px;font-weight:900;line-height:25px;letter-spacing:-.04em;text-decoration:none;text-transform:uppercase;transition:color 180ms ease}.ruth-zara-desktop-toggle{display:grid;width:34px;height:31px;place-items:center;border:0;background:transparent;color:var(--ink);font-family:var(--font-body)}.ruth-zara-desktop-toggle span{display:block;font-size:24px;font-weight:400;line-height:24px;transform:translateY(-1px)}.ruth-zara-desktop-children{display:flex;overflow:hidden;flex-direction:column;padding:5px 38px 15px 16px}.ruth-zara-desktop-child{display:block;padding:4px 0;color:var(--ink);font-family:var(--font-body);font-size:12px;font-weight:400;line-height:18px;text-decoration:none;text-transform:uppercase;transition:color 180ms ease}.ruth-zara-main-tabs{position:relative;min-width:0;padding-left:20px}.ruth-zara-main-tab{position:relative;display:flex;width:max-content;max-width:100%;min-height:31px;align-items:flex-start;border:0;background:transparent;color:var(--ink);font-family:var(--font-heading);font-size:24px;font-weight:900;line-height:25px;letter-spacing:-.04em;text-align:left;text-transform:uppercase}.ruth-zara-main-tab__dot{position:absolute;top:10.5px;left:-20px;width:4px;height:4px;border-radius:50%;background:var(--gold)}.ruth-zara-menu-copy{min-width:0;overflow-y:auto;padding-right:8px;scrollbar-width:thin;scrollbar-color:transparent transparent}.ruth-zara-menu-copy__title{display:flex;min-height:36px;align-items:flex-start;color:var(--gold-dark);font-size:13px;font-weight:500;line-height:20px;text-transform:uppercase}.ruth-zara-menu-copy__group{display:grid;margin-top:32px;grid-template-columns:clamp(80px,8.8vw,120px) minmax(0,1fr);column-gap:clamp(12px,1.75vw,24px)}.ruth-zara-menu-copy__index{padding-top:8px;color:var(--gold-dark);font-size:11px;font-weight:400;line-height:16px;text-transform:uppercase}.ruth-zara-menu-copy__links{display:flex;min-width:0;flex-direction:column}.ruth-zara-menu-copy__link{display:flex;min-height:36px;align-items:center;padding:8px;color:var(--ink);font-size:13px;font-weight:400;line-height:20px;text-transform:uppercase;transition:color 180ms ease}
        .ruth-menu-collection-rail{display:flex;min-width:0;cursor:grab;overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain;scrollbar-width:none;-webkit-overflow-scrolling:touch}.ruth-menu-collection-rail::-webkit-scrollbar{display:none}.ruth-menu-collection-rail[data-dragging=true]{cursor:grabbing;user-select:none}.ruth-menu-collection-rail--desktop{height:max-content;gap:6px;padding:0 8px 8px}.ruth-menu-collection-card{display:block;width:clamp(34px,calc(14.7vw - 166px),116px);min-width:clamp(34px,calc(14.7vw - 166px),116px);color:var(--ink);text-decoration:none}.ruth-menu-collection-card__media{display:block;width:100%;aspect-ratio:2/3;overflow:hidden;background:var(--rosta-cream)}.ruth-menu-collection-card__media img{display:block;width:100%;height:100%;object-fit:cover;object-position:center;transition:transform 450ms ease-in-out;pointer-events:none}.ruth-menu-collection-card__label{display:block;margin-top:4px;font-size:clamp(8px,calc(.36vw + 3.1px),10px);font-weight:400;line-height:clamp(11px,calc(.695vw + 1.5px),14.87px);letter-spacing:clamp(.25px,calc(.088vw - .95px),.74px);overflow-wrap:anywhere;text-transform:uppercase}.ruth-zara-menu-mobile,.ruth-zara-menu-mobile-actions{display:none}
        @media(min-width:1024px){.ruth-zara-header{height:92px}.ruth-zara-header-inner{height:92px;padding-inline:32px}.header-wordmark{width:145px;max-height:72px}.ruth-zara-menu-slot,.ruth-zara-menu-button{width:80px;height:92px}.ruth-zara-hamburger{width:64px;height:16px}.ruth-zara-hamburger[data-open=true] .ruth-zara-hamburger__line--top{transform:translateY(7.5px) rotate(45deg)}.ruth-zara-hamburger[data-open=true] .ruth-zara-hamburger__line--bottom{transform:translateY(-7.5px) rotate(-45deg)}}
        @media(max-width:1023px){.ruth-zara-menu-actions,.ruth-zara-menu-desktop{display:none}.ruth-zara-menu-logo{top:70px;left:24px;width:clamp(224px,68vw,292px);height:auto;aspect-ratio:1208/536;min-width:0;min-height:0;max-width:292px;max-height:none}.ruth-zara-menu-mobile-actions{position:absolute;top:8px;right:8px;z-index:3;display:flex;height:48px;align-items:center}.ruth-zara-menu-mobile-actions>*{display:grid;width:44px;height:44px;place-items:center}.ruth-zara-menu-mobile{display:block;height:100%;overflow-y:auto;padding:174px 0 calc(42px + env(safe-area-inset-bottom))}.ruth-zara-menu-mobile .ruth-zara-main-tabs{padding-inline:36px 18px}.ruth-zara-menu-mobile .ruth-zara-main-tab{min-height:31px;font-size:24px;line-height:25px}.ruth-zara-menu-mobile .ruth-zara-main-tab__dot{left:-20px}.ruth-menu-collection-rail--mobile{gap:8px;margin-top:34px;padding-inline:16px}.ruth-menu-collection-rail--mobile .ruth-menu-collection-card{width:92px;min-width:92px}.ruth-zara-menu-mobile-panel{margin-top:58px;padding-inline:16px}.ruth-zara-menu-mobile-panel .ruth-zara-menu-copy__title{min-height:auto;letter-spacing:.26em}.ruth-zara-menu-mobile-panel .ruth-zara-menu-copy__group{margin-top:32px;grid-template-columns:120px minmax(0,1fr);column-gap:18px}.ruth-zara-menu-mobile-panel .ruth-zara-menu-copy__link{padding-inline:0}}
        @media(hover:hover) and (pointer:fine){.ruth-zara-desktop-accordion:hover{scrollbar-color:color-mix(in srgb,var(--gold) 45%,transparent) transparent}.ruth-zara-desktop-link:hover{color:var(--gold)}.ruth-zara-desktop-child:hover{color:var(--gold)}.ruth-zara-menu-copy:hover{scrollbar-color:color-mix(in srgb,var(--gold) 48%,transparent) transparent}.ruth-zara-menu-copy__link:hover{color:var(--gold)}.ruth-menu-collection-card:hover .ruth-menu-collection-card__media img{transform:scale(1.025)}}
        .ruth-zara-header :where(button,a):focus-visible,.ruth-zara-menu-surface :where(button,a):focus-visible{outline:2px solid var(--rosta-brick-b);outline-offset:2px}
        @media(forced-colors:active){.ruth-zara-header :where(button,a):focus-visible,.ruth-zara-menu-surface :where(button,a):focus-visible{outline:2px solid Highlight}}
        @media(prefers-reduced-motion:reduce){.ruth-zara-header,.ruth-zara-hamburger__line,.ruth-menu-collection-card__media img{transition-duration:1ms}}
      `}</style>

      {!searchOpen ? (
        <button
          type="button"
          onClick={() => setMenuOpen((current) => !current)}
          className={`ruth-zara-menu-button fixed left-4 top-0 z-[130] lg:left-8 ${contrastHeader ? "ruth-zara-menu-button--contrast" : ""} ${menuOpen ? "ruth-zara-menu-button--menu-open" : ""}`}
          style={menuOpen ? menuToneStyle : undefined}
          aria-label={menuOpen ? "Menüyü kapat" : "Menüyü aç"}
          aria-expanded={menuOpen}
          aria-haspopup="dialog"
          aria-controls="ruth-category-menu"
        >
          <ZaraMenuIcon open={menuOpen} />
        </button>
      ) : null}

      <header
        data-menu-open={menuOpen ? "true" : "false"}
        className={`ruth-zara-header fixed inset-x-0 top-0 z-[80] w-full ${transparentProductHeader ? "product-header-transparent" : ""} ${contrastHeader ? "is-contrast" : ""} ${scrolled && !contrastHeader ? "is-scrolled" : ""}`}
      >
        <div className="ruth-zara-header-inner grid w-full grid-cols-[1fr_auto_1fr] items-center">
          <span className="ruth-zara-menu-slot" aria-hidden="true" />
          <Link
            href="/"
            className="header-wordmark-link flex justify-center"
            aria-label="Rosta Coffee Co ana sayfa"
          >
            <img
              src={ROSTA_WORDMARK_SRC}
              alt=""
              className="header-wordmark object-contain"
            />
          </Link>
          <div className="ruth-zara-header-actions flex items-center justify-end gap-0.5 sm:gap-1">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="grid h-10 w-10 place-items-center"
              aria-label="Ara"
            >
              <Search size={19} strokeWidth={1.35} />
            </button>
            <AccountMenu />
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="relative grid h-10 w-10 place-items-center"
              aria-label={`Sepet${count ? `, ${count} ürün` : ""}`}
            >
              <ShoppingBag size={20} strokeWidth={1.35} />
              {count > 0 ? (
                <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-brick px-1 text-[8px] font-semibold text-white">
                  {count}
                </span>
              ) : null}
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {menuOpen ? (
          <motion.div
            id="ruth-category-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Kategori menüsü"
            className="ruth-zara-menu-surface fixed inset-0 z-[100] overflow-hidden"
            style={menuToneStyle}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: "easeInOut" }}
          >
            <motion.div
              className="ruth-zara-menu-content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: "easeIn" }}
            >
              <Link
                href="/"
                onClick={closeMenu}
                className="ruth-zara-menu-logo"
                aria-label="Rosta Coffee Co menü anasayfa"
              >
                <img src={ROSTA_WORDMARK_SRC} alt="" />
              </Link>

              <div className="ruth-zara-menu-actions">
                <button
                  type="button"
                  onClick={openSearchFromMenu}
                  className="ruth-zara-menu-actions__search"
                >
                  Ara
                </button>
                <div className="ruth-zara-menu-actions__links">
                  <button type="button" onClick={openCartFromMenu}>Sepet&nbsp; | {count}</button>
                  <Link href={isLoggedIn ? "/account" : "/login"} onClick={closeMenu}>
                    {isLoggedIn ? "Hesabım" : "Giriş Yap"}
                  </Link>
                  <Link href="/faq" onClick={closeMenu}>Yardım</Link>
                </div>
              </div>

              <div className="ruth-zara-menu-mobile-actions">
                <Link
                  href={isLoggedIn ? "/account" : "/login"}
                  onClick={closeMenu}
                  aria-label={isLoggedIn ? "Hesabım" : "Giriş yap"}
                >
                  <UserRound size={21} strokeWidth={1.3} />
                </Link>
                <button type="button" onClick={openSearchFromMenu} aria-label="Ara">
                  <Search size={22} strokeWidth={1.3} />
                </button>
                <button
                  type="button"
                  onClick={openCartFromMenu}
                  aria-label={`Sepet, ${count} ürün`}
                  className="relative"
                >
                  <ShoppingBag size={22} strokeWidth={1.3} />
                  <span className="absolute right-1 top-1 text-[8px]">{count}</span>
                </button>
              </div>

              <div className="ruth-zara-menu-desktop">
                <DesktopMenuAccordion
                  items={menuItems}
                  openId={desktopOpenMenuId}
                  setOpenId={setDesktopOpenMenuId}
                  closeMenu={closeMenu}
                />
                <PhotoCollectionsRail
                  collections={collections}
                  closeMenu={closeMenu}
                  placement="desktop"
                />
              </div>

              <nav className="ruth-zara-menu-mobile" aria-label="Mobil menü">
                <MainMenuTabs
                  items={menuItems}
                  activeId={activeItem?.id || null}
                  setActiveId={setActiveMenuId}
                  panelId="ruth-zara-active-panel-mobile"
                  layoutScope="mobile"
                />
                <PhotoCollectionsRail
                  collections={collections}
                  closeMenu={closeMenu}
                  placement="mobile"
                />
                <div
                  id="ruth-zara-active-panel-mobile"
                  role="tabpanel"
                  className="ruth-zara-menu-mobile-panel"
                >
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={activeItem?.id || "empty"}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.4, ease: "easeIn" }}
                    >
                      <MenuLinkPanel item={activeItem} closeMenu={closeMenu} />
                    </motion.div>
                  </AnimatePresence>
                </div>
              </nav>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {searchOpen ? (
          <motion.div
            className="fixed inset-0 z-[110] bg-carbon px-5 text-cream sm:px-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button
              type="button"
              onClick={() => setSearchOpen(false)}
              className="absolute right-5 top-5 grid h-12 w-12 place-items-center rounded-full active:bg-brick/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brick sm:right-8 sm:top-7"
              aria-label="Aramayı kapat"
            >
              <X size={26} strokeWidth={1.1} />
            </button>
            <div className="mx-auto max-w-4xl pt-28 sm:pt-36">
              <p className="mb-7 text-[10px] uppercase tracking-[0.22em] text-cream/55">Ara</p>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  submitSearch();
                }}
                className="flex items-center border-b border-kraft/45 pb-4 focus-within:border-brick"
              >
                <Search className="mr-4" size={22} strokeWidth={1.2} />
                <input
                  autoFocus
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  placeholder="Ne arıyorsunuz?"
                  className="w-full bg-transparent text-[clamp(1.6rem,4vw,3.5rem)] font-normal text-cream outline-none placeholder:text-cream/35"
                />
              </form>
              <div className="mt-10 grid grid-cols-2 gap-x-8 sm:grid-cols-3 lg:grid-cols-4">
                {categoryLinks.slice(0, 12).map((item) => (
                  <Link
                    key={item.path}
                    href={item.path}
                    onClick={() => setSearchOpen(false)}
                    className="border-b border-kraft/30 py-4 text-[10px] uppercase tracking-[0.14em] text-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brick"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
