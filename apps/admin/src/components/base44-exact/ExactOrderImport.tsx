"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileSpreadsheet,
  FileUp,
  History,
  RefreshCw,
  ShoppingBag,
} from "lucide-react";
import { useState } from "react";
import { adminAuthHeaders } from "@/lib/adminApi";
import { reconcileAfterAdminMutation } from "@/lib/adminFreshnessActions";
import { ExactButton, ExactPageHeader, ExactStatusBadge, useExactToast } from "./primitives";
import { ExactDataCard, ExactMetricCard } from "./data";

type ImportResult = {
  ok?: boolean;
  imported?: number;
  updated?: number;
  skipped?: number;
  failed?: number;
  errors?: Array<{ row?: number; order_no?: string; error?: string }>;
  message?: string;
};

export function ExactOrderImport() {
  const toast = useExactToast();
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const importCsv = async () => {
    if (!file) {
      toast.error("Önce İkas sipariş CSV dosyasını seç.");
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const headers = await adminAuthHeaders();
      const body = new FormData();
      body.append("file", file);
      body.append("source", "ikas_csv");
      const response = await fetch("/api/orders/import-csv", { method: "POST", headers, body });
      const payload = await response.json().catch(() => ({})) as ImportResult;
      if (!response.ok && response.status !== 207) {
        throw new Error(payload.message || "Sipariş aktarımı tamamlanamadı.");
      }

      setResult(payload);
      await reconcileAfterAdminMutation([
        "/api/orders?range=all&payment=all&q=",
        "/api/preparing-products",
        "/api/customers/list",
        "/api/summary?range=today",
      ]);
      toast.success(payload.message || `${payload.imported || 0} sipariş aktarıldı.`);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Sipariş aktarımı tamamlanamadı.");
    } finally {
      setBusy(false);
    }
  };

  const choose = (next: File | null) => {
    if (next && !/\.csv$/i.test(next.name) && next.type !== "text/csv") {
      toast.error("Yalnız CSV dosyası seçebilirsin.");
      return;
    }
    setFile(next);
    setResult(null);
  };

  return <div className="space-y-4 animate-fade-in" data-exact-base44-page="order-import">
    <ExactPageHeader
      title="İkas Sipariş Aktarımı"
      subtitle="Geçmiş siparişleri güvenli ve tekrarlanabilir şekilde içe aktar"
      actions={<Link href="/orders"><ExactButton variant="secondary" size="sm"><ArrowLeft className="h-4 w-4" /> Siparişlere dön</ExactButton></Link>}
    />
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <ExactMetricCard label="Dosya" value={file ? 1 : 0} icon={FileSpreadsheet} />
      <ExactMetricCard label="Aktarılan" value={result?.imported || 0} icon={CheckCircle2} />
      <ExactMetricCard label="Güncellenen" value={result?.updated || 0} icon={RefreshCw} />
      <ExactMetricCard label="Hatalı" value={result?.failed || result?.errors?.length || 0} icon={AlertTriangle} />
    </div>
    <div className="grid xl:grid-cols-[1fr_380px] gap-4 items-start">
      <ExactDataCard title="CSV Dosyası">
        <label
          onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            choose(event.dataTransfer.files?.[0] || null);
          }}
          className={`flex flex-col items-center justify-center min-h-72 p-8 radius-card border-2 border-dashed cursor-pointer transition-all ${dragging ? "border-accent bg-accent-soft" : "border-border-strong bg-surface-secondary hover:border-accent/50"}`}
        >
          <div className="flex items-center justify-center h-14 w-14 rounded-full bg-accent-soft text-accent"><FileUp className="h-7 w-7" /></div>
          <p className="ruth-type-card-title mt-4 text-main">{file?.name || "CSV dosyasını buraya bırak"}</p>
          <p className="ruth-type-caption mt-1 text-muted">veya bilgisayarından seç</p>
          {file ? <p className="ruth-type-code mt-2 text-subtle">{Math.ceil(file.size / 1024).toLocaleString("tr-TR")} KB</p> : null}
          <input type="file" accept=".csv,text/csv" hidden onChange={(event) => choose(event.target.files?.[0] || null)} />
        </label>
        <div className="flex gap-2 mt-4">
          <ExactButton variant="secondary" className="flex-1" onClick={() => { setFile(null); setResult(null); }} disabled={!file || busy}>Temizle</ExactButton>
          <ExactButton className="flex-1" onClick={() => void importCsv()} loading={busy} disabled={!file}><FileUp className="h-4 w-4" /> Aktarımı başlat</ExactButton>
        </div>
      </ExactDataCard>
      <div className="space-y-3">
        <ExactDataCard title="Aktarım Güvenliği">
          <div className="space-y-3">
            {[
              { icon: History, title: "Tekrarlı aktarım koruması", text: "Aynı sipariş numarası yeniden gelirse kopya oluşturmak yerine mevcut kayıt kontrol edilir." },
              { icon: ShoppingBag, title: "Sipariş ve müşteri eşleştirme", text: "Ürünler, müşteri bilgileri, ödeme ve teslimat alanları kanonik modele dönüştürülür." },
              { icon: CheckCircle2, title: "Denetim kaydı", text: "Aktarım kaynağı ikas_csv olarak saklanır ve sonraki işlemler kayıt zincirine eklenir." },
            ].map((item) => <div key={item.title} className="flex items-start gap-3">
              <div className="flex items-center justify-center h-8 w-8 radius-small bg-accent-soft text-accent"><item.icon className="h-4 w-4" /></div>
              <div><p className="ruth-type-card-title text-main">{item.title}</p><p className="ruth-type-caption mt-1 text-muted">{item.text}</p></div>
            </div>)}
          </div>
        </ExactDataCard>
        {result ? <ExactDataCard title="Aktarım Sonucu">
          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 radius-small bg-success-soft"><p className="ruth-type-label text-subtle">Aktarılan</p><p className="ruth-type-metric text-success-foreground">{result.imported || 0}</p></div>
            <div className="p-3 radius-small bg-info-soft"><p className="ruth-type-label text-subtle">Güncellenen</p><p className="ruth-type-metric text-info-foreground">{result.updated || 0}</p></div>
            <div className="p-3 radius-small bg-surface-secondary"><p className="ruth-type-label text-subtle">Atlanan</p><p className="ruth-type-metric text-main">{result.skipped || 0}</p></div>
            <div className="p-3 radius-small bg-danger-soft"><p className="ruth-type-label text-subtle">Hatalı</p><p className="ruth-type-metric text-danger-foreground">{result.failed || result.errors?.length || 0}</p></div>
          </div>
          {result.errors?.length ? <div className="space-y-2 mt-3 max-h-72 overflow-y-auto">
            {result.errors.map((error, index) => <div key={index} className="p-2.5 radius-small bg-danger-soft border border-danger/20">
              <div className="flex items-center justify-between"><span className="ruth-type-table font-medium text-danger-foreground">Satır {error.row || "—"}</span><ExactStatusBadge status="failed" label={error.order_no || "Hata"} size="sm" /></div>
              <p className="ruth-type-caption mt-1 text-muted">{error.error || "Bilinmeyen aktarım hatası"}</p>
            </div>)}
          </div> : null}
        </ExactDataCard> : null}
      </div>
    </div>
  </div>;
}
