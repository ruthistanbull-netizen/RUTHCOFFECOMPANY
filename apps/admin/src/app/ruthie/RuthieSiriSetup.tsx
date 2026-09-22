"use client";

import Link from "next/link";
import { Check, Copy, ExternalLink, Headphones, Share2, X } from "lucide-react";
import { CopyButton, copyTextToClipboard } from "@ruth-commerce/ui";
import { useMemo } from "react";
import styles from "./RuthieSiriSetup.module.css";

export function RuthieSiriSetup() {
  const launchUrl = useMemo(() => typeof window === "undefined" ? "/rosta-insight/voice?autostart=1&source=vocal-shortcut" : `${window.location.origin}/rosta-insight/voice?autostart=1&source=vocal-shortcut`, []);

  const shareUrl = async () => {
    if (navigator.share) {
      await navigator.share({ title: "ROSTA Insight’ı aç", text: "ROSTA Insight sesli asistan bağlantısı", url: launchUrl });
      return;
    }
    await copyTextToClipboard(launchUrl);
  };

  return (
    <main className={styles.page}>
      <header><div><span><Headphones /></span><div><strong>ROSTA Insight ile Sesle Açma</strong><small>iPhone Vocal Shortcuts</small></div></div><Link href="/rosta-insight/voice" aria-label="ROSTA Insight’a dön"><X /></Link></header>
      <section className={styles.setupPanel}>
        <h1>Yalnızca “ROSTA” de</h1>
        <p>iOS Vocal Shortcuts, “Hey Siri” demeden seçtiğin özel kelimeyi cihaz üzerinde tanır ve ROSTA Insight Voice bağlantısını açar.</p>
        <ol>
          <li><span>1</span><div><strong>Önce ROSTA Insight bağlantısı için kestirme oluştur</strong><p>Kestirmeler uygulamasında yeni kestirme aç, <b>URL’leri Aç</b> eylemini ekle ve aşağıdaki bağlantıyı yapıştır. Kestirmenin adını <b>ROSTA Insight Voice</b> yap.</p></div></li>
          <li><span>2</span><div><strong>Ayarlar → Erişilebilirlik → Vocal Shortcuts</strong><p><b>Set Up / Ayarla</b> seçeneğine gir ve eylem olarak oluşturduğun <b>ROSTA Insight Voice</b> kestirmesini seç.</p></div></li>
          <li><span>3</span><div><strong>Tetikleme kelimesini öğret</strong><p>Kelime olarak yalnızca <b>ROSTA</b> veya <b>Hey ROSTA</b> yaz; iPhone istediğinde birkaç kez sesli tekrar et.</p></div></li>
        </ol>
        <div className={styles.urlBox}>
          <code>{launchUrl}</code>
          <CopyButton value={launchUrl} label="Bağlantıyı kopyala" copiedLabel="Kopyalandı">
            {(state, feedback) => <>{state === "copied" ? <Check /> : <Copy />}<span>{feedback}</span></>}
          </CopyButton>
        </div>
        <div className={styles.actions}><button type="button" onClick={() => void shareUrl()}><Share2 /> Paylaş</button><Link href="/rosta-insight/voice?autostart=1&source=vocal-shortcut"><ExternalLink /> ROSTA Insight’ı test et</Link></div>
      </section>
      <aside><strong>Nasıl çalışır?</strong><p>Vocal Shortcuts açıkken iPhone seçtiğin kelimeyi cihaz üzerinde dinler. Üst durum çubuğunda mikrofon kullanım göstergesi görünür. Telefon kilitliyse ROSTA Insight panelini açmadan önce Face ID veya parola isteyebilir.</p></aside>
    </main>
  );
}
