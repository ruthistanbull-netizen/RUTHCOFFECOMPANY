import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { noStoreHeaders } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "gpt-image-2";
const QUOTE_TTL_MS = 10 * 60 * 1000;
const MAX_PROMPT_LENGTH = 4_000;

type ImageQuality = "low" | "medium" | "high";
type ImageSize = "1024x1024" | "1024x1536" | "1536x1024";

type RawBody = {
  prompt?: unknown;
  quality?: unknown;
  size?: unknown;
  quoteToken?: unknown;
  confirmed?: unknown;
};

type QuotePayload = {
  actorId: string;
  promptHash: string;
  quality: ImageQuality;
  size: ImageSize;
  estimatedUsd: number;
  expiresAt: number;
};

// GPT-Image-2 is token-priced. These values are deliberately conservative
// preflight estimates for one generated image so Ruthie never starts a paid
// generation before the admin has explicitly accepted a displayed amount.
// The API response also returns the measured token cost when usage is present.
const ESTIMATED_USD: Record<ImageQuality, Record<ImageSize, number>> = {
  low: {
    "1024x1024": 0.009,
    "1024x1536": 0.013,
    "1536x1024": 0.013,
  },
  medium: {
    "1024x1024": 0.034,
    "1024x1536": 0.05,
    "1536x1024": 0.05,
  },
  high: {
    "1024x1024": 0.133,
    "1024x1536": 0.2,
    "1536x1024": 0.2,
  },
};

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "OPENAI_API_KEY tanımlı değil. ROSTA Insight görsel üretemiyor." },
      { status: 503, headers: noStoreHeaders() },
    );
  }

  const raw = await request.json().catch(() => null) as RawBody | null;
  const prompt = normalizePrompt(raw?.prompt);
  const quality = normalizeQuality(raw?.quality);
  const size = normalizeSize(raw?.size);
  if (!prompt) {
    return NextResponse.json(
      { ok: false, error: "Görsel açıklaması boş olamaz." },
      { status: 400, headers: noStoreHeaders() },
    );
  }

  const actorId = String(auth.profile.id);
  const estimatedUsd = ESTIMATED_USD[quality][size];
  const quoteToken = typeof raw?.quoteToken === "string" ? raw.quoteToken.trim() : "";

  if (!quoteToken || raw?.confirmed !== true) {
    const quote: QuotePayload = {
      actorId,
      promptHash: hashPrompt(prompt),
      quality,
      size,
      estimatedUsd,
      expiresAt: Date.now() + QUOTE_TTL_MS,
    };
    return NextResponse.json({
      ok: true,
      approvalRequired: true,
      quote: {
        token: signQuote(quote, apiKey),
        model: MODEL,
        quality,
        size,
        estimatedUsd,
        currency: "USD",
        expiresAt: new Date(quote.expiresAt).toISOString(),
        note: "Tahmini üst sınırdır. GPT-Image-2 gerçek kullanımda token bazlı faturalandırılır.",
      },
    }, { headers: noStoreHeaders() });
  }

  const quote = verifyQuote(quoteToken, apiKey);
  if (!quote
    || quote.actorId !== actorId
    || quote.promptHash !== hashPrompt(prompt)
    || quote.quality !== quality
    || quote.size !== size
    || quote.expiresAt <= Date.now()) {
    return NextResponse.json(
      { ok: false, error: "Görsel üretim onayı geçersiz veya süresi dolmuş. Fiyatı yeniden onayla." },
      { status: 409, headers: noStoreHeaders() },
    );
  }

  const openAiResponse = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(process.env.OPENAI_ORG_ID?.trim() ? { "OpenAI-Organization": process.env.OPENAI_ORG_ID.trim() } : {}),
      ...(process.env.OPENAI_PROJECT_ID?.trim() ? { "OpenAI-Project": process.env.OPENAI_PROJECT_ID.trim() } : {}),
    },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      n: 1,
      quality,
      size,
      output_format: "png",
    }),
  });

  const payload = await openAiResponse.json().catch(() => null) as any;
  if (!openAiResponse.ok) {
    const message = payload?.error?.message || payload?.error || "OpenAI görsel üretimi başarısız oldu.";
    return NextResponse.json(
      { ok: false, error: String(message) },
      { status: openAiResponse.status || 502, headers: noStoreHeaders() },
    );
  }

  const first = Array.isArray(payload?.data) ? payload.data[0] : null;
  let dataUrl = "";
  if (typeof first?.b64_json === "string" && first.b64_json) {
    dataUrl = `data:image/png;base64,${first.b64_json}`;
  } else if (typeof first?.url === "string" && first.url) {
    const remote = await fetch(first.url, { cache: "no-store" });
    if (remote.ok) {
      const bytes = Buffer.from(await remote.arrayBuffer());
      dataUrl = `data:${remote.headers.get("content-type") || "image/png"};base64,${bytes.toString("base64")}`;
    }
  }

  if (!dataUrl) {
    return NextResponse.json(
      { ok: false, error: "OpenAI görsel verisi döndürmedi." },
      { status: 502, headers: noStoreHeaders() },
    );
  }

  const actualCostUsd = calculateActualCost(payload?.usage);
  return NextResponse.json({
    ok: true,
    approvalRequired: false,
    image: {
      dataUrl,
      mimeType: "image/png",
      name: `ruthie-${Date.now()}.png`,
      model: MODEL,
      quality,
      size,
    },
    cost: {
      estimatedUsd: quote.estimatedUsd,
      actualUsd: actualCostUsd,
      currency: "USD",
      usage: payload?.usage ?? null,
    },
  }, { headers: noStoreHeaders() });
}

function normalizePrompt(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_PROMPT_LENGTH);
}

function normalizeQuality(value: unknown): ImageQuality {
  return value === "low" || value === "high" ? value : "medium";
}

function normalizeSize(value: unknown): ImageSize {
  return value === "1024x1536" || value === "1536x1024" ? value : "1024x1024";
}

function hashPrompt(prompt: string) {
  return crypto.createHash("sha256").update(prompt).digest("hex");
}

function quoteSecret(apiKey: string) {
  return process.env.ROSTA_INSIGHT_IMAGE_QUOTE_SECRET?.trim() || apiKey;
}

function signQuote(payload: QuotePayload, apiKey: string) {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", quoteSecret(apiKey)).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verifyQuote(token: string, apiKey: string): QuotePayload | null {
  const [body, suppliedSignature, extra] = token.split(".");
  if (!body || !suppliedSignature || extra) return null;
  const expected = crypto.createHmac("sha256", quoteSecret(apiKey)).update(body).digest("base64url");
  const left = Buffer.from(suppliedSignature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as QuotePayload;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function calculateActualCost(usage: any): number | null {
  if (!usage || typeof usage !== "object") return null;
  const inputTextTokens = Number(
    usage?.input_tokens_details?.text_tokens
    ?? usage?.input_tokens
    ?? 0,
  );
  const outputImageTokens = Number(
    usage?.output_tokens_details?.image_tokens
    ?? usage?.output_tokens
    ?? 0,
  );
  if (!Number.isFinite(inputTextTokens) || !Number.isFinite(outputImageTokens)) return null;
  // Current GPT-Image-2 public token rates: text input $5/M, image output $30/M.
  const usd = (Math.max(0, inputTextTokens) * 5 + Math.max(0, outputImageTokens) * 30) / 1_000_000;
  return Number(usd.toFixed(6));
}
