"use client";
import { useMemo, useState } from "react";
import { Button, Card, Notice, PageHeader, PageSection, PageShell } from "@ruth-commerce/ui";
import { command, FinanceNav, money, useFinance, type Row, type Setup } from "./shared";

type PurchaseItem = { id:string; product_name:string; variant_name?:string|null; quantity:number; image_url?:string|null };
type Payable = Row & {
  id:string; title:string; source:string; nature:string; currency:string;
  order_id?:string|null; gross:number|string; paid:number; remaining:number;
  occurred_on:string; due_on?:string|null; status:"paid"|"partial"|"unpaid";
  order_items?:PurchaseItem[];
  payments?:Array<{id:string;amount:number;paid_on:string;account_id:string;source:string}>;
};
type Payload = { rows:Payable[];missing_cost_order_ids?:string[] };

function localDate(){
  return new Intl.DateTimeFormat("en-CA",{
    timeZone:"Europe/Istanbul",year:"numeric",month:"2-digit",day:"2-digit"
  }).format(new Date());
}
function trDate(s:string|null|undefined){
  if(!s)return "Tarih belirtilmedi";
  const date=new Date(s+"T12:00:00Z");
  return Number.isNaN(date.getTime()) ? s
    : new Intl.DateTimeFormat("tr-TR",{timeZone:"UTC",day:"2-digit",month:"long",year:"numeric"}).format(date);
}
function purchaseLabel(row:Payable){
  return row.source==="purchase_payable"?"Sipariş ürün alış bedeli":
    row.source==="recurring"?"Tekrarlayan gider":"Gider";
}

export function FinancePayables(){
  const payables=useFinance<Payload>("/api/finance/payables");
  const setup=useFinance<Setup>("/api/finance/setup");
  const [filter,setFilter]=useState("unpaid");
  const [expanded,setExpanded]=useState<string|null>(null);
  const [amounts,setAmounts]=useState<Record<string,string>>({});
  const [accounts,setAccounts]=useState<Record<string,string>>({});
  const [dates,setDates]=useState<Record<string,string>>({});
  const [working,setWorking]=useState<string|null>(null);
  const [editingPayment,setEditingPayment]=useState<string|null>(null);
  const [correction,setCorrection]=useState("");
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");

  const all=payables.data?.rows||[];
  const dueCount=all.filter(x=>Number(x.remaining)>0).length;
  const rows=useMemo(()=>all.filter(x=>filter==="all" ||
    (filter==="paid"?x.remaining<=0:
      filter==="products"?x.source==="purchase_payable"&&x.remaining>0:
      filter==="recurring"?x.source==="recurring"&&x.remaining>0:
      x.remaining>0)),[all,filter]);
  const save=async(row:Payable,full=false)=>{
    if(working)return;
    const remaining=Number(row.remaining);
    const amount=full?remaining:Number((amounts[row.id]||"").replace(",","."));
    const account=accounts[row.id]||"";
    const date=dates[row.id]||localDate();
    if(!account){setError("Önce banka veya kasa hesabını seç.");return;}
    if(!Number.isFinite(amount)||amount<=0||amount>remaining){
      setError("Ödenen tutar 0'dan büyük ve kalan borçtan küçük veya eşit olmalı.");return;
    }
    setWorking(row.id);setError("");setSuccess("");
    try{
      await command("payable_payment",{
        entry_id:row.id,account_id:account,amount:Math.round(amount*100)/100,
        paid_on:date
      });
      setSuccess(full?"Gider ödendi olarak işaretlendi.":"Kısmi ödeme kaydedildi.");
      setAmounts(current=>({...current,[row.id]:""}));
      await payables.load();
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setWorking(null);}
  };
  const correct=async(row:Payable,paymentId:string)=>{
    if(working)return;
    const previous=row.payments?.find(p=>p.id===paymentId);
    const value=Number(correction.replace(",","."));
    if(!previous||!Number.isFinite(value)||value<=0||Math.round(value*100)!==value*100){
      setError("Düzeltilen ödeme pozitif ve kuruş hassasiyetinde olmalı.");return;
    }
    setWorking(row.id);setError("");setSuccess("");
    try{
      await command("payable_payment_update",{
        payment_id:paymentId,
        account_id:previous.account_id,
        amount:value,
        paid_on:previous.paid_on
      });
      setEditingPayment(null);setCorrection("");
      setSuccess("Ödeme tutarı düzeltildi.");
      await payables.load();
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setWorking(null);}
  };
  return <PageShell density="compact">
    <PageHeader eyebrow="Finans" title="Ödenecekler"
      description="Ürün alış maliyetleri, tekrarlayan giderler ve diğer borçlar. Ödemeyi sadece sen onaylarsın."
      actions={<Button variant="secondary" onClick={()=>{void payables.load();void setup.load();}}>Yenile</Button>}/>
    <FinanceNav/>
    {payables.error||setup.error?<Notice tone="danger">{payables.error||setup.error}</Notice>:null}
    {error?<Notice tone="danger">{error}</Notice>:null}
    {success?<Notice>{success}</Notice>:null}
    {(payables.data?.missing_cost_order_ids||[]).length>0?<Notice tone="warning">
      {payables.data?.missing_cost_order_ids?.length} siparişte ürün alış maliyeti eksik.
      Eksik fiyatlar girilmeden otomatik borç tutarı tahmin edilmez. Ürün düzenlemeden alış fiyatlarını kontrol et.
    </Notice>:null}
    <div className="grid grid-cols-2 gap-3">
      <Card><p className="text-xs text-muted">Ödenmesi gereken kayıt</p><strong className="text-xl">{dueCount}</strong></Card>
      <Card><p className="text-xs text-muted">Kalan borç (TRY kayıtları)</p><strong className="text-xl">
        {money(all.filter(r=>r.currency==="TRY"&&r.remaining>0).reduce((sum,r)=>sum+Number(r.remaining),0))}
      </strong></Card>
    </div>
    <PageSection title="Gider ve alış bedeli ödemeleri" description="Kısmi tutar ekle, geçmiş ödemeleri gör veya kalan tamamını ödendi olarak işaretle.">
      <div className="flex flex-wrap gap-2 pb-3">
        {([["unpaid","Ödenmemiş"],["products","Ürün alışları"],["recurring","Tekrarlayan"],["paid","Ödendi"],["all","Tümü"]] as const).map(([key,title])=>
          <Button key={key} variant={filter===key?"primary":"secondary"} onClick={()=>setFilter(key)}>{title}</Button>
        )}
      </div>
      {payables.loading&&!payables.data?<p className="text-sm text-muted">Ödeme kayıtları yükleniyor…</p>:null}
      {!payables.loading&&!rows.length?<p className="text-sm text-muted">Bu filtrede kayıt bulunmuyor.</p>:null}
      <div className="space-y-3">
        {rows.map(row=>{
          const remaining=Number(row.remaining),paid=Number(row.paid);
          const due=row.due_on||row.occurred_on;
          const isLate=remaining>0&&due<localDate();
          const isOpen=expanded===row.id;
          const options=(setup.data?.accounts||[]).filter(a=>a.currency===row.currency&&["bank","cash"].includes(a.kind));
          const currentAccount=accounts[row.id]||options[0]?.id||"";
          const showInput=remaining>0;
          return <Card key={row.id}>
            <button type="button" className="w-full text-left" onClick={()=>{
              setExpanded(isOpen?null:row.id);
              if(!accounts[row.id]&&options.length)setAccounts(x=>({...x,[row.id]:options[0].id}));
            }}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-muted">{purchaseLabel(row)} · {trDate(due)}</p>
                  <strong className="text-base">{row.title}</strong>
                  {row.order_id?<p className="text-xs text-muted">Sipariş kaydı · ürün alış maliyeti</p>:null}
                </div>
                <span className={remaining<=0?"font-semibold text-green-600":
                    "rounded-md bg-red-50 px-2 py-1 text-xs font-bold text-red-700"}>
                  {remaining<=0?"Ödendi":isLate?"Gecikti · Ödenmemiş":
                    paid>0?"Kısmi ödendi":"Ödenmemiş"}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div>Toplam<strong className="mt-1 block text-sm">{money(row.gross,row.currency)}</strong></div>
                <div>Ödenen<strong className="mt-1 block text-sm">{money(paid,row.currency)}</strong></div>
                <div>Kalan<strong className="mt-1 block text-sm">{money(remaining,row.currency)}</strong></div>
              </div>
              <p className="mt-2 text-xs underline">{isOpen?"Ayrıntıları kapat":"Ödemeyi düzenle / ayrıntıları aç"}</p>
            </button>
            {isOpen?<div className="mt-4 space-y-4 border-t border-border-subtle pt-4">
              {row.order_items?.length? <div className="space-y-2">
                <strong className="text-sm">Siparişteki ürünler</strong>
                {row.order_items.map(item=><div className="flex items-center gap-3" key={item.id}>
                  {item.image_url?<img src={item.image_url} alt={item.product_name}
                    className="h-12 w-10 rounded object-cover"/>:null}
                  <span className="text-sm">{item.product_name}{item.variant_name?" · "+item.variant_name:""} ×{item.quantity}</span>
                </div>)}
                {row.order_id?<a href={`/orders/${row.order_id}`} className="text-sm underline">Sipariş detayını aç</a>:null}
              </div>:null}
              {row.payments?.length?<div className="space-y-1">
                <strong className="text-sm">Yapılan ödemeler</strong>
                {row.payments.map(p=><div className="flex flex-wrap items-center gap-2 text-xs" key={p.id}>
                  <span>{trDate(p.paid_on)} · {money(p.amount,row.currency)}</span>
                  {p.source==="expense_payment"?<button type="button" className="underline"
                    onClick={()=>{setEditingPayment(editingPayment===p.id?null:p.id);
                      setCorrection(String(p.amount));}}>Tutarı düzelt</button>:null}
                  {editingPayment===p.id?<div className="flex w-full items-center gap-2">
                    <input type="number" min="0.01" step="0.01"
                      className="form-input w-32" value={correction}
                      onChange={e=>setCorrection(e.target.value)}/>
                    <Button disabled={working!==null}
                      onClick={()=>void correct(row,p.id)}>Güncelle</Button>
                  </div>:null}
                </div>)}
              </div>:null}
              {showInput?<div className="grid gap-3 sm:grid-cols-3">
                <label className="text-sm">Ödenen tutar
                  <input className="form-input mt-1 w-full" type="number" min="0.01"
                    max={remaining} step="0.01" placeholder="Örn. 2000"
                    value={amounts[row.id]||""}
                    onChange={e=>setAmounts(x=>({...x,[row.id]:e.target.value}))}/>
                </label>
                <label className="text-sm">Ödeme hesabı
                  <select className="form-input mt-1 w-full" value={currentAccount}
                    onChange={e=>setAccounts(x=>({...x,[row.id]:e.target.value}))}>
                    {!options.length?<option value="">Hesap yok</option>:null}
                    {options.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </label>
                <label className="text-sm">Ödeme tarihi
                  <input className="form-input mt-1 w-full" type="date"
                    value={dates[row.id]||localDate()}
                    onChange={e=>setDates(x=>({...x,[row.id]:e.target.value}))}/>
                </label>
                <div className="flex flex-wrap gap-2 sm:col-span-3">
                  <Button disabled={working!==null||!currentAccount}
                    onClick={()=>void save({...row},false)}>
                    {working===row.id?"Kaydediliyor…":"Bu tutarı ödedim"}
                  </Button>
                  <Button variant="secondary" disabled={working!==null||!currentAccount}
                    onClick={()=>void save({...row},true)}>Kalanın tamamını ödedim</Button>
                </div>
                <p className="text-xs text-muted sm:col-span-3">
                  Kayıt yalnızca sen onaylayınca ödenmiş sayılır. Aynı gider ikinci kez kârdan düşülmez.
                </p>
              </div>:<p className="text-sm font-medium text-green-600">Ödeme tamamlandı.</p>}
            </div>:null}
          </Card>;
        })}
      </div>
    </PageSection>
  </PageShell>;
}
