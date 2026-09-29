"use client";

import { ChevronDown, Images, Link2, Monitor } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { EditorScope } from "@ruth-commerce/commerce-core/store-design-v2";

type Device = "desktop" | "mobile";

type SelectedTarget = {
  id: string;
  type: string;
  label: string;
  defaultScope: EditorScope;
  allowedScopes: EditorScope[];
  controlGroups: string[];
  protectedFields: string[];
  current: {
    visible?: boolean;
    textAlign?: string;
    opacity?: number;
    borderRadius?: number;
    backgroundColor?: string;
    color?: string;
    width?: number;
    height?: number;
    content?: { text?: string } | null;
    link?: { href?: string; target?: "_self" | "_blank" } | null;
    media?: { kind?: "image" | "video"; src?: string; objectFit?: string; objectPosition?: string } | null;
    grid?: { columns?: number; gapX?: number; gapY?: number; maxWidth?: string } | null;
    card?: {
      density?: "s" | "m" | "l";
      imageRatio?: "1/1" | "4/5" | "3/4";
      titleLines?: number;
      showPrice?: boolean;
      showQuickAdd?: boolean;
    } | null;
  };
};

type Props = {
  selected: SelectedTarget;
  scope: EditorScope;
  device: Device;
  hasMobileOverrides: boolean;
  scopeLabel: (scope: EditorScope) => string;
  consentSetting: (key: string, fallback: string) => string;
  onScopeChange: (scope: EditorScope) => void;
  onPatch: (path: string, value: unknown) => void;
  onDestination: () => void;
  onMedia: () => void;
  onCopyDesktop: () => void;
  onUseDesktop: () => void;
};

const groupLabel: Record<string, string> = {
  content: "İçerik",
  link: "Bağlantı",
  media: "Medya",
  appearance: "Görünüm",
  layout: "Düzen",
  mobile: "Mobil",
  advanced: "Gelişmiş",
};

function Group({
  name,
  children,
  defaultOpen = true,
}: {
  name: keyof typeof groupLabel;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="sd-v22-inspector-group border-b">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-4 text-left text-[13px] font-semibold"
        aria-expanded={open}
      >
        {groupLabel[name]}
        <ChevronDown className={`h-4 w-4 opacity-45 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? <div className="grid gap-3 px-4 pb-4">{children}</div> : null}
    </section>
  );
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="grid gap-1.5 text-[11px] font-medium opacity-75">
      <span>{label}</span>
      {children}
      {hint ? <span className="text-[10px] font-normal opacity-55">{hint}</span> : null}
    </label>
  );
}

const fieldClass = "sd-field h-10 w-full rounded-md border px-3 text-[12px] font-medium outline-none";

export function StoreDesignInspectorBodyV22({
  selected,
  scope,
  device,
  hasMobileOverrides,
  scopeLabel,
  consentSetting,
  onScopeChange,
  onPatch,
  onDestination,
  onMedia,
  onCopyDesktop,
  onUseDesktop,
}: Props) {
  const hasContent = Boolean(selected.current.content) || selected.type === "consent-banner";
  const hasLink = Boolean(selected.current.link);
  const hasMedia = Boolean(selected.current.media);
  const hasAppearance = selected.controlGroups.includes("typography")
    || selected.controlGroups.includes("card")
    || selected.type === "product-card";
  const hasLayout = selected.controlGroups.includes("layout")
    || selected.type === "product-grid"
    || selected.type === "product-card";
  const hasResponsive = selected.controlGroups.includes("responsive")
    || selected.type === "product-card"
    || selected.type === "product-grid";

  return (
    <>
      {hasContent ? (
        <Group name="content">
          {selected.current.content ? (
            <Field label="Metin / ad">
              <textarea
                key={`content-${selected.id}-${selected.current.content.text || ""}`}
                defaultValue={selected.current.content.text || ""}
                rows={3}
                onBlur={(event) => onPatch("content.text", event.currentTarget.value)}
                className="sd-field min-h-24 w-full resize-y rounded-md border p-3 text-[12px] leading-5 outline-none"
              />
            </Field>
          ) : null}

          {selected.type === "consent-banner" ? (
            <>
              <Field label="Başlık">
                <input
                  value={consentSetting("title", "Çerezler")}
                  onChange={(event) => onPatch("title", event.target.value)}
                  className={fieldClass}
                />
              </Field>
              <Field label="Açıklama">
                <textarea
                  value={consentSetting("intro", "Deneyiminizi iyileştirmek ve site kullanımını anlamak için çerezlerden yararlanıyoruz.")}
                  onChange={(event) => onPatch("intro", event.target.value)}
                  className="sd-field min-h-24 resize-y rounded-md border p-3 text-[12px] leading-5 outline-none"
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Kabul düğmesi">
                  <input value={consentSetting("acceptLabel", "Kabul et")} onChange={(event) => onPatch("acceptLabel", event.target.value)} className={fieldClass} />
                </Field>
                <Field label="Ret düğmesi">
                  <input value={consentSetting("rejectLabel", "Reddet")} onChange={(event) => onPatch("rejectLabel", event.target.value)} className={fieldClass} />
                </Field>
              </div>
              <Field label="Gizlilik bağlantısı metni">
                <input value={consentSetting("privacyLabel", "Gizlilik ve çerezler")} onChange={(event) => onPatch("privacyLabel", event.target.value)} className={fieldClass} />
              </Field>
            </>
          ) : null}
        </Group>
      ) : null}

      {hasLink ? (
        <Group name="link">
          <button
            type="button"
            onClick={onDestination}
            className="sd-secondary-button flex min-h-11 items-center justify-between gap-3 rounded-md border px-3 text-[12px] font-semibold"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Link2 className="h-4 w-4 shrink-0 opacity-55" />
              <span className="truncate">{selected.current.link?.href || "Bağlantı yok"}</span>
            </span>
            <span className="shrink-0 text-[10px] opacity-60">Değiştir</span>
          </button>
          <Field label="Açılış">
            <select
              value={selected.current.link?.target || "_self"}
              onChange={(event) => onPatch("link.target", event.target.value)}
              className={fieldClass}
            >
              <option value="_self">Aynı sekme</option>
              <option value="_blank">Yeni sekme</option>
            </select>
          </Field>
        </Group>
      ) : null}

      {hasMedia ? (
        <Group name="media">
          <button
            type="button"
            onClick={onMedia}
            className="sd-primary-button flex min-h-11 items-center justify-center gap-2 rounded-md px-3 text-[12px] font-semibold"
          >
            <Images className="h-4 w-4" />
            {selected.current.media?.kind === "video" ? "Videoyu değiştir" : "Görseli değiştir"}
          </button>
          <Field label="Sığdırma">
            <select value={selected.current.media?.objectFit || "cover"} onChange={(event) => onPatch("media.objectFit", event.target.value)} className={fieldClass}>
              <option value="cover">Kapla / kırp</option>
              <option value="contain">Tamamını göster</option>
            </select>
          </Field>
          <Field label="Odak noktası">
            <select value={selected.current.media?.objectPosition || "50% 50%"} onChange={(event) => onPatch("media.objectPosition", event.target.value)} className={fieldClass}>
              <option value="50% 50%">Orta</option>
              <option value="50% 0%">Üst</option>
              <option value="50% 100%">Alt</option>
              <option value="0% 50%">Sol</option>
              <option value="100% 50%">Sağ</option>
            </select>
          </Field>
        </Group>
      ) : null}

      {hasAppearance ? (
        <Group name="appearance">
          {selected.controlGroups.includes("typography") ? (
            <Field label="Metin hizası">
              <select value={selected.current.textAlign || "left"} onChange={(event) => onPatch("textAlign", event.target.value)} className={fieldClass}>
                <option value="left">Sol</option>
                <option value="center">Orta</option>
                <option value="right">Sağ</option>
              </select>
            </Field>
          ) : null}

          {selected.type === "product-card" ? (
            <>
              <Field label="Kart yoğunluğu">
                <select value={selected.current.card?.density || "m"} onChange={(event) => onPatch("card.density", event.target.value)} className={fieldClass}>
                  <option value="s">Kompakt</option>
                  <option value="m">Dengeli</option>
                  <option value="l">Ferah</option>
                </select>
              </Field>
              <Field label="Görsel oranı">
                <select value={selected.current.card?.imageRatio || "3/4"} onChange={(event) => onPatch("card.imageRatio", event.target.value)} className={fieldClass}>
                  <option value="3/4">3:4</option>
                  <option value="4/5">4:5</option>
                  <option value="1/1">1:1</option>
                </select>
              </Field>
              <Field label="Başlık satırı">
                <select value={String(selected.current.card?.titleLines ?? 2)} onChange={(event) => onPatch("card.titleLines", Number(event.target.value))} className={fieldClass}>
                  {[1, 2, 3].map((value) => <option key={value} value={value}>{value} satır</option>)}
                </select>
              </Field>
              <label className="flex min-h-10 items-center justify-between gap-3 text-[12px]">
                <span>Fiyatı göster</span>
                <input type="checkbox" checked={selected.current.card?.showPrice !== false} onChange={(event) => onPatch("card.showPrice", event.target.checked)} />
              </label>
              <label className="flex min-h-10 items-center justify-between gap-3 text-[12px]">
                <span>Hızlı sepete ekle</span>
                <input type="checkbox" checked={selected.current.card?.showQuickAdd !== false} onChange={(event) => onPatch("card.showQuickAdd", event.target.checked)} />
              </label>
            </>
          ) : null}

          {(selected.controlGroups.includes("card") || selected.controlGroups.includes("layout")) && selected.type !== "consent-banner" ? (
            <Field label="Köşe yuvarlaklığı">
              <select value={String(Math.round(selected.current.borderRadius || 0))} onChange={(event) => onPatch("borderRadius", Number(event.target.value))} className={fieldClass}>
                {[0, 4, 8, 12, 16, 24, 32].map((value) => <option key={value} value={value}>{value === 0 ? "Düz" : `${value}px`}</option>)}
              </select>
            </Field>
          ) : null}
        </Group>
      ) : null}

      {hasLayout ? (
        <Group name="layout">
          {selected.type !== "consent-banner" ? (
            <label className="flex min-h-10 items-center justify-between gap-3 text-[12px]">
              <span>Görünür</span>
              <input type="checkbox" checked={selected.current.visible !== false} onChange={(event) => onPatch("visible", event.target.checked)} />
            </label>
          ) : null}

          {selected.type === "product-grid" ? (
            <>
              <Field label="Sütun sayısı">
                <select value={String(selected.current.grid?.columns ?? (device === "mobile" ? 2 : 3))} onChange={(event) => onPatch("grid.columns", Number(event.target.value))} className={fieldClass}>
                  {(device === "mobile" ? [1, 2] : [2, 3, 4, 5, 6]).map((value) => <option key={value} value={value}>{value} sütun</option>)}
                </select>
              </Field>
              <Field label="Yatay kart aralığı">
                <select value={String(Math.round(selected.current.grid?.gapX ?? 16))} onChange={(event) => onPatch("grid.gapX", Number(event.target.value))} className={fieldClass}>
                  {[0, 8, 12, 16, 20, 24, 32, 40, 48, 64].map((value) => <option key={value} value={value}>{value}px</option>)}
                </select>
              </Field>
              <Field label="Dikey kart aralığı">
                <select value={String(Math.round(selected.current.grid?.gapY ?? 32))} onChange={(event) => onPatch("grid.gapY", Number(event.target.value))} className={fieldClass}>
                  {[0, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96].map((value) => <option key={value} value={value}>{value}px</option>)}
                </select>
              </Field>
              <Field label="En fazla genişlik">
                <select value={selected.current.grid?.maxWidth || "none"} onChange={(event) => onPatch("grid.maxWidth", event.target.value)} className={fieldClass}>
                  <option value="none">Kullanılabilir alanı doldur</option>
                  <option value="1200px">1200px</option>
                  <option value="1280px">1280px</option>
                  <option value="1440px">1440px</option>
                  <option value="1600px">1600px</option>
                </select>
              </Field>
            </>
          ) : null}

          {selected.type === "consent-banner" ? (
            <>
              <Field label="Konum">
                <select value={consentSetting("position", "bottom-center")} onChange={(event) => onPatch("position", event.target.value)} className={fieldClass}>
                  <option value="bottom-center">Alt orta</option>
                  <option value="bottom-left">Alt sol</option>
                  <option value="bottom-right">Alt sağ</option>
                </select>
              </Field>
              <Field label="Genişlik">
                <select value={consentSetting("widthPreset", "standard")} onChange={(event) => onPatch("widthPreset", event.target.value)} className={fieldClass}>
                  <option value="compact">Dar</option>
                  <option value="standard">Standart</option>
                  <option value="wide">Geniş</option>
                </select>
              </Field>
              <Field label="Köşe biçimi">
                <select value={consentSetting("radiusPreset", "rounded")} onChange={(event) => onPatch("radiusPreset", event.target.value)} className={fieldClass}>
                  <option value="soft">Yumuşak</option>
                  <option value="rounded">Yuvarlak</option>
                  <option value="pill">Tam yuvarlak</option>
                </select>
              </Field>
              <p className="rounded-md border p-3 text-[10px] leading-4 opacity-60">
                Kabul ve ret davranışı, çerez kategorileri ve gizlilik sayfası korunur. Burada yalnız metin ve görünüm seçenekleri değişir.
              </p>
            </>
          ) : null}
        </Group>
      ) : null}

      {hasResponsive ? (
        <Group name="mobile">
          <div className="rounded-md border p-3">
            <div className="flex items-center gap-2 text-[11px] font-medium">
              <Monitor className="h-4 w-4 opacity-55" />
              {hasMobileOverrides ? "Mobil için farklı ayar kullanılıyor" : "Masaüstü ayarı kullanılıyor"}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={onCopyDesktop} className="sd-secondary-button min-h-10 rounded-md border px-2 text-[11px] font-semibold">Masaüstünü kopyala</button>
              <button type="button" disabled={!hasMobileOverrides} onClick={onUseDesktop} className="sd-secondary-button min-h-10 rounded-md border px-2 text-[11px] font-semibold disabled:opacity-40">Masaüstünü kullan</button>
            </div>
          </div>
        </Group>
      ) : null}

      <Group name="advanced" defaultOpen={false}>
        <Field label="Bu değişiklik nerede geçerli?">
          <select value={scope} onChange={(event) => onScopeChange(event.target.value as EditorScope)} className={fieldClass}>
            {selected.allowedScopes.map((item) => <option key={item} value={item}>{scopeLabel(item)}</option>)}
          </select>
        </Field>
        <p className="text-[10px] leading-4 opacity-55">Önerilen: {scopeLabel(selected.defaultScope)}.</p>
        {selected.protectedFields.length ? (
          <p className="rounded-md border border-amber-500/20 bg-amber-50 p-3 text-[10px] leading-4 text-amber-900">
            Bu öğenin işlevsel ve güvenlik açısından korunan bazı ayarları burada değiştirilmez.
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-2 text-[10px] opacity-60">
          <span>Boyut: {selected.current.width || 0} × {selected.current.height || 0}</span>
          <span>Saydamlık: {selected.current.opacity ?? 1}</span>
        </div>
      </Group>
    </>
  );
}
