import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { applyRange } from "@/lib/ranges";
import { getLocalProductImage } from "@/lib/localProductImages";
import { normalizeOrderStatus, orderStatusLabel } from "@/lib/statusLabels";
import { noStoreHeaders, revalidateWebsite } from "@/lib/websiteRevalidate";
import { POST as createProviderRefund } from "../payments/route";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cargoText(order: any) {
  return orderStatusLabel(order.status, order);
}

function normalizeItem(item: any, orderId: string) {
  const quantity = Math.max(1, Math.trunc(toNumber(item.quantity, 1)));
  const unitPrice = toNumber(item.unit_price || item.price, 0);
  return {
    id: item.id || null,
    order_id: orderId,
    product_id: item.product_id || null,
    variant_id: item.variant_id || null,
    product_slug: clean(item.product_slug) || "manual",
    product_name: clean(item.product_name) || "Ürün",
    variant_name: clean(item.variant_name) || null,
    quantity,
    unit_price: unitPrice,
    total_price: quantity * unitPrice,
    image_url: clean(item.image_url) || null,
  };
}

async function attachFallbackImages(supabase: any, orders: any[]) {
  const items = orders.flatMap((order: any) => order.order_items || []);
  const productIds = [...new Set(items.map((item: any) => item.product_id).filter(Boolean).map(String))];
  const productSlugs = [...new Set(items.map((item: any) => item.product_slug).filter(Boolean).map(String))];
  const productNames = [...new Set(items.map((item: any) => item.product_name).filter(Boolean).map(String))];
  const variantIds = [...new Set(items.map((item: any) => item.variant_id).filter(Boolean).map(String))];

  const productImageById = new Map<string, string>();
  const productImageBySlug = new Map<string, string>();
  const productImageByName = new Map<string, string>();
  const variantImageById = new Map<string, string>();

  if (variantIds.length > 0) {
    const { data: variants } = await supabase.from("product_variants").select("id, image_url").in("id", variantIds);
    for (const variant of variants || []) {
      if (variant.id && variant.image_url) variantImageById.set(String(variant.id), String(variant.image_url));
    }

    const { data: variantImages } = await supabase
      .from("product_images")
      .select("variant_id, image_url, sort_order")
      .in("variant_id", variantIds)
      .order("sort_order", { ascending: true });

    for (const image of variantImages || []) {
      if (image.variant_id && image.image_url && !variantImageById.has(String(image.variant_id))) {
        variantImageById.set(String(image.variant_id), String(image.image_url));
      }
    }
  }

  if (productIds.length > 0) {
    const { data: products } = await supabase.from("products").select("id, slug, name, main_image_url").in("id", productIds);
    for (const product of products || []) {
      if (product.id && product.main_image_url) productImageById.set(String(product.id), String(product.main_image_url));
      if (product.slug && product.main_image_url) productImageBySlug.set(String(product.slug), String(product.main_image_url));
      if (product.name && product.main_image_url) productImageByName.set(String(product.name), String(product.main_image_url));
    }

    const { data: productImages } = await supabase
      .from("product_images")
      .select("product_id, image_url, is_main, sort_order")
      .in("product_id", productIds)
      .order("is_main", { ascending: false })
      .order("sort_order", { ascending: true });

    for (const image of productImages || []) {
      if (image.product_id && image.image_url && !productImageById.has(String(image.product_id))) {
        productImageById.set(String(image.product_id), String(image.image_url));
      }
    }
  }

  if (productSlugs.length > 0) {
    const { data: slugProducts } = await supabase.from("products").select("id, slug, name, main_image_url").in("slug", productSlugs);
    for (const product of slugProducts || []) {
      if (product.slug && product.main_image_url) productImageBySlug.set(String(product.slug), String(product.main_image_url));
      if (product.name && product.main_image_url) productImageByName.set(String(product.name), String(product.main_image_url));
    }
  }

  const unresolvedProductNames = productNames.filter((name) => !productImageByName.has(name)).slice(0, 120);
  if (unresolvedProductNames.length > 0) {
    const { data: nameProducts } = await supabase
      .from("products")
      .select("id, name, slug, main_image_url")
      .in("name", unresolvedProductNames)
      .limit(140);

    for (const product of nameProducts || []) {
      if (product.name && product.main_image_url) productImageByName.set(String(product.name), String(product.main_image_url));
      if (product.slug && product.main_image_url) productImageBySlug.set(String(product.slug), String(product.main_image_url));
      if (product.id && product.main_image_url) productImageById.set(String(product.id), String(product.main_image_url));
    }
  }

  return orders.map((order: any) => ({
    ...order,
    order_items: (order.order_items || []).map((item: any) => ({
      ...item,
      image_url:
        item.image_url ||
        (item.variant_id ? variantImageById.get(String(item.variant_id)) : null) ||
        (item.product_id ? productImageById.get(String(item.product_id)) : null) ||
        (item.product_slug ? productImageBySlug.get(String(item.product_slug)) : null) ||
        (item.product_name ? productImageByName.get(String(item.product_name)) : null) ||
        getLocalProductImage(item.product_slug, item.product_name) ||
        null,
    })),
  }));
}

const returnOrderSelect = `
  id,
  order_no,
  customer_name,
  customer_email,
  customer_phone,
  total_amount,
  subtotal,
  shipping_fee,
  tax_total,
  currency,
  status,
  payment_status,
  cargo_company,
  cargo_tracking_no,
  imported_source,
  customer_note,
  created_at,
  order_items (
    id,
    product_id,
    variant_id,
    product_slug,
    product_name,
    variant_name,
    quantity,
    unit_price,
    total_price,
    image_url
  )
`;

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { supabase } = auth;
  const url = new URL(request.url);
  const range = url.searchParams.get("range") || "all";
  const picker = url.searchParams.get("picker") === "1";

  let safeCases: any[] = [];
  let casesError: any = null;

  if (!picker) {
    const casesResult = await supabase
      .from("returns_exchanges")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    safeCases = casesResult.error ? [] : casesResult.data || [];
    casesError = casesResult.error;
  }

  let orderQuery = supabase
    .from("orders")
    .select(returnOrderSelect)
    .eq("payment_status", "paid")
    .order("created_at", { ascending: false })
    .limit(picker ? 100 : 200);

  orderQuery = applyRange(orderQuery, "created_at", range);

  const { data: paidOrders, error: ordersError } = await orderQuery;
  if (ordersError) {
    return NextResponse.json({ ok: false, error: ordersError.message }, { status: 400, headers: noStoreHeaders() });
  }

  const orderById = new Map<string, any>();
  for (const order of paidOrders || []) {
    if (order?.id) orderById.set(String(order.id), order);
  }

  if (!picker && safeCases.length > 0) {
    const missingCaseOrderIds = [...new Set(
      safeCases
        .map((item: any) => item.order_id)
        .filter(Boolean)
        .map(String)
        .filter((id: string) => !orderById.has(id)),
    )].slice(0, 200);

    if (missingCaseOrderIds.length > 0) {
      const { data: caseOrders, error: caseOrdersError } = await supabase
        .from("orders")
        .select(returnOrderSelect)
        .in("id", missingCaseOrderIds);

      if (caseOrdersError) {
        return NextResponse.json({ ok: false, error: caseOrdersError.message }, { status: 400, headers: noStoreHeaders() });
      }

      for (const order of caseOrders || []) {
        if (order?.id) orderById.set(String(order.id), order);
      }
    }
  }

  const combinedOrders = [...orderById.values()].sort((left: any, right: any) => {
    const rightTime = new Date(String(right.created_at || 0)).getTime();
    const leftTime = new Date(String(left.created_at || 0)).getTime();
    return rightTime - leftTime;
  });

  if (picker) {
    return NextResponse.json({
      ok: true,
      orders: combinedOrders.map((order: any) => ({
        ...order,
        status: normalizeOrderStatus(order.status, order),
        return_cases: [],
      })),
      cases: [],
      setupRequired: false,
      setupError: null,
    }, { headers: noStoreHeaders() });
  }

  const casesByOrderId = new Map<string, any[]>();
  for (const item of safeCases) {
    if (item.order_id) {
      const orderId = String(item.order_id);
      const list = casesByOrderId.get(orderId) || [];
      list.push(item);
      casesByOrderId.set(orderId, list);
    }
  }

  const ordersWithImages = await attachFallbackImages(supabase, combinedOrders);
  const rows = ordersWithImages.map((order: any) => {
    const normalizedStatus = normalizeOrderStatus(order.status, order);
    return {
      ...order,
      status: normalizedStatus,
      cargo_text: cargoText({ ...order, status: normalizedStatus }),
      return_cases: casesByOrderId.get(String(order.id)) || [],
    };
  });

  return NextResponse.json({
    ok: true,
    orders: rows,
    cases: safeCases,
    setupRequired: Boolean(casesError),
    setupError: casesError?.message || null,
  }, { headers: noStoreHeaders() });
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { supabase } = auth;
  const body = await request.json();

  const orderId = clean(body.order_id);
  const type = clean(body.type) === "exchange" ? "exchange" : "return";
  const reason = clean(body.reason);
  const notes = clean(body.notes);
  const returnMode = clean(body.return_mode) === "items" ? "items" : "amount";
  const amount = toNumber(body.amount, 0);
  const selectedItems = Array.isArray(body.selected_items) ? body.selected_items : [];
  const exchangeItems = Array.isArray(body.exchange_items) ? body.exchange_items : [];

  if (!orderId) return NextResponse.json({ ok: false, error: "Sipariş seçilmedi." }, { status: 400, headers: noStoreHeaders() });

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select(`
      id,
      order_no,
      customer_name,
      customer_email,
      customer_phone,
      total_amount,
      subtotal,
      shipping_fee,
      tax_total,
      discount_total,
      currency,
      order_items (
        id,
        product_id,
        variant_id,
        product_slug,
        product_name,
        variant_name,
        quantity,
        unit_price,
        total_price,
        image_url
      )
    `)
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ ok: false, error: orderError?.message || "Sipariş bulunamadı." }, { status: 400, headers: noStoreHeaders() });
  }

  let caseAmount = amount;
  let safeSelectedItems: any[] = [];
  let safeExchangeItems: any[] = [];

  if (type === "return") {
    if (returnMode === "items") {
      const orderItemsById = new Map((order.order_items || []).map((item: any) => [String(item.id), item]));
      safeSelectedItems = selectedItems
        .map((item: any) => orderItemsById.get(String(item.id || "")))
        .filter(Boolean)
        .map((item: any) => normalizeItem(item, order.id));
      if (!safeSelectedItems.length) {
        return NextResponse.json({ ok: false, error: "İade edilecek en az bir ürün seçmelisin." }, { status: 400, headers: noStoreHeaders() });
      }
      caseAmount = safeSelectedItems.reduce((sum: number, item: any) => sum + toNumber(item.total_price), 0);
    }
    caseAmount = Math.max(0, Math.min(caseAmount || toNumber(order.total_amount), toNumber(order.total_amount)));
    if (caseAmount <= 0) {
      return NextResponse.json({ ok: false, error: "Geçerli bir iade tutarı gerekli." }, { status: 400, headers: noStoreHeaders() });
    }
  } else {
    safeExchangeItems = exchangeItems.map((item: any) => normalizeItem(item, order.id));
    if (!safeExchangeItems.length) {
      return NextResponse.json({ ok: false, error: "Değişim için en az bir ürün eklemelisin." }, { status: 400, headers: noStoreHeaders() });
    }
    const nextSubtotal = safeExchangeItems.reduce((sum: number, item: any) => sum + toNumber(item.total_price), 0);
    caseAmount = Math.abs(nextSubtotal - toNumber(order.subtotal, toNumber(order.total_amount)));
  }

  const { data, error } = await supabase
    .from("returns_exchanges")
    .insert({
      order_id: order.id,
      order_no: order.order_no,
      customer_name: order.customer_name,
      customer_email: order.customer_email,
      customer_phone: order.customer_phone,
      type,
      status: "open",
      reason: reason || null,
      amount: caseAmount,
      return_mode: returnMode,
      refunded_items: safeSelectedItems,
      exchange_items: safeExchangeItems,
      original_items: order.order_items || [],
      refund_status: type === "return" ? "pending" : "not_applicable",
      notes: notes || null,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400, headers: noStoreHeaders() });
  return NextResponse.json({ ok: true, case: data }, { headers: noStoreHeaders() });
}

async function submitPaytrRefund(request: Request, current: any, caseId: string) {
  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");
  headers.delete("content-length");

  const forwarded = new Request(new URL("/api/payments", request.url), {
    method: "POST",
    headers,
    body: JSON.stringify({
      orderId: current.order_id,
      amount: current.amount,
      reason: clean(current.reason) || `İade vakası ${caseId}`,
    }),
  });

  const response = await createProviderRefund(forwarded);
  if (!response) {
    return {
      ok: false as const,
      outcomeUnknown: true,
      status: 502,
      payload: { ok: false, outcome_unknown: true, reconciliation_required: true, error: "PayTR iade servisi yanıt döndürmedi." },
    };
  }

  const payload = await response.json().catch(() => ({
    ok: false,
    outcome_unknown: true,
    reconciliation_required: true,
    error: "PayTR iade yanıtı okunamadı.",
  })) as Record<string, any>;

  if (!response.ok || payload.ok === false) {
    return {
      ok: false as const,
      outcomeUnknown: Boolean(payload.outcome_unknown || payload.reconciliation_required),
      status: response.status || 400,
      payload,
    };
  }

  const reference = clean(
    payload.refund?.provider_reference ||
    payload.result?.reference_no ||
    payload.result?.merchant_oid,
  );

  return {
    ok: true as const,
    outcomeUnknown: false,
    status: response.status,
    payload,
    reference,
  };
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { supabase } = auth;
  const body = await request.json();
  const caseId = clean(body.case_id || body.id);
  const nextStatus = clean(body.status);

  if (!caseId) return NextResponse.json({ ok: false, error: "İade/değişim kaydı seçilmedi." }, { status: 400, headers: noStoreHeaders() });
  if (!["approved", "rejected", "completed"].includes(nextStatus)) {
    return NextResponse.json({ ok: false, error: "Geçersiz işlem durumu." }, { status: 400, headers: noStoreHeaders() });
  }

  const { data: current, error: currentError } = await supabase
    .from("returns_exchanges")
    .select("id, order_id, order_no, type, status, amount, reason, refund_status, refund_provider, refund_reference")
    .eq("id", caseId)
    .single();
  if (currentError || !current) {
    return NextResponse.json({ ok: false, error: currentError?.message || "Kayıt bulunamadı." }, { status: 404, headers: noStoreHeaders() });
  }

  if (current.status === "completed" || current.status === "rejected") {
    return NextResponse.json({ ok: false, error: "Bu kayıt daha önce kapatılmış." }, { status: 409, headers: noStoreHeaders() });
  }

  if (nextStatus === "rejected" || nextStatus === "approved") {
    const { data, error } = await supabase
      .from("returns_exchanges")
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", caseId)
      .select("*")
      .single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400, headers: noStoreHeaders() });
    return NextResponse.json({ ok: true, case: data }, { headers: noStoreHeaders() });
  }

  let providerRefund: Record<string, any> | null = null;

  if (current.type === "return") {
    if (current.status !== "approved") {
      return NextResponse.json(
        { ok: false, error: "Para iadesinden önce vaka onaylanmalı." },
        { status: 409, headers: noStoreHeaders() },
      );
    }

    const refundStatus = clean(current.refund_status).toLowerCase();
    if (["processing", "outcome_unknown", "reconciliation_required"].includes(refundStatus)) {
      const message = refundStatus === "processing"
        ? "Bu iade PayTR'ye gönderiliyor. Birkaç saniye sonra yenileyip tekrar kontrol et."
        : "Bu iadenin PayTR sonucu kesin değil. Aynı iadeyi tekrar gönderme; ödeme kaydı uzlaştırılmalı.";
      return NextResponse.json(
        { ok: false, outcome_unknown: refundStatus !== "processing", reconciliation_required: refundStatus !== "processing", error: message },
        { status: 409, headers: noStoreHeaders() },
      );
    }

    if (!["succeeded", "completed"].includes(refundStatus)) {
      const claimedAt = new Date().toISOString();
      const { data: claimed, error: claimError } = await supabase
        .from("returns_exchanges")
        .update({
          refund_status: "processing",
          refund_provider: "paytr",
          updated_at: claimedAt,
        })
        .eq("id", caseId)
        .eq("status", "approved")
        .or("refund_status.is.null,refund_status.eq.pending,refund_status.eq.failed")
        .select("id")
        .maybeSingle();

      if (claimError) {
        return NextResponse.json({ ok: false, error: claimError.message }, { status: 400, headers: noStoreHeaders() });
      }
      if (!claimed) {
        return NextResponse.json(
          { ok: false, error: "İade başka bir işlem tarafından başlatıldı veya uzlaştırma bekliyor. Sayfayı yenileyip durumu kontrol et." },
          { status: 409, headers: noStoreHeaders() },
        );
      }

      const refundResult = await submitPaytrRefund(request, current, caseId);
      if (!refundResult.ok) {
        const nextRefundStatus = refundResult.outcomeUnknown ? "reconciliation_required" : "failed";
        await supabase
          .from("returns_exchanges")
          .update({ refund_status: nextRefundStatus, updated_at: new Date().toISOString() })
          .eq("id", caseId)
          .eq("refund_status", "processing");

        return NextResponse.json(
          {
            ...refundResult.payload,
            ok: false,
            outcome_unknown: refundResult.outcomeUnknown || Boolean(refundResult.payload.outcome_unknown),
            reconciliation_required: refundResult.outcomeUnknown || Boolean(refundResult.payload.reconciliation_required),
            error: clean(refundResult.payload.error) || (refundResult.outcomeUnknown
              ? "PayTR sonucu kesin doğrulanamadı; aynı iadeyi tekrar gönderme."
              : "PayTR para iadesi başarısız."),
          },
          { status: refundResult.status, headers: noStoreHeaders() },
        );
      }

      providerRefund = refundResult.payload;
      const { error: refundMetaError } = await supabase
        .from("returns_exchanges")
        .update({
          refund_status: "succeeded",
          refund_provider: "paytr",
          refund_reference: refundResult.reference || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", caseId)
        .eq("refund_status", "processing");

      if (refundMetaError) {
        await supabase
          .from("returns_exchanges")
          .update({ refund_status: "reconciliation_required", updated_at: new Date().toISOString() })
          .eq("id", caseId)
          .neq("refund_status", "completed");
        return NextResponse.json(
          {
            ok: false,
            outcome_unknown: true,
            reconciliation_required: true,
            error: `PayTR iadesi kabul edildi fakat vaka kaydı güncellenemedi: ${refundMetaError.message}. Aynı iadeyi tekrar gönderme.`,
            provider_refund: providerRefund,
          },
          { status: 502, headers: noStoreHeaders() },
        );
      }
    } else {
      providerRefund = {
        ok: true,
        skipped: "already_refunded",
        reference: current.refund_reference || null,
      };
    }
  }

  const rpcName = current.type === "exchange" ? "complete_exchange_case" : "complete_return_case";
  const rpcArgs = current.type === "exchange"
    ? { p_case_id: caseId }
    : { p_case_id: caseId, p_refund_confirmed: true };
  const { error: rpcError } = await supabase.rpc(rpcName, rpcArgs);
  if (rpcError) {
    const providerMessage = current.type === "return"
      ? " PayTR iadesi gönderilmiş olabilir; aynı iadeyi tekrar gönderme."
      : "";
    if (current.type === "return") {
      await supabase
        .from("returns_exchanges")
        .update({ refund_status: "reconciliation_required", updated_at: new Date().toISOString() })
        .eq("id", caseId)
        .neq("refund_status", "completed");
    }
    return NextResponse.json(
      { ok: false, reconciliation_required: current.type === "return", error: `${rpcError.message}.${providerMessage}`, provider_refund: providerRefund },
      { status: current.type === "return" ? 502 : 400, headers: noStoreHeaders() },
    );
  }

  const { data: completed, error: completedError } = await supabase
    .from("returns_exchanges")
    .select("*")
    .eq("id", caseId)
    .single();
  if (completedError) return NextResponse.json({ ok: false, error: completedError.message }, { status: 400, headers: noStoreHeaders() });

  const revalidate = await revalidateWebsite({
    source: current.type === "exchange" ? "admin-exchange-complete" : "admin-return-complete",
    productIds: [],
  });

  return NextResponse.json(
    {
      ok: true,
      case: completed,
      provider_refund: providerRefund,
      message: current.type === "return"
        ? "PayTR para iadesi kabul edildi ve iade vakası tamamlandı."
        : "Değişim vakası tamamlandı.",
      revalidate,
      warning: revalidate.ok ? null : revalidate.message,
    },
    { headers: noStoreHeaders() },
  );
}
