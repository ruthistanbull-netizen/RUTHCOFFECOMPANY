"use client";

import {
  Box,
  CheckCircle2,
  ChevronRight,
  CircleOff,
  Eye,
  Github,
  Globe2,
  HelpCircle,
  Megaphone,
  PackageSearch,
  Paperclip,
  Plug,
  RotateCcw,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  Triangle,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { adminAuthHeaders } from "@/lib/adminApi";
import styles from "./RuthieChatExtensionCenter.module.css";

type ModalName = "integrations" | "abilities" | null;
type IntegrationId = "search-console" | "meta" | "vercel" | "render" | "github";
type IntegrationStatus = { connected: boolean; detail?: string };
type StatusPayload = {
  ok?: boolean;
  integrations?: Partial<Record<IntegrationId, IntegrationStatus>>;
};
type IntegrationDefinition = {
  id: IntegrationId;
  label: string;
  description: string;
  icon: LucideIcon;
  steps: string[];
};
type AbilityDefinition = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

const integrations: IntegrationDefinition[] = [
  {
    id: "search-console",
    label: "Google Search Console",
    description: "Arama performansı, sorgular, sayfalar ve indeks verileri",
    icon: Search,
    steps: [
      "Google Cloud Console'da bir proje oluştur ve Search Console API'yi etkinleştir.",
      "OAuth istemcisi veya servis hesabı oluştur; yetkili hesabı Search Console mülküne ekle.",
      "Render admin servisinde Google istemci kimliği, gizli anahtar ve yenileme anahtarı ortam değişkenlerini tanımla.",
      "Servisi yeniden deploy et; bağlantı durumu bu ekranda otomatik güncellenir.",
    ],
  },
  {
    id: "meta",
    label: "Meta Reklam Yöneticisi",
    description: "Kampanya, reklam seti, harcama ve dönüşüm verileri",
    icon: Megaphone,
    steps: [
      "Meta for Developers üzerinden bir uygulama ve System User oluştur.",
      "ads_read ve gerekli yönetim izinlerine sahip uzun ömürlü erişim anahtarı üret.",
      "Reklam hesabı kimliğini ve erişim anahtarını Render admin ortam değişkenlerine ekle.",
      "Servisi yeniden deploy et ve bağlantı kartındaki durumu kontrol et.",
    ],
  },
  {
    id: "vercel",
    label: "Vercel",
    description: "Storefront deploy, proje ve production durumları",
    icon: Triangle,
    steps: [
      "Vercel hesap ayarlarından bir erişim tokenı oluştur.",
      "Storefront projesinin Project ID bilgisini Project Settings bölümünden kopyala.",
      "Token ve Project ID değerlerini Render admin servisinin ortam değişkenlerine ekle.",
      "Admin servisini yeniden deploy et; Ruthie daha sonra deploy durumunu okuyabilir.",
    ],
  },
  {
    id: "render",
    label: "Render",
    description: "Admin servis deploy, log ve çalışma durumu",
    icon: Server,
    steps: [
      "Render Account Settings içinden bir API anahtarı oluştur.",
      "Admin servisinin Service ID değerini servis ayarlarından al.",
      "API anahtarı ve Service ID değerini admin servisinin ortam değişkenlerine ekle.",
      "Yeniden deploy sonrasında bağlantı durumu otomatik doğrulanır.",
    ],
  },
  {
    id: "github",
    label: "GitHub",
    description: "Repo, branch, pull request ve commit işlemleri",
    icon: Github,
    steps: [
      "Fine-grained personal access token veya GitHub App erişimi oluştur.",
      "RUTHISTANBUL-COMMERCE reposuna Contents ve Pull requests yetkilerini ver.",
      "Token ile owner/repo bilgisini Render admin ortam değişkenlerine ekle.",
      "Admin servisini yeniden deploy et ve bağlantı kartını yeniden aç.",
    ],
  },
];

const abilities: AbilityDefinition[] = [
  { id: "admin", label: "Admin", description: "Panel işlemlerini analiz eder ve onayla uygular.", icon: ShieldCheck },
  { id: "web", label: "Web", description: "İnternette canlı araştırma ve kaynak taraması yapar.", icon: Globe2 },
  { id: "files", label: "Dosya", description: "PDF, belge, tablo ve yüklenen dosyaları inceler.", icon: Paperclip },
  { id: "vision", label: "Vision", description: "Fotoğraf ve kamera görüntülerini analiz eder.", icon: Eye },
  { id: "orders", label: "Sipariş", description: "Siparişleri ve operasyon akışlarını yönetir.", icon: PackageSearch },
  { id: "products", label: "Ürün", description: "Katalog, varyant ve stok verilerini kullanır.", icon: Box },
  { id: "returns", label: "İade", description: "İade ve değişim süreçlerini yönetir.", icon: RotateCcw },
];

function findLegacyAbilityButton(label: string) {
  const sidebar = document.querySelector<HTMLElement>('aside[aria-label="ROSTA Insight Chat menüsü"]');
  if (!sidebar) return null;
  return Array.from(sidebar.querySelectorAll<HTMLButtonElement>('button[aria-pressed]'))
    .find((button) => button.textContent?.trim().startsWith(label)) || null;
}

export function RuthieChatExtensionCenter() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [modal, setModal] = useState<ModalName>(null);
  const [helpId, setHelpId] = useState<IntegrationId | null>(null);
  const [statuses, setStatuses] = useState<Partial<Record<IntegrationId, IntegrationStatus>>>({});
  const [loadingStatuses, setLoadingStatuses] = useState(false);
  const [abilityState, setAbilityState] = useState<Record<string, boolean>>({});

  const syncAbilityState = useCallback(() => {
    const next: Record<string, boolean> = {};
    for (const ability of abilities) {
      next[ability.id] = findLegacyAbilityButton(ability.label)?.getAttribute("aria-pressed") !== "false";
    }
    setAbilityState(next);
  }, []);

  useEffect(() => {
    let observer: MutationObserver | null = null;

    const mount = () => {
      const sidebar = document.querySelector<HTMLElement>('aside[aria-label="ROSTA Insight Chat menüsü"]');
      if (!sidebar) return;

      const labels = Array.from(sidebar.querySelectorAll<HTMLElement>("div"));
      const legacyLabel = labels.find((element) => element.textContent?.trim().startsWith("Eklentiler"));
      if (legacyLabel) {
        legacyLabel.style.display = "none";
        const legacyGrid = legacyLabel.nextElementSibling as HTMLElement | null;
        if (legacyGrid?.querySelector('button[aria-pressed]')) legacyGrid.style.display = "none";
      }

      let portalHost = sidebar.querySelector<HTMLElement>("#ruthie-extension-center-host");
      if (!portalHost) {
        portalHost = document.createElement("div");
        portalHost.id = "ruthie-extension-center-host";
        const footer = sidebar.querySelector("footer");
        sidebar.insertBefore(portalHost, footer || null);
      }
      setHost(portalHost);
      syncAbilityState();
    };

    mount();
    observer = new MutationObserver(mount);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-pressed"] });
    return () => observer?.disconnect();
  }, [syncAbilityState]);

  useEffect(() => {
    if (!modal && !helpId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (helpId) setHelpId(null);
        else setModal(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [helpId, modal]);

  const loadStatuses = useCallback(async () => {
    setLoadingStatuses(true);
    try {
      const headers = await adminAuthHeaders();
      const response = await fetch("/api/ruthie/integrations/status", { headers, cache: "no-store" });
      const payload = await response.json().catch(() => null) as StatusPayload | null;
      setStatuses(response.ok && payload?.ok ? payload.integrations || {} : {});
    } catch {
      setStatuses({});
    } finally {
      setLoadingStatuses(false);
    }
  }, []);

  const openIntegrations = () => {
    setModal("integrations");
    void loadStatuses();
  };

  const toggleAbility = (ability: AbilityDefinition) => {
    const button = findLegacyAbilityButton(ability.label);
    button?.click();
    window.setTimeout(syncAbilityState, 40);
  };

  const connectedCount = useMemo(
    () => integrations.filter((item) => statuses[item.id]?.connected).length,
    [statuses],
  );
  const enabledAbilityCount = useMemo(
    () => abilities.filter((item) => abilityState[item.id] !== false).length,
    [abilityState],
  );
  const helpIntegration = integrations.find((item) => item.id === helpId) || null;

  const launcher = host ? createPortal(
    <section className={styles.launcher} aria-label="Ruthie eklentileri ve yetenekleri">
      <button type="button" onClick={openIntegrations}>
        <span className={styles.launcherIcon}><Plug /></span>
        <span><strong>Eklentiler</strong><small>Dış servis bağlantıları</small></span>
        <em>{connectedCount}/{integrations.length}</em>
        <ChevronRight />
      </button>
      <button type="button" onClick={() => { syncAbilityState(); setModal("abilities"); }}>
        <span className={styles.launcherIcon}><Sparkles /></span>
        <span><strong>Yetenekler</strong><small>Ruthie çalışma özellikleri</small></span>
        <em>{enabledAbilityCount}/{abilities.length}</em>
        <ChevronRight />
      </button>
    </section>,
    host,
  ) : null;

  const popup = modal ? createPortal(
    <div className={styles.overlay} role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) setModal(null);
    }}>
      <section className={styles.modal} role="dialog" aria-modal="true" aria-label={modal === "integrations" ? "Eklentiler" : "Yetenekler"}>
        <header>
          <div>
            <span>{modal === "integrations" ? <Plug /> : <Sparkles />}</span>
            <div>
              <strong>{modal === "integrations" ? "Eklentiler" : "Yetenekler"}</strong>
              <small>{modal === "integrations" ? "Ruthie'nin bağlanabildiği dış servisler" : "Ruthie'nin kullanabildiği çalışma özellikleri"}</small>
            </div>
          </div>
          <button type="button" onClick={() => setModal(null)} aria-label="Pencereyi kapat"><X /></button>
        </header>

        {modal === "integrations" ? (
          <div className={styles.integrationList}>
            {integrations.map(({ id, label, description, icon: Icon }) => {
              const status = statuses[id];
              const connected = Boolean(status?.connected);
              return (
                <article key={id} className={connected ? styles.connectedCard : ""}>
                  <span className={styles.serviceIcon}><Icon /></span>
                  <div className={styles.cardCopy}>
                    <strong>{label}</strong>
                    <small>{description}</small>
                    <p>{loadingStatuses && !status ? "Bağlantı kontrol ediliyor…" : status?.detail || (connected ? "Bağlantı doğrulandı." : "Bağlı değil")}</p>
                  </div>
                  <span className={`${styles.status} ${connected ? styles.statusConnected : styles.statusOff}`}>
                    {connected ? <CheckCircle2 /> : <CircleOff />}
                    {connected ? "Bağlı" : "Bağlı değil"}
                  </span>
                  {!connected ? (
                    <button className={styles.helpButton} type="button" onClick={() => setHelpId(id)} aria-label={`${label} nasıl bağlanır?`}>
                      <HelpCircle />
                    </button>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <div className={styles.abilityList}>
            {abilities.map((ability) => {
              const Icon = ability.icon;
              const enabled = abilityState[ability.id] !== false;
              return (
                <button key={ability.id} type="button" onClick={() => toggleAbility(ability)} aria-pressed={enabled}>
                  <span className={styles.serviceIcon}><Icon /></span>
                  <span className={styles.cardCopy}><strong>{ability.label}</strong><small>{ability.description}</small></span>
                  <span className={`${styles.switch} ${enabled ? styles.switchOn : ""}`}><i /></span>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>,
    document.body,
  ) : null;

  const helpPopup = helpIntegration ? createPortal(
    <div className={`${styles.overlay} ${styles.helpOverlay}`} role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) setHelpId(null);
    }}>
      <section className={`${styles.modal} ${styles.helpModal}`} role="dialog" aria-modal="true" aria-label={`${helpIntegration.label} bağlantı yardımı`}>
        <header>
          <div>
            <span><helpIntegration.icon /></span>
            <div><strong>{helpIntegration.label}</strong><small>Nasıl bağlanır?</small></div>
          </div>
          <button type="button" onClick={() => setHelpId(null)} aria-label="Yardımı kapat"><X /></button>
        </header>
        <ol>
          {helpIntegration.steps.map((step, index) => (
            <li key={step}><span>{index + 1}</span><p>{step}</p></li>
          ))}
        </ol>
        <footer>
          <HelpCircle />
          <p>Gizli anahtarları kodun içine yazma. Render ortam değişkenlerinde sakla ve bağlantıdan sonra yeniden deploy et.</p>
        </footer>
      </section>
    </div>,
    document.body,
  ) : null;

  return <>{launcher}{popup}{helpPopup}</>;
}
