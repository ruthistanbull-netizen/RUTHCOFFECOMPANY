type QueryError = { message: string } | null;

type CountResult = { count: number | null; error: QueryError };
type RowsResult<T> = { data: T[] | null; error: QueryError };

async function safeCount(query: PromiseLike<CountResult>): Promise<number> {
  try {
    const { count, error } = await query;
    return error ? 0 : Number(count || 0);
  } catch {
    return 0;
  }
}

async function safeRows<T>(query: PromiseLike<unknown>): Promise<T[]> {
  try {
    const result = await query as RowsResult<T>;
    return result.error || !Array.isArray(result.data) ? [] : result.data;
  } catch {
    return [];
  }
}

export type RuthiePanelSnapshot = {
  generatedAt: string;
  access: {
    role: "admin";
    mode: "read_only_live";
    canAnalyzePanel: true;
    commandPolicy: "confirmation_required";
  };
  summary: {
    totalOrders: number;
    paidOrders: number;
    activeProducts: number;
    totalProducts: number;
    customers: number;
    returns: number;
    checkoutDrafts: number;
    lowStockVariants: number;
  };
  recentOrders: Array<Record<string, unknown>>;
  recentProducts: Array<Record<string, unknown>>;
  lowStockVariants: Array<Record<string, unknown>>;
  availableAnalysisAreas: string[];
};

export async function buildRuthiePanelSnapshot(supabase: any): Promise<RuthiePanelSnapshot> {
  const [
    totalOrders,
    paidOrders,
    activeProducts,
    totalProducts,
    customers,
    returns,
    checkoutDrafts,
    recentOrders,
    recentProducts,
    lowStockVariants,
  ] = await Promise.all([
    safeCount(supabase.from("orders").select("id", { count: "exact", head: true })),
    safeCount(supabase.from("orders").select("id", { count: "exact", head: true }).eq("payment_status", "paid")),
    safeCount(supabase.from("products").select("id", { count: "exact", head: true }).eq("status", "active")),
    safeCount(supabase.from("products").select("id", { count: "exact", head: true })),
    safeCount(supabase.from("profiles").select("id", { count: "exact", head: true }).neq("role", "admin")),
    safeCount(supabase.from("returns_exchanges").select("id", { count: "exact", head: true })),
    safeCount(supabase.from("checkout_drafts").select("id", { count: "exact", head: true })),
    safeRows<Record<string, unknown>>(
      supabase
        .from("orders")
        .select("id,order_no,total_amount,currency,status,payment_status,shipping_status,cargo_company,created_at")
        .order("created_at", { ascending: false })
        .limit(12),
    ),
    safeRows<Record<string, unknown>>(
      supabase
        .from("products")
        .select("id,name,slug,price,status,sort_order,created_at,updated_at,product_variants(id,option_summary,price,stock,stock_status,is_active)")
        .order("updated_at", { ascending: false })
        .limit(12),
    ),
    safeRows<Record<string, unknown>>(
      supabase
        .from("product_variants")
        .select("id,product_id,option_summary,stock,stock_status,is_active")
        .eq("is_active", true)
        .lte("stock", 5)
        .order("stock", { ascending: true })
        .limit(20),
    ),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    access: {
      role: "admin",
      mode: "read_only_live",
      canAnalyzePanel: true,
      commandPolicy: "confirmation_required",
    },
    summary: {
      totalOrders,
      paidOrders,
      activeProducts,
      totalProducts,
      customers,
      returns,
      checkoutDrafts,
      lowStockVariants: lowStockVariants.length,
    },
    recentOrders,
    recentProducts,
    lowStockVariants,
    availableAnalysisAreas: [
      "sipariş ve ödeme durumu",
      "ürün ve varyant kataloğu",
      "stok uyarıları",
      "müşteri sayısı",
      "iade ve değişim hacmi",
      "checkout taslakları",
      "panel servis ve entegrasyon yapısı",
    ],
  };
}

export function serializeRuthiePanelSnapshot(snapshot: RuthiePanelSnapshot): string {
  return JSON.stringify(snapshot, null, 2).slice(0, 32_000);
}
