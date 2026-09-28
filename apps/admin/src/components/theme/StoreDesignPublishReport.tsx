"use client";

import { AlertTriangle, CheckCircle2, Send, X, XCircle } from "lucide-react";
import type { ThemeReferenceIssue } from "@ruth-commerce/commerce-core/store-design-v2";

import { useStoreDesignDialogExit } from "@/components/theme/useStoreDesignDialogExit";

type Props = {
  issues: ThemeReferenceIssue[];
  onCancel: () => void;
  onPublish: () => void;
  publishing: boolean;
};

function friendlyIssueMessage(issue: ThemeReferenceIssue) {
  const route = typeof issue.target === "string" && issue.target.startsWith("/") ? issue.target : null;
  switch (issue.code) {
    case "missing-page-template":
      return "Bir sayfanın görünüm şablonu eksik. Sayfa ayarlarından uygun bir şablon seç.";
    case "missing-page-seo":
      return "Bir sayfanın arama ve paylaşım ayarları eksik. Sayfa ayarlarından bu alanları tamamla.";
    case "missing-template-section":
      return "Bir şablonda bulunamayan bir bölüm var. Bölüm düzenini kontrol edip eksik bölümü kaldır veya yeniden ekle.";
    case "unknown-section-definition":
      return "Bir bölüm bu sürümde tanınmıyor. Yayınlamadan önce bölümü değiştir veya kaldır.";
    case "section-runtime-unavailable":
      return "Bir bölüm mağazada gösterime hazır değil. Yayınlamadan önce farklı bir bölüm kullan veya bu bölümü kaldır.";
    case "missing-section-block":
      return "Bir bölümün içerik öğelerinden biri bulunamadı. Bölüm içeriğini açıp eksik öğeyi düzelt.";
    case "unknown-block-definition":
      return "Bir içerik öğesi bu sürümde tanınmıyor. İlgili bölümü açıp öğeyi değiştir veya kaldır.";
    case "block-runtime-unavailable":
      return "Bir içerik öğesi mağazada gösterime hazır değil. Yayınlamadan önce öğeyi değiştir veya kaldır.";
    case "shared-section-reference":
      return "Aynı bölüm birden fazla yerde kullanılıyor. Bu bölümdeki değişiklikler bağlı olan diğer yerleri de etkiler.";
    case "shared-block-reference":
      return "Aynı içerik öğesi birden fazla bölümde kullanılıyor. Değişiklik bağlı bölümleri de etkileyebilir.";
    case "invalid-preset-reference":
      return "Kaydedilmiş bir bölüm düzeninde eksik veya artık kullanılamayan içerik var. Hazır düzeni yeniden oluştur.";
    case "missing-template-binding":
      return "Bir sayfanın şablon bağlantısı eksik. Sayfaya uygun bir şablon ata.";
    case "missing-og-media":
      return "Bir sayfanın paylaşım görseli bulunamadı. Sayfa ayarlarından yeni bir paylaşım görseli seç.";
    case "broken-merchant-link":
    case "BROKEN_MANAGED_LINK":
      return route
        ? `${route} adresine giden bağlantının hedefi bulunamadı. Bağlantıyı düzelt veya hedef sayfayı oluştur.`
        : "Bir bağlantının hedef sayfası bulunamadı. Bağlantıyı düzelt veya hedef sayfayı oluştur.";
    case "link-to-unpublished-page":
      return route
        ? `${route} adresindeki sayfa henüz yayınlanmadı. Bağlantıyı kullanmadan önce sayfayı yayınla.`
        : "Bir bağlantı henüz yayınlanmamış bir sayfaya gidiyor. Hedef sayfayı yayınla veya bağlantıyı değiştir.";
    case "missing-media-reference":
      return "Kullanılan bir medya dosyası bulunamadı. İlgili bölüm veya sayfadan yeni bir medya seç.";
    default:
      return "Yayınlamayı etkileyen bir düzenleme sorunu bulundu. İlgili sayfa veya bölümü kontrol edip yeniden dene.";
  }
}

export function StoreDesignPublishReport({ issues, onCancel, onPublish, publishing }: Props) {

  const { closing, requestClose } = useStoreDesignDialogExit(onCancel, 180, publishing);
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  const canPublish = errors.length === 0;

  return (
    <div data-closing={closing ? "true" : "false"} className="sd-modal-backdrop fixed inset-0 z-[2147483630] grid place-items-center bg-black/40 p-3 backdrop-blur-sm">
      <div className="sd-modal-card flex max-h-[88dvh] w-full max-w-[760px] flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-black/10 px-4">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold">Yayınlama Öncesi Kontrol</p>
            <p className="mt-0.5 text-[8px] text-black/40">Sayfa, şablon, bölüm, içerik öğesi, medya ve bağlantılar denetlendi.</p>
          </div>
          <button type="button" onClick={requestClose} disabled={publishing} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-black/[0.04] disabled:opacity-40" aria-label="Kapat">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-black/[0.08] p-3">
              <p className="text-[7px] font-semibold uppercase tracking-[0.12em] text-black/35">Toplam</p>
              <p className="mt-1 text-xl font-semibold">{issues.length}</p>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50/50 p-3">
              <p className="text-[7px] font-semibold uppercase tracking-[0.12em] text-red-600">Hata</p>
              <p className="mt-1 text-xl font-semibold text-red-700">{errors.length}</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
              <p className="text-[7px] font-semibold uppercase tracking-[0.12em] text-amber-700">Uyarı</p>
              <p className="mt-1 text-xl font-semibold text-amber-800">{warnings.length}</p>
            </div>
          </div>

          {!issues.length ? (
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
              <div>
                <p className="text-[10px] font-semibold text-emerald-900">Sorun bulunmadı</p>
                <p className="mt-1 text-[8px] leading-4 text-emerald-800/70">Yayın sürümü oluşturulabilir.</p>
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {issues.map((issue, index) => (
                <div key={`${issue.code}-${issue.source || "source"}-${index}`} className={`rounded-xl border p-3 ${issue.severity === "error" ? "border-red-200 bg-red-50/40" : "border-amber-200 bg-amber-50/40"}`}>
                  <div className="flex items-start gap-2">
                    {issue.severity === "error" ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded px-1.5 py-0.5 text-[6px] font-semibold uppercase ${issue.severity === "error" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>{issue.severity === "error" ? "Hata" : "Uyarı"}</span>
                      </div>
                      <p className="mt-1.5 text-[8px] leading-4 text-black/65">{friendlyIssueMessage(issue)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center gap-2 border-t border-black/10 bg-[#fafafa] p-3">
          <p className="min-w-0 flex-1 text-[8px] leading-4 text-black/35">
            {canPublish ? (warnings.length ? "Uyarılar yayınlamayı engellemez; canlı sonucu kontrol ederek devam et." : "Kontrol temiz.") : "Hatalar düzeltilmeden yayınlama yapılamaz."}
          </p>
          <button type="button" onClick={requestClose} disabled={publishing} className="h-10 rounded-lg border border-black/10 bg-white px-4 text-[9px] font-semibold disabled:opacity-40">Vazgeç</button>
          <button type="button" disabled={!canPublish || publishing} onClick={onPublish} className="flex h-10 items-center gap-2 rounded-lg bg-[#111] px-4 text-[9px] font-semibold text-white disabled:opacity-35">
            <Send className="h-3.5 w-3.5" />{publishing ? "Yayınlanıyor…" : warnings.length ? "Uyarılara Rağmen Yayınla" : "Yayınla"}
          </button>
        </footer>
      </div>
    </div>
  );
}
