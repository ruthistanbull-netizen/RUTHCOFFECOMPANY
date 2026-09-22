import crypto from "node:crypto";

export type RuthieConfirmedAction = {
  version: 1;
  actorId: string;
  action: string;
  arguments: Record<string, unknown>;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
};

const TOKEN_TTL_MS = 10 * 60 * 1_000;

function confirmationSecret(env: NodeJS.ProcessEnv = process.env) {
  const secret = String(
    env.RUTHIE_CONFIRMATION_SECRET
      || env.SUPABASE_SERVICE_ROLE_KEY
      || env.OPENAI_API_KEY
      || "",
  ).trim();
  if (!secret) throw new Error("ROSTA Insight confirmation secret is not configured.");
  return secret;
}

function encode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signature(body: string, env?: NodeJS.ProcessEnv) {
  return crypto.createHmac("sha256", confirmationSecret(env)).update(body).digest("base64url");
}

export function createRuthieConfirmationToken(options: {
  actorId: string;
  action: string;
  arguments: Record<string, unknown>;
  now?: number;
  env?: NodeJS.ProcessEnv;
}) {
  const now = options.now ?? Date.now();
  const payload: RuthieConfirmedAction = {
    version: 1,
    actorId: options.actorId,
    action: options.action,
    arguments: options.arguments,
    issuedAt: now,
    expiresAt: now + TOKEN_TTL_MS,
    nonce: crypto.randomUUID(),
  };
  const body = encode(JSON.stringify(payload));
  return {
    token: `${body}.${signature(body, options.env)}`,
    expiresAt: new Date(payload.expiresAt).toISOString(),
  };
}

export function verifyRuthieConfirmationToken(options: {
  token: string;
  actorId: string;
  now?: number;
  env?: NodeJS.ProcessEnv;
}): RuthieConfirmedAction {
  const [body, suppliedSignature, ...rest] = options.token.split(".");
  if (!body || !suppliedSignature || rest.length) throw new Error("Geçersiz ROSTA Insight onay kodu.");
  const expectedSignature = signature(body, options.env);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    throw new Error("ROSTA Insight onay kodunun imzası geçersiz.");
  }
  const payload = JSON.parse(decode(body)) as Partial<RuthieConfirmedAction>;
  const now = options.now ?? Date.now();
  if (payload.version !== 1 || typeof payload.actorId !== "string" || typeof payload.action !== "string") {
    throw new Error("ROSTA Insight onay kodu okunamadı.");
  }
  if (!payload.arguments || typeof payload.arguments !== "object" || Array.isArray(payload.arguments)) {
    throw new Error("ROSTA Insight işlem girdisi geçersiz.");
  }
  if (payload.actorId !== options.actorId) throw new Error("Bu işlem onayı farklı bir yöneticiye ait.");
  if (typeof payload.expiresAt !== "number" || payload.expiresAt < now) throw new Error("ROSTA Insight işlem onayının süresi doldu.");
  return payload as RuthieConfirmedAction;
}
