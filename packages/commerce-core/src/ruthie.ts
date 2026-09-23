import type {
  RuthieActionPlan,
  RuthieActionRequest,
  RuthieConnectorDefinition,
  RuthieCoreKey,
  RuthieDispatchContext,
  RuthieToolDefinition,
  RuthieToolExecutionResult,
} from "@ruth-commerce/contracts/ruthie";
import { CommerceInvariantError } from "./state-transitions.ts";

export const RUTHIE_ENGINE_KEY = "ruthie" as const;
export const RUTHIE_ENGINE_VERSION = "0.1.0";

export const RUTHIE_ALLOWED_ENGINES: readonly RuthieCoreKey[] = Object.freeze([
  "catalog",
  "pricing",
  "promotion",
  "cart",
  "checkout",
  "payment",
  "order",
  "inventory",
  "shipping",
  "customer",
  "loyalty",
  "return",
  "notification",
  "cms",
]);

export const RUTHIE_DEFAULT_TOOLS: readonly RuthieToolDefinition[] = Object.freeze([
  tool("order.read", "Siparişi görüntüle", "Sipariş özeti, ürünleri, müşteri ve durum bilgilerini getirir.", "order", "query", "orders.read", "none", "never", true),
  tool("order.search", "Sipariş ara", "Sipariş numarası, müşteri veya iletişim bilgisine göre arama yapar.", "order", "query", "orders.read", "none", "never", true),
  tool("order.create", "Sipariş oluştur", "Commerce Core kurallarıyla yeni sipariş taslağı oluşturur.", "order", "command", "orders.write", "high", "risk_based", true),
  tool("order.update", "Siparişi düzenle", "Siparişin izin verilen alanlarını ve yaşam döngüsü durumunu günceller.", "order", "command", "orders.write", "high", "risk_based", true),
  tool("order.add_note", "Sipariş notu ekle", "Siparişe yönetici notu ekler.", "order", "command", "orders.write", "low", "risk_based", true),
  tool("catalog.product.read", "Ürünü görüntüle", "Ürün, varyant, SKU, fiyat ve medya bilgilerini getirir.", "catalog", "query", "catalog.read", "none", "never", true),
  tool("catalog.product.search", "Ürün ara", "Ürün adı, SKU, kategori veya koleksiyona göre arama yapar.", "catalog", "query", "catalog.read", "none", "never", true),
  tool("catalog.product.create", "Ürün oluştur", "Yeni ürün ve varyant taslağı oluşturur.", "catalog", "command", "catalog.write", "high", "risk_based", true),
  tool("catalog.product.update", "Ürünü düzenle", "Ürün içeriği, varyantı ve yayınlanabilir alanları günceller.", "catalog", "command", "catalog.write", "high", "risk_based", true),
  tool("pricing.quote", "Fiyat dökümünü hesapla", "Pricing Engine üzerinden kesin para dökümü veya teklif üretir.", "pricing", "query", "pricing.read", "none", "never", true),
  tool("cart.read", "Sepeti görüntüle", "Sepet ürünlerini, miktarları ve fiyat dökümünü getirir.", "cart", "query", "cart.read", "none", "never", true),
  tool("cart.update", "Sepeti düzenle", "Sepetteki ürün veya miktarları Commerce Core kurallarıyla günceller.", "cart", "command", "cart.write", "high", "risk_based", true),
  tool("checkout.read", "Checkout oturumunu görüntüle", "Checkout müşteri, adres, teslimat ve ödeme öncesi durumunu getirir.", "checkout", "query", "checkout.read", "none", "never", true),
  tool("checkout.update", "Checkout oturumunu düzenle", "Checkout oturumunun izin verilen müşteri, adres ve teslimat alanlarını günceller.", "checkout", "command", "checkout.write", "high", "risk_based", true),
  tool("inventory.read", "Stok görüntüle", "SKU bazında eldeki, ayrılmış ve kullanılabilir stokları getirir.", "inventory", "query", "inventory.read", "none", "never", true),
  tool("inventory.adjust", "Stok düzelt", "Stok hareket defterine gerekçeli manuel düzeltme yazar.", "inventory", "command", "inventory.adjust", "critical", "always", true),
  tool("payment.read", "Ödeme görüntüle", "Ödeme, taksit, tahsilat ve iade özetini getirir.", "payment", "query", "payments.read", "none", "never", true),
  tool("payment.refund", "Ödeme iadesi yap", "Tam veya kısmi iade orkestrasyonunu başlatır.", "payment", "command", "payments.refund", "critical", "always", false),
  tool("shipping.read", "Kargoyu görüntüle", "Gönderi, etiket, takip ve istisna bilgilerini getirir.", "shipping", "query", "shipping.read", "none", "never", true),
  tool("shipping.create", "Kargo oluştur", "Sipariş için kargo kaydı ve sağlayıcı işlemini başlatır.", "shipping", "command", "shipping.write", "high", "risk_based", true),
  tool("shipping.cancel", "Kargoyu iptal et", "Aktif gönderiyi sağlayıcı ve yerel kayıtlarla birlikte iptal eder.", "shipping", "command", "shipping.write", "critical", "always", false),
  tool("customer.read", "Müşteriyi görüntüle", "Müşteri profili, adresleri, izinleri ve sipariş özetini getirir.", "customer", "query", "customers.read", "none", "never", true),
  tool("customer.update", "Müşteriyi düzenle", "Müşteri profilindeki izin verilen alanları günceller.", "customer", "command", "customers.write", "high", "risk_based", true),
  tool("loyalty.read", "ROSTA Points görüntüle", "Müşterinin puan bakiyesi ve hareketlerini getirir.", "loyalty", "query", "loyalty.read", "none", "never", true),
  tool("loyalty.adjust", "ROSTA Points düzenle", "Gerekçeli puan ekleme veya çıkarma hareketi oluşturur.", "loyalty", "command", "loyalty.adjust", "high", "always", true),
  tool("return.read", "İade ve değişimi görüntüle", "İade/değişim vakasını, ürünleri ve durum geçmişini getirir.", "return", "query", "returns.read", "none", "never", true),
  tool("return.approve", "İade veya değişimi onayla", "İade/değişim sürecini onaylar ve bağlı operasyonları başlatır.", "return", "command", "returns.approve", "critical", "always", true),
  tool("notification.whatsapp.draft", "WhatsApp yanıtı hazırla", "Müşteri ve sipariş bağlamına göre gönderilmemiş WhatsApp taslağı oluşturur.", "notification", "command", "messages.draft", "low", "risk_based", true),
  tool("notification.whatsapp.send", "WhatsApp mesajı gönder", "Onaylanan mesajı WhatsApp Business sağlayıcısına gönderir.", "notification", "command", "messages.send", "high", "always", false),
  tool("promotion.read", "Kampanyayı görüntüle", "Kampanya, kupon ve uygunluk ayarlarını getirir.", "promotion", "query", "promotions.read", "none", "never", true),
  tool("promotion.activate", "Kampanyayı etkinleştir", "Hazır kampanyayı yayın durumuna geçirir.", "promotion", "command", "promotions.publish", "high", "always", true),
  tool("cms.read", "İçeriği görüntüle", "Site içeriği ve yayın ayarlarını getirir.", "cms", "query", "cms.read", "none", "never", true),
  tool("cms.publish", "İçeriği yayınla", "Hazır içerik veya tema değişikliğini storefront'a yayınlar.", "cms", "command", "cms.publish", "high", "always", true),
]);

export const RUTHIE_CONNECTOR_CATALOG: readonly RuthieConnectorDefinition[] = Object.freeze([
  connector("openai", "OpenAI", "ai", ["chat", "realtime_voice", "vision", "files", "tool_calling"], "api_key", true),
  connector("whatsapp-business", "WhatsApp Business", "messaging", ["send_message", "templates", "webhooks", "delivery_status"], "oauth2", true),
  connector("github", "GitHub", "development", ["repositories", "issues", "pull_requests", "actions"], "platform_connection", false),
  connector("zeabur", "Zeabur", "infrastructure", ["services", "deployments", "domains", "logs"], "api_key", false),
  connector("supabase", "Supabase", "commerce", ["database", "auth", "storage", "edge_functions"], "platform_connection", false),
  connector("canva", "Canva", "design", ["designs", "templates", "exports"], "oauth2", false),
  connector("figma", "Figma", "design", ["files", "components", "comments", "design_context"], "oauth2", false),
  connector("google-drive", "Google Drive", "productivity", ["files", "folders", "search"], "oauth2", false),
  connector("gmail", "Gmail", "productivity", ["search", "read", "draft", "send"], "oauth2", false),
  connector("google-calendar", "Google Calendar", "productivity", ["events", "availability", "reminders"], "oauth2", false),
  connector("slack", "Slack", "productivity", ["channels", "messages", "notifications"], "oauth2", false),
  connector("notion", "Notion", "productivity", ["pages", "databases", "search"], "oauth2", false),
  connector("google-analytics", "Google Analytics", "analytics", ["reports", "realtime", "acquisition", "conversion"], "oauth2", false),
  connector("search-console", "Google Search Console", "analytics", ["queries", "pages", "indexing", "sitemaps"], "oauth2", false),
  connector("meta-business", "Meta Business", "analytics", ["ads", "campaigns", "insights", "creative_status"], "oauth2", false),
]);

export interface RuthieEngineGateway {
  query<TData = unknown>(
    engine: RuthieCoreKey,
    toolId: string,
    input: Record<string, unknown>,
    context: RuthieDispatchContext,
  ): Promise<TData>;
  command<TData = unknown>(
    engine: RuthieCoreKey,
    toolId: string,
    input: Record<string, unknown>,
    context: RuthieDispatchContext,
  ): Promise<TData>;
}

export function createRuthieToolRegistry(
  definitions: readonly RuthieToolDefinition[] = RUTHIE_DEFAULT_TOOLS,
): ReadonlyMap<string, RuthieToolDefinition> {
  const registry = new Map<string, RuthieToolDefinition>();

  for (const definition of definitions) {
    validateTool(definition);
    if (registry.has(definition.id)) {
      throw new CommerceInvariantError("RUTHIE_DUPLICATE_TOOL", `ROSTA Insight tool ${definition.id} is defined more than once.`);
    }
    registry.set(definition.id, Object.freeze({ ...definition }));
  }

  return registry;
}

export function createRuthieConnectorRegistry(
  definitions: readonly RuthieConnectorDefinition[] = RUTHIE_CONNECTOR_CATALOG,
): ReadonlyMap<string, RuthieConnectorDefinition> {
  const registry = new Map<string, RuthieConnectorDefinition>();

  for (const definition of definitions) {
    if (!definition.key.trim() || !definition.title.trim()) {
      throw new CommerceInvariantError("RUTHIE_INVALID_CONNECTOR", "Ruthie connector key and title are required.");
    }
    if (definition.capabilities.length === 0) {
      throw new CommerceInvariantError("RUTHIE_EMPTY_CONNECTOR", `Ruthie connector ${definition.key} has no capabilities.`);
    }
    if (registry.has(definition.key)) {
      throw new CommerceInvariantError("RUTHIE_DUPLICATE_CONNECTOR", `Ruthie connector ${definition.key} is defined more than once.`);
    }
    registry.set(definition.key, Object.freeze({ ...definition, capabilities: Object.freeze([...definition.capabilities]) }));
  }

  return registry;
}

export function planRuthieAction(
  request: RuthieActionRequest,
  registry: ReadonlyMap<string, RuthieToolDefinition> = createRuthieToolRegistry(),
): RuthieActionPlan {
  const definition = registry.get(request.toolId);
  if (!definition) {
    throw new CommerceInvariantError("RUTHIE_UNKNOWN_TOOL", `Ruthie tool ${request.toolId} is not registered.`);
  }

  if (!hasPermission(request.actor.permissions, definition.permission)) {
    return {
      tool: definition,
      request,
      status: "blocked",
      confirmation: { required: false, mode: "none" },
      reason: `Actor does not have ${definition.permission} permission.`,
    };
  }

  const requiresConfirmation = definition.confirmationPolicy === "always"
    || (definition.confirmationPolicy === "risk_based" && (definition.riskLevel === "high" || definition.riskLevel === "critical"));

  if (!requiresConfirmation) {
    return {
      tool: definition,
      request,
      status: "ready",
      confirmation: { required: false, mode: "none" },
      reason: definition.operation === "query" ? "Read-only tool is ready." : "Low-risk reversible command is ready.",
    };
  }

  const mode = request.surface === "voice" ? "voice" : "chat";
  return {
    tool: definition,
    request,
    status: "awaiting_confirmation",
    confirmation: {
      required: true,
      mode,
      prompt: request.surface === "voice"
        ? `${definition.title} işlemi panelde değişiklik yapacak. Devam etmek için sesli olarak “Evet, onaylıyorum” de.`
        : `${definition.title} işlemi panelde değişiklik yapacak. Devam etmek için işlemi onayla.`,
      acceptedVoicePhrases: request.surface === "voice"
        ? ["evet onaylıyorum", "onaylıyorum", "devam et"]
        : undefined,
    },
    reason: `${definition.riskLevel} risk command requires ${mode} confirmation.`,
  };
}

export async function dispatchRuthieAction<TData = unknown>(
  plan: RuthieActionPlan,
  gateway: RuthieEngineGateway,
  confirmationGranted = false,
): Promise<RuthieToolExecutionResult<TData>> {
  const context: RuthieDispatchContext = {
    actor: plan.request.actor,
    surface: plan.request.surface,
    correlationId: plan.request.correlationId,
    idempotencyKey: plan.request.idempotencyKey,
    confirmationGranted,
  };

  if (plan.status === "blocked") {
    return failure(plan, "RUTHIE_PERMISSION_DENIED", plan.reason, false);
  }

  if (plan.confirmation.required && !confirmationGranted) {
    return failure(plan, "RUTHIE_CONFIRMATION_REQUIRED", plan.confirmation.prompt || "Confirmation is required.", false);
  }

  try {
    const data = plan.tool.operation === "query"
      ? await gateway.query<TData>(plan.tool.engine, plan.tool.id, plan.request.input, context)
      : await gateway.command<TData>(plan.tool.engine, plan.tool.id, plan.request.input, context);

    return {
      ok: true,
      toolId: plan.tool.id,
      engine: plan.tool.engine,
      data,
      correlationId: plan.request.correlationId,
    };
  } catch (error) {
    return failure(
      plan,
      "RUTHIE_ENGINE_DISPATCH_FAILED",
      error instanceof Error ? error.message : "Ruthie engine dispatch failed.",
      true,
    );
  }
}

export function runRuthieCoreSelfTest(): string {
  const tools = createRuthieToolRegistry();
  const connectors = createRuthieConnectorRegistry();
  const actor = { actorId: "health", role: "admin" as const, permissions: ["*"] };

  const readPlan = planRuthieAction({
    toolId: "order.read",
    surface: "chat",
    actor,
    input: { orderId: "health" },
    correlationId: "ruthie-health-read" as never,
  }, tools);
  const voicePlan = planRuthieAction({
    toolId: "payment.refund",
    surface: "voice",
    actor,
    input: { orderId: "health", amountMinor: 100 },
    correlationId: "ruthie-health-write" as never,
    idempotencyKey: "ruthie-health-write" as never,
  }, tools);

  if (readPlan.status !== "ready" || readPlan.confirmation.required) {
    throw new CommerceInvariantError("RUTHIE_SELF_TEST_READ", "Read-only Ruthie tool unexpectedly requires confirmation.");
  }
  if (voicePlan.status !== "awaiting_confirmation" || voicePlan.confirmation.mode !== "voice") {
    throw new CommerceInvariantError("RUTHIE_SELF_TEST_CONFIRMATION", "Critical voice tool did not require voice confirmation.");
  }
  if (!RUTHIE_ALLOWED_ENGINES.every((engine) => [...tools.values()].some((definition) => definition.engine === engine))) {
    throw new CommerceInvariantError("RUTHIE_SELF_TEST_ENGINE_ACCESS", "Ruthie engine access registry is incomplete.");
  }

  return `${tools.size} araç, ${connectors.size} connector ve sesli/yazılı onay politikası geçti`;
}

function tool(
  id: string,
  title: string,
  description: string,
  engine: RuthieCoreKey,
  operation: RuthieToolDefinition["operation"],
  permission: string,
  riskLevel: RuthieToolDefinition["riskLevel"],
  confirmationPolicy: RuthieToolDefinition["confirmationPolicy"],
  reversible: boolean,
): RuthieToolDefinition {
  return { id, title, description, engine, operation, permission, riskLevel, confirmationPolicy, reversible, inputSchemaVersion: 1 };
}

function connector(
  key: string,
  title: string,
  category: RuthieConnectorDefinition["category"],
  capabilities: string[],
  auth: RuthieConnectorDefinition["auth"],
  required: boolean,
): RuthieConnectorDefinition {
  return { key, title, category, capabilities, auth, required };
}

function validateTool(definition: RuthieToolDefinition): void {
  if (!definition.id.trim() || !definition.title.trim() || !definition.permission.trim()) {
    throw new CommerceInvariantError("RUTHIE_INVALID_TOOL", "Ruthie tool id, title and permission are required.");
  }
  if (!RUTHIE_ALLOWED_ENGINES.includes(definition.engine)) {
    throw new CommerceInvariantError("RUTHIE_INVALID_ENGINE", `Ruthie tool ${definition.id} targets unsupported engine ${definition.engine}.`);
  }
  if (!Number.isInteger(definition.inputSchemaVersion) || definition.inputSchemaVersion <= 0) {
    throw new CommerceInvariantError("RUTHIE_INVALID_SCHEMA_VERSION", `Ruthie tool ${definition.id} has an invalid schema version.`);
  }
  if (definition.operation === "query" && (definition.riskLevel !== "none" || definition.confirmationPolicy !== "never")) {
    throw new CommerceInvariantError("RUTHIE_QUERY_CONFIRMATION", `Read-only Ruthie tool ${definition.id} must not require confirmation.`);
  }
  if (definition.operation === "command" && definition.riskLevel === "none") {
    throw new CommerceInvariantError("RUTHIE_COMMAND_WITHOUT_RISK", `Ruthie command ${definition.id} must declare a risk level.`);
  }
  if ((definition.riskLevel === "high" || definition.riskLevel === "critical") && definition.confirmationPolicy === "never") {
    throw new CommerceInvariantError("RUTHIE_UNSAFE_CONFIRMATION_POLICY", `Ruthie tool ${definition.id} cannot skip confirmation.`);
  }
}

function hasPermission(permissions: readonly string[], required: string): boolean {
  if (permissions.includes("*") || permissions.includes(required)) return true;
  const namespace = required.split(".")[0];
  return permissions.includes(`${namespace}.*`);
}

function failure<TData>(
  plan: RuthieActionPlan,
  code: string,
  message: string,
  retryable: boolean,
): RuthieToolExecutionResult<TData> {
  return {
    ok: false,
    toolId: plan.tool.id,
    engine: plan.tool.engine,
    error: { code, message, retryable },
    correlationId: plan.request.correlationId,
  };
}
