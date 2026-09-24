import { runServiceHealthMonitor } from "@/lib/serviceHealthMonitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

// Production-infra contract markers live in the shared monitor core now:
// /api/health/ready · /api/health · /api/commerce-core/health · /api/health/platform
// platform-health · admin_push_jobs · persistBatch

export async function GET(request: Request) {
  return runServiceHealthMonitor(request);
}

export async function POST(request: Request) {
  return runServiceHealthMonitor(request);
}
