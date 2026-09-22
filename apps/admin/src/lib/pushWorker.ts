import {
  createCipheriv,
  createECDH,
  createPrivateKey,
  hkdfSync,
  randomBytes,
  sign as signPayload,
} from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type PushConfig = {
  vapid_public_key: string;
  vapid_private_key: string;
  subject: string;
};

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
};

type PushJob = {
  id: string;
  kind: "order" | "reminder" | "contact" | "health" | "test";
  payload: Record<string, unknown> | null;
  target_url: string | null;
  order_id: string | null;
  attempts: number;
};

export type AdminPushWorkerResult = {
  ok: boolean;
  error?: string;
  sent?: number;
  reason?: "no_active_subscriptions" | "no_pending_jobs";
  jobs?: number;
  sent_jobs?: number;
  failed_jobs?: number;
  delivered_notifications?: number;
};

class PushDeliveryError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "PushDeliveryError";
    this.statusCode = statusCode;
  }
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pushConfigFrom(value: unknown): PushConfig | null {
  if (!isRecord(value)) return null;
  const vapidPublicKey = clean(value.vapid_public_key);
  const vapidPrivateKey = clean(value.vapid_private_key);
  const subject = clean(value.subject);
  if (!vapidPublicKey || !vapidPrivateKey || !subject) return null;
  return {
    vapid_public_key: vapidPublicKey,
    vapid_private_key: vapidPrivateKey,
    subject,
  };
}

function subscriptionsFrom(value: unknown): PushSubscriptionRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const id = clean(item.id);
    const endpoint = clean(item.endpoint);
    const p256dh = clean(item.p256dh);
    const authKey = clean(item.auth_key);
    if (!id || !endpoint || !p256dh || !authKey) return [];
    return [{ id, endpoint, p256dh, auth_key: authKey }];
  });
}

const PUSH_KINDS = new Set<PushJob["kind"]>(["order", "reminder", "contact", "health", "test"]);

function jobsFrom(value: unknown): PushJob[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const id = clean(item.id);
    const kind = clean(item.kind) as PushJob["kind"];
    if (!id || !PUSH_KINDS.has(kind)) return [];
    return [{
      id,
      kind,
      payload: isRecord(item.payload) ? item.payload : null,
      target_url: clean(item.target_url) || null,
      order_id: clean(item.order_id) || null,
      attempts: Number.isFinite(Number(item.attempts)) ? Number(item.attempts) : 0,
    }];
  });
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function amountText(value: unknown, currency: unknown) {
  const amount = numberValue(value);
  const code = clean(currency).toUpperCase() || "TRY";
  const number = new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
  return code === "TRY" ? `${number} TL` : `${number} ${code}`;
}

function notificationFor(job: PushJob) {
  const payload = job.payload || {};
  const url = clean(job.target_url) || "/";

  if (job.kind === "order") {
    const customerName = clean(payload.customer_name) || "Müşteri";
    const amount = amountText(payload.total_amount, payload.currency);
    return {
      title: "Yeni Sipariş",
      body: `${customerName} ${amount} tutarında alışveriş yaptı.`,
      url,
      tag: `rosta-order-${job.order_id || job.id}`,
    };
  }

  if (job.kind === "reminder") {
    const orderNo = clean(payload.order_no);
    const customerName = clean(payload.customer_name) || "Müşteri";
    const reminderNote = clean(payload.reminder_note) || clean(payload.admin_note);
    const prefix = [orderNo ? `#${orderNo}` : "", customerName].filter(Boolean).join(" · ");
    return {
      title: "Hatırlatma zamanı",
      body: reminderNote ? `${prefix}: ${reminderNote}` : `${prefix}: Siparişi kontrol et.`,
      url,
      tag: `rosta-reminder-${job.order_id || job.id}`,
    };
  }

  if (job.kind === "contact") {
    const senderName = clean(payload.name) || "Bir müşteri";
    return {
      title: "Yeni iletişim mesajı",
      body: `${senderName} iletişim formundan yeni bir mesaj gönderdi.`,
      url,
      tag: `rosta-contact-${clean(payload.message_id) || job.id}`,
    };
  }

  if (job.kind === "health") {
    const serviceKey = clean(payload.service_key) || "system";
    const status = clean(payload.status) || "degraded";
    return {
      title: clean(payload.title) || (status === "unhealthy" ? "ROSTA Panel servis hatası" : "ROSTA Panel servis uyarısı"),
      body: clean(payload.body) || `${serviceKey} kontrol gerektiriyor.`,
      url: url || "/system",
      tag: `rosta-health-${serviceKey}`,
    };
  }

  return {
    title: clean(payload.title) || "ROSTA Panel bildirimleri açık",
    body: clean(payload.body) || "Sipariş, hatırlatıcı ve servis sağlığı bildirimleri bu cihaza gönderilecek.",
    url,
    tag: `rosta-test-${job.id}`,
  };
}

function base64UrlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function vapidPrivateKeyObject(publicKey: Buffer, privateKey: Buffer) {
  const sec1 = Buffer.concat([
    Buffer.from([0x30, 0x77, 0x02, 0x01, 0x01, 0x04, 0x20]),
    privateKey,
    Buffer.from([0xa0, 0x0a, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07]),
    Buffer.from([0xa1, 0x44, 0x03, 0x42, 0x00]),
    publicKey,
  ]);
  return createPrivateKey({ key: sec1, format: "der", type: "sec1" });
}

function createVapidJwt(endpoint: string, config: PushConfig) {
  const publicKey = Buffer.from(config.vapid_public_key, "base64url");
  const privateKey = Buffer.from(config.vapid_private_key, "base64url");
  if (publicKey.length !== 65 || publicKey[0] !== 4 || privateKey.length !== 32) {
    throw new Error("VAPID key format is invalid.");
  }

  const key = vapidPrivateKeyObject(publicKey, privateKey);
  const header = base64UrlJson({ typ: "JWT", alg: "ES256" });
  const payload = base64UrlJson({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: config.subject,
  });
  const unsigned = `${header}.${payload}`;
  const signature = signPayload("sha256", Buffer.from(unsigned), {
    key,
    dsaEncoding: "ieee-p1363",
  });
  return `${unsigned}.${signature.toString("base64url")}`;
}

function encryptWebPushPayload(subscription: PushSubscriptionRow, payload: string) {
  const receiverPublicKey = Buffer.from(subscription.p256dh, "base64url");
  const authSecret = Buffer.from(subscription.auth_key, "base64url");
  if (receiverPublicKey.length !== 65 || receiverPublicKey[0] !== 4 || authSecret.length === 0) {
    throw new Error("Push subscription key format is invalid.");
  }

  const sender = createECDH("prime256v1");
  sender.generateKeys();
  const senderPublicKey = sender.getPublicKey();
  const sharedSecret = sender.computeSecret(receiverPublicKey);
  const keyInfo = Buffer.concat([
    Buffer.from("WebPush: info\0", "utf8"),
    receiverPublicKey,
    senderPublicKey,
  ]);
  const inputKeyMaterial = Buffer.from(
    hkdfSync("sha256", sharedSecret, authSecret, keyInfo, 32),
  );
  const salt = randomBytes(16);
  const contentEncryptionKey = Buffer.from(
    hkdfSync(
      "sha256",
      inputKeyMaterial,
      salt,
      Buffer.from("Content-Encoding: aes128gcm\0", "utf8"),
      16,
    ),
  );
  const nonce = Buffer.from(
    hkdfSync(
      "sha256",
      inputKeyMaterial,
      salt,
      Buffer.from("Content-Encoding: nonce\0", "utf8"),
      12,
    ),
  );

  const plaintext = Buffer.concat([Buffer.from(payload, "utf8"), Buffer.from([2])]);
  const cipher = createCipheriv("aes-128-gcm", contentEncryptionKey, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  const recordSize = Buffer.allocUnsafe(4);
  recordSize.writeUInt32BE(4096, 0);

  return Buffer.concat([
    salt,
    recordSize,
    Buffer.from([senderPublicKey.length]),
    senderPublicKey,
    ciphertext,
  ]);
}

function toFetchBody(source: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(source.byteLength);
  copy.set(source);
  return copy.buffer;
}

async function sendWebPushNotification(
  subscription: PushSubscriptionRow,
  payload: string,
  config: PushConfig,
  ttl: number,
) {
  const body = encryptWebPushPayload(subscription, payload);
  const token = createVapidJwt(subscription.endpoint, config);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        Authorization: `vapid t=${token}, k=${config.vapid_public_key}`,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(ttl),
      },
      body: toFetchBody(body),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      const responseBody = (await response.text().catch(() => "")).slice(0, 500);
      throw new PushDeliveryError(
        response.status,
        responseBody || `Push endpoint returned ${response.status}`,
      );
    }
  } finally {
    clearTimeout(timer);
  }
}

export async function kickAdminPushWorker(): Promise<AdminPushWorkerResult> {
  const supabase = getSupabaseAdmin();

  const { data: configData, error: configError } = await supabase
    .from("admin_push_config")
    .select("vapid_public_key,vapid_private_key,subject")
    .eq("id", true)
    .maybeSingle();
  const config = pushConfigFrom(configData);

  if (configError || !config) {
    return { ok: false, error: configError?.message || "Push yapılandırması bulunamadı." };
  }

  const { data: subscriptionData, error: subscriptionError } = await supabase
    .from("admin_push_subscriptions")
    .select("id,endpoint,p256dh,auth_key")
    .eq("active", true);
  const subscriptions = subscriptionsFrom(subscriptionData);

  if (subscriptionError) return { ok: false, error: subscriptionError.message };
  if (!subscriptions.length) return { ok: true, sent: 0, reason: "no_active_subscriptions" };

  await supabase.rpc("enqueue_due_admin_reminders");

  const { data: jobData, error: claimError } = await supabase
    .rpc("claim_admin_push_jobs", { p_limit: 25 });
  const jobs = jobsFrom(jobData);

  if (claimError) return { ok: false, error: claimError.message };
  if (!jobs.length) return { ok: true, sent: 0, reason: "no_pending_jobs" };

  let sentJobs = 0;
  let failedJobs = 0;
  let deliveredNotifications = 0;

  for (const job of jobs) {
    const notification = notificationFor(job);
    const encodedPayload = JSON.stringify(notification);
    let successes = 0;
    const errors: string[] = [];

    for (const subscription of subscriptions) {
      try {
        await sendWebPushNotification(
          subscription,
          encodedPayload,
          config,
          job.kind === "reminder" ? 3600 : job.kind === "health" ? 1800 : 86400,
        );
        successes += 1;
        deliveredNotifications += 1;
        await supabase
          .from("admin_push_subscriptions")
          .update({ last_success_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() })
          .eq("id", subscription.id);
      } catch (caught) {
        const statusCode = caught instanceof PushDeliveryError ? caught.statusCode : 0;
        const message = caught instanceof Error ? caught.message : `Push failed (${statusCode || "unknown"})`;
        errors.push(message);

        if (statusCode === 404 || statusCode === 410) {
          await supabase
            .from("admin_push_subscriptions")
            .update({ active: false, last_error: message, updated_at: new Date().toISOString() })
            .eq("id", subscription.id);
        } else {
          await supabase
            .from("admin_push_subscriptions")
            .update({ last_error: message, updated_at: new Date().toISOString() })
            .eq("id", subscription.id);
        }
      }
    }

    if (successes > 0) {
      const sentAt = new Date().toISOString();
      await supabase
        .from("admin_push_jobs")
        .update({ status: "sent", sent_at: sentAt, error_message: null, updated_at: sentAt })
        .eq("id", job.id);

      if (job.kind === "reminder" && job.order_id) {
        await supabase
          .from("orders")
          .update({ reminder_push_sent_at: sentAt })
          .eq("id", job.order_id);
      }
      sentJobs += 1;
      continue;
    }

    const attempts = Number(job.attempts || 0);
    const permanentlyFailed = attempts >= 6;
    const retryAt = new Date(Date.now() + Math.min(30, Math.max(2, attempts * 3)) * 60_000).toISOString();
    await supabase
      .from("admin_push_jobs")
      .update({
        status: permanentlyFailed ? "failed" : "pending",
        available_at: retryAt,
        error_message: errors.slice(0, 3).join(" | ") || "No subscription accepted the notification.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    failedJobs += 1;
  }

  return {
    ok: true,
    jobs: jobs.length,
    sent_jobs: sentJobs,
    failed_jobs: failedJobs,
    delivered_notifications: deliveredNotifications,
  };
}
