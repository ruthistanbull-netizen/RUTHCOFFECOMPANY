import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getRuthieOpenAIStatus } from "@/lib/ruthieOpenAI";
import { noStoreHeaders } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const status = getRuthieOpenAIStatus();
  return NextResponse.json({
    ok: true,
    provider: "openai",
    configured: status.configured,
    missing: status.missing,
    models: status.models,
    capabilities: status.capabilities,
    usagePolicy: {
      realtimeStartsPerMinute: Number(process.env.ROSTA_INSIGHT_REALTIME_STARTS_PER_MINUTE || 6),
      realtimeStartsPerDay: Number(process.env.ROSTA_INSIGHT_REALTIME_STARTS_PER_DAY || 120),
      chatRequestsPerMinute: Number(process.env.ROSTA_INSIGHT_CHAT_REQUESTS_PER_MINUTE || 20),
      chatRequestsPerDay: Number(process.env.ROSTA_INSIGHT_CHAT_REQUESTS_PER_DAY || 500),
      maxVoiceSessionMinutes: 20,
    },
    secretExposed: false,
  }, { headers: noStoreHeaders() });
}
