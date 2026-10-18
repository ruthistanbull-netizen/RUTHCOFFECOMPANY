import { createHash } from "node:crypto";
import { queryPaytrTransactions } from "@ruth-commerce/commerce-core";
import {
  financeAmount,
  financeMinor,
  financeDecimal,
} from "@ruth-commerce/commerce-core/finance";
import { financeRpc } from "./server";
import type { getSupabaseAdmin } from "@/lib/supabaseAdmin";
type ProviderRow = Record<string, unknown>;
function transactionRows(value: unknown): ProviderRow[] {
  if (Array.isArray(value)) return value.flatMap(transactionRows);
  if (!value || typeof value !== "object") return [];
  const row = value as ProviderRow;
  if (
    typeof row.siparis_no === "string" &&
    ["S", "I"].includes(String(row.islem_tipi))
  )
    return [row];
  return Object.values(row).flatMap(transactionRows);
}
/** Official PayTR fields only: dev.paytr.com/islem-dokumu. No fixed commission rate. */
export async function syncFinancePaytr(
  db: ReturnType<typeof getSupabaseAdmin>,
  from: string,
  to: string,
  actor: string,
) {
  if (
    !process.env.PAYTR_MERCHANT_ID ||
    !process.env.PAYTR_MERCHANT_KEY ||
    !process.env.PAYTR_MERCHANT_SALT
  )
    throw new Error("Bu markanın PayTR rapor erişimi yapılandırılmamış.");
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > 2)
    throw new Error("PayTR dökümünü en fazla üç günlük aralıklarla aktar.");
  const result = await queryPaytrTransactions({
    merchantId: process.env.PAYTR_MERCHANT_ID,
    merchantKey: process.env.PAYTR_MERCHANT_KEY,
    merchantSalt: process.env.PAYTR_MERCHANT_SALT,
    startDate: `${from} 00:00:00`,
    endDate: `${to} 23:59:59`,
    dummy: 0,
  });
  if (result.status === "failed") return { imported: 0 };
  if (result.status !== "success")
    throw new Error(String(result.err_msg || "PayTR işlem dökümü alınamadı."));
  const rows = transactionRows(result);
  let imported = 0;
  const grouped = new Map<string, ProviderRow>();
  for (const row of rows) {
    if (row.kesinti_tutari == null) continue;
    const group = [
      row.siparis_no,
      row.islem_tipi,
      row.islem_tarihi,
      row.para_birimi,
    ].join(":");
    const old = grouped.get(group);
    grouped.set(group, {
      ...row,
      kesinti_tutari: financeDecimal(
        financeMinor(String(old?.kesinti_tutari || "0")) +
          financeMinor(String(row.kesinti_tutari)),
      ),
    });
  }
  for (const row of grouped.values()) {
    if (row.kesinti_tutari == null) continue;
    const amount = financeAmount(row.kesinti_tutari);
    if (amount === "0.00") continue;
    const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(
      String(row.islem_tarihi || ""),
    );
    if (!match)
      throw new Error("PayTR işlem tarihi tanınamadı; kayıt oluşturulmadı.");
    const date = `${match[3]}-${match[2]}-${match[1]}`;
    const payment = await db
      .from("payment_intents")
      .select("order_id")
      .eq("merchant_oid", String(row.siparis_no))
      .maybeSingle();
    if (payment.error) throw new Error(payment.error.message);
    // Aggregate by order/day/type; multiple partial refunds retain all deductions, repeated reports update one aggregate.
    const key = createHash("sha256")
      .update(
        [row.siparis_no, row.islem_tipi, date, String(row.para_birimi)].join(
          ":",
        ),
      )
      .digest("hex");
    await financeRpc(db, "finance_provider_fee", {
      p_data: {
        key,
        amount,
        date,
        currency: row.para_birimi === "TL" ? "TRY" : row.para_birimi,
        order_id: payment.data?.order_id || null,
        reference: String(row.siparis_no),
        type: row.islem_tipi,
      },
      p_actor: actor,
    });
    imported++;
  }
  return { imported };
}
