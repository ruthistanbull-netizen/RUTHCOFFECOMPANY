import type { getSupabaseAdmin } from "@/lib/supabaseAdmin";
type Database = ReturnType<typeof getSupabaseAdmin>;
export type UsdRate = {
  usdTry: number | null;
  publishedOn: string | null;
  checkedAt: string | null;
  source: "TCMB-ForexSelling";
  fallback: boolean;
  message?: string;
};
/** TCMB publishes one official indicative FX quote on each business day.
 * It is NOT an intraday trading / bank-dealing quotation.
 * Store the observed quote on the brand's OWN self-host DB for finance snapshots.
 */
export async function latestUsdTry(db: Database): Promise<UsdRate> {
  let message: string | undefined;
  try {
    const response = await fetch("https://www.tcmb.gov.tr/kurlar/today.xml", {
      headers: { Accept: "application/xml,text/xml" },
      signal: AbortSignal.timeout(9000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error("TCMB HTTP " + response.status);
    const xml = await response.text();
    const usdXml = xml.match(/<Currency\b[^>]*\b(?:Kod|Code)=["']USD["'][^>]*>[\s\S]*?<\/Currency>/i)?.[0];
    const rateRaw = usdXml?.match(/<ForexSelling>([\d.]+)<\/ForexSelling>/i)?.[1];
    const publishedRaw = xml.match(/<Tarih_Date\b[^>]*\bDate=["'](\d{2})\/(\d{2})\/(\d{4})["']/i);
    const publishedOn = publishedRaw
      ? publishedRaw[3] + "-" + publishedRaw[1] + "-" + publishedRaw[2]
      : null;
    const usdTry = Number(rateRaw);
    if (!publishedOn || !Number.isFinite(usdTry) || usdTry <= 0 || usdTry > 10_000)
      throw new Error("TCMB USD satış kuru geçersiz.");
    const existing = await db.from("finance_fx_usd_try")
      .select("rate").eq("published_on", publishedOn).maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (!existing.data || Number(existing.data.rate) !== usdTry) {
      const saved = await db.from("finance_fx_usd_try").upsert({
        published_on: publishedOn,
        rate: usdTry,
        source: "TCMB-ForexSelling",
        effective_at: new Date().toISOString(),
        fetched_at: new Date().toISOString(),
      }, { onConflict: "published_on" });
      if (saved.error) throw new Error(saved.error.message);
    }
    return {
      usdTry, publishedOn, checkedAt: new Date().toISOString(),
      source: "TCMB-ForexSelling", fallback: false,
    };
  } catch (error) {
    message = error instanceof Error ? error.message : "TCMB'ye bağlanılamadı";
  }
  const fallback = await db.from("finance_fx_usd_try")
    .select("rate,published_on,fetched_at").order("effective_at", { ascending: false }).limit(1).maybeSingle();
  if (fallback.error) throw new Error(message + " · " + fallback.error.message);
  const row = fallback.data;
  return {
    usdTry: row ? Number(row.rate) : null,
    publishedOn: row?.published_on ?? null,
    checkedAt: row?.fetched_at ?? null,
    source: "TCMB-ForexSelling",
    fallback: true, message,
  };
}
