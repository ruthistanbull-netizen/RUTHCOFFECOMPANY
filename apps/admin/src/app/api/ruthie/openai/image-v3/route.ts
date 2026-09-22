import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStoreHeaders() { return { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" }; }
function getLocalProductImage(_slug?: unknown, _name?: unknown) { return null; }

const MODEL = "gpt-image-2";
const QUOTE_TTL_MS = 10 * 60 * 1000;
const MAX_PROMPT_LENGTH = 4_000;
const MAX_PRODUCTS = 6;
const MAX_REFERENCE_BYTES = 12 * 1024 * 1024;

type ImageQuality = "low" | "medium" | "high";
type ImageSize = "1024x1024" | "1024x1536" | "1536x1024";

type StyleInput = {
  category: string;
  variant: string;
  framing: string;
  background: string;
  lighting: string;
  usage: string;
  platform: string;
  purpose: string;
};

type NormalizedRequest = {
  prompt: string;
  quality: ImageQuality;
  size: ImageSize;
  productIds: string[];
  style: StyleInput;
};

type RawBody = {
  prompt?: unknown;
  quality?: unknown;
  size?: unknown;
  productIds?: unknown;
  style?: unknown;
  quoteToken?: unknown;
  confirmed?: unknown;
};

type QuotePayload = {
  actorId: string;
  requestHash: string;
  estimatedUsd: number;
  expiresAt: number;
};

type ProductRow = {
  id: string;
  name?: string | null;
  slug?: string | null;
  material?: string | null;
  finish_color?: string | null;
  main_image_url?: string | null;
  product_images?: Array<{ image_url?: string | null; is_main?: boolean | null; sort_order?: number | null }> | null;
};

type ReferenceImage = {
  product: ProductRow;
  blob: Blob;
  filename: string;
};

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
  const normalized = normalizeRequest(raw);
  if (!normalized.prompt) {
    return NextResponse.json(
      { ok: false, error: "Görsel açıklaması boş olamaz." },
      { status: 400, headers: noStoreHeaders() },
    );
  }

  const estimatedUsd = estimateCost(normalized);
  const actorId = String(auth.profile.id);
  const requestHash = hashRequest(normalized);
  const quoteToken = typeof raw?.quoteToken === "string" ? raw.quoteToken.trim() : "";

  if (!quoteToken || raw?.confirmed !== true) {
    const quote: QuotePayload = {
      actorId,
      requestHash,
      estimatedUsd,
      expiresAt: Date.now() + QUOTE_TTL_MS,
    };
    return NextResponse.json({
      ok: true,
      approvalRequired: true,
      quote: {
        token: signQuote(quote, apiKey),
        model: MODEL,
        quality: normalized.quality,
        size: normalized.size,
        estimatedUsd,
        currency: "USD",
        referenceCount: normalized.productIds.length,
        expiresAt: new Date(quote.expiresAt).toISOString(),
        note: normalized.productIds.length
          ? "Seçili ürün fotoğrafları yüksek sadakatli referans olarak gönderilir. Bu tutar referans görsel girdilerini de hesaba katan tahmini ön onay tutarıdır; gerçek token kullanımı farklı olabilir."
          : "Tahmini ön onay tutarıdır; gerçek token kullanımı farklı olabilir.",
      },
    }, { headers: noStoreHeaders() });
  }

  const quote = verifyQuote(quoteToken, apiKey);
  if (!quote
    || quote.actorId !== actorId
    || quote.requestHash !== requestHash
    || quote.expiresAt <= Date.now()) {
    return NextResponse.json(
      { ok: false, error: "Görsel üretim onayı geçersiz veya süresi dolmuş. Fiyatı yeniden onayla." },
      { status: 409, headers: noStoreHeaders() },
    );
  }

  let selectedProducts: ProductRow[] = [];
  let references: ReferenceImage[] = [];
  if (normalized.productIds.length) {
    const productResult = await auth.supabase
      .from("products")
      .select(`
        id,
        name,
        slug,
        material,
        finish_color,
        main_image_url,
        product_images (
          image_url,
          is_main,
          sort_order
        )
      `)
      .in("id", normalized.productIds)
      .neq("status", "deleted")
      .neq("status", "archived");

    if (productResult.error) {
      return NextResponse.json(
        { ok: false, error: `Ürün referansları alınamadı: ${productResult.error.message}` },
        { status: 400, headers: noStoreHeaders() },
      );
    }

    const rows = (productResult.data || []) as ProductRow[];
    const byId = new Map(rows.map((row) => [String(row.id), row]));
    selectedProducts = normalized.productIds.map((id) => byId.get(id)).filter(Boolean) as ProductRow[];

    if (selectedProducts.length !== normalized.productIds.length) {
      return NextResponse.json(
        { ok: false, error: "Seçtiğin ürünlerden biri artık bulunamıyor. Ürün seçimini yenile." },
        { status: 409, headers: noStoreHeaders() },
      );
    }

    try {
      references = await Promise.all(selectedProducts.map((product, index) => fetchProductReference(product, request, index)));
    } catch (caught) {
      return NextResponse.json(
        { ok: false, error: caught instanceof Error ? caught.message : "Ürün fotoğrafı referans olarak hazırlanamadı." },
        { status: 422, headers: noStoreHeaders() },
      );
    }
  }

  const finalPrompt = buildFinalPrompt(normalized, selectedProducts);
  const openAiResponse = references.length
    ? await callImageEdit(apiKey, finalPrompt, normalized, references)
    : await callImageGeneration(apiKey, finalPrompt, normalized);

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

  return NextResponse.json({
    ok: true,
    approvalRequired: false,
    image: {
      dataUrl,
      mimeType: "image/png",
      name: `rosta-insight-${Date.now()}.png`,
      model: MODEL,
      quality: normalized.quality,
      size: normalized.size,
    },
    cost: {
      estimatedUsd: quote.estimatedUsd,
      actualUsd: null,
      currency: "USD",
      usage: payload?.usage ?? null,
    },
    references: selectedProducts.map((product) => ({ id: product.id, name: product.name || "Ürün" })),
  }, { headers: noStoreHeaders() });
}

function normalizeRequest(raw: RawBody | null): NormalizedRequest {
  return {
    prompt: normalizeText(raw?.prompt, MAX_PROMPT_LENGTH),
    quality: normalizeQuality(raw?.quality),
    size: normalizeSize(raw?.size),
    productIds: normalizeProductIds(raw?.productIds),
    style: normalizeStyle(raw?.style),
  };
}

function normalizeText(value: unknown, max = 100) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeQuality(value: unknown): ImageQuality {
  return value === "low" || value === "high" ? value : "medium";
}

function normalizeSize(value: unknown): ImageSize {
  return value === "1024x1536" || value === "1536x1024" ? value : "1024x1024";
}

function normalizeProductIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))].slice(0, MAX_PRODUCTS);
}

function normalizeStyle(value: unknown): StyleInput {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    category: normalizeText(source.category, 80),
    variant: normalizeText(source.variant, 80),
    framing: normalizeText(source.framing, 60),
    background: normalizeText(source.background, 60),
    lighting: normalizeText(source.lighting, 60),
    usage: normalizeText(source.usage, 60),
    platform: normalizeText(source.platform, 60),
    purpose: normalizeText(source.purpose, 80),
  };
}

function estimateCost(request: NormalizedRequest) {
  const base = ESTIMATED_USD[request.quality][request.size];
  const referenceAllowance = request.productIds.length * 0.008;
  return Number((base + referenceAllowance).toFixed(4));
}

function hashRequest(value: NormalizedRequest) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function quoteSecret(apiKey: string) {
  return process.env.RUTHIE_IMAGE_QUOTE_SECRET?.trim() || apiKey;
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

function productImageUrl(product: ProductRow) {
  const images = [...(product.product_images || [])]
    .filter((item) => item?.image_url)
    .sort((left, right) => Number(Boolean(right.is_main)) - Number(Boolean(left.is_main)) || Number(left.sort_order || 0) - Number(right.sort_order || 0));
  return images[0]?.image_url
    || product.main_image_url
    || getLocalProductImage(product.slug, product.name)
    || "";
}

async function fetchProductReference(product: ProductRow, request: Request, index: number): Promise<ReferenceImage> {
  const source = productImageUrl(product);
  if (!source) throw new Error(`${product.name || "Seçili ürün"} için referans fotoğraf bulunamadı.`);

  const origin = new URL(request.url).origin;
  let url: string;
  try {
    url = new URL(source, origin).toString();
  } catch {
    throw new Error(`${product.name || "Seçili ürün"} fotoğraf adresi geçersiz.`);
  }

  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`${product.name || "Seçili ürün"} fotoğrafı alınamadı.`);
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > MAX_REFERENCE_BYTES) throw new Error(`${product.name || "Seçili ürün"} fotoğrafı referans için uygun boyutta değil.`);
  const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
  const extension = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
  const safeName = normalizeText(product.name, 50).replace(/[^a-zA-Z0-9._-]+/g, "-") || `product-${index + 1}`;
  return {
    product,
    blob: new Blob([bytes], { type: mimeType }),
    filename: `${safeName}.${extension}`,
  };
}

function purposeGuidance(purpose: string) {
  const normalized = purpose.toLocaleLowerCase("tr-TR");
  if (normalized.includes("instagram post")) {
    return [
      "Kullanım amacı Instagram feed gönderisidir. Kompozisyon kare feed mantığında çalışsın; ürün ilk bakışta anlaşılır, dengeli ve premium görünsün.",
      "Ana ürün ve önemli detayları merkezde güvenli bölgede tut. Instagram arayüzü/crop nedeniyle kenarlara kritik detay yerleştirme.",
      "Metin gerekiyorsa çok kısa, rafine ve Türkçe bir başlık kullan; görseli metinle boğma. Kullanıcı açıkça istemediyse fiyat, indirim oranı veya kampanya süresi uydurma.",
    ];
  }
  if (normalized.includes("instagram hikaye") || normalized.includes("instagram story")) {
    return [
      "Kullanım amacı Instagram Hikaye/Story'dir. Dikey, mobil öncelikli ve tek bakışta okunabilir bir kompozisyon kur.",
      "Üst ve alt bölgelerde arayüz elemanları için güvenli boşluk bırak; ürün, yüz ve temel metni merkezde güvenli bölgede tut.",
      "Metin kullanılıyorsa en fazla kısa bir başlık ve gerekirse kısa CTA kullan; küçük veya kalabalık yazılardan kaçın. Kullanıcı vermediyse fiyat/indirim uydurma.",
    ];
  }
  if (normalized.includes("meta reklam")) {
    return [
      "Kullanım amacı Meta performans reklamıdır. İlk bakışta ürünü ve faydayı anlatan, dönüşüm odaklı güçlü bir reklam kreatifi üret.",
      "Kompozisyonu feed ve Reels/Stories kırpmasına dayanıklı kur; ürün ile ana mesajı orta güvenli bölgede tut ve küçük ekranda bile okunurluğu koru.",
      "Uygunsa kısa ve yüksek kontrastlı Türkçe reklam başlığı ekle; çok kısa bir CTA olarak 'Şimdi Keşfet' veya 'İncele' benzeri ifade kullanılabilir. Kullanıcı tarafından verilmemiş fiyat, indirim oranı, stok aciliyeti, ücretsiz kargo veya son tarih gibi ticari iddiaları kesinlikle uydurma.",
      "Reklam metni ürünün önüne geçmesin; takı ana kahraman kalsın. Metni birkaç kelimeyle sınırlı tut ve tipografiyi premium marka estetiğinde tasarla.",
    ];
  }
  return [];
}

function buildFinalPrompt(request: NormalizedRequest, products: ProductRow[]) {
  const styleParts = [
    request.style.purpose && `Kullanım amacı: ${request.style.purpose}`,
    request.style.category && `Fotoğraf tarzı: ${request.style.category}`,
    request.style.variant && `Alt tarz: ${request.style.variant}`,
    request.style.framing && `Kadraj: ${request.style.framing}`,
    request.style.background && `Arka plan: ${request.style.background}`,
    request.style.lighting && `Işık: ${request.style.lighting}`,
    request.style.usage && `Ürün kullanımı: ${request.style.usage}`,
    request.style.platform && `Hedef platform: ${request.style.platform}`,
  ].filter(Boolean);

  const productParts = products.map((product, index) => {
    const details = [product.material, product.finish_color].filter(Boolean).join(", ");
    return `Referans ${index + 1}: ${product.name || `Ürün ${index + 1}`}${details ? ` (${details})` : ""}`;
  });

  return [
    "Ruth Istanbul için premium, foto-gerçekçi bir takı görseli oluştur.",
    products.length
      ? "Eklenen referans görseller seçili katalog ürünleridir. Her ürünün gerçek tasarımını, siluetini, taşlarını, metal rengini, oranlarını, yüzey dokusunu ve ayırt edici detaylarını mümkün olan en yüksek sadakatle koru. Ürünleri başka tasarımlarla değiştirme, yeni taş/aksesuar ekleme ve seçilen hiçbir ürünü atlama. Birden fazla referans varsa hepsini nihai kompozisyona dahil et."
      : "Takıların oranlarını ve malzeme gerçekçiliğini koru; premium ticari fotoğraf kalitesi hedefle.",
    ...productParts,
    ...styleParts,
    ...purposeGuidance(request.style.purpose),
    `Kullanıcı isteği: ${request.prompt}`,
    "Sonuç profesyonel sosyal medya/e-ticaret/reklam kullanımına hazır, temiz, gerçekçi, premium ve ürün odaklı olsun.",
  ].filter(Boolean).join("\n");
}

function openAiHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    ...(process.env.OPENAI_ORG_ID?.trim() ? { "OpenAI-Organization": process.env.OPENAI_ORG_ID.trim() } : {}),
    ...(process.env.OPENAI_PROJECT_ID?.trim() ? { "OpenAI-Project": process.env.OPENAI_PROJECT_ID.trim() } : {}),
  };
}

function callImageGeneration(apiKey: string, prompt: string, request: NormalizedRequest) {
  return fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    cache: "no-store",
    headers: {
      ...openAiHeaders(apiKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      n: 1,
      quality: request.quality,
      size: request.size,
      output_format: "png",
    }),
  });
}

function callImageEdit(apiKey: string, prompt: string, request: NormalizedRequest, references: ReferenceImage[]) {
  const form = new FormData();
  form.append("model", MODEL);
  form.append("prompt", prompt);
  form.append("n", "1");
  form.append("quality", request.quality);
  form.append("size", request.size);
  form.append("output_format", "png");
  form.append("input_fidelity", "high");
  for (const reference of references) {
    form.append("image[]", reference.blob, reference.filename);
  }
  return fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    cache: "no-store",
    headers: openAiHeaders(apiKey),
    body: form,
  });
}
