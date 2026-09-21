"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { categoryHref } from "@/lib/catalogCategories";
import {
  defaultThemeCustomizerSettings,
  type ThemeCustomizerSettings,
  type ThemeNavItem,
} from "@/lib/themeCustomizer";
import type { Category, Collection } from "@/types/site";

type NavChild = { label: string; path: string };
type AccordionItem = ThemeNavItem & { children?: NavChild[] };

const COLLECTION_ORDER = [
  "ruthatelier",
  "ateliersetleri",
  "sunkissed",
  "nazar",
  "handmadespecials",
  "arya",
  "mantra",
  "huna",
];

function uniqueChildren(items: NavChild[]) {
  const byPath = new Map<string, NavChild>();
  for (const item of items) {
    const key = item.path.replace(/\/+$/, "").toLocaleLowerCase("tr-TR");
    if (!byPath.has(key)) byPath.set(key, item);
  }
  return [...byPath.values()];
}

function collectionKey(collection: Collection) {
  return collection.slug
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function orderedCollections(collections: Collection[]) {
  return collections
    .map((item, sourceIndex) => ({ item, sourceIndex }))
    .sort((a, b) => {
      const aIndex = COLLECTION_ORDER.indexOf(collectionKey(a.item));
      const bIndex = COLLECTION_ORDER.indexOf(collectionKey(b.item));
      const safeA = aIndex === -1 ? COLLECTION_ORDER.length + a.sourceIndex : aIndex;
      const safeB = bIndex === -1 ? COLLECTION_ORDER.length + b.sourceIndex : bIndex;
      return safeA - safeB;
    })
    .map(({ item }) => item);
}

export function MobileMenuAccordion({
  themeSettings = defaultThemeCustomizerSettings,
  categories = [],
  collections = [],
}: {
  themeSettings?: ThemeCustomizerSettings;
  categories?: Category[];
  collections?: Collection[];
}) {
  const pathname = usePathname();
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const orderedCollectionItems = useMemo(
    () => orderedCollections(collections),
    [collections],
  );

  const photoCollections = useMemo(
    () => orderedCollectionItems.filter((collection) => Boolean(collection.cover_image_url)),
    [orderedCollectionItems],
  );

  const items = useMemo<AccordionItem[]>(() => {
    const categoryLinks = categories.map((category) => ({
      label: category.name,
      path: categoryHref(category.public_slug || category.slug),
    }));
    const collectionLinks = orderedCollectionItems.map((collection) => ({
      label: collection.name,
      path: `/collections/${collection.slug}`,
    }));
    const links = themeSettings.header.links.length
      ? themeSettings.header.links
      : defaultThemeCustomizerSettings.header.links;

    return links.map((item) => {
      const key = `${item.id} ${item.path} ${item.label}`.toLocaleLowerCase("tr-TR");
      if (
        item.path === "/categories" ||
        key.includes("kategori") ||
        key.includes("categor")
      ) {
        return { ...item, children: uniqueChildren(categoryLinks) };
      }
      if (
        item.path === "/collections" ||
        key.includes("koleksiyon") ||
        key.includes("collection")
      ) {
        return { ...item, children: uniqueChildren(collectionLinks) };
      }
      return item;
    });
  }, [categories, orderedCollectionItems, themeSettings.header.links]);

  useEffect(() => {
    const sync = () => {
      const target = document.querySelector<HTMLElement>(".ruth-zara-menu-surface");
      setPortalTarget((current) => (current === target ? current : target));
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!portalTarget) return;
    portalTarget.classList.add("has-link-accordion");
    return () => portalTarget.classList.remove("has-link-accordion");
  }, [portalTarget]);

  useEffect(() => {
    setExpanded({});
  }, [pathname]);

  if (!portalTarget) return null;

  return createPortal(
    <nav className="ruth-mobile-link-accordion" aria-label="Mobil menü bağlantıları">
      <style>{`
        @media(min-width:1024px){
          .ruth-mobile-link-accordion{display:none!important}
          .ruth-zara-menu-surface .ruth-zara-panel__inner{
            grid-template-columns:minmax(0,1fr) clamp(440px,43vw,720px)!important;
          }
          .ruth-zara-menu-surface .ruth-menu-collection-rail--desktop{
            gap:12px!important;
            padding:8px!important;
          }
          .ruth-zara-menu-surface .ruth-menu-collection-rail--desktop .ruth-menu-collection-card{
            width:clamp(154px,11.5vw,198px)!important;
            min-width:clamp(154px,11.5vw,198px)!important;
          }
          .ruth-zara-menu-surface .ruth-menu-collection-rail--desktop .ruth-menu-collection-card__label{
            margin-top:7px!important;
            font-size:10px!important;
            line-height:14px!important;
            letter-spacing:.45px!important;
          }
        }
        @media(max-width:1023px){
          .ruth-zara-menu-surface.has-link-accordion .ruth-zara-menu-mobile{display:none!important}
          .ruth-mobile-link-accordion{
            position:absolute;
            inset:174px 0 0;
            z-index:2;
            overflow-x:hidden;
            overflow-y:auto;
            padding:0 0 calc(42px + env(safe-area-inset-bottom));
            background:var(--ivory)!important;
            color:var(--ink);
            -webkit-overflow-scrolling:touch;
            overscroll-behavior:contain;
          }
          .ruth-mobile-link-accordion__links{
            padding:0 18px 0 36px;
            background:var(--ivory)!important;
          }
          .ruth-mobile-link-accordion__item,
          .ruth-mobile-link-accordion__row,
          .ruth-mobile-link-accordion__title,
          .ruth-mobile-link-accordion__toggle,
          .ruth-mobile-link-accordion__children,
          .ruth-mobile-link-accordion__children-inner,
          .ruth-mobile-link-accordion__child{
            background:var(--ivory)!important;
          }
          .ruth-mobile-link-accordion__item{border:0}
          .ruth-mobile-link-accordion__row{
            display:grid;
            grid-template-columns:minmax(0,1fr) 42px;
            align-items:start;
            min-height:31px;
          }
          .ruth-mobile-link-accordion__title{
            display:flex;
            min-height:31px;
            align-items:flex-start;
            color:var(--ink);
            font-family:"Times New Roman",Georgia,serif!important;
            font-size:24px;
            font-weight:400;
            line-height:25px;
            letter-spacing:-1px;
            text-transform:uppercase;
            text-decoration:none;
          }
          .ruth-mobile-link-accordion__toggle{
            display:grid;
            width:42px;
            height:31px;
            place-items:center;
            border:0;
            color:var(--ink);
            -webkit-tap-highlight-color:transparent;
          }
          .ruth-mobile-link-accordion__toggle svg{
            width:20px;
            height:20px;
            transition:transform 220ms ease;
          }
          .ruth-mobile-link-accordion__toggle[aria-expanded="true"] svg{transform:rotate(45deg)}
          .ruth-mobile-link-accordion__children{
            display:grid;
            grid-template-rows:0fr;
            transition:grid-template-rows 260ms cubic-bezier(.22,1,.36,1);
          }
          .ruth-mobile-link-accordion__children[data-open="true"]{grid-template-rows:1fr}
          .ruth-mobile-link-accordion__children-inner{min-height:0;overflow:hidden;padding-left:0}
          .ruth-mobile-link-accordion__child{
            display:flex;
            min-height:34px;
            align-items:center;
            padding:6px 0 6px 18px;
            color:var(--ink);
            font-size:11px;
            font-weight:300;
            line-height:20px;
            letter-spacing:.08em;
            text-transform:uppercase;
            text-decoration:none;
          }
          .ruth-mobile-link-accordion__children-inner>.ruth-mobile-link-accordion__child:first-child{padding-top:12px}
          .ruth-mobile-link-accordion__children-inner>.ruth-mobile-link-accordion__child:last-child{padding-bottom:20px}
          .ruth-mobile-photo-collections{
            display:flex;
            gap:8px;
            margin-top:34px;
            padding:0 16px 8px;
            overflow-x:auto;
            overflow-y:hidden;
            background:var(--ivory)!important;
            overscroll-behavior-x:contain;
            scrollbar-width:none;
            -webkit-overflow-scrolling:touch;
          }
          .ruth-mobile-photo-collections::-webkit-scrollbar{display:none}
          .ruth-mobile-photo-collection-card{
            display:block;
            width:92px;
            min-width:92px;
            color:var(--ink);
            background:var(--ivory)!important;
            text-decoration:none;
          }
          .ruth-mobile-photo-collection-card__media{
            display:block;
            width:100%;
            aspect-ratio:2/3;
            overflow:hidden;
            background:var(--cream);
          }
          .ruth-mobile-photo-collection-card__media img{
            display:block;
            width:100%;
            height:100%;
            object-fit:cover;
            object-position:center;
          }
          .ruth-mobile-photo-collection-card__label{
            display:block;
            margin-top:4px;
            color:var(--ink);
            background:var(--ivory)!important;
            font-size:9px;
            font-weight:300;
            line-height:13px;
            letter-spacing:.35px;
            overflow-wrap:anywhere;
            text-transform:uppercase;
          }
        }
        @media(prefers-reduced-motion:reduce){
          .ruth-mobile-link-accordion__children,
          .ruth-mobile-link-accordion__toggle svg{transition-duration:1ms!important}
        }
      `}</style>

      <div className="ruth-mobile-link-accordion__links">
        {items.map((item) => {
          const children = item.children || [];
          const open = Boolean(expanded[item.id]);
          const panelId = `ruth-mobile-submenu-${item.id}`;
          return (
            <section key={item.id} className="ruth-mobile-link-accordion__item">
              <div className="ruth-mobile-link-accordion__row">
                <Link href={item.path} className="ruth-mobile-link-accordion__title">
                  {item.label}
                </Link>
                {children.length ? (
                  <button
                    type="button"
                    className="ruth-mobile-link-accordion__toggle"
                    aria-label={`${item.label} alt başlıklarını ${open ? "kapat" : "aç"}`}
                    aria-expanded={open}
                    aria-controls={panelId}
                    onClick={() =>
                      setExpanded((current) => ({ ...current, [item.id]: !current[item.id] }))
                    }
                  >
                    <Plus size={20} strokeWidth={1.25} />
                  </button>
                ) : (
                  <span aria-hidden="true" />
                )}
              </div>

              {children.length ? (
                <div
                  id={panelId}
                  className="ruth-mobile-link-accordion__children"
                  data-open={open ? "true" : "false"}
                >
                  <div className="ruth-mobile-link-accordion__children-inner">
                    {children.map((child) => (
                      <Link
                        key={child.path}
                        href={child.path}
                        className="ruth-mobile-link-accordion__child"
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>

      {photoCollections.length ? (
        <div className="ruth-mobile-photo-collections" aria-label="Fotoğraflı koleksiyonlar">
          {photoCollections.map((collection) => (
            <Link
              key={collection.id}
              href={`/collections/${collection.slug}`}
              className="ruth-mobile-photo-collection-card"
            >
              <span className="ruth-mobile-photo-collection-card__media">
                <img
                  src={collection.cover_image_url || ""}
                  alt=""
                  loading="eager"
                  decoding="async"
                  draggable={false}
                />
              </span>
              <span className="ruth-mobile-photo-collection-card__label">
                {collection.name}
              </span>
            </Link>
          ))}
        </div>
      ) : null}
    </nav>,
    portalTarget,
  );
}
