import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";

const MAX_ROWS = 5000;
const MAX_CSV_LENGTH = 8_000_000;

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseCsvLine(line: string, delimiter: string) {
  const result: string[] = [];
  let current = "";
  let inside = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      inside = !inside;
    } else if (char === delimiter && !inside) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

function detectDelimiter(header: string) {
  const commaCount = (header.match(/,/g) || []).length;
  const semicolonCount = (header.match(/;/g) || []).length;
  return semicolonCount > commaCount ? ";" : ",";
}

function toNumber(value: string) {
  const trimmed = value.replace(/\s/g, "");
  const lastComma = trimmed.lastIndexOf(",");
  const lastDot = trimmed.lastIndexOf(".");
  let normalized = trimmed;
  if (lastComma > lastDot) normalized = trimmed.replace(/\./g, "").replace(",", ".");
  else normalized = trimmed.replace(/,/g, "");
  const number = Number(normalized.replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function toDate(value: string) {
  if (!value) return new Date().toISOString();
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString();
  const match = value.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!match) return new Date().toISOString();
  const [, day, month, year, hour = "0", minute = "0"] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { supabase } = auth;
  const body = await request.json();
  const csv = clean(body.csv).replace(/^\uFEFF/, "");

  if (!csv) return NextResponse.json({ ok: false, error: "CSV boş." }, { status: 400 });
  if (csv.length > MAX_CSV_LENGTH) return NextResponse.json({ ok: false, error: "CSV dosyası çok büyük. En fazla 8 MB yüklenebilir." }, { status: 413 });

  const lines = csv.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return NextResponse.json({ ok: false, error: "CSV başlık ve en az bir sipariş satırı içermeli." }, { status: 400 });
  if (lines.length - 1 > MAX_ROWS) return NextResponse.json({ ok: false, error: `Tek aktarımda en fazla ${MAX_ROWS} sipariş yüklenebilir.` }, { status: 400 });

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delimiter).map((header) => header.toLocaleLowerCase("tr-TR"));
  const rows = lines.slice(1).map((line) => parseCsvLine(line, delimiter));

  const find = (row: string[], aliases: string[]) => {
    const index = headers.findIndex((header) => aliases.some((alias) => header.includes(alias)));
    return index >= 0 ? clean(row[index]) : "";
  };

  const orders = rows.map((row, rowIndex) => {
    const orderNo = find(row, ["sipariş no", "siparis no", "order no", "order number", "order"]);
    const customerName = find(row, ["müşteri", "musteri", "ad soyad", "customer", "isim"]);
    const email = find(row, ["e-posta", "eposta", "email", "mail"]);
    const phone = find(row, ["telefon", "phone", "gsm"]);
    const total = find(row, ["toplam", "tutar", "total", "grand total"]);
    const date = find(row, ["tarih", "date", "oluşturulma"]);
    const productName = find(row, ["ürün", "urun", "product", "ürün adı"]);

    return {
      order_no: orderNo || `IKAS-${Date.now()}-${rowIndex + 1}`,
      customer_name: customerName || "İkas müşteri",
      customer_email: email || null,
      customer_phone: phone || null,
      total_amount: toNumber(total),
      subtotal: toNumber(total),
      shipping_fee: 0,
      tax_total: 0,
      currency: "TRY",
      status: "completed",
      payment_status: "paid",
      customer_note: "İkas geçmiş sipariş aktarımı",
      created_at: toDate(date),
      imported_source: "ikas_csv",
      productName: productName || "İkas ürünü",
    };
  }).filter((order) => order.total_amount > 0);

  if (!orders.length) return NextResponse.json({ ok: false, error: "Geçerli tutara sahip sipariş satırı bulunamadı." }, { status: 400 });

  let imported = 0;
  let skipped = 0;
  const errors: Array<{ order_no: string; error: string }> = [];

  for (const order of orders) {
    const { data: existing, error: lookupError } = await supabase.from("orders").select("id").eq("order_no", order.order_no).maybeSingle();
    if (lookupError) {
      errors.push({ order_no: order.order_no, error: lookupError.message });
      continue;
    }
    if (existing?.id) {
      skipped += 1;
      continue;
    }

    const { productName, ...orderPayload } = order;
    const { data: inserted, error } = await supabase.from("orders").insert(orderPayload).select("id").single();
    if (error || !inserted) {
      errors.push({ order_no: order.order_no, error: error?.message || "Sipariş eklenemedi." });
      continue;
    }

    const { error: itemError } = await supabase.from("order_items").insert({
      order_id: inserted.id,
      product_slug: "ikas-import",
      product_name: productName,
      variant_name: null,
      quantity: 1,
      unit_price: order.total_amount,
      total_price: order.total_amount,
      image_url: null,
    });

    if (itemError) {
      await supabase.from("orders").delete().eq("id", inserted.id);
      errors.push({ order_no: order.order_no, error: itemError.message });
      continue;
    }

    imported += 1;
  }

  return NextResponse.json({
    ok: errors.length === 0,
    imported,
    skipped,
    failed: errors.length,
    errors: errors.slice(0, 25),
    total: orders.length,
    delimiter,
  }, { status: errors.length && imported === 0 ? 400 : 200 });
}
