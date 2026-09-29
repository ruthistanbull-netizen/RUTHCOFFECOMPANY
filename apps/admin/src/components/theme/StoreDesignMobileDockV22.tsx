"use client";

import {
  Eye,
  History,
  Images,
  Layout,
  LayoutTemplate,
  Link2,
  MoreHorizontal,
  Plus,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";

type Props = {
  mode: "browse" | "edit";
  structureOpen: boolean;
  inspectorOpen: boolean;
  hasSelection: boolean;
  structureButtonRef?: RefObject<HTMLButtonElement | null>;
  editButtonRef?: RefObject<HTMLButtonElement | null>;
  onPreview: () => void;
  onStructure: () => void;
  onAdd: () => void;
  onEdit: () => void;
  onOpenMedia: () => void;
  onOpenTemplates: () => void;
  onOpenRedirects: () => void;
  onOpenPages: () => void;
  onOpenHistory: () => void;
};

export function StoreDesignMobileDockV22({
  mode,
  structureOpen,
  inspectorOpen,
  hasSelection,
  structureButtonRef,
  editButtonRef,
  onPreview,
  onStructure,
  onAdd,
  onEdit,
  onOpenMedia,
  onOpenTemplates,
  onOpenRedirects,
  onOpenPages,
  onOpenHistory,
}: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!moreOpen) return;
    const close = (event: PointerEvent) => {
      const node = event.target instanceof Node ? event.target : null;
      if (node && rootRef.current?.contains(node)) return;
      setMoreOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    window.document.addEventListener("pointerdown", close, true);
    window.document.addEventListener("keydown", key, true);
    return () => {
      window.document.removeEventListener("pointerdown", close, true);
      window.document.removeEventListener("keydown", key, true);
    };
  }, [moreOpen]);

  const itemClass = "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold";
  const active = (value: boolean) => value ? "is-active" : "";

  const open = (action: () => void) => {
    setMoreOpen(false);
    action();
  };

  return (
    <nav className="sd-mobile-dock sd-v22-mobile-dock hidden" aria-label="Mağaza tasarımı araçları">
      <button type="button" className={`${itemClass} ${active(mode === "browse" && !structureOpen && !inspectorOpen)}`} onClick={onPreview}>
        <Eye className="h-5 w-5" /><span>Önizle</span>
      </button>
      <button ref={structureButtonRef} type="button" className={`${itemClass} ${active(structureOpen)}`} onClick={onStructure}>
        <Layout className="h-5 w-5" /><span>Yapı</span>
      </button>
      <button type="button" className={itemClass} onClick={onAdd}>
        <span className="sd-v22-mobile-add grid h-8 w-8 -mt-3 place-items-center rounded-full"><Plus className="h-[18px] w-[18px]" /></span>
        <span>Ekle</span>
      </button>
      <button ref={editButtonRef} type="button" className={`${itemClass} ${active(inspectorOpen || (mode === "edit" && hasSelection))}`} onClick={onEdit}>
        <SlidersHorizontal className="h-5 w-5" /><span>Düzenle</span>
      </button>

      <div ref={rootRef} className="relative flex min-w-0 flex-1 self-stretch">
        <button type="button" className={itemClass} onClick={() => setMoreOpen((value) => !value)} aria-expanded={moreOpen} aria-haspopup="menu">
          <MoreHorizontal className="h-5 w-5" /><span>Daha</span>
        </button>
        {moreOpen ? (
          <div role="menu" className="sd-v22-mobile-more absolute bottom-14 right-1 w-48 rounded-lg border p-1.5 shadow-2xl">
            <div className="mb-1 flex items-center justify-between px-2 py-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide opacity-45">Araçlar</span>
              <button type="button" onClick={() => setMoreOpen(false)} className="sd-icon-button grid h-7 w-7 place-items-center rounded-md" aria-label="Kapat"><X className="h-3.5 w-3.5" /></button>
            </div>
            <button role="menuitem" type="button" onClick={() => open(onOpenMedia)} className="sd-mobile-menu-row flex w-full items-center gap-2 px-3 text-left"><Images className="h-4 w-4" />Medya</button>
            <button role="menuitem" type="button" onClick={() => open(onOpenTemplates)} className="sd-mobile-menu-row flex w-full items-center gap-2 px-3 text-left"><LayoutTemplate className="h-4 w-4" />Şablonlar</button>
            <button role="menuitem" type="button" onClick={() => open(onOpenRedirects)} className="sd-mobile-menu-row flex w-full items-center gap-2 px-3 text-left"><Link2 className="h-4 w-4" />Yönlendirmeler</button>
            <button role="menuitem" type="button" onClick={() => open(onOpenPages)} className="sd-mobile-menu-row flex w-full items-center gap-2 px-3 text-left"><Layout className="h-4 w-4" />Sayfalar</button>
            <button role="menuitem" type="button" onClick={() => open(onOpenHistory)} className="sd-mobile-menu-row flex w-full items-center gap-2 px-3 text-left"><History className="h-4 w-4" />Geçmiş</button>
          </div>
        ) : null}
      </div>
    </nav>
  );
}
