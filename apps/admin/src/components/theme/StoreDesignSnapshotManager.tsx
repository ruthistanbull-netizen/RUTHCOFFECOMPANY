"use client";

import { Clock3, RefreshCw, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { normalizeThemeDocument, type ThemeDocument } from "@ruth-commerce/commerce-core/store-design-v2";
import { adminRequest } from "@/lib/adminApi";
import { useExactToast } from "@/components/base44-exact/primitives";

type SnapshotSummary = {
  key: string;
  revision: number;
  schemaVersion: number;
  publishedAt?: string | null;
  updatedAt?: string | null;
  pageCount: number;
  templateCount: number;
  sectionCount: number;
  mediaCount: number;
  redirectCount: number;
};

type Props = {
  currentPublishedRevision: number;
  onRestore: (document: ThemeDocument) => Promise<void>;
  onClose: () => void;
};

export function StoreDesignSnapshotManager({ currentPublishedRevision, onRestore, onClose }: Props) {
  const toast = useExactToast();
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const result = await adminRequest<{ snapshots?: SnapshotSummary[] }>(`/api/store-design-v2/snapshots?t=${Date.now()}`, { force: true });
      setSnapshots(Array.isArray(result.snapshots) ? result.snapshots : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Snapshot geçmişi yüklenemedi.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const restore = async (snapshot: SnapshotSummary) => {
    if (restoring) return;
    setRestoring(snapshot.key);
    try {
      const result = await adminRequest<{ document?: unknown; liveSiteChanged?: boolean }>("/api/store-design-v2/snapshots", {
        method: "POST",
        body: JSON.stringify({ key: snapshot.key }),
        confirmation: false,
      });
      const document = normalizeThemeDocument(result.document);
      await onRestore(document);
      toast.success(`Revision ${snapshot.revision} taslağa geri yüklendi. Canlı site değişmedi.`);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Snapshot geri yüklenemedi.");
    } finally {
      setRestoring(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[2147483625] grid place-items-center bg-black/35 p-3 backdrop-blur-sm">
      <div className="flex h-[min(760px,92dvh)] w-full max-w-[820px] flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-black/10 px-4">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold">Publish Snapshot Geçmişi</p>
            <p className="mt-0.5 text-[8px] text-black/40">Rollback önce draft’a yüklenir; canlı site yalnız tekrar Publish ile değişir.</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className="grid h-9 w-9 place-items-center rounded-lg border border-black/10 hover:bg-black/[0.03] disabled:opacity-40" aria-label="Yenile">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-black/[0.04]" aria-label="Kapat"><X className="h-4 w-4" /></button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {loading && !snapshots.length ? (
            <div className="grid min-h-52 place-items-center text-[9px] text-black/35">
              <div className="flex items-center gap-2"><RefreshCw className="h-4 w-4 animate-spin" />Snapshot geçmişi okunuyor…</div>
            </div>
          ) : (
            <div className="space-y-2">
              {snapshots.map((snapshot) => {
                const current = snapshot.revision === currentPublishedRevision;
                return (
                  <div key={snapshot.key} className={`rounded-xl border p-3 ${current ? "border-emerald-200 bg-emerald-50/40" : "border-black/[0.08]"}`}>
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-black/[0.04]">
                        <Clock3 className="h-4 w-4 text-black/45" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[10px] font-semibold">Revision {snapshot.revision}</p>
                          <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[7px] font-semibold text-black/45">Schema {snapshot.schemaVersion}</span>
                          {current ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[7px] font-semibold text-emerald-800">CANLI</span> : null}
                        </div>
                        <p className="mt-1 text-[8px] text-black/35">{snapshot.updatedAt ? new Date(snapshot.updatedAt).toLocaleString("tr-TR") : "Tarih bilinmiyor"}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className="rounded bg-black/[0.03] px-1.5 py-1 text-[7px] text-black/45">{snapshot.pageCount} sayfa</span>
                          <span className="rounded bg-black/[0.03] px-1.5 py-1 text-[7px] text-black/45">{snapshot.templateCount} template</span>
                          <span className="rounded bg-black/[0.03] px-1.5 py-1 text-[7px] text-black/45">{snapshot.sectionCount} bölüm</span>
                          <span className="rounded bg-black/[0.03] px-1.5 py-1 text-[7px] text-black/45">{snapshot.mediaCount} medya</span>
                          <span className="rounded bg-black/[0.03] px-1.5 py-1 text-[7px] text-black/45">{snapshot.redirectCount} redirect</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={Boolean(restoring) || current}
                        onClick={() => void restore(snapshot)}
                        className="flex h-9 items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 text-[8px] font-semibold hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        {restoring === snapshot.key ? "Yükleniyor…" : current ? "Canlı Sürüm" : "Taslağa Yükle"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!loading && !snapshots.length ? (
            <div className="grid min-h-52 place-items-center rounded-xl border border-dashed border-black/10 text-center">
              <div>
                <Clock3 className="mx-auto h-5 w-5 text-black/20" />
                <p className="mt-2 text-[9px] font-semibold text-black/45">Henüz publish snapshot yok</p>
                <p className="mt-1 text-[8px] text-black/30">Bir sonraki Publish ile revision snapshot’ı otomatik oluşturulur.</p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
