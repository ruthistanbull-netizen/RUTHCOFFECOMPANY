"use client";

import { Layers3, Plus, Trash2, X } from "lucide-react";
import {
  SECTION_LIBRARY_BY_TYPE,
  type PageCompatibility,
  type SectionPresetRecord,
} from "@ruth-commerce/commerce-core/store-design-v2";

import { useStoreDesignDialogExit } from "@/components/theme/useStoreDesignDialogExit";

type Props = {
  presets: SectionPresetRecord[];
  compatibility: PageCompatibility;
  onInsert: (presetId: string) => void;
  onDelete: (presetId: string) => void;
  onClose: () => void;
};

export function StoreDesignPresetLibrary({ presets, compatibility, onInsert, onDelete, onClose }: Props) {

  const { closing, requestClose } = useStoreDesignDialogExit(onClose);
  const compatible = presets.filter((preset) => {
    const definition = SECTION_LIBRARY_BY_TYPE[preset.sectionType];
    return Boolean(definition?.implemented && definition.compatiblePages.includes(compatibility));
  });

  return (
    <div data-closing={closing ? "true" : "false"} className="sd-modal-backdrop fixed inset-0 z-[2147483608] grid place-items-center bg-black/35 p-3 backdrop-blur-sm">
      <div className="sd-modal-card flex max-h-[82dvh] w-full max-w-[680px] flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-black/10 px-4">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-black/[0.04]">
            <Layers3 className="h-4 w-4 text-black/50" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold">Kaydedilmiş Bölümler</p>
            <p className="mt-0.5 text-[8px] text-black/40">Bölüm ve blok ayarlarını içerik ve medya bağlantılarıyla yeniden kullanabilirsin.</p>
          </div>
          <button type="button" onClick={requestClose} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-black/[0.04]" aria-label="Kapat"><X className="h-4 w-4" /></button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="space-y-2">
            {compatible.map((preset) => {
              const definition = SECTION_LIBRARY_BY_TYPE[preset.sectionType];
              return (
                <div key={preset.id} className="rounded-xl border border-black/[0.08] p-3">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-[10px] font-semibold">{preset.label}</p>
                        <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[7px] font-semibold text-black/45">{definition?.label || preset.sectionType}</span>
                      </div>
                      <p className="mt-1 text-[7px] text-black/30">{preset.blocks.length} blok{preset.schemaVersion}</p>
                    </div>
                    <button type="button" onClick={() => onInsert(preset.id)} className="flex h-8 items-center gap-1 rounded-lg bg-[#111] px-2.5 text-[8px] font-semibold text-white">
                      <Plus className="h-3 w-3" />Ekle
                    </button>
                    <button type="button" onClick={() => onDelete(preset.id)} className="grid h-8 w-8 place-items-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50" aria-label="Hazır düzeni sil">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {!compatible.length ? (
            <div className="grid min-h-48 place-items-center rounded-xl border border-dashed border-black/10 text-center">
              <div>
                <Layers3 className="mx-auto h-5 w-5 text-black/20" />
                <p className="mt-2 text-[9px] font-semibold text-black/45">Bu sayfa türüyle uyumlu hazır düzen yok</p>
                <p className="mt-1 text-[8px] text-black/30">Bir bölüm satırındaki hazır düzen olarak kaydet düğmesiyle oluşturabilirsin.</p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
