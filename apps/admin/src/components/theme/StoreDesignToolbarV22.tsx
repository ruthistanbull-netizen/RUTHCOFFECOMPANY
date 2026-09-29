"use client";

import {
  ArrowLeft,
  Check,
  Eye,
  FileText,
  History,
  Images,
  LayoutTemplate,
  Link2,
  MoreHorizontal,
  Monitor,
  PanelLeft,
  Pencil,
  Redo2,
  RefreshCw,
  Save,
  Send,
  Smartphone,
  Undo2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Device = "desktop" | "mobile";
type InteractionMode = "browse" | "edit";
type PageOption = { path: string; label: string; group: string };

type Props = {
  groupedPages: Array<[string, PageOption[]]>;
  activePath: string;
  device: Device;
  interactionMode: InteractionMode;
  leftOpen: boolean;
  hasUnsavedChanges: boolean;
  saving: "draft" | "publish" | null;
  saveFeedback: "draft" | "publish" | null;
  canUndo: boolean;
  canRedo: boolean;
  onBack: () => void;
  onToggleStructure: () => void;
  onChangePage: (path: string) => void;
  onDeviceChange: (device: Device) => void;
  onModeChange: (mode: InteractionMode) => void;
  onUndo: () => void;
  onRedo: () => void;
  onSaveDraft: () => void;
  onPublish: () => void;
  onOpenMedia: () => void;
  onOpenPages: () => void;
  onOpenTemplates: () => void;
  onOpenRedirects: () => void;
  onOpenHistory: () => void;
};

export function StoreDesignToolbarV22({
  groupedPages,
  activePath,
  device,
  interactionMode,
  leftOpen,
  hasUnsavedChanges,
  saving,
  saveFeedback,
  canUndo,
  canRedo,
  onBack,
  onToggleStructure,
  onChangePage,
  onDeviceChange,
  onModeChange,
  onUndo,
  onRedo,
  onSaveDraft,
  onPublish,
  onOpenMedia,
  onOpenPages,
  onOpenTemplates,
  onOpenRedirects,
  onOpenHistory,
}: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!moreOpen) return;
    const close = (event: PointerEvent) => {
      const node = event.target instanceof Node ? event.target : null;
      if (node && moreRef.current?.contains(node)) return;
      setMoreOpen(false);
    };
    const esc = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    window.document.addEventListener("pointerdown", close, true);
    window.document.addEventListener("keydown", esc, true);
    return () => {
      window.document.removeEventListener("pointerdown", close, true);
      window.document.removeEventListener("keydown", esc, true);
    };
  }, [moreOpen]);

  const moreItems = [
    { label: "Medya", icon: Images, action: onOpenMedia },
    { label: "Sayfalar", icon: FileText, action: onOpenPages },
    { label: "Şablonlar", icon: LayoutTemplate, action: onOpenTemplates },
    { label: "Yönlendirmeler", icon: Link2, action: onOpenRedirects },
    { label: "Geçmiş", icon: History, action: onOpenHistory },
  ];

  return (
    <header className="sd-toolbar sd-v22-toolbar z-20 flex h-14 shrink-0 items-center justify-between gap-2 border-b px-2 sm:px-3">
      <div className="sd-v22-toolbar-left flex min-w-0 items-center gap-1">
        <button type="button" onClick={onBack} className="sd-icon-button grid h-9 w-9 shrink-0 place-items-center rounded-md" aria-label="Geri">
          <ArrowLeft className="h-[18px] w-[18px]" />
        </button>
        <button type="button" onClick={onToggleStructure} aria-pressed={leftOpen} className="sd-icon-button grid h-9 w-9 shrink-0 place-items-center rounded-md" aria-label="Yapı">
          <PanelLeft className="h-[18px] w-[18px]" />
        </button>
        <span className="mx-1 hidden h-6 w-px bg-[var(--sd-border)] sm:block" />
        <div className="relative min-w-0 max-w-[240px] flex-1">
          <select
            aria-label="Düzenlenen sayfa"
            value={activePath}
            onChange={(event) => onChangePage(event.target.value)}
            className="sd-field h-9 w-full min-w-[130px] appearance-none rounded-md border px-3 pr-8 text-[13px] font-semibold outline-none"
          >
            {groupedPages.map(([group, items]) => (
              <optgroup key={group} label={group}>
                {items.map((item) => <option key={item.path} value={item.path}>{item.label}</option>)}
              </optgroup>
            ))}
          </select>
          {hasUnsavedChanges ? <span className="pointer-events-none absolute right-2.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-amber-500" aria-label="Kaydedilmemiş değişiklik var" /> : null}
        </div>
      </div>

      <div className="sd-v22-toolbar-center flex shrink-0 items-center gap-1">
        <div className="sd-device-toggle flex rounded-md p-0.5">
          <button type="button" onClick={() => onDeviceChange("desktop")} aria-pressed={device === "desktop"} className={`sd-device-button grid h-8 w-8 place-items-center rounded ${device === "desktop" ? "is-active" : ""}`} title="Masaüstü">
            <Monitor className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => onDeviceChange("mobile")} aria-pressed={device === "mobile"} className={`sd-device-button grid h-8 w-8 place-items-center rounded ${device === "mobile" ? "is-active" : ""}`} title="Mobil">
            <Smartphone className="h-4 w-4" />
          </button>
        </div>

        <div className="sd-device-toggle hidden rounded-md p-0.5 sm:flex">
          <button type="button" onClick={() => onModeChange("edit")} aria-pressed={interactionMode === "edit"} className={`sd-device-button flex h-8 items-center gap-1.5 rounded px-2.5 text-[12px] font-semibold ${interactionMode === "edit" ? "is-active" : ""}`}>
            <Pencil className="h-3.5 w-3.5" />Düzenle
          </button>
          <button type="button" onClick={() => onModeChange("browse")} aria-pressed={interactionMode === "browse"} className={`sd-device-button flex h-8 items-center gap-1.5 rounded px-2.5 text-[12px] font-semibold ${interactionMode === "browse" ? "is-active" : ""}`}>
            <Eye className="h-3.5 w-3.5" />Önizle
          </button>
        </div>

        <span className="mx-1 hidden h-6 w-px bg-[var(--sd-border)] md:block" />
        <button type="button" onClick={onUndo} disabled={!canUndo || saving !== null} className="sd-icon-button hidden h-9 w-9 place-items-center rounded-md disabled:opacity-35 md:grid" aria-label="Geri al">
          <Undo2 className="h-[18px] w-[18px]" />
        </button>
        <button type="button" onClick={onRedo} disabled={!canRedo || saving !== null} className="sd-icon-button hidden h-9 w-9 place-items-center rounded-md disabled:opacity-35 md:grid" aria-label="Yinele">
          <Redo2 className="h-[18px] w-[18px]" />
        </button>
      </div>

      <div className="sd-v22-toolbar-right flex shrink-0 items-center gap-1">
        <button type="button" onClick={onSaveDraft} disabled={saving !== null} className="sd-toolbar-button hidden h-9 items-center gap-1.5 rounded-md px-3 text-[12px] font-semibold sm:flex disabled:opacity-45">
          {saving === "draft" ? <RefreshCw className="h-4 w-4 animate-spin" /> : saveFeedback === "draft" ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          <span className="hidden lg:inline">{saving === "draft" ? "Kaydediliyor…" : saveFeedback === "draft" ? "Kaydedildi" : "Kaydet"}</span>
        </button>
        <button type="button" onClick={onPublish} disabled={saving !== null} className="sd-primary-button flex h-9 items-center gap-1.5 rounded-md px-3 text-[12px] font-semibold disabled:opacity-45">
          {saving === "publish" ? <RefreshCw className="h-4 w-4 animate-spin" /> : saveFeedback === "publish" ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
          <span className="hidden sm:inline">{saving === "publish" ? "Yayınlanıyor…" : saveFeedback === "publish" ? "Yayınlandı" : "Yayınla"}</span>
        </button>

        <div ref={moreRef} className="relative">
          <button type="button" onClick={() => setMoreOpen((value) => !value)} aria-expanded={moreOpen} aria-haspopup="menu" className="sd-icon-button grid h-9 w-9 place-items-center rounded-md" aria-label="Diğer araçlar">
            <MoreHorizontal className="h-[18px] w-[18px]" />
          </button>
          {moreOpen ? (
            <div role="menu" aria-label="Diğer araçlar" className="sd-v22-more-menu absolute right-0 top-11 z-50 w-56 rounded-lg border p-1.5 shadow-2xl">
              {moreItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      item.action();
                    }}
                    className="sd-mobile-menu-row flex w-full items-center gap-3 px-3 text-left"
                  >
                    <Icon className="h-4 w-4 opacity-60" />{item.label}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
