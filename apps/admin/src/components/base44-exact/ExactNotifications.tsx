"use client";

import { AlertTriangle, BellOff, BellRing, CheckCircle2, HeartPulse, MessageSquareText, RefreshCw, Send, Smartphone } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { adminRequest } from "@/lib/adminApi";
import { ExactButton, ExactIconButton, ExactPageHeader, ExactStatusBadge, useExactToast } from "./primitives";
import { ExactDataCard, ExactMetricCard } from "./data";

function urlBase64ToArrayBuffer(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const bytes = Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}
function standaloneMode() { if (typeof window === "undefined") return false; const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean }; return window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true; }

const NOTIFICATION_COVERAGE = [
  { icon: BellRing, title: "Yeni sipariş", text: "Ödemesi tamamlanan yeni sipariş geldiğinde." },
  { icon: CheckCircle2, title: "CRM hatırlatması", text: "Planlanan müşteri veya sipariş takip zamanı geldiğinde." },
  { icon: MessageSquareText, title: "Yeni müşteri mesajı", text: "Web sitesindeki iletişim formundan yeni mesaj geldiğinde." },
  { icon: HeartPulse, title: "Backend servis sağlığı", text: "Commerce Core, panel sync, API veya kuyruk sistemi doğrulanmış bir sorun yaşadığında." },
  { icon: AlertTriangle, title: "Operasyon istisnası", text: "Ödeme başarısızlığı, kargo dead-letter veya reconcile manuel inceleme gerektirdiğinde." },
];

export function ExactNotifications() {
  const toast = useExactToast();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);

  const inspect = useCallback(async (showSuccess = false) => {
    setChecking(true);
    try {
      const canPush = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      setSupported(canPush);
      setStandalone(standaloneMode());
      if (!canPush) {
        setPermission("default");
        setSubscription(null);
        if (showSuccess) toast.info("Bu tarayıcı web push bildirimlerini desteklemiyor.");
        return;
      }
      setPermission(Notification.permission);
      const registration = await navigator.serviceWorker.register("/push-sw.js", { scope: "/" });
      setSubscription(await registration.pushManager.getSubscription());
      if (showSuccess) toast.success("Cihaz bildirim durumu yenilendi.");
    } catch (caught) {
      setSupported(false);
      setSubscription(null);
      toast.error(caught instanceof Error ? caught.message : "Bildirim desteği kontrol edilemedi.");
    } finally {
      setChecking(false);
    }
  }, [toast]);

  useEffect(() => { void inspect(false); }, [inspect]);

  const enable = async () => {
    if (busy || !supported) return;
    setBusy(true);
    try {
      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);
      if (nextPermission !== "granted") throw new Error("Bildirim izni verilmedi.");
      const config = await adminRequest<{ vapidPublicKey?: string }>("/api/push/config");
      if (!config.vapidPublicKey) throw new Error("VAPID açık anahtarı bulunamadı.");
      const registration = await navigator.serviceWorker.register("/push-sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const current = await registration.pushManager.getSubscription();
      const next = current || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToArrayBuffer(config.vapidPublicKey),
      });
      await adminRequest("/api/push/subscriptions", { method: "POST", body: JSON.stringify(next.toJSON()) });
      setSubscription(next);
      toast.success("Sipariş, CRM, müşteri mesajı, servis sağlığı ve operasyon bildirimleri açıldı.");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Bildirimler açılamadı.");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (!subscription || busy) return;
    setBusy(true);
    try {
      const endpoint = subscription.endpoint;
      if (!await subscription.unsubscribe()) throw new Error("Tarayıcı bildirim aboneliğini kapatamadı.");
      await adminRequest("/api/push/subscriptions", { method: "DELETE", body: JSON.stringify({ endpoint }) });
      setSubscription(null);
      toast.success("Bu cihaz için bildirimler kapatıldı.");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Bildirim aboneliği kapatılamadı.");
      await inspect(false);
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    if (!subscription || busy) return;
    setBusy(true);
    try {
      await adminRequest("/api/push/test", { method: "POST", body: "{}" });
      toast.success("Test bildirimi gönderildi.");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Test bildirimi gönderilemedi.");
    } finally {
      setBusy(false);
    }
  };

  return <div className="space-y-4 animate-fade-in" data-exact-base44-page="notifications">
    <ExactPageHeader
      title="Bildirimler"
      subtitle="Panel kapalıyken sipariş, CRM, müşteri mesajı, servis sağlığı ve operasyon uyarılarını bu cihazda al"
      actions={<ExactIconButton icon={RefreshCw} label="Durumu yenile" variant="secondary" onClick={() => void inspect(true)} loading={checking || busy} />}
    />
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <ExactMetricCard label="Tarayıcı Desteği" value={supported ? 1 : 0} icon={Smartphone} />
      <ExactMetricCard label="Uygulama Modu" value={standalone ? 1 : 0} icon={Smartphone} />
      <ExactMetricCard label="Bildirim İzni" value={permission === "granted" ? 1 : 0} icon={BellRing} />
      <ExactMetricCard label="Push Aboneliği" value={subscription ? 1 : 0} icon={BellRing} />
    </div>
    {!standalone && supported ? <div className="ruth-type-caption p-3 radius-control bg-info-soft border border-info/20 flex items-start gap-2 text-info-foreground"><Smartphone className="h-4 w-4 shrink-0" /><span>iPhone’da tam push desteği için Safari paylaş menüsünden <strong>Ana Ekrana Ekle</strong> seçeneğini kullan ve paneli ana ekran simgesinden aç.</span></div> : null}
    <div className="grid lg:grid-cols-2 gap-3">
      <ExactDataCard title="Bu Cihaz">
        <div className="flex items-center gap-3 p-3 radius-small bg-surface-secondary">
          <div className="flex items-center justify-center h-10 w-10 radius-small bg-accent-soft text-accent"><Smartphone className="h-5 w-5" /></div>
          <div className="flex-1"><p className="ruth-type-card-title text-main">{standalone ? "Ana ekran uygulaması" : "Web tarayıcı"}</p><p className="ruth-type-caption text-muted">{subscription ? "Tüm yönetici bildirimleri bu cihaza bağlı" : "Bildirim aboneliği yok"}</p></div>
          <ExactStatusBadge status={subscription ? "active" : "archived"} label={subscription ? "Aktif" : "Kapalı"} size="sm" />
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          {!subscription
            ? <ExactButton size="sm" onClick={() => void enable()} disabled={!supported || checking} loading={busy}><BellRing className="h-4 w-4" /> Bildirimleri aç</ExactButton>
            : <><ExactButton size="sm" onClick={() => void sendTest()} loading={busy}><Send className="h-4 w-4" /> Test gönder</ExactButton><ExactButton variant="destructive" size="sm" onClick={() => void disable()} loading={busy}><BellOff className="h-4 w-4" /> Kapat</ExactButton></>}
        </div>
      </ExactDataCard>
      <ExactDataCard title="Gönderilecek Bildirimler">
        <div className="space-y-2">{NOTIFICATION_COVERAGE.map((item) => <div key={item.title} className="flex items-start gap-3 p-3 radius-small bg-surface-secondary"><item.icon className="h-4 w-4 text-accent mt-0.5" /><div><p className="ruth-type-card-title text-main">{item.title}</p><p className="ruth-type-caption mt-1 text-muted">{item.text}</p></div></div>)}</div>
      </ExactDataCard>
    </div>
  </div>;
}
