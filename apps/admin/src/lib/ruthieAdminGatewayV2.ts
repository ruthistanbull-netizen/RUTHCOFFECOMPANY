import { createRuthieConfirmationToken } from "@/lib/ruthieActionConfirmation";
import {
  RUTHIE_ADMIN_ACTION_IDS as ACTION_IDS,
  RUTHIE_CAPABILITY_GUIDE,
  type RuthieAdminActionId,
} from "@/lib/ruthieCapabilityGuide";

export { RUTHIE_ADMIN_ACTION_IDS } from "@/lib/ruthieCapabilityGuide";

export type RuthieAdminRisk = "none" | "low" | "high" | "critical";

type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

type ActionSpec = {
  id: RuthieAdminActionId;
  title: string;
  description: string;
  risk: RuthieAdminRisk;
  mutates: boolean;
};

type ResolvedAction = ActionSpec & {
  method: HttpMethod;
  path: string;
  query: Record<string, unknown>;
  payload: Record<string, unknown>;
  directData?: unknown;
};

const ACTIONS: readonly ActionSpec[] = [
  action("panel.summary", "Panel raporunu getir", "Dashboard, birleşik arama, ödeme, sistem, entegrasyon, bildirim, iletişim ve ROSTA Insight sohbet raporlarını getirir.", "none", false),
  action("panel.health", "Servis sağlığını getir", "Panel servisleri, Commerce Core, entegrasyonlar, e-posta ve kargo operasyon sağlığını getirir.", "none", false),
  action("orders.search", "Sipariş ve ödeme ara", "Sipariş, ödeme, PayTR, CRM, hatırlatma, müşteri yolculuğu ve tarih/durum filtrelerini getirir.", "none", false),
  action("orders.create", "Sipariş oluştur", "Paneldeki manuel sipariş akışını kullanarak sipariş oluşturur.", "high", true),
  action("orders.update", "Sipariş veya ödemeyi güncelle", "Sipariş alanları, durum, adres, not, ürün satırları, uzlaştırma ve para iadesi işlemlerini yürütür.", "high", true),
  action("orders.bulk", "Toplu sipariş işlemi", "Birden fazla siparişte durum veya kargo firması işlemi çalıştırır.", "critical", true),
  action("products.search", "Ürün ve katalog verisi ara", "Ürün, varyant, stok, fiyat, görsel, çekirdek/içerik, kategori ve koleksiyon verilerini getirir.", "none", false),
  action("products.create", "Ürün oluştur", "Yeni tekil ürün veya set ürünü oluşturur.", "high", true),
  action("products.update", "Ürünü güncelle", "Ürün, varyant, fiyat, stok, içerik, görsel, çekirdek türü ve yayın alanlarını günceller.", "high", true),
  action("products.bulk", "Toplu ürün işlemi", "Birden fazla üründe fiyat, stok, katalog, çekirdek/içerik ve ürün bilgisi işlemi çalıştırır.", "critical", true),
  action("customers.search", "Müşterileri getir", "Müşteri listeleme, arama, üyelik filtresi, sıralama, özet, izin segmenti, sipariş ve puan geçmişini getirir.", "none", false),
  action("returns.search", "İade ve değişim ara", "İade/değişim kayıtlarını, ters kargoyu, ödeme ve durum raporlarını getirir.", "none", false),
  action("returns.create", "İade veya değişim işlemi", "İade/değişim oluşturur, durumunu günceller, ters kargo veya para iadesi başlatır.", "critical", true),
  action("reviews.search", "Yorumları ara", "Ürün yorumlarını, puanları, kuponları ve moderasyon durumlarını getirir.", "none", false),
  action("reviews.update", "Yorum veya mesaj durumunu güncelle", "Yorum moderasyonu veya iletişim mesajı durum değişikliği yapar.", "high", true),
  action("points.search", "ROSTA Points raporu getir", "Müşteri puan bakiyesi, toplamlar ve hareket geçmişini getirir.", "none", false),
  action("points.adjust", "ROSTA Points düzenle", "Tek veya toplu müşteriye gerekçeli puan ekler ya da çıkarır.", "high", true),
  action("campaigns.search", "Kampanya ve otomasyon ayarlarını getir", "İndirim, kupon, kampanya, e-posta şablonu ve otomasyon ayarlarını getirir.", "none", false),
  action("campaigns.update", "Kampanya veya otomasyonu güncelle", "İndirim, kupon, kampanya ve e-posta otomasyonu ayarlarını günceller.", "high", true),
  action("catalog.groups.read", "Kategori ve koleksiyonları getir", "Kategori, koleksiyon, sıralama, durum ve ürün bağlantılarını getirir.", "none", false),
  action("catalog.groups.write", "Kategori veya koleksiyonu değiştir", "Kategori/koleksiyon oluşturur, düzenler, siler veya sıralar.", "high", true),
  action("theme.read", "Site ayarlarını getir", "Tema, duyuru, logo, renk, menü, WhatsApp, ana sayfa ve kargo ayarlarını getirir.", "none", false),
  action("theme.update", "Site ayarlarını güncelle", "Tema, duyuru, logo, renk, menü, WhatsApp, ana sayfa ve kargo ayarlarını günceller.", "high", true),
  action("shipping.orders", "Kargo verilerini getir", "Gönderiler, etiketler, hareketler, ters kargo ve operasyon istisnalarını getirir.", "none", false),
  action("shipping.quotes", "Kargo teklifi al", "Paket bilgisine göre canlı kargo teklifi hesaplar.", "none", false),
  action("shipping.create", "Kargo oluştur", "Tekil/toplu gönderi veya iade/değişim ters kargosu oluşturur.", "high", true),
  action("shipping.cancel", "Kargoyu iptal et", "Siparişin aktif gönderisini iptal eder.", "critical", true),
  action("shipping.return", "İade kargosu oluştur", "Sipariş için sağlayıcı iade gönderisi oluşturur.", "critical", true),
  action("shipping.sync", "Kargo operasyonunu çalıştır", "Gönderiyi eşitler veya başarısız webhook işlemlerini yeniden çalıştırır.", "high", true),
  action("shipping.settings.read", "Kargo ayarlarını getir", "Ücretsiz kargo limiti ve müşteriden alınan kargo ücretini getirir.", "none", false),
  action("shipping.settings.update", "Kargo ayarlarını güncelle", "Ücretsiz kargo limiti ve müşteriden alınan kargo ücretini günceller.", "high", true),
  action("email.status", "E-posta ve iletişim merkezini yönet", "Gmail/Brevo, alıcı segmentleri, şablonlar, iletişim mesajları ve push aboneliklerini okur veya alt operasyonla yönetir.", "none", false),
  action("email.send", "E-posta gönder", "Sipariş hizmet e-postası veya sağlayıcı test e-postası gönderir.", "high", true),
  action("email.bulk_send", "Toplu e-posta gönder", "İzin kontrollü müşteri segmentine toplu e-posta gönderir.", "critical", true),
  action("abandoned_carts.search", "Terk edilmiş sepet raporu getir", "Terk sepet, kurtarma, ciro ve e-posta otomasyonu raporlarını getirir.", "none", false),
  action("abandoned_carts.run", "Terk sepet otomasyonunu çalıştır", "Terk edilmiş sepet e-posta otomasyonunu çalıştırır.", "high", true),
  action("review_automation.settings.read", "Yorum otomasyonu ayarlarını getir", "Teslim sonrası yorum isteme ayarlarını getirir.", "none", false),
  action("review_automation.settings.update", "Yorum otomasyonunu güncelle", "Teslim sonrası yorum isteme ayarlarını günceller.", "high", true),
  action("review_automation.send", "Yorum isteği gönder", "Uygun sipariş için yorum isteği gönderir veya otomasyonu çalıştırır.", "high", true),
] as const;

const ACTION_MAP = new Map<RuthieAdminActionId, ActionSpec>(
  ACTIONS.map((spec) => [spec.id, spec]),
);

export const RUTHIE_ADMIN_TOOL = {
  type: "function",
  name: "ruthie_admin",
  description: [
    "ROSTA Commerce admin panelinin tam yetenekli canlı aracıdır.",
    "Arama, filtreleme, sıralama, raporlama, detay görüntüleme, oluşturma, düzenleme, silme ve otomasyon işlemlerinde kullan.",
    "Okuma işlemleri doğrudan çalışır; veri değiştiren işlemler gateway tarafından imzalı kullanıcı onayına çevrilir.",
    RUTHIE_CAPABILITY_GUIDE,
  ].join("\n\n"),
  strict: false,
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: ACTION_IDS },
      query: {
        type: "object",
        description: "Arama/filtre/rapor alanları: q, view, module, report, range, from, to, status, payment, membership, sort, page, pageSize, limit, type, provider, profileId.",
      },
      payload: {
        type: "object",
        description: "Yazma gövdesi. Alt işlem gerektiğinde payload.operation kullanılır.",
      },
      resourceId: {
        type: "string",
        description: "Sipariş, gönderi, konuşma veya kayıt kimliği.",
      },
      reason: {
        type: "string",
        description: "Kullanıcının isteğini ve hedeflenen işlemi açıkça anlatan kısa gerekçe.",
      },
    },
    required: ["action"],
    additionalProperties: false,
  },
} as const;

export type RuthiePendingAction = {
  id: string;
  action: string;
  title: string;
  summary: string;
  risk: RuthieAdminRisk;
  token: string;
  expiresAt: string;
};

export type RuthieAdminInvocationResult = {
  ok: boolean;
  action: string;
  title: string;
  status: number;
  data?: unknown;
  error?: string;
  pendingAction?: RuthiePendingAction;
};

export async function invokeRuthieAdminAction(options: {
  request: Request;
  actorId: string;
  arguments: Record<string, unknown>;
  confirmed?: boolean;
}): Promise<RuthieAdminInvocationResult> {
  const normalizedArguments = normalizeAdminArguments(options.arguments);
  const actionId = stringValue(normalizedArguments.action) as RuthieAdminActionId;
  const spec = ACTION_MAP.get(actionId);
  if (!spec) {
    return {
      ok: false,
      action: actionId,
      title: actionId || "Bilinmeyen işlem",
      status: 400,
      error: "Bu admin işlemi ROSTA Insight gateway'de kayıtlı değil.",
    };
  }

  let resolved: ResolvedAction;
  try {
    resolved = resolveAction(spec, normalizedArguments);
  } catch (error) {
    return {
      ok: false,
      action: spec.id,
      title: spec.title,
      status: 400,
      error: error instanceof Error ? error.message : "ROSTA Insight işlem hedefi oluşturulamadı.",
    };
  }

  if (resolved.directData !== undefined) {
    return {
      ok: true,
      action: resolved.id,
      title: resolved.title,
      status: 200,
      data: resolved.directData,
    };
  }

  if (resolved.mutates && !options.confirmed) {
    const confirmation = createRuthieConfirmationToken({
      actorId: options.actorId,
      action: resolved.id,
      arguments: normalizedArguments,
    });
    return {
      ok: false,
      action: resolved.id,
      title: resolved.title,
      status: 202,
      pendingAction: {
        id: cryptoId(),
        action: resolved.id,
        title: resolved.title,
        summary: pendingSummary(resolved, normalizedArguments),
        risk: resolved.risk,
        token: confirmation.token,
        expiresAt: confirmation.expiresAt,
      },
    };
  }

  const headers = forwardHeaders(options.request);
  const body = resolved.method === "GET"
    ? undefined
    : JSON.stringify(resolved.payload);
  if (body !== undefined) headers.set("Content-Type", "application/json");

  const targets = buildTargets(options.request, resolved.path, resolved.query);
  let lastNetworkError = "";

  for (const target of targets) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(target, {
        method: resolved.method,
        headers,
        cache: "no-store",
        body,
        signal: controller.signal,
      });
      const responseText = await response.text();
      let data: unknown = null;
      if (responseText) {
        try {
          data = JSON.parse(responseText);
        } catch {
          data = responseText.slice(0, 48_000);
        }
      }
      if (!response.ok) {
        return {
          ok: false,
          action: resolved.id,
          title: resolved.title,
          status: response.status,
          error: extractError(data) || `${resolved.title} işlemi başarısız oldu.`,
          data: compactData(data),
        };
      }
      return {
        ok: true,
        action: resolved.id,
        title: resolved.title,
        status: response.status,
        data: compactData(data),
      };
    } catch (error) {
      lastNetworkError = error instanceof Error
        ? error.name === "AbortError"
          ? "Panel isteği zaman aşımına uğradı."
          : error.message
        : "Panel bağlantısı kurulamadı.";
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    ok: false,
    action: resolved.id,
    title: resolved.title,
    status: 502,
    error: `Panel servisine bağlanılamadı${lastNetworkError ? `: ${lastNetworkError}` : "."}`,
  };
}

export function getRuthieAdminActionCatalog() {
  return ACTIONS.map((spec) => ({
    ...spec,
    supports: supportsFor(spec.id),
  }));
}

function action(
  id: RuthieAdminActionId,
  title: string,
  description: string,
  risk: RuthieAdminRisk,
  mutates: boolean,
): ActionSpec {
  return { id, title, description, risk, mutates };
}

function resolveAction(spec: ActionSpec, args: Record<string, unknown>): ResolvedAction {
  const query = { ...recordValue(args.query) };
  const payload = { ...recordValue(args.payload) };
  const intent = intentText(args);
  const operation = normalizedOperation(args);

  const resolved = (
    method: HttpMethod,
    path: string,
    options: Partial<Pick<ResolvedAction, "query" | "payload" | "risk" | "mutates" | "title" | "description" | "directData">> = {},
  ): ResolvedAction => ({
    ...spec,
    method,
    path,
    query: options.query ?? query,
    payload: options.payload ?? payloadWithoutControl(payload),
    risk: options.risk ?? spec.risk,
    mutates: options.mutates ?? spec.mutates,
    title: options.title ?? spec.title,
    description: options.description ?? spec.description,
    ...(options.directData !== undefined ? { directData: options.directData } : {}),
  });

  switch (spec.id) {
    case "panel.summary": {
      if (matches(intent, "capabilit", "yetenek", "neler yap", "araç kataloğu", "tool catalog")) {
        return resolved("GET", "/api/summary", {
          directData: {
            guide: RUTHIE_CAPABILITY_GUIDE,
            actions: getRuthieAdminActionCatalog(),
          },
        });
      }

      if (matches(operation, "conversation_create", "sohbet oluştur", "new conversation")) {
        return resolved("POST", "/api/rosta-insight/conversations", {
          mutates: true,
          risk: "low",
          title: "ROSTA Insight sohbeti oluştur",
        });
      }
      if (matches(operation, "conversation_rename", "sohbet yeniden adlandır", "rename conversation")) {
        return resolved("PATCH", conversationPath(args), {
          mutates: true,
          risk: "low",
          title: "ROSTA Insight sohbetini yeniden adlandır",
        });
      }
      if (matches(operation, "conversation_delete", "sohbet sil", "delete conversation")) {
        return resolved("DELETE", conversationPath(args), {
          mutates: true,
          risk: "high",
          title: "ROSTA Insight sohbetini sil",
        });
      }
      if (matches(intent, "global search", "birleşik arama", "panel arama")) {
        return resolved("GET", "/api/search");
      }
      if (matches(intent, "payment", "ödeme", "paytr", "finans")) {
        return resolved("GET", "/api/payments/list");
      }
      if (matches(intent, "commerce core", "çekirdek", "core health")) {
        return resolved("GET", "/api/commerce-core/health");
      }
      if (matches(intent, "shipping operation", "kargo istisna", "webhook", "dead letter")) {
        return resolved("GET", "/api/shipping/operations");
      }
      if (matches(intent, "integration", "entegrasyon", "eklenti")) {
        return resolved("GET", "/api/rosta-insight/integrations/status-v2");
      }
      if (matches(intent, "notification", "bildirim", "push")) {
        return resolveEmailCenter(spec, args, query, payload, intent, operation);
      }
      if (matches(intent, "contact", "iletişim mesaj")) {
        return resolveEmailCenter(spec, args, query, payload, intent, operation);
      }
      if (matches(intent, "conversation", "sohbet geçmiş", "chat history", "ruthie memory", "hafıza")) {
        return resolved("GET", "/api/rosta-insight/conversations");
      }
      return resolved("GET", "/api/summary");
    }

    case "panel.health":
      if (matches(intent, "commerce core", "çekirdek", "core")) return resolved("GET", "/api/commerce-core/health");
      if (matches(intent, "shipping", "kargo", "webhook")) return resolved("GET", "/api/shipping/operations");
      if (matches(intent, "integration", "entegrasyon", "eklenti")) return resolved("GET", "/api/rosta-insight/integrations/status-v2");
      if (matches(intent, "email", "e-posta", "gmail", "brevo")) return resolved("GET", "/api/email/status");
      return resolved("GET", "/api/health");

    case "orders.search":
      if (matches(intent, "payment detail", "ödeme detay", "merchant oid", "paytr durum")) {
        return resolved("GET", "/api/payments");
      }
      if (matches(intent, "payment", "ödeme", "paytr", "finans", "refund report", "iade rapor")) {
        return resolved("GET", "/api/payments/list");
      }
      return resolved("GET", "/api/orders", {
        query: withDefaults(query, { range: "all", payment: "all" }),
      });

    case "orders.create":
      return resolved("POST", "/api/orders/manual");

    case "orders.update":
      if (matches(operation, "refund", "payment_refund", "para iadesi", "paytr iade")) {
        return resolved("POST", "/api/payments", {
          risk: "critical",
          title: "PayTR para iadesi başlat",
        });
      }
      if (matches(operation, "bulk", "bulk_status", "toplu")) {
        return resolved("PATCH", "/api/orders/bulk", {
          risk: "critical",
          title: "Toplu sipariş işlemi",
        });
      }
      if (matches(operation, "reconcile", "uzlaştır", "uzlastir")) {
        return resolved("POST", "/api/orders/reconcile", {
          risk: "high",
          title: "Sipariş kayıtlarını uzlaştır",
        });
      }
      return resolved("PATCH", "/api/orders");

    case "orders.bulk":
      return resolved("PATCH", "/api/orders/bulk");

    case "products.search":
      if (matches(intent, "material option", "materyal seçenek")) return resolved("GET", "/api/product-settings/materials");
      if (matches(intent, "variant media", "varyant görsel", "ürün medya")) return resolved("GET", "/api/products/variant-media");
      return resolved("GET", "/api/products");

    case "products.create":
      return resolved("POST", "/api/products");

    case "products.update":
      if (matches(operation, "materials", "material_options", "materyal seçenek")) {
        return resolved("PUT", "/api/product-settings/materials", {
          title: "Çekirdek / içerik seçeneklerini güncelle",
        });
      }
      if (matches(operation, "variant_media", "media", "varyant görsel")) {
        return resolved("POST", "/api/products/variant-media", {
          title: "Varyant görsellerini güncelle",
        });
      }
      return resolved("PATCH", "/api/products");

    case "products.bulk":
      return resolved("PATCH", "/api/products/bulk-update");

    case "customers.search":
      if (matches(intent, "email segment", "e-posta segment", "alıcı segment", "recipient")) {
        return resolved("GET", "/api/email/customers");
      }
      if (matches(intent, "points", "puan", "hareket geçmiş")) {
        return resolved("GET", "/api/rosta-points");
      }
      if (matches(intent, "sipariş", "order", "alışveriş")) {
        return resolved("GET", "/api/orders", {
          query: withDefaults(query, { range: "all", payment: "all" }),
        });
      }
      return resolved("GET", "/api/customers/list", {
        query: withDefaults(query, { page: 1, pageSize: 25, membership: "all", sort: "recent" }),
      });

    case "returns.search":
      if (matches(intent, "reverse", "ters kargo", "iade kargo")) return resolved("GET", "/api/returns/shipping");
      return resolved("GET", "/api/returns");

    case "returns.create":
      if (matches(operation, "refund", "payment_refund", "para iadesi", "paytr iade")) {
        return resolved("POST", "/api/payments", {
          risk: "critical",
          title: "PayTR para iadesi başlat",
        });
      }
      if (matches(operation, "reverse_shipping", "ters kargo", "iade kargo")) {
        return resolved("POST", "/api/returns/shipping", {
          risk: "high",
          title: "İade kargo kodu oluştur",
        });
      }
      if (matches(operation, "update", "approve", "approved", "reject", "rejected", "complete", "completed", "durum")) {
        return resolved("PATCH", "/api/returns", {
          title: "İade veya değişim durumunu güncelle",
        });
      }
      return resolved("POST", "/api/returns");

    case "reviews.search":
      return resolved("GET", "/api/reviews");

    case "reviews.update":
      if (matches(operation, "contact_message", "iletişim mesaj", "message_status")) {
        return resolved("PATCH", "/api/contact-messages", {
          title: "İletişim mesajı durumunu güncelle",
        });
      }
      return resolved("PUT", "/api/reviews/status");

    case "points.search":
      return resolved("GET", "/api/rosta-points");

    case "points.adjust":
      return resolved("POST", "/api/rosta-points");

    case "campaigns.search":
      if (matches(intent, "abandoned", "terk sepet")) return resolved("GET", "/api/email/abandoned-cart/settings");
      if (matches(intent, "review automation", "yorum otomasyon")) return resolved("GET", "/api/review-automation/settings");
      if (matches(intent, "email template", "e-posta şablon", "mail şablon")) return resolved("GET", "/api/email/templates");
      return resolved("GET", "/api/discount-campaigns");

    case "campaigns.update":
      if (matches(operation, "abandoned_settings", "abandoned", "terk sepet")) {
        return resolved("PUT", "/api/email/abandoned-cart/settings", {
          title: "Terk sepet otomasyonunu güncelle",
        });
      }
      if (matches(operation, "review_settings", "review automation", "yorum otomasyon")) {
        return resolved("PUT", "/api/review-automation/settings", {
          title: "Yorum otomasyonunu güncelle",
        });
      }
      return resolved("PUT", "/api/discount-campaigns");

    case "catalog.groups.read":
      return resolved("GET", "/api/catalog-groups");

    case "catalog.groups.write": {
      const catalogQuery = { ...query };
      if (payload.type && !catalogQuery.type) catalogQuery.type = payload.type;
      if (payload.id && !catalogQuery.id) catalogQuery.id = payload.id;
      if (matches(operation, "delete", "sil", "remove")) {
        return resolved("DELETE", "/api/catalog-groups", {
          query: catalogQuery,
          risk: "high",
          title: "Kategori veya koleksiyonu sil",
        });
      }
      if (matches(operation, "update", "reorder", "sırala", "sirala", "edit", "düzenle")) {
        return resolved("PATCH", "/api/catalog-groups", {
          query: catalogQuery,
          title: "Kategori veya koleksiyonu güncelle",
        });
      }
      return resolved("POST", "/api/catalog-groups", {
        query: catalogQuery,
        title: "Kategori veya koleksiyon oluştur",
      });
    }

    case "theme.read":
      return resolved("GET", "/api/theme");

    case "theme.update":
      return resolved("PUT", "/api/theme");

    case "shipping.orders":
      if (matches(intent, "operation", "istisna", "webhook", "dead letter")) return resolved("GET", "/api/shipping/operations");
      if (matches(intent, "reverse", "ters kargo", "iade kargo")) return resolved("GET", "/api/returns/shipping");
      return resolved("GET", "/api/shipping/basit-kargo/orders");

    case "shipping.quotes":
      return resolved("POST", "/api/shipping/basit-kargo/quotes", {
        mutates: false,
        risk: "none",
      });

    case "shipping.create":
      if (matches(operation, "bulk", "toplu")) {
        return resolved("POST", "/api/shipping/basit-kargo/bulk", {
          risk: "critical",
          title: "Toplu kargo oluştur",
        });
      }
      if (matches(operation, "reverse_shipping", "return_case", "ters kargo")) {
        return resolved("POST", "/api/returns/shipping", {
          title: "İade/değişim ters kargosu oluştur",
        });
      }
      return resolved("POST", "/api/shipping/basit-kargo/shipments");

    case "shipping.cancel":
      return resolved("POST", shipmentPath(args, "cancel"));

    case "shipping.return":
      return resolved("POST", shipmentPath(args, "return"));

    case "shipping.sync":
      if (matches(operation, "retry_webhook", "retry_all_webhooks", "sync_order", "webhook", "istisna")) {
        return resolved("POST", "/api/shipping/operations", {
          payload,
          title: "Kargo operasyonunu yeniden çalıştır",
        });
      }
      return resolved("POST", shipmentPath(args, "sync"));

    case "shipping.settings.read":
      return resolved("GET", "/api/shipping/settings");

    case "shipping.settings.update":
      return resolved("PUT", "/api/shipping/settings");

    case "email.status":
      return resolveEmailCenter(spec, args, query, payload, intent, operation);

    case "email.send":
      if (matches(operation, "brevo_test", "brevo test")) {
        return resolved("POST", "/api/email/brevo", {
          title: "Brevo test e-postası gönder",
        });
      }
      return resolved("POST", "/api/email/send");

    case "email.bulk_send":
      return resolved("POST", "/api/email/bulk-send");

    case "abandoned_carts.search":
      return resolved("GET", "/api/abandoned-carts");

    case "abandoned_carts.run":
      return resolved("POST", "/api/email/abandoned-cart/run");

    case "review_automation.settings.read":
      return resolved("GET", "/api/review-automation/settings");

    case "review_automation.settings.update":
      return resolved("PUT", "/api/review-automation/settings");

    case "review_automation.send":
      return resolved("POST", "/api/review-automation/send");
  }
}

function resolveEmailCenter(
  spec: ActionSpec,
  args: Record<string, unknown>,
  query: Record<string, unknown>,
  payload: Record<string, unknown>,
  intent: string,
  operation: string,
): ResolvedAction {
  const make = (
    method: HttpMethod,
    path: string,
    options: Partial<Pick<ResolvedAction, "query" | "payload" | "risk" | "mutates" | "title">> = {},
  ): ResolvedAction => ({
    ...spec,
    method,
    path,
    query: options.query ?? query,
    payload: options.payload ?? payloadWithoutControl(payload),
    risk: options.risk ?? spec.risk,
    mutates: options.mutates ?? spec.mutates,
    title: options.title ?? spec.title,
  });

  if (matches(operation, "contact_message", "message_status", "iletişim mesaj güncelle")) {
    return make("PATCH", "/api/contact-messages", {
      mutates: true,
      risk: "low",
      title: "İletişim mesajı durumunu güncelle",
    });
  }
  if (matches(operation, "push_enable", "push_subscribe", "bildirim aç")) {
    return make("POST", "/api/push/subscriptions", {
      mutates: true,
      risk: "low",
      title: "Panel bildirimlerini aç",
    });
  }
  if (matches(operation, "push_disable", "push_unsubscribe", "bildirim kapat")) {
    return make("DELETE", "/api/push/subscriptions", {
      mutates: true,
      risk: "low",
      title: "Panel bildirimlerini kapat",
    });
  }
  if (matches(operation, "brevo_connect", "brevo_update", "brevo configure", "brevo bağla")) {
    return make("PUT", "/api/email/brevo", {
      mutates: true,
      risk: "high",
      title: "Brevo bağlantısını güncelle",
    });
  }
  if (matches(operation, "brevo_test", "brevo test")) {
    return make("POST", "/api/email/brevo", {
      mutates: true,
      risk: "low",
      title: "Brevo test e-postası gönder",
    });
  }
  if (matches(operation, "brevo_disconnect", "brevo bağlantısını kes")) {
    return make("DELETE", "/api/email/brevo", {
      mutates: true,
      risk: "high",
      title: "Brevo bağlantısını kes",
    });
  }
  if (matches(operation, "gmail_connect", "gmail bağla", "gmail yenile")) {
    return make("GET", "/api/email/gmail/connect", {
      mutates: false,
      risk: "none",
      title: "Gmail bağlantısını başlat",
    });
  }
  if (matches(operation, "gmail_disconnect", "gmail bağlantısını kes")) {
    return make("DELETE", "/api/email/status", {
      query: { ...query, provider: "gmail" },
      mutates: true,
      risk: "high",
      title: "Gmail bağlantısını kes",
    });
  }
  if (matches(intent, "recipient", "alıcı", "segment", "müşterilere gönder")) {
    return make("GET", "/api/email/customers");
  }
  if (matches(intent, "template", "şablon")) {
    return make("GET", "/api/email/templates");
  }
  if (matches(intent, "contact", "iletişim mesaj")) {
    return make("GET", "/api/contact-messages");
  }
  if (matches(intent, "push", "notification", "bildirim")) {
    return make("GET", "/api/push/subscriptions");
  }
  return make("GET", "/api/email/status");
}

function normalizeAdminArguments(input: Record<string, unknown>): Record<string, unknown> {
  const action = stringValue(input.action);
  const query = { ...recordValue(input.query) };
  const payload = { ...recordValue(input.payload) };
  const queryKeys = new Set([
    "q", "view", "module", "report", "range", "from", "to", "status", "payment",
    "membership", "sort", "page", "pageSize", "limit", "type", "provider",
    "profileId", "merchant_oid", "include_messages",
  ]);

  for (const [key, value] of Object.entries(input)) {
    if (["action", "query", "payload", "resourceId", "reason"].includes(key)) continue;
    if (queryKeys.has(key)) {
      if (query[key] === undefined) query[key] = value;
    } else if (payload[key] === undefined) {
      payload[key] = value;
    }
  }

  const reason = stringValue(input.reason).toLocaleLowerCase("tr-TR");
  const customerSearch = firstString(
    query.q,
    query.search,
    query.customer,
    query.customerName,
    query.customer_name,
    query.name,
    input.q,
    input.search,
    input.customer,
    input.customerName,
    input.customer_name,
    input.name,
  );

  if (action === "customers.search" && customerSearch && matches(reason, "sipariş", "order", "alışveriş")) {
    query.q = customerSearch;
    if (!stringValue(query.payment)) query.payment = "all";
    if (!stringValue(query.range)) query.range = "all";
    return { ...input, action: "orders.search", query, payload };
  }

  if (action === "orders.search") {
    if (customerSearch) query.q = customerSearch;
    if (!stringValue(query.payment)) query.payment = "all";
    if (!stringValue(query.range)) query.range = "all";
    if (!stringValue(query.view) && matches(reason, "ödeme", "payment", "paytr", "finans")) {
      query.view = matches(reason, "detay", "merchant", "durum") ? "payment_detail" : "payments";
    }
  }

  if (action === "customers.search") {
    if (customerSearch) query.q = customerSearch;
    if (query.page === undefined) query.page = 1;
    if (query.pageSize === undefined) query.pageSize = 25;
  }

  if (action === "returns.create" && !stringValue(payload.operation) && matches(reason, "para iadesi", "paytr iade", "payment refund")) {
    payload.operation = "refund";
  }

  return {
    ...input,
    action,
    query,
    payload,
  };
}

function intentText(args: Record<string, unknown>) {
  const query = recordValue(args.query);
  const payload = recordValue(args.payload);
  return [
    args.reason,
    query.view,
    query.module,
    query.report,
    query.operation,
    payload.operation,
    payload.action,
  ]
    .map(stringValue)
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("tr-TR");
}

function normalizedOperation(args: Record<string, unknown>) {
  const query = recordValue(args.query);
  const payload = recordValue(args.payload);
  return firstString(
    payload.operation,
    query.operation,
    query.view,
    query.module,
    query.report,
    payload.action,
    args.reason,
  ).toLocaleLowerCase("tr-TR");
}

function supportsFor(id: RuthieAdminActionId): string[] {
  const supports: Partial<Record<RuthieAdminActionId, string[]>> = {
    "panel.summary": ["dashboard", "global_search", "payments", "commerce_core", "shipping_operations", "integrations", "notifications", "contact_messages", "conversations", "capabilities"],
    "orders.search": ["search", "filters", "date_range", "payments", "paytr_status", "crm", "reminders", "customer_journey"],
    "orders.update": ["fields", "status", "payment_status", "address", "notes", "reminders", "items", "refund", "reconcile"],
    "products.search": ["search", "stock", "status", "type", "photo", "variants", "materials", "media", "categories", "collections"],
    "products.update": ["fields", "variants", "stock", "price", "content", "media", "materials", "archive"],
    "customers.search": ["list", "search", "membership", "sort", "pagination", "summary", "orders", "consents", "email_segments", "points_history"],
    "returns.create": ["create", "update", "approve", "reject", "complete", "reverse_shipping", "refund"],
    "campaigns.update": ["discounts", "coupons", "campaigns", "abandoned_settings", "review_settings"],
    "catalog.groups.write": ["create", "update", "delete", "reorder"],
    "shipping.sync": ["sync", "retry_webhook", "retry_all_webhooks", "sync_order"],
    "email.status": ["providers", "gmail", "brevo", "segments", "templates", "contact_messages", "push"],
  };
  return supports[id] || [id];
}

function conversationPath(args: Record<string, unknown>) {
  const payload = recordValue(args.payload);
  const query = recordValue(args.query);
  const id = firstString(
    args.resourceId,
    payload.conversationId,
    payload.conversation_id,
    payload.id,
    query.conversationId,
    query.id,
  );
  if (!id) throw new Error("Sohbet işlemi için resourceId veya conversationId gerekli.");
  return `/api/rosta-insight/conversations/${encodeURIComponent(id)}`;
}

function shipmentPath(args: Record<string, unknown>, operation: "cancel" | "return" | "sync") {
  const payload = recordValue(args.payload);
  const query = recordValue(args.query);
  const id = firstString(
    args.resourceId,
    payload.orderId,
    payload.order_id,
    payload.id,
    query.orderId,
    query.order_id,
    query.id,
  );
  if (!id) throw new Error("Bu kargo işlemi için resourceId veya orderId gerekli.");
  return `/api/shipping/basit-kargo/shipments/${encodeURIComponent(id)}/${operation}`;
}

function withDefaults(
  query: Record<string, unknown>,
  defaults: Record<string, unknown>,
) {
  const result = { ...query };
  for (const [key, value] of Object.entries(defaults)) {
    if (result[key] === undefined || result[key] === null || result[key] === "") result[key] = value;
  }
  return result;
}

function payloadWithoutControl(payload: Record<string, unknown>) {
  const result = { ...payload };
  delete result.operation;
  return result;
}

function buildTargets(
  request: Request,
  path: string,
  query: Record<string, unknown>,
) {
  const origins = resolveAdminOrigins(request);
  const targets: URL[] = [];

  for (const origin of origins) {
    try {
      const url = new URL(path, origin);
      for (const [key, value] of Object.entries(query)) {
        if (value == null || value === "") continue;
        if (Array.isArray(value)) {
          value.forEach((item) => url.searchParams.append(key, String(item)));
        } else {
          url.searchParams.set(key, String(value));
        }
      }
      if (!targets.some((item) => item.href === url.href)) targets.push(url);
    } catch {
      // Optional malformed origins are ignored.
    }
  }

  if (!targets.length) throw new Error("Panel API adresi oluşturulamadı.");
  return targets;
}

function resolveAdminOrigins(request: Request) {
  const values: string[] = [];
  const add = (value: unknown) => {
    if (typeof value !== "string" || !value.trim()) return;
    const normalized = value.trim().replace(/\/+$/, "");
    if (!values.includes(normalized)) values.push(normalized);
  };

  const port = stringValue(process.env.PORT) || "3000";
  add(`http://127.0.0.1:${port}`);
  add(process.env.ROSTA_INSIGHT_ADMIN_INTERNAL_ORIGIN);
  add(process.env.ADMIN_APP_URL);
  add(process.env.NEXT_PUBLIC_ADMIN_URL);

  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  if (forwardedHost) add(`${forwardedProto}://${forwardedHost}`);

  const host = request.headers.get("host")?.trim();
  if (host) add(`${request.url.startsWith("https:") ? "https" : "http"}://${host}`);

  try {
    add(new URL(request.url).origin);
  } catch {
    // Request URL is expected to be absolute.
  }
  return values;
}

function forwardHeaders(request: Request) {
  const headers = new Headers();
  for (const name of ["authorization", "cookie", "x-admin-token", "user-agent"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("x-rosta-insight-agent", "admin-v7");
  headers.set("x-correlation-id", request.headers.get("x-correlation-id") || cryptoId());
  return headers;
}

function pendingSummary(spec: ResolvedAction, args: Record<string, unknown>) {
  const reason = stringValue(args.reason);
  const payload = recordValue(args.payload);
  const identifiers = [
    payload.order_no,
    payload.orderId,
    payload.order_id,
    payload.id,
    payload.name,
    args.resourceId,
  ]
    .map(stringValue)
    .filter(Boolean)
    .slice(0, 2)
    .join(" · ");
  return [reason || spec.description, identifiers]
    .filter(Boolean)
    .join(" — ")
    .slice(0, 320);
}

function compactData(value: unknown): unknown {
  const serialized = JSON.stringify(value ?? null);
  if (serialized.length <= 96_000) return value;
  if (Array.isArray(value)) return value.slice(0, 100);
  return { truncated: true, preview: serialized.slice(0, 96_000) };
}

function extractError(value: unknown) {
  if (!value || typeof value !== "object") return typeof value === "string" ? value : "";
  const data = value as Record<string, unknown>;
  if (typeof data.error === "string") return data.error;
  if (
    data.error
    && typeof data.error === "object"
    && typeof (data.error as Record<string, unknown>).message === "string"
  ) {
    return String((data.error as Record<string, unknown>).message);
  }
  if (typeof data.message === "string") return data.message;
  return "";
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const normalized = stringValue(value);
    if (normalized) return normalized;
  }
  return "";
}

function stringValue(value: unknown) {
  return typeof value === "string"
    ? value.trim()
    : value == null
      ? ""
      : String(value).trim();
}

function matches(value: string, ...terms: string[]) {
  const normalized = value.toLocaleLowerCase("tr-TR");
  return terms.some((term) => normalized.includes(term.toLocaleLowerCase("tr-TR")));
}

function cryptoId() {
  return globalThis.crypto?.randomUUID?.()
    || `ruthie-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
