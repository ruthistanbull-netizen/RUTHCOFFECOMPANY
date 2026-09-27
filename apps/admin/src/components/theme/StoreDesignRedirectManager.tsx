"use client";

import { ArrowRight, Plus, Power, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  flattenThemeRedirects,
  isProtectedStoreDesignRoute,
  normalizeStoreDesignRoute,
  type RedirectRecord,
  type ThemeDocument,
} from "@ruth-commerce/commerce-core/store-design-v2";
import { useExactToast } from "@/components/base44-exact/primitives";

type Props = {
  document: ThemeDocument;
  onApply: (next: ThemeDocument, label: string) => Promise<void>;
  onClose: () => void;
};

function uid() {
  const random = globalThis.crypto?.randomUUID?.().replace(/-/g, "") || Math.random().toString(36).slice(2);
  return `redirect-${random}`.slice(0, 180);
}

function route(value: string) {
  return normalizeStoreDesignRoute(value.trim());
}

function redirectUsageLabel(item: RedirectRecord) {
  if (item.reason === "page-slug-change") return "Slug geçmişi";
  if (item.reason === "manual") return "Manuel";
  return item.reason || "Redirect";
}

export function StoreDesignRedirectManager({ document, onApply, onClose }: Props) {
  const toast = useExactToast();
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const [status, setStatus] = useState<301 | 302>(301);
  const [busy, setBusy] = useState(false);

  const activePages = useMemo(
    () => new Set(Object.values(document.pages).filter((page) => page.status === "published").map((page) => page.route)),
    [document.pages],
  );

  const redirects = useMemo(
    () => [...document.redirects].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))),
    [document.redirects],
  );

  const commit = async (next: ThemeDocument, label: string) => {
    setBusy(true);
    try {
      next.revision = Math.max(next.revision, document.revision) + 1;
      await onApply(next, label);
    } finally {
      setBusy(false);
    }
  };

  const addRedirect = async () => {
    const from = route(source);
    const to = route(target);

    if (!source.trim() || !target.trim()) return toast.error("Kaynak ve hedef route gerekli.");
    if (from === to) return toast.error("Redirect kendi üzerine gidemez.");
    if (isProtectedStoreDesignRoute(from)) return toast.error("Checkout/account gibi korumalı route'lar redirect kaynağı olamaz.");
    if (activePages.has(from)) return toast.error("Yayınlanmış aktif sayfa redirect kaynağı olamaz.");
    const duplicate = document.redirects.find((item) => item.active !== false && item.from === from);
    if (duplicate) return toast.error("Bu kaynak için zaten aktif redirect var.");

    const next = structuredClone(document) as ThemeDocument;
    const record: RedirectRecord = {
      id: uid(),
      from,
      to,
      sourcePath: from,
      targetPath: to,
      status,
      statusCode: status,
      reason: "manual",
      active: true,
      createdAt: new Date().toISOString(),
    };
    next.redirects = [...next.redirects, record];

    setBusy(true);
    try {
      await commit(next, `${from} → ${to} yönlendirmesi eklendi`);
      setSource("");
      setTarget("");
      setStatus(301);
      toast.success("Redirect eklendi. Publish edildiğinde storefront'ta aktif olur.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Redirect eklenemedi.");
    } finally {
      setBusy(false);
    }
  };

  const updateRedirect = async (item: RedirectRecord, patch: Partial<RedirectRecord>) => {
    const next = structuredClone(document) as ThemeDocument;
    next.redirects = next.redirects.map((entry) => entry.id === item.id ? {
      ...entry,
      ...patch,
      sourcePath: patch.from ?? entry.from,
      targetPath: patch.to ?? entry.to,
      statusCode: patch.status ?? entry.status,
    } : entry);

    setBusy(true);
    try {
      await commit(next, "Redirect ayarı güncellendi");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Redirect güncellenemedi.");
    } finally {
      setBusy(false);
    }
  };

  const deleteRedirect = async (item: RedirectRecord) => {
    const next = structuredClone(document) as ThemeDocument;
    next.redirects = next.redirects.filter((entry) => entry.id !== item.id);
    setBusy(true);
    try {
      await commit(next, "Redirect kaydı silindi");
      toast.success("Redirect kaydı kaldırıldı.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Redirect silinemedi.");
    } finally {
      setBusy(false);
    }
  };

  const flattenedPreview = useMemo(() => flattenThemeRedirects(document.redirects), [document.redirects]);

  return (
    <div className="fixed inset-0 z-[2147483620] grid place-items-center bg-black/35 p-3 backdrop-blur-sm">
      <div className="flex h-[min(820px,94dvh)] w-full max-w-[940px] flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-black/10 px-4">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold">URL Yönlendirmeleri</p>
            <p className="mt-0.5 text-[8px] text-black/40">301/302 kayıtları ThemeDocument içinde tutulur; publish sırasında chain flatten edilir.</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-black/[0.04]" aria-label="Kapat"><X className="h-4 w-4" /></button>
        </header>

        <div className="grid shrink-0 gap-2 border-b border-black/[0.07] bg-[#fafafa] p-3 md:grid-cols-[1fr_auto_1fr_100px_auto]">
          <input value={source} onChange={(event) => setSource(event.target.value)} placeholder="/eski-url" className="h-10 rounded-lg border border-black/10 bg-white px-3 text-[9px] font-medium outline-none" />
          <div className="hidden items-center justify-center md:flex"><ArrowRight className="h-4 w-4 text-black/25" /></div>
          <input value={target} onChange={(event) => setTarget(event.target.value)} placeholder="/yeni-url" className="h-10 rounded-lg border border-black/10 bg-white px-3 text-[9px] font-medium outline-none" />
          <select value={status} onChange={(event) => setStatus(Number(event.target.value) === 302 ? 302 : 301)} className="h-10 rounded-lg border border-black/10 bg-white px-2 text-[9px] font-semibold outline-none">
            <option value={301}>301</option>
            <option value={302}>302</option>
          </select>
          <button type="button" disabled={busy} onClick={() => void addRedirect()} className="flex h-10 items-center justify-center gap-1.5 rounded-lg bg-[#111] px-3 text-[8px] font-semibold text-white disabled:opacity-40"><Plus className="h-3.5 w-3.5" />Ekle</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="space-y-2">
            {redirects.map((item) => {
              const effective = flattenedPreview.find((entry) => entry.id === item.id);
              return (
                <div key={item.id} className="rounded-xl border border-black/[0.08] p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-1 text-[7px] font-semibold ${item.active === false ? "bg-black/[0.04] text-black/35" : "bg-emerald-50 text-emerald-700"}`}>{item.active === false ? "PASİF" : "AKTİF"}</span>
                    <span className="rounded-full bg-black/[0.04] px-2 py-1 text-[7px] font-semibold">{item.status}</span>
                    <span className="rounded-full bg-black/[0.04] px-2 py-1 text-[7px] font-semibold text-black/45">{redirectUsageLabel(item)}</span>
                    <span className="ml-auto text-[7px] text-black/30">{item.createdAt ? new Date(item.createdAt).toLocaleString("tr-TR") : ""}</span>
                  </div>

                  <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto_1fr] md:items-center">
                    <code className="truncate rounded-lg bg-black/[0.03] px-2.5 py-2 text-[8px]">{item.from}</code>
                    <ArrowRight className="mx-auto h-3.5 w-3.5 text-black/25" />
                    <code className="truncate rounded-lg bg-black/[0.03] px-2.5 py-2 text-[8px]">{item.to}</code>
                  </div>

                  {effective && effective.active !== false && effective.to !== item.to ? (
                    <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[7px] leading-4 text-amber-900">Publish chain sonucu: {item.from} → {effective.to}</p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <select
                      value={item.status}
                      disabled={busy}
                      onChange={(event) => void updateRedirect(item, { status: Number(event.target.value) === 302 ? 302 : 301 })}
                      className="h-8 rounded-lg border border-black/10 bg-white px-2 text-[8px] font-semibold"
                    >
                      <option value={301}>301 Permanent</option>
                      <option value={302}>302 Temporary</option>
                    </select>
                    <button type="button" disabled={busy} onClick={() => void updateRedirect(item, { active: item.active === false })} className="flex h-8 items-center gap-1.5 rounded-lg border border-black/10 bg-white px-2.5 text-[8px] font-semibold disabled:opacity-40">
                      <Power className="h-3 w-3" />{item.active === false ? "Aktifleştir" : "Pasifleştir"}
                    </button>
                    <button type="button" disabled={busy} onClick={() => void deleteRedirect(item)} className="ml-auto flex h-8 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-2.5 text-[8px] font-semibold text-red-700 disabled:opacity-40">
                      <Trash2 className="h-3 w-3" />Sil
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {!redirects.length ? (
            <div className="grid min-h-52 place-items-center rounded-xl border border-dashed border-black/10 text-center">
              <div>
                <ArrowRight className="mx-auto h-5 w-5 text-black/20" />
                <p className="mt-2 text-[9px] font-semibold text-black/45">Redirect kaydı yok</p>
                <p className="mt-1 text-[8px] text-black/30">Slug değişikliklerinde otomatik 301; manuel kayıtlar da buradan yönetilir.</p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
