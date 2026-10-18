import { createHmac } from "node:crypto";
type Payout = { date: string; currency: string; sales: number; refunds: number; net: number; state: "upcoming" | "transferred"; };
function moneyNumber(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v !== "string") return 0;
  const s=v.trim().replace(/\s/g,"");
  const normalized = s.includes(",") && s.includes(".")
    ? s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g,"").replace(",",".") : s.replace(/,/g,"")
    : s.includes(",") ? s.replace(",",".") : s;
  const n=Number(normalized);
  return Number.isFinite(n) ? n : 0;
}
function readCurrency(v: unknown): string {
  const s=String(v||"TL").toUpperCase();
  return s==="TL" || s==="TRL" ? "TRY" : s;
}
function readDate(value: unknown): string | null {
  const raw=String(value||"");
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}
function flatten(value: unknown, state: Payout["state"], parentDate?: string, parentCurrency?: string): Payout[] {
  if (!value || typeof value!=="object") return [];
  if (Array.isArray(value)) return value.flatMap(v=>flatten(v,state,parentDate,parentCurrency));
  const row=value as Record<string,unknown>;
  const date=readDate(row.date_paid||row.date||row.payment_date||parentDate);
  const currency=readCurrency(row.currency||row.TL||parentCurrency);
  if (date && (row.net!=null || row.net_amounts!=null)) {
    return [{date,currency,net:moneyNumber(row.net??row.net_amounts),
      sales:moneyNumber(row.sales??row.sale_amounts),
      refunds:moneyNumber(row.return??row.return_amounts),state}];
  }
  return Object.entries(row).flatMap(([key,child])=>flatten(child,state,readDate(key)||date||parentDate, /^(TRY|TL|USD|EUR|GBP)$/i.test(key)?key:currency));
}
function localDate(offset:number): string {
  const date=new Date();
  date.setUTCDate(date.getUTCDate()+offset);
  return new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul",year:"numeric",month:"2-digit",day:"2-digit"}).format(date);
}
/** Official PayTR Payment Summary: transferred and future settlements.
 * Server credentials remain server-only; no date/value guessing is allowed.
 */
export async function paytrPayoutSummary(): Promise<{rows:Payout[];upcoming:Payout[];unpaidTotal:number;checkedAt:string}> {
  const merchantId=process.env.PAYTR_MERCHANT_ID;
  const merchantKey=process.env.PAYTR_MERCHANT_KEY;
  const merchantSalt=process.env.PAYTR_MERCHANT_SALT;
  if(!merchantId || !merchantKey || !merchantSalt) throw new Error("PayTR ödeme raporu erişimi yapılandırılmamış.");
  // PayTR permits up to 31 days. Query today through next 30 days.
  const from=localDate(0),to=localDate(30);
  const token=createHmac("sha256",merchantKey).update(merchantId+from+to+merchantSalt).digest("base64");
  const form=new URLSearchParams({merchant_id:merchantId,start_date:from,end_date:to,paytr_token:token});
  const response=await fetch("https://www.paytr.com/rapor/odeme-dokumu",{
    method:"POST",body:form,headers:{"Content-Type":"application/x-www-form-urlencoded"},cache:"no-store",
    signal:AbortSignal.timeout(12000),
  });
  if(!response.ok) throw new Error(`PayTR ödeme raporu HTTP ${response.status}`);
  const result=await response.json() as Record<string,unknown>;
  if(result.status==="error") throw new Error(String(result.err_msg||"PayTR ödeme özeti hatası"));
  if(result.status==="failed") return {rows:[],upcoming:[],unpaidTotal:0,checkedAt:new Date().toISOString()};
  if(result.status!=="success") throw new Error("PayTR ödeme özeti yanıtı tanınamadı.");
  const upcoming=flatten(result.future_payments,"upcoming");
  // Other API fields describe past/transferred payments; do not classify them as pending.
  const rows=flatten(result.payments??result.paid_payments??result.past_payments??[],"transferred");
  // A future row without a verifiable date must not be shown as confirmed upcoming money.
  const filtered=upcoming.filter(r=>r.date>=from && r.net>0);
  return {rows,upcoming:filtered,unpaidTotal:Math.round(filtered.reduce((a,r)=>a+r.net,0)*100)/100,checkedAt:new Date().toISOString()};
}
