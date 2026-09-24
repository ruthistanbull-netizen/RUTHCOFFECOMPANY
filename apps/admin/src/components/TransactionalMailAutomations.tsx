"use client";

import { CheckCircle2, Clock3, Mail, PackageCheck, ShoppingBag, Truck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { adminRequest } from "@/lib/adminApi";
import { formatDateTime } from "@/lib/format";

type MailLog = {
  id: string;
  template_key?: string | null;
  status?: string | null;
  to_email?: string | null;
  subject?: string | null;
  sent_at?: string | null;
  created_at?: string | null;
  error_message?: string | null;
};

const automations = [
  { key: "order_created", title: "Sipariş alındı", detail: "Müşteri sipariş verdiğinde ürün ve tutar özetiyle otomatik gider.", trigger: "Sipariş oluşturuldu", icon: ShoppingBag },
  { key: "order_lifecycle_ready", title: "Kargoya hazır", detail: "Kargo kodu/etiketi oluşup sipariş ready_to_ship olduğunda otomatik gider.", trigger: "Kargo kodu oluşturuldu", icon: PackageCheck },
  { key: "order_lifecycle_shipped", title: "Sipariş gönderildi", detail: "Basit Kargo API'si gönderiyi yolda olarak bildirdiğinde otomatik gider.", trigger: "in_transit / shipped", icon: Truck },
  { key: "order_lifecycle_delivered", title: "Sipariş teslim edildi", detail: "Basit Kargo API'si teslim edildi durumunu bildirdiğinde otomatik gider.", trigger: "delivered", icon: CheckCircle2 },
];

export function TransactionalMailAutomations() {
  const [logs, setLogs] = useState<MailLog[]>([]);

  useEffect(() => {
    void adminRequest<{ logs?: MailLog[] }>("/api/email/logs")
      .then((result) => setLogs(result.logs || []))
      .catch(() => setLogs([]));
  }, []);

  const stats = useMemo(() => Object.fromEntries(automations.map((automation) => {
    const rows = logs.filter((log) => log.template_key === automation.key);
    const last = rows[0] || null;
    return [automation.key, {
      sent: rows.filter((row) => row.status === "sent").length,
      failed: rows.filter((row) => row.status === "failed").length,
      last,
    }];
  })), [logs]);

  return (
    <section className="cr-card cr-transactional-mails">
      <div className="cr-card__header">
        <div><span className="cr-eyebrow">Hizmet mailleri</span><h2>Sipariş yaşam döngüsü otomasyonları</h2></div>
        <span className="cr-status cr-status--success">Sistem tarafından aktif</span>
      </div>
      <div className="cr-transactional-mail-grid">
        {automations.map((automation) => {
          const Icon = automation.icon;
          const stat = stats[automation.key] || { sent: 0, failed: 0, last: null };
          return (
            <article key={automation.key}>
              <header><span><Icon aria-hidden="true" /></span><span className="cr-status cr-status--success">Otomatik</span></header>
              <h3>{automation.title}</h3>
              <p>{automation.detail}</p>
              <dl>
                <div><dt>Tetikleyici</dt><dd>{automation.trigger}</dd></div>
                <div><dt>Gönderilen log</dt><dd>{stat.sent}</dd></div>
                <div><dt>Başarısız</dt><dd>{stat.failed}</dd></div>
              </dl>
              <footer><Clock3 aria-hidden="true" /><span>{stat.last ? `${stat.last.status === "sent" ? "Son gönderim" : "Son deneme"}: ${formatDateTime(stat.last.sent_at || stat.last.created_at)}` : "Henüz gönderim logu yok"}</span></footer>
              {stat.last?.error_message ? <div className="cr-notice cr-notice--danger"><Mail /><span>{stat.last.error_message}</span></div> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
