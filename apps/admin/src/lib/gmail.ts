import fs from "node:fs";
import path from "node:path";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const TOKEN_PREFIX = "enc:rosta:v1:";

type GmailIntegration = {
  id: string;
  email: string | null;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  sender_name: string | null;
};

export type InlineEmailImage = {
  contentId: string;
  contentType: string;
  filename: string;
  dataBase64: string;
};

export type GmailMessagePayload = {
  mimeType?: string | null;
  headers?: Array<{ name?: string | null; value?: string | null }> | null;
  body?: { data?: string | null; size?: number | null } | null;
  parts?: GmailMessagePayload[] | null;
};

export type GmailMessage = {
  id: string;
  threadId: string;
  internalDate?: string | null;
  snippet?: string | null;
  payload?: GmailMessagePayload | null;
};

export type GmailThread = {
  id: string;
  messages?: GmailMessage[];
};

function requiredEnv(name: string) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} env eksik.`);
  return value;
}

function tokenKey() {
  const master = String(
    process.env.GMAIL_TOKEN_ENCRYPTION_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "",
  ).trim();
  if (!master) throw new Error("Gmail token şifreleme anahtarı eksik.");
  return createHash("sha256").update(`rosta:gmail-refresh-token:v1:${master}`).digest();
}

export function encryptRefreshToken(token: string) {
  const clean = String(token || "").trim();
  if (!clean) return "";
  if (clean.startsWith(TOKEN_PREFIX)) return clean;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(clean, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${TOKEN_PREFIX}${iv.toString("base64url")}:${tag.toString("base64url")}:${ciphertext.toString("base64url")}`;
}

export function decryptRefreshToken(stored: string) {
  const value = String(stored || "").trim();
  if (!value) return "";
  if (!value.startsWith(TOKEN_PREFIX)) return value;

  const parts = value.slice(TOKEN_PREFIX.length).split(":");
  if (parts.length !== 3) throw new Error("Gmail refresh token formatı geçersiz.");
  const [iv, tag, ciphertext] = parts;
  const decipher = createDecipheriv("aes-256-gcm", tokenKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function decryptGmailRefreshToken(stored: string) {
  const value = String(stored || "").trim();
  return {
    token: decryptRefreshToken(value),
    encrypted: value.startsWith(TOKEN_PREFIX),
  };
}

export function gmailRedirectUri(request: Request) {
  return String(process.env.GMAIL_REDIRECT_URI || "").trim()
    || new URL("/api/email/gmail/callback", request.url).toString();
}

export function gmailAuthUrl(state: string, redirectUri: string) {
  const params = new URLSearchParams({
    client_id: requiredEnv("GOOGLE_CLIENT_ID"),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly",
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
      client_id: requiredEnv("GOOGLE_CLIENT_ID"),
      client_secret: requiredEnv("GOOGLE_CLIENT_SECRET"),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || data.error || "Gmail token alınamadı.");
  return data as { access_token: string; refresh_token?: string; expires_in?: number };
}

export async function refreshGmailAccessToken(refreshToken: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requiredEnv("GOOGLE_CLIENT_ID"),
      client_secret: requiredEnv("GOOGLE_CLIENT_SECRET"),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || data.error || "Gmail token yenilenemedi.");
  return data as { access_token: string; expires_in?: number };
}

export async function getGoogleEmail(accessToken: string) {
  const profile = await getGmailProfile(accessToken);
  const email = String(profile.emailAddress || "").trim().toLowerCase();
  if (!email) throw new Error("Google hesabında e-posta bulunamadı.");
  return email;
}

export async function getGmailProfile(accessToken: string) {
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Gmail profili alınamadı.");
  return data as { emailAddress?: string; messagesTotal?: number; threadsTotal?: number };
}

export async function ensureGmailAccessToken(supabase: any, integration: GmailIntegration) {
  const refreshToken = integration.refresh_token ? decryptRefreshToken(integration.refresh_token) : "";
  const expiresAt = integration.expires_at ? new Date(integration.expires_at).getTime() : 0;
  if (integration.access_token && expiresAt > Date.now() + 90_000) return integration.access_token;
  if (!refreshToken) throw new Error("Gmail refresh token yok. Gmail hesabını yeniden bağla.");

  const refreshed = await refreshGmailAccessToken(refreshToken);
  const nextExpiresAt = new Date(Date.now() + Number(refreshed.expires_in || 3600) * 1000).toISOString();
  const { error } = await supabase
    .from("email_integrations")
    .update({
      access_token: refreshed.access_token,
      expires_at: nextExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", integration.id);
  if (error) throw new Error(error.message);
  return refreshed.access_token;
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
export function renderTemplate(template: string, variables: Record<string, string | number | null | undefined>) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const value = variables[key];
    return value === null || value === undefined ? "" : String(value);
  });
}

export function htmlToText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}
function wrapBase64(value: string) {
  return value.replace(/(.{76})/g, "$1\r\n");
}

export function makeMimeMessage(input: {
  fromEmail: string;
  fromName: string;
  to: string;
  subject: string;
  html: string;
  inlineImages?: InlineEmailImage[];
  inReplyTo?: string | null;
  references?: string | null;
}) {
  const alt = `rosta_alt_${Date.now()}`;
  const related = `rosta_related_${Date.now()}`;
  const text = htmlToText(input.html);
  const alternative = [
    `--${alt}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    text,
    "",
    `--${alt}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    input.html,
    "",
    `--${alt}--`,
  ].join("\r\n");

  const headers = [
    `From: ${encodeHeader(input.fromName)} <${input.fromEmail}>`,
    `To: ${input.to}`,
    `Subject: ${encodeHeader(input.subject)}`,
    "MIME-Version: 1.0",
  ];
  const safeInReplyTo = String(input.inReplyTo || "").replace(/[\r\n]+/g, " ").trim();
  const safeReferences = String(input.references || "").replace(/[\r\n]+/g, " ").trim();
  if (safeInReplyTo) headers.push(`In-Reply-To: ${safeInReplyTo}`);
  if (safeReferences) headers.push(`References: ${safeReferences}`);

  const inlineImages = input.inlineImages || [];
  if (!inlineImages.length) {
    return [...headers, `Content-Type: multipart/alternative; boundary="${alt}"`, "", alternative].join("\r\n");
  }

  const imageParts = inlineImages.flatMap((image) => [
    `--${related}`,
    `Content-Type: ${image.contentType}; name="${image.filename}"`,
    "Content-Transfer-Encoding: base64",
    `Content-ID: <${image.contentId}>`,
    `Content-Disposition: inline; filename="${image.filename}"`,
    "",
    wrapBase64(image.dataBase64),
    "",
  ]);
  return [
    ...headers,
    `Content-Type: multipart/related; boundary="${related}"`,
    "",
    `--${related}`,
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    "",
    alternative,
    "",
    ...imageParts,
    `--${related}--`,
  ].join("\r\n");
}

export async function sendGmailMessage(accessToken: string, message: string, threadId?: string | null) {
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: base64Url(message), ...(threadId ? { threadId } : {}) }),
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Gmail gönderimi başarısız.");
  return data as { id: string; threadId?: string };
}

export function loadRostaInlineLogo(): InlineEmailImage[] {
  const candidate = path.join(process.cwd(), "public", "rosta-coffee-co.svg");
  if (!fs.existsSync(candidate)) return [];
  return [{
    contentId: "rosta-email-logo",
    contentType: "image/svg+xml",
    filename: "rosta-coffee-co.svg",
    dataBase64: fs.readFileSync(candidate).toString("base64"),
  }];
}

export const loadRuthInlineLogo = loadRostaInlineLogo;


export async function getGmailThread(accessToken: string, threadId: string) {
  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Gmail konuşması alınamadı.");
  return data as GmailThread;
}

export function gmailHeader(payload: GmailMessagePayload | null | undefined, name: string) {
  const expected = name.toLocaleLowerCase("en-US");
  const header = (payload?.headers || []).find(
    (item) => String(item.name || "").toLocaleLowerCase("en-US") === expected,
  );
  return String(header?.value || "").trim();
}

function decodeGmailBody(value?: string | null) {
  if (!value) return "";
  try { return Buffer.from(value, "base64url").toString("utf8"); } catch { return ""; }
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
    return String(message.payload.mimeType || "").toLocaleLowerCase("en-US") === "text/html"
      ? htmlToText(body)
      : body.trim();
  }
  return String(message.snippet || "").trim();
}


export function defaultOrderHtml(type: "order_created" | "order_shipped", vars: Record<string, string>) {
  if (type === "order_shipped") {
    return `<div style="font-family:Arial,sans-serif;color:#111111;line-height:1.7"><h2>Siparişin kargoya verildi</h2><p>Merhaba ${vars.customer_name || ""},</p><p>${vars.order_no} numaralı siparişin kargoya verildi.</p>${vars.cargo_company ? `<p><strong>Kargo:</strong> ${vars.cargo_company}</p>` : ""}${vars.cargo_tracking_no ? `<p><strong>Takip No:</strong> ${vars.cargo_tracking_no}</p>` : ""}<p>Sevgiler,<br/>ROSTA Coffee Co.</p></div>`;
  }
  return `<div style="font-family:Arial,sans-serif;color:#111111;line-height:1.7"><h2>Siparişini aldık</h2><p>Merhaba ${vars.customer_name || ""},</p><p>${vars.order_no} numaralı siparişin bize ulaştı. Hazırlık süreci başladığında seni bilgilendireceğiz.</p><p>Sevgiler,<br/>ROSTA Coffee Co.</p></div>`;
}
