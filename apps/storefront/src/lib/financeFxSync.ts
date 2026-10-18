import type { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type Db = ReturnType<typeof getSupabaseAdmin>;

/** Currency is only persisted as USD->TRY. Revenue, expense and purchase
 * payable amounts are never denominated in USD.
 * Best effort; worker failures must not prevent order notifications.
 */
export async function syncFinanceFxForPurchaseCosts(db: Db): Promise<void> {
  const usingUsd = await db.from("finance_costs")
    .select("id").eq("cost_method","weight_usd").limit(1);
  if (usingUsd.error || !usingUsd.data?.length) return;
  const latest = await db.from("finance_fx_usd_try")
    .select("published_on,rate,fetched_at")
    .order("fetched_at",{ascending:false}).limit(1).maybeSingle();
  if (latest.error) return;
  if (latest.data?.fetched_at &&
      Date.now()-Date.parse(latest.data.fetched_at)<2*60*60*1000) return;

  const response = await fetch("https://www.tcmb.gov.tr/kurlar/today.xml",{
    signal:AbortSignal.timeout(8000),
    headers:{Accept:"application/xml,text/xml"},cache:"no-store",
  });
  if(!response.ok)throw new Error("TCMB exchange quote HTTP "+response.status);
  const xml=await response.text();
  const usd=xml.match(/<Currency\b[^>]*\b(?:Kod|Code)=["']USD["'][^>]*>[\s\S]*?<\/Currency>/i)?.[0];
  const rate=Number(usd?.match(/<ForexSelling>([\d.]+)<\/ForexSelling>/i)?.[1]);
  const published=xml.match(/<Tarih_Date\b[^>]*\bDate=["'](\d{2})\/(\d{2})\/(\d{4})["']/i);
  if(!published || !Number.isFinite(rate)||rate<=0||rate>=10000)
    throw new Error("TCMB USD/TRY quote invalid");
  const publishedOn=published[3]+"-"+published[1]+"-"+published[2];
  const prior=await db.from("finance_fx_usd_try")
    .select("rate").eq("published_on",publishedOn).maybeSingle();
  if(prior.error)throw new Error(prior.error.message);
  if(prior.data && Number(prior.data.rate)===rate) {
    const touch=await db.from("finance_fx_usd_try")
      .update({fetched_at:new Date().toISOString()}).eq("published_on",publishedOn);
    if(touch.error)throw new Error(touch.error.message);
    return;
  }
  const saved=await db.from("finance_fx_usd_try").upsert({
    published_on:publishedOn,
    rate,
    source:"TCMB-ForexSelling",
    effective_at:new Date().toISOString(),
    fetched_at:new Date().toISOString(),
  },{onConflict:"published_on"});
  if(saved.error)throw new Error(saved.error.message);
}
