import { GET as getV2, POST as postV2 } from "../service-health-monitor-v2/route";

// Backward-compatible endpoint only. All monitoring logic lives in v2 so an old
// caller cannot accidentally re-enable expensive orders/payments list probes.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

export async function GET(request: Request) {
  return getV2(request);
}

export async function POST(request: Request) {
  return postV2(request);
}
