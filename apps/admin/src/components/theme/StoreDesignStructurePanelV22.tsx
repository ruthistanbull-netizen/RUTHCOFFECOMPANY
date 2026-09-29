"use client";

import { ChevronDown, LayoutTemplate, PanelBottom, PanelTop, Plus, Settings2, X } from "lucide-react";
import type { ReactNode, RefObject } from "react";

type PageOption = { path: string; label: string; group: string };

type Props = {
  open: boolean;
  groupedPages: Array<[string, PageOption[]]>;
  activePath: string;
  activeLabel: string;
  managedPage: boolean;
  onHide: () => void;
  onChangePage: (path: string) => void;
  onEditPage: () => void;
  onNewPage: () => void;
  onSelectGlobal: (targetId: string) => void;
  children: ReactNode;
  panelRef?: RefObject<HTMLElement | null>;
};

export function StoreDesignStructurePanelV22({
  open,
  groupedPages,
  activePath,
  activeLabel,
  managedPage,
  onHide,
  onChangePage,
  onEditPage,
  onNewPage,
  onSelectGlobal,
  children,
  panelRef,
}: Props) {
  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      aria-label="Sayfa yapısı"
      data-open={open ? "true" : "false"}
      aria-hidden={!open}
      className={`sd-sidebar sd-sidebar-left sd-v22-structure ${open ? "is-open" : "is-closed"} flex w-72 shrink-0 flex-col border-r max-lg:absolute max-lg:bottom-0 max-lg:left-0 max-lg:top-14 max-lg:z-20 max-lg:shadow-2xl`}
    >
      <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <div>
          <p className="text-[13px] font-semibold">Yapı</p>
          <p className="mt-0.5 max-w-[190px] truncate text-[10px] opacity-45">{activeLabel}</p>
        </div>
        <button type="button" onClick={onHide} className="sd-icon-button grid h-8 w-8 place-items-center rounded-md" aria-label="Yapıyı gizle">
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="border-b p-3">
        <div className="relative">
          <select
            aria-label="Düzenlenen sayfa"
            value={activePath}
            onChange={(event) => onChangePage(event.target.value)}
            className="sd-field h-10 w-full appearance-none rounded-md border px-3 pr-8 text-[12px] font-semibold outline-none"
          >
            {groupedPages.map(([group, items]) => (
              <optgroup key={group} label={group}>
                {items.map((item) => <option key={item.path} value={item.path}>{item.label}</option>)}
              </optgroup>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-3 h-4 w-4 opacity-40" />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button type="button" onClick={managedPage ? onEditPage : onNewPage} className="sd-secondary-button flex h-9 items-center justify-center gap-1.5 rounded-md border px-2 text-[11px] font-semibold">
            <Settings2 className="h-3.5 w-3.5" />{managedPage ? "Sayfa ayarları" : "Sayfa oluştur"}
          </button>
          <button type="button" onClick={onNewPage} className="sd-secondary-button flex h-9 items-center justify-center gap-1.5 rounded-md border px-2 text-[11px] font-semibold">
            <Plus className="h-3.5 w-3.5" />Yeni sayfa
          </button>
        </div>
      </div>

      <div className="border-b p-2">
        <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide opacity-45">Global alanlar</p>
        <button type="button" onClick={() => onSelectGlobal("global.header")} className="sd-v22-structure-row flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-[12px] font-medium">
          <PanelTop className="h-4 w-4 opacity-50" />Üst bilgi
        </button>
        <button type="button" onClick={() => onSelectGlobal("global.header.mega-menu")} className="sd-v22-structure-row flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-[12px] font-medium">
          <LayoutTemplate className="h-4 w-4 opacity-50" />Menü
        </button>
        <button type="button" onClick={() => onSelectGlobal("global.footer")} className="sd-v22-structure-row flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-[12px] font-medium">
          <PanelBottom className="h-4 w-4 opacity-50" />Alt bilgi
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide opacity-45">Bölümler</div>
        {children}
      </div>
    </aside>
  );
}
