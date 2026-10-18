import { randomUUID } from "node:crypto";
import {
  financeActionPermission,
  financeAmount,
  financeCsvCell,
} from "@ruth-commerce/commerce-core/finance";
import {
  financeAuth,
  financeError,
  financeHeaders,
  financeJson,
  financeRange,
  financeRpc,
} from "@/lib/finance/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
const uuid = (v: unknown) =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export async function GET(request: Request, context: Context) {
  const path = (await context.params).path;
  const route = path[0];
  const auth = await financeAuth(
    request,
    route === "export" ? "export" : "view",
  );
  if ("error" in auth) return auth.error;
  const db = auth.supabase;
  try {
    const url = new URL(request.url);
    const range = financeRange(url);
    if (route === "overview" || route === "export") {
      const report = await financeRpc(db, "finance_report", {
        p_from: range.from,
        p_to: range.to,
        p_currency: range.currency,
        p_group: url.searchParams.get("group") || "day",
      });
      if (route === "overview") return financeJson({ ok: true, report });
      const format = url.searchParams.get("format") || "csv";
      if (["xlsx", "pdf"].includes(format)) {
        const { exportFinance } = await import("@/lib/finance/export");
        const output = await exportFinance(report, format);
        return new Response(new Uint8Array(output.bytes), {
          headers: {
            ...financeHeaders,
            "Content-Type": output.mime,
            "Content-Disposition": `attachment; filename="finans-${range.from}-${range.to}.${output.ext}"`,
          },
        });
      }
      const rows = [
        ["Dönem", "Kalem", "Tutar", "Para birimi"],
        ...report.monthly.flatMap(
          (month: { date: string; values: Record<string, unknown> }) =>
            Object.entries(month.values).map(([key, value]) => [
              month.date,
              key,
              value,
              range.currency,
            ]),
        ),
      ];
      const csv =
        "\uFEFF" +
        rows
          .map((r: unknown[]) => r.map(financeCsvCell).join(";"))
          .join("\r\n");
      return new Response(csv, {
        headers: {
          ...financeHeaders,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="finans-${range.from}-${range.to}.csv"`,
        },
      });
    }
    if (route === "records" && !path[1]) {
      const filter = Object.fromEntries(url.searchParams);
      const data = await financeRpc(db, "finance_list", {
        p_filter: { ...filter, ...range },
      });
      return financeJson({ ok: true, ...data });
    }
    if (route === "records" && uuid(path[1])) {
      const [entry, payments, documents, audit] = await Promise.all([
        db.from("finance_entries").select("*").eq("id", path[1]).single(),
        db
          .from("finance_payments")
          .select("*")
          .eq("entry_id", path[1])
          .order("paid_on"),
        db
          .from("finance_documents")
          .select("*")
          .eq("entry_id", path[1])
          .eq("archived", false),
        db
          .from("finance_audit")
          .select("*")
          .eq("entity_id", path[1])
          .order("created_at", { ascending: false })
          .limit(100),
      ]);
      for (const r of [entry, payments, documents, audit])
        if (r.error) throw new Error(r.error.message);
      const snapshots = entry.data.order_id
        ? await db
            .from("finance_item_snapshots")
            .select("*,order_items(product_name)")
            .eq("order_id", entry.data.order_id)
        : { data: [], error: null };
      if (snapshots.error) throw new Error(snapshots.error.message);
      return financeJson({
        ok: true,
        snapshots: snapshots.data,
        entry: entry.data,
        payments: payments.data,
        documents: documents.data,
        audit: audit.data,
      });
    }
    if (route === "bank") {
      const { data, error } = await db
        .from("finance_bank_rows")
        .select("*")
        .order("occurred_on", { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      return financeJson({ ok: true, rows: data });
    }
    if (route === "setup") {
      const [settings, categories, accounts, recurring, permissions] =
        await Promise.all([
          db.from("finance_settings").select("*").single(),
          db.from("finance_categories").select("*").order("name"),
          db.from("finance_accounts").select("*"),
          db.from("finance_recurring").select("*").order("next_on"),
          db
            .from("finance_permissions")
            .select("*")
            .eq("user_id", auth.user.id),
        ]);
      for (const r of [settings, categories, accounts, recurring, permissions])
        if (r.error) throw new Error(r.error.message);
      return financeJson({
        ok: true,
        settings: settings.data,
        categories: categories.data,
        accounts: accounts.data,
        recurring: recurring.data,
        permissions: ["admin", "owner"].includes(
          String(auth.user.app_metadata?.panel_role || auth.profile.role),
        )
          ? ["*"]
          : permissions.data?.map((r) => r.permission),
      });
    }
    if (route === "costs" && uuid(url.searchParams.get("product_id"))) {
      const product = url.searchParams.get("product_id")!;
      const { data, error } = await db
        .from("finance_costs")
        .select("*")
        .eq("product_id", product)
        .order("effective_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      const unitCost = await financeRpc(db, "finance_unit_cost", {
        p_product: product,
        p_variant: url.searchParams.get("variant_id") || null,
      });
      return financeJson({ ok: true, costs: data, unitCost });
    }
    if (route === "documents" && uuid(path[1])) {
      const { data, error } = await db
        .from("finance_documents")
        .select("path")
        .eq("id", path[1])
        .eq("archived", false)
        .single();
      if (error) throw new Error(error.message);
      const signed = await db.storage
        .from("finance-documents")
        .createSignedUrl(data.path, 60);
      if (signed.error) throw new Error(signed.error.message);
      return financeJson({ ok: true, url: signed.data.signedUrl });
    }
    return financeJson({ ok: false, error: "Finans kaynağı bulunamadı." }, 404);
  } catch (e) {
    return financeError(e);
  }
}

export async function POST(request: Request, context: Context) {
  const route = (await context.params).path[0];
  if (route === "documents") return uploadDocument(request);
  let body: { action?: string; data?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return financeJson({ ok: false, error: "Geçersiz istek." }, 400);
  }
  const action = body.action || "";
  // Historical orders must not be bulk-imported into finance without an explicit new decision.
  if (action === "backfill") return financeJson({ok:false,error:"Geçmiş sipariş toplu aktarımı kapalı."},403);
  const data = body.data || {};
  let permission = ["paytr_sync", "bank_import", "bank_match"].includes(action)
    ? "settings"
    : financeActionPermission[action];
  if (action === "entry")
    permission =
      data.id && data.version
        ? "expense_edit"
        : data.direction === "income"
          ? "income_create"
          : "expense_create";
  if (!permission || route !== "command")
    return financeJson({ ok: false, error: "Geçersiz finans komutu." }, 400);
  const auth = await financeAuth(request, permission);
  if ("error" in auth) return auth.error;
  try {
    // Amounts arrive as decimal strings, never UI-computed totals.
    if (["entry", "payment", "budget", "transfer"].includes(action))
      data.amount = financeAmount(data.amount);
    if (action === "bank_import") {
      return financeJson({
        ok: true,
        result: await financeRpc(auth.supabase, "finance_bank_import", {
          p_account: data.account_id,
          p_rows: data.rows,
          p_actor: auth.user.id,
        }),
      });
    }
    if (action === "bank_match") {
      return financeJson({
        ok: true,
        result: await financeRpc(auth.supabase, "finance_bank_match", {
          p_row: data.row_id,
          p_payment: data.payment_id,
          p_actor: auth.user.id,
        }),
      });
    }
    if (action === "paytr_sync") {
      const { syncFinancePaytr } = await import("@/lib/finance/provider");
      const range = financeRange(
        new URL(`https://finance.local/?from=${data.from}&to=${data.to}`),
      );
      return financeJson({
        ok: true,
        result: await syncFinancePaytr(
          auth.supabase,
          range.from,
          range.to,
          auth.user.id,
        ),
      });
    }
    if (action === "permission") {
      if (
        !["admin", "owner"].includes(
          String(auth.user.app_metadata?.panel_role || auth.profile.role),
        )
      )
        return financeJson(
          { ok: false, error: "Yalnız marka yöneticisi yetki atayabilir." },
          403,
        );
      if (
        !uuid(data.user_id) ||
        ![
          "view",
          "expense_create",
          "expense_edit",
          "income_create",
          "pay",
          "settings",
          "export",
          "void",
        ].includes(String(data.permission))
      )
        throw new Error("Geçersiz yetki.");
      await financeRpc(auth.supabase, "finance_save", {
        p_action: "permission",
        p_data: data,
        p_actor: auth.user.id,
      });
      return financeJson({ ok: true });
    }
    const result =
      action === "backfill"
        ? await financeRpc(auth.supabase, "finance_backfill", {
            p_after: data.cursor || null,
          })
        : action === "run"
          ? await financeRpc(auth.supabase, "finance_run_recurring")
          : await financeRpc(auth.supabase, "finance_save", {
              p_action: action,
              p_data: data,
              p_actor: auth.user.id,
            });
    return financeJson({ ok: true, result });
  } catch (e) {
    return financeError(e);
  }
}

async function uploadDocument(request: Request) {
  const auth = await financeAuth(request, "expense_edit");
  if ("error" in auth) return auth.error;
  try {
    const form = await request.formData();
    const file = form.get("file");
    const entryId = form.get("entry_id");
    if (!(file instanceof File) || !uuid(entryId))
      throw new Error("Belge veya kayıt eksik.");
    if (
      file.size < 1 ||
      file.size > 10 * 1024 * 1024 ||
      !["application/pdf", "image/jpeg", "image/png", "image/heic"].includes(
        file.type,
      )
    )
      throw new Error("En fazla 10 MB PDF veya fotoğraf yükleyebilirsin.");
    const entry = await auth.supabase
      .from("finance_entries")
      .select("id")
      .eq("id", entryId)
      .single();
    if (entry.error) throw new Error(entry.error.message);
    const path = `${entryId}/${randomUUID()}`;
    const upload = await auth.supabase.storage
      .from("finance-documents")
      .upload(path, await file.arrayBuffer(), {
        contentType: file.type,
        upsert: false,
      });
    if (upload.error) throw new Error(upload.error.message);
    try {
      await financeRpc(auth.supabase, "finance_save", {
        p_action: "document_create",
        p_actor: auth.user.id,
        p_data: {
          entry_id: entryId,
          path,
          name: file.name.slice(0, 240),
          mime: file.type,
          size: file.size,
        },
      });
    } catch (e) {
      await auth.supabase.storage.from("finance-documents").remove([path]);
      throw e;
    }
    return financeJson({ ok: true });
  } catch (e) {
    return financeError(e);
  }
}
export async function DELETE(request: Request, context: Context) {
  const auth = await financeAuth(request, "expense_edit");
  if ("error" in auth) return auth.error;
  const path = (await context.params).path;
  if (path[0] !== "documents" || !uuid(path[1]))
    return financeJson({ ok: false, error: "Geçersiz belge." }, 400);
  try {
    await financeRpc(auth.supabase, "finance_save", {
      p_action: "document_archive",
      p_data: { id: path[1] },
      p_actor: auth.user.id,
    });
    return financeJson({ ok: true });
  } catch (e) {
    return financeError(e);
  }
}
