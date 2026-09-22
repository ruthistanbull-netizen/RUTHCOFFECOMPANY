import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function number(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pricingOf(order: any) {
  const currency = String(order.currency || "TRY");
  const minor = (value: unknown) => Math.round(number(value) * 100);
  return {
    subtotal: { amountMinor: minor(order.subtotal), currency },
    discount: { amountMinor: minor(order.discount_total), currency },
    pointsDiscount: { amountMinor: minor(order.reward_discount_total), currency },
    shipping: { amountMinor: minor(order.shipping_fee), currency },
    tax: { amountMinor: minor(order.tax_total), currency },
    total: { amountMinor: minor(order.total_amount), currency },
  };
}

function paymentSummaryOf(order: any) {
  return {
    source: "rosta",
    provider: String(order.payment_provider || "paytr"),
    method: String(order.payment_method || "card"),
    status: String(order.payment_status || "pending"),
    orderAmountMinor: Math.round(number(order.total_amount) * 100),
    chargedAmountMinor: ["paid","succeeded","success"].includes(String(order.payment_status || "").toLowerCase())
      ? Math.round(number(order.total_amount) * 100)
      : 0,
    installmentFeeMinor: 0,
    installmentCount: 1,
    paidAt: null,
    fallbackReason: null,
  };
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const q = String(url.searchParams.get("q") || "").trim();
  const payment = String(url.searchParams.get("payment") || "all").trim();

  let query = auth.supabase.from("orders").select("*").order("created_at",{ascending:false}).limit(1000);
  if (q) {
    query = query.or(`order_no.ilike.%${q}%,customer_name.ilike.%${q}%,customer_email.ilike.%${q}%,customer_phone.ilike.%${q}%,cargo_tracking_no.ilike.%${q}%`);
  }
  if (payment !== "all") query = query.eq("payment_status", payment);

  const orderResult = await query;
  if (orderResult.error) return NextResponse.json({ok:false,error:orderResult.error.message},{status:500});

  const orders = orderResult.data || [];
  const ids = orders.map((order:any)=>order.id);
  const itemsResult = ids.length
    ? await auth.supabase.from("order_items").select("*").in("order_id",ids).order("created_at",{ascending:true})
    : { data: [], error: null as any };
  if (itemsResult.error) return NextResponse.json({ok:false,error:itemsResult.error.message},{status:500});

  const byOrder = new Map<string,any[]>();
  for(const item of itemsResult.data || []){
    const key=String((item as any).order_id);
    byOrder.set(key,[...(byOrder.get(key)||[]),item]);
  }

  const hydrated=orders.map((order:any)=>({
    ...order,
    order_items:byOrder.get(String(order.id))||[],
    pricing:pricingOf(order),
    paymentSummary:paymentSummaryOf(order),
    fulfillment_status:order.shipping_status || null,
    state_version:null,
    cancelled_at:["cancelled","canceled"].includes(String(order.status||"").toLowerCase()) ? order.updated_at : null,
    delivered_at:["delivered","completed","fulfilled"].includes(String(order.status||"").toLowerCase()) ? order.updated_at : null,
    review_email_status:null,
    review_email_sent_at:null,
    review_email_error_message:null,
  }));

  if(ids.length){
    const review=await auth.supabase.from("review_request_emails").select("order_id,status,sent_at,error_message").in("order_id",ids);
    if(!review.error){
      const byId=new Map((review.data||[]).map((row:any)=>[String(row.order_id),row]));
      for(const order of hydrated){
        const row=byId.get(String(order.id));
        if(row){
          order.review_email_status=row.status;
          order.review_email_sent_at=row.sent_at;
          order.review_email_error_message=row.error_message;
        }
      }
    }
  }

  return NextResponse.json({ok:true,orders:hydrated},{headers:{"Cache-Control":"private, no-store"}});
}

export async function PATCH(request: Request) {
  const auth=await requireAdmin(request); if("error" in auth) return auth.error;
  const body=await request.json().catch(()=>({})); const id=String(body.id||"").trim();
  if(!id) return NextResponse.json({ok:false,error:"Sipariş id eksik."},{status:400});
  const allowed=["status","payment_status","shipping_status","shipping_provider","cargo_company","cargo_tracking_no","cargo_tracking_url","admin_note","reminder_note","reminder_at","shipping_price","shipping_error"];
  const update:Record<string,unknown>={updated_at:new Date().toISOString()};
  for(const key of allowed) if(key in body) update[key]=body[key] === "" ? null : body[key];
  const {data,error}=await auth.supabase.from("orders").update(update).eq("id",id).select("*").single();
  if(error) return NextResponse.json({ok:false,error:error.message},{status:400});
  return NextResponse.json({ok:true,order:data});
}
