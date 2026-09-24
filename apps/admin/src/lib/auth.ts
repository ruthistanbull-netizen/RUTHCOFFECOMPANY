import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { readAdminContinuity } from "@/lib/adminContinuity";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const CLAIMS_TIMEOUT_MS = 2_500;
const AUTH_USER_TIMEOUT_MS = 3_500;
const PROFILE_TIMEOUT_MS = 2_500;
const PROFILE_FRESH_MS = 10 * 60_000;
const PROFILE_STALE_MS = 6 * 60 * 60_000;
const INTERNAL_SECRET_FRESH_MS = 30 * 60_000;
const INTERNAL_SECRET_STALE_MS = 2 * 60 * 60_000;
const AUTH_CIRCUIT_FAILURES = 3;
const AUTH_CIRCUIT_OPEN_MS = 30_000;

// Break-glass principals are not secrets. They are useful only after a real
// Supabase JWT has passed cryptographic verification. Normal DB role checks win
// whenever the database is reachable; this snapshot is used only on transient
// profile-store failures so a database incident cannot lock out the root admin.
const ROOT_ADMIN_SNAPSHOTS: Record<string, AdminProfile> = {};

class AdminAuthTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminAuthTimeoutError";
  }
}

type VerifiedClaims = {
  sub?: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
  exp?: number;
};

type VerifiedAdminUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
};

type AdminProfile = {
  id: string;
  email?: string | null;
  full_name?: string | null;
  role: string;
};

type ProfileCacheEntry = {
  profile: AdminProfile;
  freshUntil: number;
  staleUntil: number;
};

type InternalSecretCache = {
  secret: string;
  freshUntil: number;
  staleUntil: number;
};

const profileCache = new Map<string, ProfileCacheEntry>();
let internalSecretCache: InternalSecretCache | null = null;
let internalSecretLoad: Promise<string | null> | null = null;
let authFailureCount = 0;
let authCircuitOpenUntil = 0;

async function withTimeout<T>(value: PromiseLike<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      Promise.resolve(value),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new AdminAuthTimeoutError(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function bearerToken(request: Request) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

function sameSecret(left: string, right: string) {
  try {
    const a = Buffer.from(left);
    const b = Buffer.from(right);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function rememberProfile(userId: string, profile: AdminProfile) {
  const now = Date.now();
  profileCache.set(userId, {
    profile,
    freshUntil: now + PROFILE_FRESH_MS,
    staleUntil: now + PROFILE_STALE_MS,
  });
  if (profileCache.size > 100) {
    const first = profileCache.keys().next().value;
    if (first) profileCache.delete(first);
  }
}

function cachedProfile(userId: string, allowStale = false) {
  const entry = profileCache.get(userId);
  if (!entry) return null;
  const limit = allowStale ? entry.staleUntil : entry.freshUntil;
  if (limit <= Date.now()) {
    if (entry.staleUntil <= Date.now()) profileCache.delete(userId);
    return null;
  }
  return entry.profile;
}

function rootAdminSnapshot(user: VerifiedAdminUser) {
  const configured = String(process.env.ROSTA_ROOT_ADMIN_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const explicitlyAllowed = configured.includes(user.id);
  const snapshot = ROOT_ADMIN_SNAPSHOTS[user.id];
  if (!snapshot && !explicitlyAllowed) return null;
  return snapshot || {
    id: user.id,
    email: user.email || null,
    full_name: "ROSTA Root Admin",
    role: "admin",
  };
}

async function loadInternalSecret(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const now = Date.now();
  if (internalSecretCache?.freshUntil && internalSecretCache.freshUntil > now) return internalSecretCache.secret;
  if (internalSecretLoad) return internalSecretLoad;

  internalSecretLoad = (async () => {
    try {
      const result = await withTimeout(
        supabase.from("automation_cron_config").select("secret").eq("id", true).maybeSingle(),
        2_500,
        "Internal secret doğrulaması zaman aşımına uğradı.",
      );
      const secret = String(result.data?.secret || "").trim();
      if (result.error || !secret) throw new Error(result.error?.message || "Internal secret bulunamadı.");
      const loadedAt = Date.now();
      internalSecretCache = {
        secret,
        freshUntil: loadedAt + INTERNAL_SECRET_FRESH_MS,
        staleUntil: loadedAt + INTERNAL_SECRET_STALE_MS,
      };
      return secret;
    } catch {
      if (internalSecretCache?.staleUntil && internalSecretCache.staleUntil > Date.now()) {
        return internalSecretCache.secret;
      }
      return null;
    } finally {
      internalSecretLoad = null;
    }
  })();

  return internalSecretLoad;
}

async function internalAdmin(request: Request) {
  const supplied = String(request.headers.get("x-rosta-internal-secret") || "").trim();
  if (!supplied) return null;

  const supabase = getSupabaseAdmin();
  const expected = await loadInternalSecret(supabase);
  if (!expected || !sameSecret(supplied, expected)) return null;

  return {
    supabase,
    user: {
      id: "00000000-0000-0000-0000-000000000000",
      email: "system@rosta.local",
      user_metadata: { panel_status: "active", system_worker: true },
    } as any,
    profile: {
      id: "00000000-0000-0000-0000-000000000000",
      email: "system@rosta.local",
      full_name: "ROSTA Platform Worker",
      role: "admin",
    },
    internalSecret: supplied,
    internal: true as const,
    continuity: false as const,
    authSource: "internal-secret-cache" as const,
  };
}

function authHealthy() {
  authFailureCount = 0;
  authCircuitOpenUntil = 0;
}

function authTransientFailure() {
  authFailureCount += 1;
  if (authFailureCount >= AUTH_CIRCUIT_FAILURES) {
    authCircuitOpenUntil = Date.now() + AUTH_CIRCUIT_OPEN_MS;
  }
}

async function verifyAdminToken(supabase: ReturnType<typeof getSupabaseAdmin>, token: string): Promise<{
  user?: VerifiedAdminUser;
  invalid?: boolean;
  transientError?: string;
}> {
  const authWithClaims = supabase.auth as typeof supabase.auth & {
    getClaims?: (jwt?: string) => Promise<{
      data?: { claims?: VerifiedClaims } | null;
      error?: { message?: string; status?: number } | null;
    }>;
  };

  if (typeof authWithClaims.getClaims === "function") {
    try {
      const result = await withTimeout(
        authWithClaims.getClaims(token),
        CLAIMS_TIMEOUT_MS,
        "Kimlik imzası doğrulaması zaman aşımına uğradı.",
      );
      const claims = result.data?.claims;
      if (!result.error && claims?.sub) {
        if (claims.exp && claims.exp * 1000 <= Date.now()) return { invalid: true };
        authHealthy();
        return {
          user: {
            id: String(claims.sub),
            email: typeof claims.email === "string" ? claims.email : null,
            user_metadata: claims.user_metadata && typeof claims.user_metadata === "object"
              ? claims.user_metadata
              : {},
          },
        };
      }
      if (result.error && Number(result.error.status || 0) >= 500) authTransientFailure();
    } catch {
      authTransientFailure();
    }
  }

  if (authCircuitOpenUntil > Date.now()) {
    return { transientError: "Kimlik servisi geçici olarak koruma modunda; güvenli oturum kullanılıyor." };
  }

  try {
    const { data: userData, error: userError } = await withTimeout(
      supabase.auth.getUser(token),
      AUTH_USER_TIMEOUT_MS,
      "Supabase Auth kullanıcı doğrulaması zaman aşımına uğradı.",
    );
    if (userError || !userData.user) {
      const status = Number((userError as any)?.status || 0);
      if (status >= 500) {
        authTransientFailure();
        return { transientError: userError?.message || "Kimlik servisi geçici olarak kullanılamıyor." };
      }
      return { invalid: true };
    }
    authHealthy();
    return { user: userData.user as VerifiedAdminUser };
  } catch (caught) {
    authTransientFailure();
    return {
      transientError: caught instanceof Error
        ? caught.message
        : "Kimlik servisine geçici olarak ulaşılamıyor.",
    };
  }
}

function continuityAuth(request: Request, token: string, supabase: ReturnType<typeof getSupabaseAdmin>) {
  const continuity = readAdminContinuity(request, token);
  if (!continuity) return null;
  rememberProfile(continuity.user.id, continuity.profile);
  return {
    supabase,
    user: continuity.user as any,
    profile: continuity.profile,
    internal: false as const,
    continuity: true as const,
    authSource: "signed-continuity" as const,
  };
}

function canUseContinuityFastPath(request: Request) {
  const method = String(request.method || "GET").toUpperCase();
  return method === "GET" || method === "HEAD" || method === "OPTIONS";
}

export async function requireAdmin(request: Request) {
  const internal = await internalAdmin(request);
  if (internal) return internal;

  const token = bearerToken(request);
  if (!token) {
    return { error: NextResponse.json({ ok: false, error: "Oturum yok." }, { status: 401 }) };
  }

  const supabase = getSupabaseAdmin();
  const continuity = continuityAuth(request, token, supabase);

  // A continuity cookie is minted only after a real Supabase JWT + admin profile
  // verification succeeds. It is HMAC-signed, bound to the exact bearer token,
  // user-agent, session id and bearer expiry. For read-only requests it is therefore
  // safe to use as the primary auth proof instead of paying a 2.5s getClaims + 3.5s
  // getUser network round-trip on every panel read. Mutations deliberately keep the
  // live verification path so revoked/disabled sessions cannot modify data.
  if (continuity && canUseContinuityFastPath(request)) return continuity;

  const verified = await verifyAdminToken(supabase, token);

  if (verified.transientError) {
    if (continuity) return continuity;
    return {
      error: NextResponse.json(
        { ok: false, error: verified.transientError, code: "AUTH_TEMPORARILY_UNAVAILABLE" },
        { status: 503, headers: { "Retry-After": "2" } },
      ),
    };
  }

  if (verified.invalid || !verified.user) {
    return { error: NextResponse.json({ ok: false, error: "Oturum geçersiz." }, { status: 401 }) };
  }

  if (String(verified.user.user_metadata?.panel_status || "active") === "disabled") {
    return { error: NextResponse.json({ ok: false, error: "Bu panel hesabı devre dışı bırakılmış." }, { status: 403 }) };
  }

  const freshProfile = cachedProfile(verified.user.id, false);
  if (freshProfile) {
    return {
      supabase,
      user: verified.user as any,
      profile: freshProfile,
      internal: false as const,
      continuity: false as const,
      authSource: "jwt-profile-cache" as const,
    };
  }

  try {
    const profileResult = await withTimeout(
      supabase
        .from("profiles")
        .select("id, email, full_name, role")
        .eq("auth_user_id", verified.user.id)
        .maybeSingle(),
      PROFILE_TIMEOUT_MS,
      "Yönetici profili doğrulaması zaman aşımına uğradı.",
    );

    const { data: profile, error: profileError } = profileResult;
    if (profileError) throw new Error(profileError.message);
    if (profile?.role !== "admin") {
      return { error: NextResponse.json({ ok: false, error: "Bu panele erişim yetkin yok." }, { status: 403 }) };
    }

    const adminProfile = profile as AdminProfile;
    rememberProfile(verified.user.id, adminProfile);
    return {
      supabase,
      user: verified.user as any,
      profile: adminProfile,
      internal: false as const,
      continuity: false as const,
      authSource: "jwt-profile-db" as const,
    };
  } catch (caught) {
    const staleProfile = cachedProfile(verified.user.id, true);
    if (staleProfile) {
      return {
        supabase,
        user: verified.user as any,
        profile: staleProfile,
        internal: false as const,
        continuity: false as const,
        authSource: "jwt-stale-profile-cache" as const,
      };
    }
    if (continuity) return continuity;

    const breakGlass = rootAdminSnapshot(verified.user);
    if (breakGlass) {
      rememberProfile(verified.user.id, breakGlass);
      return {
        supabase,
        user: verified.user as any,
        profile: breakGlass,
        internal: false as const,
        continuity: false as const,
        authSource: "jwt-break-glass-root" as const,
      };
    }

    return {
      error: NextResponse.json(
        {
          ok: false,
          error: caught instanceof Error ? caught.message : "Yönetici profiline geçici olarak ulaşılamıyor.",
          code: "AUTH_TEMPORARILY_UNAVAILABLE",
        },
        { status: 503, headers: { "Retry-After": "2" } },
      ),
    };
  }
}
