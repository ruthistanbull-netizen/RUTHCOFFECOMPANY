"use client";

import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Link2,
  Monitor,
  Pencil,
  Settings2,
  Trash2,
  Video,
  X,
} from "lucide-react";
import type { RefObject } from "react";
import type { EditorScope } from "@ruth-commerce/commerce-core/store-design-v2";

type Target = {
  id: string;
  type: string;
  label: string;
  controlGroups: string[];
  protectedFields: string[];
  breadcrumb: Array<{ id: string; type: string; label: string }>;
  current: {
    visible?: boolean;
    content?: { text?: string } | null;
    link?: { href?: string; target?: "_self" | "_blank" } | null;
    media?: { kind?: "image" | "video"; src?: string; objectFit?: string; objectPosition?: string } | null;
  };
};

type Props = {
  x: number;
  y: number;
  target: Target;
  scope: EditorScope;
  contextMenuRef: RefObject<HTMLDivElement | null>;
  hasSection: boolean;
  canMoveSectionUp: boolean;
  canMoveSectionDown: boolean;
  sharedSectionCount: number;
  onClose: () => void;
  onEditText: () => void;
  onChangeDestination: () => void;
  onChangeMedia: () => void;
  onToggleVisibility: () => void;
  onMobileSettings: () => void;
  onOpenFull: () => void;
  onSectionAction: (action: "focus" | "duplicate" | "up" | "down" | "toggle" | "delete") => void;
};

function MenuRow({
  icon: Icon,
  label,
  onClick,
  danger = false,
  disabled = false,
  primary = false,
}: {
  icon: typeof Pencil;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`sd-v22-context-row flex min-h-10 w-full items-center gap-3 rounded-md px-3 text-left text-[13px] font-medium transition disabled:opacity-35 ${danger ? "text-red-600" : ""} ${primary ? "is-primary" : ""}`}
    >
      <Icon className="h-4 w-4 shrink-0 opacity-65" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

export function StoreDesignContextMenuV22({
  x,
  y,
  target,
  scope,
  contextMenuRef,
  hasSection,
  canMoveSectionUp,
  canMoveSectionDown,
  sharedSectionCount,
  onClose,
  onEditText,
  onChangeDestination,
  onChangeMedia,
  onToggleVisibility,
  onMobileSettings,
  onOpenFull,
  onSectionAction,
}: Props) {
  const hasText = Boolean(target.current.content);
  const hasLink = Boolean(target.current.link);
  const hasMedia = Boolean(target.current.media);
  const isVideo = target.current.media?.kind === "video";
  const canVisibility = target.controlGroups.includes("layout") || target.type.includes("menu") || hasSection;

  return (
    <div
      ref={contextMenuRef}
      data-store-design-context-menu
      tabIndex={-1}
      className="sd-context-menu sd-v22-context-menu fixed z-[2147483560] w-[340px] max-w-[calc(100vw_-_24px)] overflow-hidden rounded-lg border shadow-2xl"
      style={{ left: x, top: y }}
      role="menu"
      aria-label={`${target.label} hızlı düzenleme`}
    >
      <div className="flex items-start justify-between gap-3 border-b px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">{target.label}</p>
          <p className="mt-0.5 truncate text-[10px] opacity-55">
            {target.breadcrumb.map((item) => item.label).join(" › ") || "Site"}
          </p>
        </div>
        <button type="button" onClick={onClose} className="sd-icon-button grid h-8 w-8 shrink-0 place-items-center rounded-md" aria-label="Kapat">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="max-h-[60vh] overflow-y-auto p-1.5">
        {hasText ? <MenuRow icon={Pencil} label="Metni düzenle" onClick={onEditText} /> : null}
        {hasLink ? <MenuRow icon={Link2} label="Hedefi değiştir" onClick={onChangeDestination} /> : null}
        {hasMedia ? (
          <MenuRow
            icon={isVideo ? Video : ImageIcon}
            label={isVideo ? "Videoyu değiştir" : "Görseli değiştir"}
            onClick={onChangeMedia}
          />
        ) : null}
        {hasMedia ? <MenuRow icon={Settings2} label={isVideo ? "Video ayarları" : "Kırp / sığdır / odak"} onClick={onOpenFull} /> : null}
        {canVisibility ? (
          <MenuRow
            icon={target.current.visible === false ? Eye : EyeOff}
            label={target.current.visible === false ? "Göster" : "Gizle"}
            onClick={onToggleVisibility}
          />
        ) : null}
        <MenuRow icon={Monitor} label="Mobil ayarlar" onClick={onMobileSettings} />

        {hasSection ? (
          <>
            <div className="my-1.5 border-t" />
            <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide opacity-45">
              {sharedSectionCount > 1 ? `Bölüm · ${sharedSectionCount} yerde bağlı` : "Bölüm"}
            </div>
            <MenuRow icon={Settings2} label="Bölümü düzenle" onClick={() => onSectionAction("focus")} />
            <MenuRow icon={Copy} label="Bölümü çoğalt" onClick={() => onSectionAction("duplicate")} />
            <MenuRow icon={ArrowUp} label="Yukarı taşı" disabled={!canMoveSectionUp} onClick={() => onSectionAction("up")} />
            <MenuRow icon={ArrowDown} label="Aşağı taşı" disabled={!canMoveSectionDown} onClick={() => onSectionAction("down")} />
            <MenuRow icon={Trash2} label="Bölümü kaldır" danger onClick={() => onSectionAction("delete")} />
          </>
        ) : null}

        <div className="my-1.5 border-t" />
        <MenuRow icon={Settings2} label="Tüm ayarları aç" onClick={onOpenFull} primary />
        <p className="px-3 pb-1 pt-2 text-[10px] leading-4 opacity-40">Uygulama alanı: {scope === "global" ? "Tüm site" : scope === "instance" ? "Bu öğe" : scope === "section" ? "Bu bölüm" : scope === "template" ? "Bu şablon" : "Benzer öğeler"}</p>
      </div>
    </div>
  );
}
