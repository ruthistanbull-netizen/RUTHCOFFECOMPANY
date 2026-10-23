import { randomUUID } from "node:crypto";
import { expenseBreakdown, getExpenseFxRates } from "@/lib/finance/expenseFx";
import { financeOrderItems } from "@/lib/finance/orderItems";
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
    if (route === "fx-rates") {
      const quote = await getExpenseFxRates();
      return financeJson({ ok: true, ...quote });
    }
    if (route === "overview" || route === "export") {
      const report = await financeRpc(db, "finance_report", {
        p_from: range.from,
        p_to: range.to,
        p_currency: range.currency,
        p_group: url.searchParams.get("group") || "day",
      });
      if (route === "overview") {
        // The cardholder's PayTR installment uplift is passed to the provider:
        // disclose it with expenses, but don't charge it again to company profit.
        const tryReport = range.currency === "TRY" ? report :
          await financeRpc(db, "finance_report", {
            p_from: range.from,p_to: range.to,p_currency: "TRY",p_group: "month",
          });
        // A temporary TCMB outage must not take down unrelated finance KPIs.
        // Never show a fabricated TL total when the rate can't be verified.
        let expenses: Record<string,unknown>;
        try {
          expenses = await expenseBreakdown(db,range.from,range.to,tryReport);
        } catch (error) {
          expenses = {
            currency:"TRY",totalTRY:null,cogs:null,monthly:{},rows:[],
            legacyWarning:false,
            error:error instanceof Error?error.message:"Giderler döviz kuru yüzünden hesaplanamadı.",
          };
        }
        const surcharge = await db.rpc("finance_paytr_installment_pass_through", {
          p_from: range.from, p_to: range.to, p_currency: range.currency,
        });
        return financeJson({
          ok: true,
          report: {
            ...report,
            expenseBreakdown: expenses,
            paytrInstallmentPassThrough: surcharge.error ? null : surcharge.data,
          },
        });
      }
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
      const allCurrencies = url.searchParams.get("currency") === "ALL";
      // The existing finance_list RPC already computes payment status,
      // category and filters accurately; reuse it for each currency.
      // Aggregate only the record LIST, never monetary totals in different
      // currencies. Fetch enough entries per currency for stable pagination.
      let data: { records: Record<string, unknown>[]; count: number };
      if (allCurrencies) {
        const offset = Math.max(0, Math.min(10000, Number.parseInt(String(filter.offset || "0"), 10) || 0));
        const limit = Math.max(1, Math.min(100, Number.parseInt(String(filter.limit || "50"), 10) || 50));
        const requested = offset + limit;
        const currencies = ["TRY", "USD", "EUR"];
        const groups = await Promise.all(currencies.map(async (currency) => {
          const rows: Record<string, unknown>[] = [];
          let count = 0;
          for (let start = 0; start < requested; start += 500) {
            const response = await financeRpc(db, "finance_list", {
              p_filter: { ...filter, ...range, currency,
                offset: String(start), limit: String(Math.min(500, requested - start)) },
            }) as {records?: Record<string, unknown>[];count?:number};
            count = Number(response.count || 0);
            rows.push(...(response.records || []));
            if (rows.length >= count || !(response.records || []).length) break;
          }
          return { count, records: rows };
        }));
        const combined = groups.flatMap(group => group.records);
        combined.sort((a,b) => {
          const date = String(b.occurred_on || "").localeCompare(String(a.occurred_on || ""));
          return date || String(a.id || "").localeCompare(String(b.id || "")) * -1;
        });
        data = {
          count: groups.reduce((sum, group) => sum + group.count, 0),
          records: combined.slice(offset, offset + limit),
        };
      } else {
        data = await financeRpc(db, "finance_list", {
          p_filter: { ...filter, ...range },
        }) as {records: Record<string, unknown>[];count:number};
      }
      // Expand only the currently visible page; finance entries are not changed.
      const financeRecords = (data.records || []) as Array<{ order_id?: string | null; source?: string }>;
      const orderItems = await financeOrderItems(
        db,
        financeRecords.filter((r) => r.source === "order" && r.order_id)
          .map((r) => String(r.order_id)),
      );
      return financeJson({
        ok: true,
        ...data,
        records: financeRecords.map((r) =>
          r.source === "order" && r.order_id
            ? { ...r, order_items: orderItems.get(String(r.order_id)) || [] }
            : r,
        ),
      });
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
      const purchasedItems = entry.data.order_id
        ? await financeOrderItems(db, [String(entry.data.order_id)])
        : new Map();
      return financeJson({
        ok: true,
        snapshots: snapshots.data,
        order_items: entry.data.order_id
          ? purchasedItems.get(String(entry.data.order_id)) || []
          : [],
        entry: entry.data,
        payments: payments.data,
        documents: documents.data,
        audit: audit.data,
      });
    }
    if (route === "payouts") {
      // The same official report/parser owns Hakedişler and Finance.
      const { loadPaytrSettlementReport } = await import("@/lib/paytrSettlementReport");
      const { financePayouts } = await import("@/lib/finance/paytrPayouts");
      try {
        const report = await loadPaytrSettlementReport({
          merchantId: process.env.PAYTR_MERCHANT_ID || "",
          merchantKey: process.env.PAYTR_MERCHANT_KEY || "",
          merchantSalt: process.env.PAYTR_MERCHANT_SALT || "",
        });
        return financeJson({ ok: true, ...financePayouts(report) });
      } catch (error) {
        return financeJson({
          ok: true, rows: [], upcoming: [], unpaidTotal: 0, byCurrency: {},
          checkedAt: new Date().toISOString(), windowsChecked: 0,
          providerStatus: "unavailable",
          payoutWarning: error instanceof Error ? error.message : "PayTR hakedişleri alınamadı.",
        });
      }
    }
    if (route === "payables") {
      // Only expenses the business must explicitly mark paid. Payment processor
      // fees and automated order settlements are never payable by hand.
      const expenses=await db.from("finance_entries").select(
        "id,title,source,direction,nature,order_id,gross,net,tax,currency,occurred_on,due_on,category_id,supplier"
      ).eq("direction","expense").eq("cancelled",false)
        .in("source",["manual","recurring","purchase_payable"])
        .order("occurred_on",{ascending:false}).limit(500);
      if(expenses.error) throw new Error(expenses.error.message);
      const entryIds=(expenses.data||[]).map(e=>e.id);
      const payments=entryIds.length
        ? await db.from("finance_payments")
            .select("id,entry_id,account_id,amount,direction,paid_on,method,source")
            .in("entry_id",entryIds).limit(5000)
        : {data:[],error:null};
      if(payments.error) throw new Error(payments.error.message);
      const paidByEntry=new Map<string,number>();
      const paymentsByEntry=new Map<string,typeof payments.data>();
      for(const p of payments.data||[]){
        if(!p.entry_id||p.direction!=="out")continue;
        const id=String(p.entry_id);
        paidByEntry.set(id,(paidByEntry.get(id)||0)+Number(p.amount||0));
        paymentsByEntry.set(id,[...(paymentsByEntry.get(id)||[]),p]);
      }
      const purchaseOrderIds=(expenses.data||[])
        .filter(e=>e.source==="purchase_payable" && e.order_id)
        .map(e=>String(e.order_id));
      const purchased=await financeOrderItems(db,purchaseOrderIds);
      const costSnapshots=purchaseOrderIds.length
        ? await db.from("finance_item_snapshots")
            .select("item_id,unit_cost,quantity,returned_quantity")
            .in("order_id",purchaseOrderIds).limit(2500)
        : {data:[],error:null};
      if(costSnapshots.error)throw new Error(costSnapshots.error.message);
      const itemCosts=new Map<string,{unit_cost:number;total_cost:number}>();
      for(const snapshot of costSnapshots.data||[]){
        if(!snapshot.item_id||snapshot.unit_cost==null)continue;
        const unit=Number(snapshot.unit_cost||0);
        itemCosts.set(String(snapshot.item_id),{
          unit_cost:unit,
          total_cost:Math.round(unit*Math.max(0,
            Number(snapshot.quantity||0)-Number(snapshot.returned_quantity||0))*100)/100
        });
      }
      const missingOrders=await db.from("finance_entries")
        .select("order_id").eq("source","order").eq("cancelled",false)
        .not("order_id","is",null).order("occurred_on",{ascending:false}).limit(250);
      const missing: string[]=[];
      if(!missingOrders.error) {
        const orderIds=[...new Set((missingOrders.data||[]).map(e=>String(e.order_id)))];
        if(orderIds.length){
          const snapshots=await db.from("finance_item_snapshots")
            .select("order_id,unit_cost").in("order_id",orderIds).limit(2000);
          if(!snapshots.error){
            const byOrder=new Map<string,{found:number;missing:number}>();
            for(const item of snapshots.data||[]){
              const id=String(item.order_id);
              const cur=byOrder.get(id)||{found:0,missing:0};
              cur.found++;if(item.unit_cost==null)cur.missing++;
              byOrder.set(id,cur);
            }
            for(const orderId of orderIds){
              const state=byOrder.get(orderId);
              if(!state?.found||state.missing)missing.push(orderId);
            }
          }
        }
      }
      return financeJson({ok:true,rows:(expenses.data||[]).map(e=>{
        const paid=paidByEntry.get(e.id)||0;
        const total=Number(e.gross||0),remaining=Math.max(0,total-paid);
        return {...e,paid,remaining,
          status:remaining<=0?"paid":paid>0?"partial":"unpaid",
          payments:paymentsByEntry.get(e.id)||[],
          order_items:e.order_id?(purchased.get(String(e.order_id))||[]).map(item=>({
            ...item,
            unit_cost:itemCosts.get(item.id)?.unit_cost??null,
            purchase_total:itemCosts.get(item.id)?.total_cost??null,
          })):[]
        };
      }),missing_cost_order_ids:missing});
    }
    if (route === "bank") {
      const { data, error } = await db
        .from("finance_bank_rows")
        .select("*")
        .order("occurred_on", { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      const payments = await db.from("finance_payments")
        .select("id,amount,paid_on,account_id,direction")
        .order("paid_on",{ascending:false}).limit(300);
      if (payments.error) throw new Error(payments.error.message);
      return financeJson({ ok: true, rows: data, payments: payments.data || [] });
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
    if (route === "usd-rate") {
      const { latestUsdTry } = await import("@/lib/finance/usdRate");
      const quote = await latestUsdTry(db);
      return financeJson({ ok: true, ...quote });
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
      const gramRate=await db.from("finance_purchase_gram_rates")
        .select("usd_per_gram,effective_at")
        .order("effective_at",{ascending:false}).limit(1).maybeSingle();
      if(gramRate.error) throw new Error(gramRate.error.message);
      return financeJson({ ok: true, costs: data, unitCost,
        gramRateUsd: gramRate.data?.usd_per_gram ?? null,
      });
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
  let permission = ["bank_import", "bank_match"].includes(action)
    ? "settings"
    : financeActionPermission[action];
  if (action === "monthly_expense") permission = "expense_create";
  if (action === "payable_payment") permission = "pay";
  if (action === "payable_payment_update") permission = "pay";
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
    if (action === "payable_payment_update") {
      if (!uuid(String(data.payment_id||"")) || !uuid(String(data.account_id||"")))
        return financeJson({ok:false,error:"Ödeme veya hesap geçersiz."},400);
      const amount=financeAmount(data.amount);
      return financeJson({ok:true,result:await financeRpc(auth.supabase,
        "finance_update_expense_payment",{
          p_payment:data.payment_id,p_account:data.account_id,p_amount:amount,
          p_paid_on:data.paid_on,p_actor:auth.user.id
        })});
    }
    if (action === "payable_payment") {
      if (!uuid(String(data.entry_id||"")) || !uuid(String(data.account_id||"")))
        return financeJson({ok:false,error:"Gider veya ödeme hesabı geçersiz."},400);
      const amount=financeAmount(data.amount);
      if (!(Number(amount) > 0))
        return financeJson({ok:false,error:"Ödeme tutarını gir."},400);
      return financeJson({ok:true,result:await financeRpc(auth.supabase,
        "finance_pay_expense",{
          p_entry:data.entry_id,p_account:data.account_id,p_amount:amount,
          p_paid_on:data.paid_on,p_key:typeof data.key === "string" && data.key.length >= 8 ? data.key : randomUUID(),p_actor:auth.user.id,
        })});
    }
    if (action === "cost") {
      return financeJson({ok:true,result:await financeRpc(auth.supabase,
        "finance_save_purchase_cost",{p_data:data,p_actor:auth.user.id})});
    }
    // Snapshot the provider's quoted rate when recording a USD/EUR expense.
    // The business's base book stays in original currency, while summary
    // conversions use this stored quote instead of fluctuating with time.
    const isForeignExpense = (action === "entry" || action === "monthly_expense") &&
      data.direction === "expense" && ["USD","EUR"].includes(String(data.currency));
    const fxQuote = isForeignExpense ? await getExpenseFxRates() : null;
    const stampForeignExpense = async (result: Record<string, unknown>) => {
      if (!fxQuote) return;
      const id = String(result.id || "");
      if (!uuid(id)) throw new Error("Giderin kur bilgisi kaydedilemedi: gider kimliği eksik.");
      const currency = String(data.currency) as "USD" | "EUR";
      const stored = result.metadata &&
        typeof result.metadata === "object" && !Array.isArray(result.metadata)
        ? result.metadata as Record<string,unknown> : {};
      const metadata = { ...stored,
        fx_to_try: fxQuote.rates[currency],
        fx_published_on: fxQuote.publishedOn,
        fx_source: fxQuote.source,
        fx_checked_at: fxQuote.checkedAt,
      };
      const saved = await auth.supabase.from("finance_entries")
        .update({metadata}).eq("id",id).select("id").single();
      if (saved.error) throw new Error("Gider kaydedildi ancak TL kuru kaydı başarısız: " + saved.error.message);
    };
    if (action === "monthly_expense") {
      if (data.direction !== "expense")
        return financeJson({ ok:false,error:"Aylık otomasyon yalnız giderler içindir." },400);
      const saved = await financeRpc(auth.supabase,"finance_save_monthly_expense",{
        p_data:data,p_actor:auth.user.id,
      }) as Record<string,unknown>;
      if (fxQuote && saved.id) await stampForeignExpense(saved);
      return financeJson({ok:true,result:saved});
    }
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
    if (action === "entry" && fxQuote) await stampForeignExpense(result as Record<string,unknown>);
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
