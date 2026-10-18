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
/** PayTR's transaction amount is the original sale; the customer's payment
 * amount may also contain an installment surcharge, which is never our income.
 * For completed sales the merchant's true fee is original sale minus net payout.
 */
function merchantOnlyDeduction(row: ProviderRow): bigint {
  const raw = financeMinor(String(row.kesinti_tutari));
  if (row.islem_tipi !== "S" || row.islem_tutari == null || row.net_tutar == null)
    return raw;
  const original = financeMinor(String(row.islem_tutari));
  const settled = financeMinor(String(row.net_tutar));
  const fee = original - settled;
  // If the returned values aren't comparable, retain the provider's fee.
  return original >= 0n && settled >= 0n && fee >= 0n && fee <= original ? fee : raw;
}

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
  if (result.status === "failed") return { imported: 0, rates: [] };
  if (result.status !== "success")
    throw new Error(String(result.err_msg || "PayTR işlem dökümü alınamadı."));
  const rows = transactionRows(result);
  const rates = rows.flatMap((row) => {
    if (row.islem_tipi !== "S" || row.kesinti_orani == null) return [];
    const rate = Number(String(row.kesinti_orani).replace(",", "."));
    return Number.isFinite(rate) && rate >= 0 && rate < 100
      ? [{ rate, date: String(row.islem_tarihi || ""), installments: Number(row.taksit || 0) }]
      : [];
  }).slice(0, 25);
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
      merchant_fee_tutari: financeDecimal(
        financeMinor(String(old?.merchant_fee_tutari || "0")) +
          merchantOnlyDeduction(row),
      ),
    });
  }
  for (const row of grouped.values()) {
    if (row.kesinti_tutari == null) continue;
    // Raw deduction may include customer-paid installment interest.
    // Only the merchant-cost portion belongs in expense/net-income reports.
    const amount = financeAmount(row.merchant_fee_tutari ?? row.kesinti_tutari);
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
    // Some manual / legacy orders use their order number as provider reference.
    // Only accept an exact unique lookup; never infer a match from dates or amounts.
    let orderId = payment.data?.order_id || null;
    if (!orderId) {
      const direct = await db.from("orders").select("id")
        .eq("order_no",String(row.siparis_no)).maybeSingle();
      if (direct.error) throw new Error(direct.error.message);
      orderId = direct.data?.id || null;
    }
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
        order_id: orderId,
        reference: String(row.siparis_no),
        type: row.islem_tipi,
      },
      p_actor: actor,
    });
    imported++;
  }
  return { imported, rates };
}
