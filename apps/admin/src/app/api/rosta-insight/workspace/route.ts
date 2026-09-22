import { NextResponse } from "next/server";
import {
  RUTHIE_CONNECTOR_CATALOG,
  RUTHIE_DEFAULT_TOOLS,
} from "@ruth-commerce/commerce-core";
import { requireAdmin } from "@/lib/auth";
import { getRuthieAdminActionCatalog } from "@/lib/ruthieAdminGateway";
import { getRuthieOpenAIStatus } from "@/lib/ruthieOpenAI";
import { noStoreHeaders } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const provider = getRuthieOpenAIStatus();
  const supabaseConnected = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL
    && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const connectors = RUTHIE_CONNECTOR_CATALOG.map((connector) => {
    const connected = connector.key === "openai"
      ? provider.configured
      : connector.key === "supabase"
        ? supabaseConnected
        : false;

    return {
      key: connector.key,
      title: connector.title,
      category: connector.category,
      capabilities: [...connector.capabilities],
      auth: connector.auth,
      required: connector.required,
      connected,
      state: connected ? "connected" : "available",
    };
  });

  const adminActions = getRuthieAdminActionCatalog();
  const tools = [
    {
      id: "openai.web_search",
      title: "Web araması",
      description: "Güncel dış kaynakları OpenAI Web Search üzerinden araştırır.",
      engine: "openai",
      operation: "query",
      riskLevel: "none",
      confirmationPolicy: "never",
      enabled: provider.configured,
    },
    {
      id: "panel.live_snapshot",
      title: "Canlı panel analizi",
      description: "Sipariş, ürün, stok, müşteri, iade ve checkout özetini canlı getirir.",
      engine: "ruthie",
      operation: "query",
      riskLevel: "none",
      confirmationPolicy: "never",
      enabled: supabaseConnected,
    },
    ...RUTHIE_DEFAULT_TOOLS.map((tool) => ({
      id: tool.id,
      title: tool.title,
      description: tool.description,
      engine: tool.engine,
      operation: tool.operation,
      riskLevel: tool.riskLevel,
      confirmationPolicy: tool.confirmationPolicy,
      enabled: supabaseConnected,
    })),
    ...adminActions.map((tool) => ({
      id: `admin.${tool.id}`,
      title: tool.title,
      description: tool.description,
      engine: "admin-api",
      operation: tool.mutates ? "command" : "query",
      riskLevel: tool.risk,
      confirmationPolicy: tool.mutates ? "always" : "never",
      enabled: supabaseConnected,
    })),
  ];

  return NextResponse.json({
    ok: true,
    access: {
      role: "admin",
      panelRead: true,
      panelWrite: true,
      webSearch: provider.configured,
      commandPolicy: "signed_confirmation_for_writes",
    },
    connectors,
    tools,
    summary: {
      connectorCount: connectors.length,
      connectedConnectorCount: connectors.filter((connector) => connector.connected).length,
      toolCount: tools.length,
      enabledToolCount: tools.filter((tool) => tool.enabled).length,
      adminActionCount: adminActions.length,
    },
  }, { headers: noStoreHeaders() });
}
