import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_CONTINUITY_COOKIE = "rosta_admin_continuity";
const CONTINUITY_VERSION = 2;
const MAX_CONTINUITY_MS = 8 * 60 * 60 * 1000;

type AdminProfileSnapshot = {
  id: string;
  email?: string | null;
  full_name?: string | null;
  role: string;
};

type AdminContinuityPayload = {
  v: number;
  sub: string;
  sid?: string;
  email?: string | null;
  profile: AdminProfileSnapshot;
  ua: string;
  tokenHash: string;
  iat: number;
  exp: number;
};

function base64Url(value: Buffer | string) {
  return Buffer.from(value).toString("base64url");
}

function decodeBase64UrlJson<T>(value: string): T | null {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

function continuitySecret() {
  const value = String(
    process.env.ROSTA_ADMIN_CONTINUITY_SECRET
      || process.env.SUPABASE_SERVICE_ROLE_KEY
      || "",
  ).trim();
  if (!value) throw new Error("Admin continuity signing secret eksik.");
  return value;
}

function userAgentDigest(request: Request) {
  return createHash("sha256")
    .update(String(request.headers.get("user-agent") || "unknown"))
    .digest("base64url")
    .slice(0, 24);
}

function bearerDigest(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

function bearerSnapshot(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const payload = decodeBase64UrlJson<Record<string, unknown>>(parts[1]);
  if (!payload) return null;
  const sub = typeof payload.sub === "string" ? payload.sub : "";
  const sid = typeof payload.session_id === "string" ? payload.session_id : undefined;
  const exp = typeof payload.exp === "number" ? payload.exp : 0;
  if (!sub || !exp) return null;
  return { sub, sid, exp };
}

function signature(encodedPayload: string) {
  return createHmac("sha256", continuitySecret()).update(encodedPayload).digest("base64url");
}

function signaturesEqual(left: string, right: string) {
  try {
    const a = Buffer.from(left);
    const b = Buffer.from(right);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function mintAdminContinuity(
  request: Request,
  bearerToken: string,
  user: { id: string; email?: string | null },
  profile: AdminProfileSnapshot,
) {
  const bearer = bearerSnapshot(bearerToken);
  if (!bearer || bearer.sub !== user.id) return null;

  const now = Date.now();
  const bearerExpiryMs = bearer.exp * 1000;
  const exp = Math.min(now + MAX_CONTINUITY_MS, bearerExpiryMs);
  if (exp <= now + 5_000) return null;

  const payload: AdminContinuityPayload = {
    v: CONTINUITY_VERSION,
    sub: user.id,
    sid: bearer.sid,
    email: user.email || profile.email || null,
    profile: {
      id: String(profile.id),
      email: profile.email || user.email || null,
      full_name: profile.full_name || null,
      role: String(profile.role || "admin"),
    },
    ua: userAgentDigest(request),
    tokenHash: bearerDigest(bearerToken),
    iat: now,
    exp,
  };

  const encoded = base64Url(JSON.stringify(payload));
  return {
    token: `${encoded}.${signature(encoded)}`,
    expiresAt: exp,
  };
}

export function readAdminContinuity(request: Request, bearerToken: string) {
  const cookieHeader = String(request.headers.get("cookie") || "");
  const rawCookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ADMIN_CONTINUITY_COOKIE}=`));
  if (!rawCookie) return null;

  let token = "";
  try {
    token = decodeURIComponent(rawCookie.slice(ADMIN_CONTINUITY_COOKIE.length + 1));
  } catch {
    return null;
  }

  const splitAt = token.lastIndexOf(".");
  if (splitAt <= 0) return null;
  const encoded = token.slice(0, splitAt);
  const suppliedSignature = token.slice(splitAt + 1);
  if (!signaturesEqual(signature(encoded), suppliedSignature)) return null;

  const payload = decodeBase64UrlJson<AdminContinuityPayload>(encoded);
  if (!payload || payload.v !== CONTINUITY_VERSION || payload.exp <= Date.now()) return null;
  if (payload.profile?.role !== "admin") return null;
  if (payload.ua !== userAgentDigest(request)) return null;
  if (!signaturesEqual(payload.tokenHash, bearerDigest(bearerToken))) return null;

  const bearer = bearerSnapshot(bearerToken);
  if (!bearer || bearer.exp * 1000 <= Date.now()) return null;
  if (bearer.sub !== payload.sub) return null;
  if (payload.sid && bearer.sid && payload.sid !== bearer.sid) return null;

  return {
    user: {
      id: payload.sub,
      email: payload.email || null,
      user_metadata: { panel_status: "active", continuity_session: true },
    },
    profile: payload.profile,
    issuedAt: payload.iat,
    expiresAt: payload.exp,
  };
}
