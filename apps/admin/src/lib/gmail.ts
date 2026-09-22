import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const TOKEN_PREFIX = "enc:rosta:v1:";

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

export function gmailRedirectUri(request: Request) {
  return String(process.env.GMAIL_REDIRECT_URI || "").trim()
    || new URL("/api/email/gmail/callback", request.url).toString();
}

export function gmailAuthUrl(state: string, redirectUri: string) {
  const params = new URLSearchParams({
    client_id: requiredEnv("GOOGLE_CLIENT_ID"),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email https://www.googleapis.com/auth/gmail.send",
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
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Google hesabı okunamadı.");
  const email = String(data.email || "").trim().toLowerCase();
  if (!email) throw new Error("Google hesabında e-posta bulunamadı.");
  return email;
}
