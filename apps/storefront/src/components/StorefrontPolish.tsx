"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  defaultThemeCustomizerSettings,
  type ThemeCustomizerSettings,
} from "@/lib/themeCustomizer";

type HeaderTone = "dark" | "light" | "adaptive";

function normalize(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function hasChildrenHint(label: string, path: string) {
  const key = normalize(`${label} ${path}`);
  return (
    path === "/categories" ||
    path === "/collections" ||
    key.includes("kategori") ||
    key.includes("category") ||
    key.includes("koleksiyon") ||
    key.includes("collection")
  );
}

export function StorefrontPolish({
  themeSettings,
}: {
  themeSettings: ThemeCustomizerSettings;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [headerTone, setHeaderTone] = useState<HeaderTone>("adaptive");

  const menuLinks = useMemo(() => {
    const source = themeSettings.header.links.length
      ? themeSettings.header.links
      : defaultThemeCustomizerSettings.header.links;
    return source.map((item) => ({
      label: item.label,
      path: item.path,
      key: normalize(item.label),
      hasChildren: hasChildrenHint(item.label, item.path),
    }));
  }, [themeSettings.header.links]);

  useEffect(() => {
    const html = document.documentElement;
    const productPage = pathname.startsWith("/products/");
    html.classList.toggle("ruth-product-page-active", productPage);
    if (!productPage) {
      html.removeAttribute("data-product-header-tone");
      setHeaderTone("adaptive");
    } else {
      html.dataset.productHeaderTone = headerTone;
    }
    return () => {
      html.classList.remove("ruth-product-page-active");
      html.removeAttribute("data-product-header-tone");
    };
  }, [headerTone, pathname]);

  useEffect(() => {
    const onTone = (event: Event) => {
      const custom = event as CustomEvent<{ tone?: HeaderTone }>;
      const tone = custom.detail?.tone;
      if (tone === "dark" || tone === "light" || tone === "adaptive") {
        setHeaderTone(tone);
      }
    };
    window.addEventListener("ruth:product-header-tone", onTone);
    return () => window.removeEventListener("ruth:product-header-tone", onTone);
  }, []);

  useEffect(() => {
    const closeMenu = () => {
      document
        .querySelector<HTMLButtonElement>('button[aria-label="Menüyü kapat"]')
        ?.click();
    };

    const removeInlineSubmenus = (except?: HTMLElement | null) => {
      document
        .querySelectorAll<HTMLElement>(".ruth-zara-inline-submenu")
        .forEach((submenu) => {
          if (submenu !== except) submenu.remove();
        });
      document
        .querySelectorAll<HTMLElement>(".ruth-zara-main-tab__plus[data-open='true']")
        .forEach((plus) => {
          if (!except || plus.closest(".ruth-zara-main-tab")?.nextElementSibling !== except) {
            plus.dataset.open = "false";
            plus.textContent = "+";
          }
        });
    };

    const enhanceTabs = () => {
      document
        .querySelectorAll<HTMLButtonElement>(".ruth-zara-main-tab")
        .forEach((tab) => {
          const rawLabel = Array.from(tab.childNodes)
            .map((node) => node.textContent || "")
            .join(" ")
            .replace(/\+/g, " ")
            .replace(/−/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          const key = normalize(rawLabel);
          const item =
            menuLinks.find((link) => link.key === key) ||
            menuLinks.find(
              (link) => key.includes(link.key) || link.key.includes(key),
            );

          if (key.includes("yenigelen")) {
            tab.dataset.removedFromMenu = "true";
            tab.setAttribute("aria-hidden", "true");
            tab.tabIndex = -1;
            return;
          }

          delete tab.dataset.removedFromMenu;
          tab.removeAttribute("aria-hidden");
          tab.tabIndex = 0;
          if (!item) return;
          tab.dataset.menuHref = item.path;
          tab.dataset.menuLabel = item.label;

          if (item.hasChildren && !tab.querySelector(".ruth-zara-main-tab__plus")) {
            const plus = document.createElement("span");
            plus.className = "ruth-zara-main-tab__plus";
            plus.setAttribute("role", "button");
            plus.setAttribute("aria-label", `${item.label} alt başlıklarını aç`);
            plus.setAttribute("tabindex", "0");
            plus.dataset.open = "false";
            plus.textContent = "+";
            tab.appendChild(plus);
          }
        });
    };

    const openMobileInlinePanel = (tab: HTMLButtonElement, plus: HTMLElement) => {
      const existing = tab.nextElementSibling as HTMLElement | null;
      if (existing?.classList.contains("ruth-zara-inline-submenu")) {
        existing.remove();
        plus.dataset.open = "false";
        plus.textContent = "+";
        return;
      }

      removeInlineSubmenus();
      tab.focus();
      tab.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));

      window.setTimeout(() => {
        const links = document.querySelector<HTMLElement>(
          "#ruth-zara-active-panel-mobile .ruth-zara-menu-copy__links",
        );
        if (!links) return;

        const submenu = document.createElement("div");
        submenu.className = "ruth-zara-inline-submenu";
        const clonedLinks = links.cloneNode(true) as HTMLElement;
        clonedLinks
          .querySelectorAll<HTMLAnchorElement>("a[href]")
          .forEach((link) => link.addEventListener("click", closeMenu));
        submenu.appendChild(clonedLinks);
        tab.insertAdjacentElement("afterend", submenu);
        plus.dataset.open = "true";
        plus.textContent = "−";
      }, 70);
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const collectionCard = target.closest<HTMLAnchorElement>(
        ".ruth-menu-collection-card",
      );
      if (collectionCard && collectionCard.dataset.pointerMoved !== "true") {
        event.preventDefault();
        event.stopPropagation();
        closeMenu();
        router.push(collectionCard.getAttribute("href") || "/collections");
        return;
      }

      const plus = target.closest<HTMLElement>(".ruth-zara-main-tab__plus");
      if (plus) {
        event.preventDefault();
        event.stopPropagation();
        const tab = plus.closest<HTMLButtonElement>(".ruth-zara-main-tab");
        if (!tab) return;
        if (tab.closest(".ruth-zara-menu-mobile")) {
          openMobileInlinePanel(tab, plus);
        } else {
          tab.focus();
          tab.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        }
        return;
      }

      const tab = target.closest<HTMLButtonElement>(".ruth-zara-main-tab");
      const href = tab?.dataset.menuHref;
      if (!tab || !href || tab.dataset.removedFromMenu === "true") return;
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
      router.push(href);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.classList.contains("ruth-zara-main-tab__plus")) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      target.click();
    };

    const pointerStart = new WeakMap<Element, { x: number; y: number }>();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const card = target.closest<HTMLElement>(".ruth-menu-collection-card");
      if (!card) return;
      pointerStart.set(card, { x: event.clientX, y: event.clientY });
      card.dataset.pointerMoved = "false";
    };
    const onPointerMove = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const card = target.closest<HTMLElement>(".ruth-menu-collection-card");
      if (!card) return;
      const start = pointerStart.get(card);
      if (!start) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 7) {
        card.dataset.pointerMoved = "true";
      }
    };

    enhanceTabs();
    const observer = new MutationObserver(enhanceTabs);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointermove", onPointerMove, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointermove", onPointerMove, true);
    };
  }, [menuLinks, router]);

  return (
    <style>{`
      .ruth-zara-main-tab[data-removed-from-menu="true"]{display:none!important}.ruth-zara-main-tab{gap:12px}.ruth-zara-main-tab__plus{display:inline-grid;width:22px;height:22px;flex:0 0 22px;place-items:center;margin-top:1px;border:1px solid color-mix(in srgb,var(--rosta-kraft) 46%,transparent);border-radius:50%;font-family:var(--font-body)!important;font-size:15px;font-weight:300;line-height:1;letter-spacing:0;transition:transform 260ms cubic-bezier(.22,1,.36,1),border-color 220ms ease}.ruth-zara-main-tab__plus:focus-visible{border-color:var(--rosta-brick-b);transform:rotate(90deg);outline:2px solid var(--rosta-brick-b);outline-offset:2px}@media(hover:hover) and (pointer:fine){.ruth-zara-main-tab__plus:hover{border-color:var(--rosta-brick-b);transform:rotate(90deg)}}.ruth-zara-main-tab__plus[data-open="true"]{border-color:var(--rosta-brick-b)}.ruth-zara-menu-logo{width:clamp(270px,21vw,410px)!important;height:clamp(105px,8.5vw,165px)!important;max-width:410px!important;max-height:165px!important}html.ruth-product-page-active .ruth-zara-header{background:transparent!important;border-color:transparent!important;box-shadow:none!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important}html.ruth-product-page-active .ruth-zara-header-inner,html.ruth-product-page-active .ruth-zara-menu-button{transition:color 320ms ease,filter 320ms ease,transform 440ms cubic-bezier(.22,1,.36,1)!important}html.ruth-product-page-active[data-product-header-tone="dark"] .ruth-zara-header-inner,html.ruth-product-page-active[data-product-header-tone="dark"] .ruth-zara-menu-button{color:var(--rosta-carbon)!important;mix-blend-mode:normal!important}html.ruth-product-page-active[data-product-header-tone="dark"] .header-wordmark{filter:brightness(0)!important}html.ruth-product-page-active[data-product-header-tone="light"] .ruth-zara-header-inner,html.ruth-product-page-active[data-product-header-tone="light"] .ruth-zara-menu-button{color:var(--rosta-cream)!important;mix-blend-mode:normal!important}html.ruth-product-page-active[data-product-header-tone="light"] .header-wordmark{filter:brightness(0) invert(1)!important}html.ruth-product-page-active[data-product-header-tone="adaptive"] .ruth-zara-header-inner,html.ruth-product-page-active[data-product-header-tone="adaptive"] .ruth-zara-menu-button{color:var(--rosta-cream)!important;mix-blend-mode:difference!important}html[data-product-page-slide="next"] :is(.ruth-zara-header,.ruth-zara-menu-button,.whatsapp-floating-bubble,.rewards-floating-bubble){transform:translate3d(-100vw,0,0)!important;transition:transform 440ms cubic-bezier(.22,1,.36,1)!important}html[data-product-page-slide="previous"] :is(.ruth-zara-header,.ruth-zara-menu-button,.whatsapp-floating-bubble,.rewards-floating-bubble){transform:translate3d(100vw,0,0)!important;transition:transform 440ms cubic-bezier(.22,1,.36,1)!important}@keyframes ruth-global-enter-next{from{transform:translate3d(100vw,0,0)}to{transform:translate3d(0,0,0)}}@keyframes ruth-global-enter-previous{from{transform:translate3d(-100vw,0,0)}to{transform:translate3d(0,0,0)}}html[data-product-page-enter="next"] :is(.ruth-zara-header,.ruth-zara-menu-button,.whatsapp-floating-bubble,.rewards-floating-bubble){animation:ruth-global-enter-next 440ms cubic-bezier(.22,1,.36,1) both}html[data-product-page-enter="previous"] :is(.ruth-zara-header,.ruth-zara-menu-button,.whatsapp-floating-bubble,.rewards-floating-bubble){animation:ruth-global-enter-previous 440ms cubic-bezier(.22,1,.36,1) both}@media(max-width:1023px){.ruth-zara-menu-logo{top:60px!important;left:12px!important;width:min(82vw,340px)!important;height:108px!important;max-width:340px!important;max-height:108px!important}.ruth-zara-menu-mobile{padding-top:178px!important}.ruth-zara-menu-mobile-panel{display:none!important}.ruth-zara-menu-mobile .ruth-zara-main-tabs{display:flex!important;flex-direction:column!important}.ruth-zara-inline-submenu{width:100%;overflow:hidden;padding:4px 18px 15px 48px;animation:ruth-inline-menu-in 300ms cubic-bezier(.22,1,.36,1) both}.ruth-zara-inline-submenu .ruth-zara-menu-copy__links{display:flex;flex-direction:column;border-left:1px solid var(--ruth-color-border-subtle);padding-left:14px}.ruth-zara-inline-submenu .ruth-zara-menu-copy__link{min-height:34px;padding:7px 0;font-size:11px;letter-spacing:.08em}.ruth-menu-collection-rail--mobile{margin-top:22px!important}}@keyframes ruth-inline-menu-in{from{height:0;opacity:0;transform:translateY(-8px)}to{height:auto;opacity:1;transform:translateY(0)}}@media(prefers-reduced-motion:reduce){.ruth-zara-main-tab__plus,html.ruth-product-page-active .ruth-zara-header-inner,html.ruth-product-page-active .ruth-zara-menu-button{transition-duration:1ms!important}html[data-product-page-enter] :is(.ruth-zara-header,.ruth-zara-menu-button,.whatsapp-floating-bubble,.rewards-floating-bubble){animation-duration:1ms!important}}
    `}</style>
  );
}
