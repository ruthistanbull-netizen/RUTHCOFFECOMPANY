import fs from "node:fs";
import path from "node:path";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

type GmailIntegration = {
  id: string;
  email: string | null;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  sender_name: string | null;
};

export type GmailMessagePayload = {
  mimeType?: string | null;
  filename?: string | null;
  headers?: Array<{ name?: string | null; value?: string | null }> | null;
  body?: { data?: string | null; size?: number | null } | null;
  parts?: GmailMessagePayload[] | null;
};

export type GmailMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string | null;
  internalDate?: string | null;
  payload?: GmailMessagePayload | null;
};

export type GmailThread = {
  id: string;
  historyId?: string | null;
  messages?: GmailMessage[];
};

const GMAIL_REFRESH_TOKEN_PREFIX = "enc:v1:";

function envRequired(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} env eksik.`);
  return value;
}

function gmailRefreshTokenKey() {
  const master =
    process.env.GMAIL_TOKEN_ENCRYPTION_KEY ||
    process.env.RUTH_ADMIN_CONTINUITY_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "";
  if (!master) throw new Error("Gmail refresh token encryption key bulunamadı.");
  return createHash("sha256").update(`ruth:gmail-refresh-token:v1:${master}`).digest();
}

function toBase64Url(value: Buffer) {
  return value.toString("base64url");
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url");
}

export function encryptGmailRefreshToken(token: string) {
  const cleanToken = String(token || "").trim();
  if (!cleanToken) return "";
  if (cleanToken.startsWith(GMAIL_REFRESH_TOKEN_PREFIX)) return cleanToken;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", gmailRefreshTokenKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(cleanToken, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${GMAIL_REFRESH_TOKEN_PREFIX}${toBase64Url(iv)}:${toBase64Url(tag)}:${toBase64Url(ciphertext)}`;
}

export function decryptGmailRefreshToken(stored: string) {
  const value = String(stored || "").trim();
  if (!value) return { token: "", encrypted: false };
  if (!value.startsWith(GMAIL_REFRESH_TOKEN_PREFIX)) return { token: value, encrypted: false };

  const parts = value.slice(GMAIL_REFRESH_TOKEN_PREFIX.length).split(":");
  if (parts.length !== 3) throw new Error("Gmail refresh token şifre formatı geçersiz.");
  const [ivText, tagText, ciphertextText] = parts;
  const decipher = createDecipheriv("aes-256-gcm", gmailRefreshTokenKey(), fromBase64Url(ivText));
  decipher.setAuthTag(fromBase64Url(tagText));
  const plaintext = Buffer.concat([
    decipher.update(fromBase64Url(ciphertextText)),
    decipher.final(),
  ]).toString("utf8");
  if (!plaintext) throw new Error("Gmail refresh token çözülemedi.");
  return { token: plaintext, encrypted: true };
}

function base64Url(value: string) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function encodeHeader(value: string) {
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function safeHeaderValue(value?: string | null) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim();
}

export function gmailRedirectUri(request: Request) {
  return process.env.GMAIL_REDIRECT_URI || new URL("/api/email/gmail/callback", request.url).toString();
}

export function gmailAuthUrl(state: string, redirectUri: string) {
  const params = new URLSearchParams({
    client_id: envRequired("GOOGLE_CLIENT_ID"),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly",
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGmailCode(code: string, redirectUri: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: envRequired("GOOGLE_CLIENT_ID"),
      client_secret: envRequired("GOOGLE_CLIENT_SECRET"),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || data.error || "Gmail token alınamadı.");
  return data as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string; token_type?: string };
}

export async function refreshGmailAccessToken(refreshToken: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: envRequired("GOOGLE_CLIENT_ID"),
      client_secret: envRequired("GOOGLE_CLIENT_SECRET"),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || data.error || "Gmail yenileme başarısız.");
  return data as { access_token: string; expires_in?: number };
}

export async function getGmailProfile(accessToken: string) {
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Gmail profili alınamadı.");
  return data as { emailAddress?: string; messagesTotal?: number; threadsTotal?: number };
}

export async function getGmailMessage(accessToken: string, messageId: string, format: "full" | "metadata" = "full") {
  const params = new URLSearchParams({ format });
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Gmail mesajı okunamadı.");
  return data as GmailMessage;
}

export async function getGmailThread(accessToken: string, threadId: string) {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Gmail konuşması okunamadı.");
  return data as GmailThread;
}

export function gmailHeader(payload: GmailMessagePayload | null | undefined, name: string) {
  const expected = name.toLocaleLowerCase("en-US");
  const header = (payload?.headers || []).find((item) => String(item.name || "").toLocaleLowerCase("en-US") === expected);
  return String(header?.value || "").trim();
}

function decodeGmailBody(value?: string | null) {
  if (!value) return "";
  try {
    return Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return "";
  }
}

function findGmailPart(payload: GmailMessagePayload | null | undefined, mimeType: string): GmailMessagePayload | null {
  if (!payload) return null;
  if (String(payload.mimeType || "").toLocaleLowerCase("en-US") === mimeType && payload.body?.data) return payload;
  for (const part of payload.parts || []) {
    const found = findGmailPart(part, mimeType);
    if (found) return found;
  }
  return null;
}

export function gmailMessageText(message: GmailMessage) {
  const plain = findGmailPart(message.payload, "text/plain");
  if (plain?.body?.data) return decodeGmailBody(plain.body.data).trim();
  const html = findGmailPart(message.payload, "text/html");
  if (html?.body?.data) return htmlToText(decodeGmailBody(html.body.data)).trim();
  if (message.payload?.body?.data) {
    const body = decodeGmailBody(message.payload.body.data);
    return String(message.payload.mimeType || "").toLocaleLowerCase("en-US") === "text/html" ? htmlToText(body) : body.trim();
  }
  return String(message.snippet || "").trim();
}

export async function ensureGmailAccessToken(supabase: any, integration: GmailIntegration) {
  const refreshState = integration.refresh_token
    ? decryptGmailRefreshToken(integration.refresh_token)
    : { token: "", encrypted: false };

  // Existing plaintext rows are migrated by the canonical Gmail owner on first use.
  if (refreshState.token && !refreshState.encrypted) {
    await supabase
      .from("email_integrations")
      .update({ refresh_token: encryptGmailRefreshToken(refreshState.token), updated_at: new Date().toISOString() })
      .eq("id", integration.id);
  }

  const expiresAt = integration.expires_at ? new Date(integration.expires_at).getTime() : 0;
  const stillValid = integration.access_token && expiresAt > Date.now() + 90_000;
  if (stillValid) return integration.access_token as string;
  if (!refreshState.token) throw new Error("Gmail refresh token yok. Gmail bağlantısını yeniden kur.");

  const refreshed = await refreshGmailAccessToken(refreshState.token);
  const nextExpiresAt = new Date(Date.now() + (refreshed.expires_in || 3600) * 1000).toISOString();
  await supabase
    .from("email_integrations")
    .update({ access_token: refreshed.access_token, expires_at: nextExpiresAt, updated_at: new Date().toISOString() })
    .eq("id", integration.id);
  return refreshed.access_token;
}

export function renderTemplate(template: string, variables: Record<string, string | number | null | undefined>) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const value = variables[key];
    return value === null || value === undefined ? "" : String(value);
  });
}

export function htmlToText(html: string) {
  return html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();
}

function wrapBase64(value: string) { return value.replace(/(.{76})/g, "$1\r\n"); }

export type InlineEmailImage = { contentId: string; contentType: string; filename: string; dataBase64: string };

export function loadRuthInlineLogo(): InlineEmailImage[] {
  const candidates = [
    path.join(process.cwd(), "public", "ruth-email-logo-card.png"),
    path.join(process.cwd(), "public", "ruth-email-logo.png"),
    path.join(process.cwd(), "public", "ruthistanbul-mail-logo.png"),
  ];
  const filePath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!filePath) return [];
  return [{ contentId: "ruth-email-logo", contentType: "image/png", filename: "ruth-logo.png", dataBase64: fs.readFileSync(filePath).toString("base64") }];
}

export function makeMimeMessage({ fromEmail, fromName, to, subject, html, inlineImages = [], inReplyTo, references }: {
  fromEmail: string;
  fromName: string;
  to: string;
  subject: string;
  html: string;
  inlineImages?: InlineEmailImage[];
  inReplyTo?: string | null;
  references?: string | null;
}) {
  const altBoundary = `ruth_alt_${Date.now()}`;
  const relatedBoundary = `ruth_related_${Date.now()}`;
  const text = htmlToText(html);
  const alternativeBody = [
    `--${altBoundary}`, 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: 8bit", "", text, "",
    `--${altBoundary}`, 'Content-Type: text/html; charset="UTF-8"', "Content-Transfer-Encoding: 8bit", "", html, "", `--${altBoundary}--`,
  ].join("\r\n");
  const headers = [`From: ${encodeHeader(fromName)} <${fromEmail}>`, `To: ${to}`, `Subject: ${encodeHeader(subject)}`, "MIME-Version: 1.0"];
  const safeInReplyTo = safeHeaderValue(inReplyTo);
  const safeReferences = safeHeaderValue(references);
  if (safeInReplyTo) headers.push(`In-Reply-To: ${safeInReplyTo}`);
  if (safeReferences) headers.push(`References: ${safeReferences}`);
  if (!inlineImages.length) return [...headers, `Content-Type: multipart/alternative; boundary="${altBoundary}"`, "", alternativeBody].join("\r\n");

  const relatedParts = inlineImages.flatMap((image) => [
    `--${relatedBoundary}`,
    `Content-Type: ${image.contentType}; name="${image.filename}"`,
    "Content-Transfer-Encoding: base64",
    `Content-ID: <${image.contentId}>`,
    `Content-Disposition: inline; filename="${image.filename}"`,
    "", wrapBase64(image.dataBase64), "",
  ]);
  return [...headers, `Content-Type: multipart/related; boundary="${relatedBoundary}"`, "", `--${relatedBoundary}`, `Content-Type: multipart/alternative; boundary="${altBoundary}"`, "", alternativeBody, "", ...relatedParts, `--${relatedBoundary}--`].join("\r\n");
}

export async function sendGmailMessage(accessToken: string, message: string, threadId?: string | null) {
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: base64Url(message), ...(threadId ? { threadId } : {}) }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Gmail gönderimi başarısız.");
  return data as { id: string; threadId: string; labelIds?: string[] };
}

export function defaultOrderHtml(type: "order_created" | "order_shipped", vars: Record<string, string>) {
  if (type === "order_shipped") {
    return `<div style="font-family:Arial,sans-serif;color:#2B2620;line-height:1.7"><h2>Siparişin kargoya verildi</h2><p>Merhaba ${vars.customer_name || ""},</p><p>${vars.order_no} numaralı siparişin kargoya verildi.</p>${vars.cargo_company ? `<p><strong>Kargo:</strong> ${vars.cargo_company}</p>` : ""}${vars.cargo_tracking_no ? `<p><strong>Takip No:</strong> ${vars.cargo_tracking_no}</p>` : ""}<p>Sevgiler,<br/>Ruth Istanbul</p></div>`;
  }
  return `<div style="font-family:Arial,sans-serif;color:#2B2620;line-height:1.7"><h2>Siparişini aldık</h2><p>Merhaba ${vars.customer_name || ""},</p><p>${vars.order_no} numaralı siparişin bize ulaştı. Hazırlık süreci başladığında seni bilgilendireceğiz.</p><p>Sevgiler,<br/>Ruth Istanbul</p></div>`;
}
