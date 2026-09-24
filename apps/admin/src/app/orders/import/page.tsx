"use client";

import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2, FileSpreadsheet, History, Upload, X } from "lucide-react";
import { LoadingIndicator } from "@ruth-commerce/ui";
import { useRef, useState } from "react";
import { adminRequest } from "@/lib/adminApi";

type ImportResult = {
  ok: boolean;
  imported: number;
  skipped: number;
  failed: number;
  total: number;
  delimiter?: string;
  errors?: Array<{ order_no: string; error: string }>;
};

const sample = `Sipariş No;Müşteri;E-posta;Telefon;Toplam;Tarih;Ürün\nIKAS-1001;Örnek Müşteri;ornek@example.com;05550000000;1250,00;27.07.2026;Örnek Ürün`;

export default function OrderHistoryImportPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState("");
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const readFile = async (file: File) => {
    setError(null);
    setResult(null);
    if (!/\.(csv|txt)$/i.test(file.name)) {
      setError("Excel dosyasını önce CSV UTF-8 olarak dışa aktar. .xlsx dosyası doğrudan yüklenmez.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    if (file.size > 8_000_000) {
      setError("Dosya 8 MB sınırını aşıyor.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    try {
      setCsv((await file.text()).replace(/^\uFEFF/, ""));
      setFileName(file.name);
    } catch {
      setError("Dosya okunamadı.");
    }
  };

  const runImport = async () => {
    if (!csv.trim()) {
      setError("CSV dosyası seç veya içeriği alana yapıştır.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await adminRequest<ImportResult>("/api/orders/import-csv", {
        method: "POST",
        body: JSON.stringify({ csv }),
      });
      setResult(response);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "İkas sipariş geçmişi aktarılamadı.");
    } finally {
      setBusy(false);
    }
  };

  const clear = () => {
    setCsv("");
    setFileName("");
    setResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <>
      <header className="cr-page-header">
        <div>
          <span className="cr-eyebrow">Geçmiş veri aktarımı</span>
          <h1>İkas siparişlerini içe aktar</h1>
          <p className="cr-description">İkas’tan Excel olarak indirdiğin sipariş listesini Excel’de CSV UTF-8 biçiminde kaydet; dosyadaki geçmiş siparişleri API bağlantısı olmadan panele aktar.</p>
        </div>
        <div className="cr-actions">
          <Link className="cr-button cr-button--secondary" href="/orders"><ArrowLeft /> Siparişlere dön</Link>
        </div>
      </header>

      {error ? <div className="cr-notice cr-notice--danger" role="alert"><AlertTriangle /><span>{error}</span><button type="button" onClick={() => setError(null)} aria-label="Hata bildirimini kapat"><X /></button></div> : null}
      {result ? <div className={`cr-notice ${result.failed ? "cr-notice--danger" : "cr-notice--success"}`} role="status"><CheckCircle2 /><span>{result.imported} sipariş eklendi · {result.skipped} tekrar kayıt atlandı · {result.failed} kayıt eklenemedi.</span><button type="button" onClick={() => setResult(null)} aria-label="Aktarım bildirimini kapat"><X /></button></div> : null}

      <section className="cr-grid cr-grid--split cr-import-layout">
        <article className="cr-card cr-card__body cr-import-card">
          <div className="cr-section-heading"><div><span className="cr-eyebrow">1. Dosya</span><h2>CSV UTF-8 dosyasını seç</h2><p>Virgül veya noktalı virgülle ayrılmış dosyalar desteklenir. En fazla 8 MB ve 5.000 sipariş.</p></div><FileSpreadsheet /></div>
          <label className="cr-product-upload cr-import-upload">
            <Upload />
            <strong>{fileName || "CSV dosyası seç"}</strong>
            <span>Excel → Farklı Kaydet → CSV UTF-8</span>
            <input ref={inputRef} type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readFile(file); }} />
          </label>
          <label className="cr-field"><span>CSV içeriği</span><textarea rows={14} value={csv} onChange={(event) => { setCsv(event.target.value); setFileName(""); setResult(null); }} placeholder={sample} spellCheck={false} /></label>
          <div className="cr-actions cr-import-actions">
            <button className="cr-button cr-button--secondary" type="button" onClick={clear} disabled={busy || (!csv && !fileName)}>Temizle</button>
            <button className="cr-button cr-button--primary" type="button" onClick={() => void runImport()} disabled={busy || !csv.trim()} aria-busy={busy || undefined}>{busy ? <LoadingIndicator size="sm" label="Siparişler içe aktarılıyor" /> : <Upload />} Geçmiş siparişleri aktar</button>
          </div>
        </article>

        <div className="cr-import-side">
          <article className="cr-card cr-card__body">
            <div className="cr-section-heading"><div><span className="cr-eyebrow">Güvenli aktarım</span><h2>Aktarım kuralları</h2></div><History /></div>
            <div className="cr-check-list">
              <p><CheckCircle2 /> Aynı sipariş numarası daha önce aktarıldıysa tekrar eklenmez.</p>
              <p><CheckCircle2 /> Kayıtlar <strong>ikas_csv</strong> kaynağıyla işaretlenir.</p>
              <p><CheckCircle2 /> İkas geçmiş siparişleri ROSTA Points kazanımına dahil edilmez.</p>
              <p><CheckCircle2 /> İkas API bağlantısı veya canlı senkronizasyon kullanılmaz.</p>
              <p><CheckCircle2 /> Başarısız satırlar ayrı listelenir; başarılı satırlar korunur.</p>
            </div>
          </article>

          <article className="cr-card cr-card__body">
            <div className="cr-section-heading"><div><span className="cr-eyebrow">Beklenen sütunlar</span><h2>Başlık eşleştirmesi</h2></div><FileSpreadsheet /></div>
            <dl className="cr-key-values">
              <div><dt>Zorunlu</dt><dd>Toplam / Tutar</dd></div>
              <div><dt>Önerilen</dt><dd>Sipariş No, Müşteri</dd></div>
              <div><dt>Müşteri</dt><dd>E-posta, Telefon</dd></div>
              <div><dt>Operasyon</dt><dd>Tarih, Ürün</dd></div>
            </dl>
          </article>

          {result?.errors?.length ? <article className="cr-card cr-card__body"><div className="cr-section-heading"><div><span className="cr-eyebrow">Hatalı satırlar</span><h2>İnceleme listesi</h2></div><AlertTriangle /></div><div className="cr-import-errors">{result.errors.map((item, index) => <div key={`${item.order_no}-${index}`}><strong>{item.order_no}</strong><span>{item.error}</span></div>)}</div></article> : null}
        </div>
      </section>
    </>
  );
}
