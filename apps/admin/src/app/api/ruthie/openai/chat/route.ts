import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: unknown, max = 24000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function extractText(payload: any) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim();
  const parts: string[] = [];
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === "output_text" && typeof content.text === "string" && content.text.trim()) {
        parts.push(content.text.trim());
      }
    }
  }
  return parts.join("\n\n");
}

async function panelContext(supabase: any) {
  const [products, orders, customers, lowStock, recentOrders] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }).neq("status", "archived"),
    supabase.from("orders").select("id", { count: "exact", head: true }),
    supabase.from("customer_read_model").select("id", { count: "exact", head: true }),
    supabase.from("product_variants").select("id,product_id,name,stock").eq("is_active", true).lte("stock", 4).order("stock", { ascending: true }).limit(12),
    supabase.from("orders").select("order_no,customer_name,total_amount,currency,status,payment_status,created_at").order("created_at", { ascending: false }).limit(10),
  ]);

  return {
    products: Number(products.count || 0),
    orders: Number(orders.count || 0),
    customers: Number(customers.count || 0),
    lowStockVariants: lowStock.data || [],
    recentOrders: recentOrders.data || [],
  };
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: { message: "OPENAI_API_KEY tanımlı değil. ROSTA Insight sohbete hazır değil." } }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const rawMessages = Array.isArray(body.messages) ? body.messages : [];
  const messages = rawMessages
    .slice(-16)
    .map((item: any) => ({ role: item?.role === "assistant" ? "assistant" : "user", text: clean(item?.text) }))
    .filter((item: any) => item.text);

  if (!messages.length || messages.at(-1)?.role !== "user") {
    return NextResponse.json({ ok: false, error: { message: "Geçerli bir kullanıcı mesajı gerekli." } }, { status: 400 });
  }

  const context = await panelContext(auth.supabase);
  const model = String(process.env.ROSTA_CHAT_MODEL || process.env.RUTHIE_CHAT_MODEL || "gpt-5.6-luna").trim();
  const correlationId = String(request.headers.get("x-correlation-id") || crypto.randomUUID()).slice(0, 120);
  const attachments = Array.isArray(body.attachments)
    ? body.attachments.slice(0, 4).map((item: any) => clean(item?.name, 160)).filter(Boolean)
    : [];

  const instructions = [
    "Sen ROSTA Coffee Co. yönetim panelindeki ROSTA Insight asistanısın.",
    "Türkçe, kısa, net ve operasyon odaklı yanıt ver.",
    "Sana verilen panel özetini gerçek veri olarak kullan; verilmemiş ayrıntıları uydurma.",
    "Bu endpoint salt-okunur bağlam sağlar; sipariş, ürün veya müşteri üzerinde işlem yaptığını iddia etme.",
    `Panel özeti: ${JSON.stringify(context)}`,
    attachments.length ? `Kullanıcının eklediği dosya adları: ${attachments.join(", ")}. Dosya içerikleri bu basit sohbet çağrısında okunmadı.` : "",
  ].filter(Boolean).join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(process.env.OPENAI_PROJECT_ID ? { "OpenAI-Project": process.env.OPENAI_PROJECT_ID } : {}),
      ...(process.env.OPENAI_ORG_ID ? { "OpenAI-Organization": process.env.OPENAI_ORG_ID } : {}),
    },
    body: JSON.stringify({
      model,
      store: false,
      instructions,
      input: messages.map((message: any) => ({ role: message.role, content: message.text })),
      metadata: { surface: "rosta_admin_insight", actor_id: String(auth.profile.id), correlation_id: correlationId },
    }),
    signal: AbortSignal.timeout(45000),
  }).catch((error) => {
    throw new Error(error instanceof Error ? error.message : "OpenAI bağlantısı kurulamadı.");
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return NextResponse.json({
      ok: false,
      error: { message: payload?.error?.message || "ROSTA Insight yanıt üretemedi." },
    }, { status: response.status === 429 ? 429 : 502 });
  }

  const text = extractText(payload);
  if (!text) return NextResponse.json({ ok: false, error: { message: "OpenAI metin yanıtı döndürmedi." } }, { status: 502 });

  return NextResponse.json({
    ok: true,
    response: {
      text,
      responseId: String(payload.id || ""),
      model: String(payload.model || model),
      usage: payload.usage || null,
    },
    correlationId,
  }, { headers: { "Cache-Control": "no-store" } });
}
