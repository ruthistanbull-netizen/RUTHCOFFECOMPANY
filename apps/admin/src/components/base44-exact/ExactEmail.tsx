"use client";

import Link from "next/link";
import { CheckCircle2, Mail, MessageSquareText, Plug, RefreshCw, Send, Settings2, Sparkles, UsersRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminRequest } from "@/lib/adminApi";
import { ExactButton, ExactIconButton, ExactPageHeader, ExactSkeleton, ExactStatusBadge, useExactToast } from "./primitives";
import { ExactDataCard, ExactEmptyState, ExactMetricCard } from "./data";

type Integration = {
  id: string;
  provider: string;
  email: string | null;
  sender_name: string | null;
  status: string;
  updated_at: string | null;
};
type EmailStatus = { integrations?: Integration[]; activeIntegration?: Integration | null };

function dateTime(value?: string | null) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

export function ExactEmail() {
  const toast = useExactToast();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [active, setActive] = useState<Integration | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const result = await adminRequest<EmailStatus>("/api/email/status", { force });
      const gmailOnly = (result.integrations || []).filter((item) => item.provider === "gmail");
      const activeGmail = result.activeIntegration?.provider === "gmail"
        ? result.activeIntegration
        : gmailOnly.find((item) => ["active", "connected"].includes(item.status)) || null;
      setIntegrations(gmailOnly);
      setActive(activeGmail);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "E-posta sağlayıcı durumu alınamadı.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const handler = (event: Event) => {
      const match = (event as CustomEvent<{ match?: string | null }>).detail?.match || "";
      if (match.includes("/api/email/status")) void load(true);
    };
    window.addEventListener("ruth-admin-api-cache-clear", handler);
    return () => window.removeEventListener("ruth-admin-api-cache-clear", handler);
  }, [load]);

  const gmail = useMemo(() => integrations.find((item) => item.provider === "gmail") || null, [integrations]);
  const gmailActive = gmail?.status === "active" || gmail?.status === "connected";

  const connectGmail = async () => {
    setBusy("gmail-connect");
    try {
      const result = await adminRequest<{ authUrl?: string }>("/api/email/gmail/connect");
      if (!result.authUrl) throw new Error("Gmail yetkilendirme bağlantısı alınamadı.");
      window.location.href = result.authUrl;
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Gmail bağlantısı başlatılamadı.");
      setBusy(null);
    }
  };

  const disconnectGmail = async () => {
    setBusy("disconnect:gmail");
    try {
      await adminRequest("/api/email/status?provider=gmail", { method: "DELETE" });
      toast.success("Gmail bağlantısı kapatıldı.");
      await load(true);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Gmail bağlantısı kapatılamadı.");
    } finally {
      setBusy(null);
    }
  };

  const tools = [
    { href: "/contact-messages", icon: MessageSquareText, title: "İletişim mesajları", description: "Mağaza iletişim formundan gelen müşteri mesajlarını yönet." },
    { href: "/email/customers", icon: UsersRound, title: "Müşterilere gönder", description: "İzinli müşteri gruplarına kişiselleştirilmiş e-posta gönder." },
    { href: "/email/templates", icon: Mail, title: "Hazır şablonlar", description: "Kampanya, koleksiyon ve teşekkür şablonlarını düzenle." },
    { href: "/email/automations", icon: Sparkles, title: "Pazarlama otomasyonları", description: "Terk edilmiş sepet ve teslim sonrası akışlarını zamanla." },
    { href: "/abandoned-carts", icon: Send, title: "Terk edilmiş sepetler", description: "Sepet kurtarma gönderimlerini ve sonuçlarını izle." },
  ];

  return (
    <div className="space-y-4 animate-fade-in" data-exact-base44-page="email">
      <ExactPageHeader
        title="E-posta Merkezi"
        subtitle="Gmail, şablonlar, alıcılar ve otomasyonlar"
        actions={<ExactIconButton icon={RefreshCw} label="Yenile" variant="secondary" onClick={() => void load(true)} loading={loading} />}
      />

      {loading ? (
        <div className="grid grid-cols-3 gap-3"><ExactSkeleton className="h-32" /><ExactSkeleton className="h-32" /><ExactSkeleton className="h-32" /></div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <ExactMetricCard label="Gmail Durumu" value={gmailActive ? 1 : 0} icon={Mail} />
          <ExactMetricCard label="Bağlı Hesap" value={gmail ? 1 : 0} icon={Plug} />
          <ExactMetricCard label="Gönderim Hazır" value={active?.provider === "gmail" ? 1 : 0} icon={CheckCircle2} />
        </div>
      )}

      <ExactDataCard title="Gmail Yetkilendirmesi">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center radius-small bg-accent-soft text-accent"><Mail className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-main">{gmailActive ? "Gmail bağlı" : "Gmail bağlantısı gerekli"}</h3>
              <ExactStatusBadge status={gmailActive ? "active" : "inactive"} label={gmailActive ? "Aktif" : "Pasif"} size="sm" />
            </div>
            <p className="mt-1 truncate text-xs text-muted">{gmail?.email || "Henüz hesap bağlanmadı"}</p>
            <p className="mt-1 text-[10px] text-subtle">Son güncelleme: {dateTime(gmail?.updated_at)}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <ExactButton size="sm" onClick={() => void connectGmail()} loading={busy === "gmail-connect"}><Plug className="h-4 w-4" /> Gmail’i bağla / yenile</ExactButton>
          {gmail ? <ExactButton variant="destructive" size="sm" onClick={() => void disconnectGmail()} loading={busy === "disconnect:gmail"}>Bağlantıyı kes</ExactButton> : null}
        </div>
      </ExactDataCard>

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <Link href={tool.href} key={tool.href} className="group bg-surface-primary radius-card shadow-card p-4 hover:shadow-floating transition-all">
              <div className="flex h-10 w-10 items-center justify-center radius-small bg-accent-soft text-accent mb-3"><Icon className="h-5 w-5" /></div>
              <h3 className="text-sm font-semibold text-main group-hover:text-accent transition-colors">{tool.title}</h3>
              <p className="text-xs text-muted mt-1 min-h-8">{tool.description}</p>
              <span className="text-[11px] font-medium text-accent mt-3 inline-block">Yönetimi aç →</span>
            </Link>
          );
        })}
      </div>

      {!loading && !gmail ? (
        <ExactDataCard><ExactEmptyState icon={Settings2} title="Gmail bağlı değil" description="Gmail hesabını bağlayarak hizmet ve pazarlama e-postalarını etkinleştir." /></ExactDataCard>
      ) : null}
    </div>
  );
}
