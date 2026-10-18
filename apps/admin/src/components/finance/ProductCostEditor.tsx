"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Button, InputControl as Input, Notice, PageSection, ConfirmDialog,
} from "@ruth-commerce/ui";
import { Field, Pick, command, money, useFinance, type Row, type Setup } from "./shared";

type CostResult = {costs:Row[];unitCost:string|null;gramRateUsd:string|null};
type FxResult = {
  usdTry:number|null;
  publishedOn:string|null;
  checkedAt:string|null;
  source:string;
  fallback:boolean;
  message?:string;
};
type CostMethod = "manual"|"weight_usd"|"coffee_kg";
const number = (value:unknown) => Number(String(value ?? "").replace(",","."));
const validAmount = (value:unknown) => {
  const v=number(value);
  return Number.isFinite(v) && v>=0;
};
const formattedDate = (value:string|null) => {
  if(!value)return "Tarih bilinmiyor";
  const date=new Date(value+"T12:00:00Z");
  return new Intl.DateTimeFormat("tr-TR",{
    dateStyle:"long",timeZone:"UTC",
  }).format(date);
};

export function ProductCostEditor({
  productId, variants = [],
}:{
  productId:string;
  variants:Array<{id?:string;option_summary?:string}>;
}) {
  const [variant,setVariant]=useState("");
  const [values,setValues]=useState<Row>({});
  const [original,setOriginal]=useState<Row>({});
  const [usdPerGram,setUsdPerGram]=useState("");
  const [originalUsdPerGram,setOriginalUsdPerGram]=useState("");
  const [discard,setDiscard]=useState(false);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [saved,setSaved]=useState(false);
  const setup=useFinance<Setup>("/api/finance/setup");
  const costs=useFinance<CostResult>(
    "/api/finance/costs?product_id="+encodeURIComponent(productId)+
    "&variant_id="+encodeURIComponent(variant),
  );
  const fx=useFinance<FxResult>("/api/finance/usd-rate");
  const rosta=setup.data?.settings.brand==="rosta";
  const method:CostMethod = values.cost_method==="weight_usd"?"weight_usd":
    values.cost_method==="coffee_kg"?"coffee_kg":
    // Historic ROSTA coffee rows have no cost_method.
    rosta && values.purchase==null && values.coffee_per_kg!=null ? "coffee_kg":"manual";
  const dirty=JSON.stringify(values)!==JSON.stringify(original) ||
    (method==="weight_usd" && usdPerGram!==originalUsdPerGram);
  useEffect(()=>{
    const row=costs.data?.costs.find(r=>(r.variant_id||"")===variant)||{};
    setValues(row);
    setOriginal(row);
    const shared=costs.data?.gramRateUsd==null?"":String(costs.data.gramRateUsd);
    setUsdPerGram(shared);
    setOriginalUsdPerGram(shared);
    setSaved(false);
  },[costs.data,variant]);
  useEffect(()=>{
    const timer=setInterval(()=>void fx.load(),15*60*1000);
    return ()=>clearInterval(timer);
  },[fx.load]);
  const preview=useMemo(()=>{
    if(method==="manual"){
      return validAmount(values.purchase)?number(values.purchase):null;
    }
    const grams=number(values.grams);
    if(!Number.isFinite(grams)||grams<=0)return null;
    if(method==="coffee_kg"){
      return validAmount(values.coffee_per_kg)
        ? Math.round(grams*number(values.coffee_per_kg)/1000*10000)/10000:null;
    }
    if(!Number.isFinite(number(usdPerGram)) || number(usdPerGram)<=0 ||
      !fx.data?.usdTry) return null;
    return Math.round(grams*number(usdPerGram)*fx.data.usdTry*10000)/10000;
  },[values,method,usdPerGram,fx.data?.usdTry]);
  const usdTotal=method==="weight_usd"&&number(values.grams)>0&&number(usdPerGram)>0
    ? number(values.grams)*number(usdPerGram):null;

  const save=async()=>{
    if(busy||!setup.data||!productId)return;
    setBusy(true);setError("");setSaved(false);
    try {
      const data:Row={
        product_id:productId,variant_id:variant,currency:"TRY",
        cost_method:method,
      };
      if(method==="manual"){
        if(!validAmount(values.purchase)||String(values.purchase??"").trim()==="")
          throw new Error("Ürünün TL alış fiyatını gir.");
        data.purchase=String(values.purchase).replace(",",".");
        // Grams may be retained even in fixed-price mode for product records.
        if(number(values.grams)>0)data.grams=String(values.grams).replace(",",".");
      } else if(method==="coffee_kg"){
        if(!number(values.grams)||number(values.grams)<=0||
          !validAmount(values.coffee_per_kg)||values.coffee_per_kg==null)
          throw new Error("Kahve gramajını ve TL/kg alış fiyatını gir.");
        data.grams=String(values.grams).replace(",",".");
        data.coffee_per_kg=String(values.coffee_per_kg).replace(",",".");
      } else {
        if(!(number(values.grams)>0) || !(number(usdPerGram)>0))
          throw new Error("Ürün gramajını ve gram başı dolar fiyatını gir.");
        if(!fx.data?.usdTry)throw new Error("USD/TRY kuru alınamadı. Kuru yenileyip tekrar dene.");
        data.grams=String(values.grams).replace(",",".");
        data.usd_per_gram=usdPerGram.replace(",",".");
      }
      await command("cost",data);
      setSaved(true);
      await costs.load();
    }catch(e){
      setError(e instanceof Error?e.message:String(e));
    }finally{setBusy(false);}
  };
  const selectVariant=(value:string)=>{
    if(dirty){setError("Varyant değiştirmeden önce kaydet veya değişiklikleri iptal et.");return;}
    setError("");setVariant(value);
  };
  return <PageSection
    title="Ürünün alış fiyatı"
    description="Yalnız ürünün alış bedelini hesapla. Kargo, paketleme, etiket ve işçilik burada alış maliyetine eklenmez; ayrı finans giderleridir."
  >
    <div className="grid gap-4 sm:grid-cols-2">
      <Pick label="Ürün / varyant" value={variant} onChange={selectVariant}
        options={[
          ["","Ürün varsayılanı"],
          ...variants.filter(v=>v.id).map(v=>[v.id!,v.option_summary||v.id!] as [string,string]),
        ]}
      />
      <Pick label="Alış fiyatı hesaplama yöntemi" value={method}
        onChange={value=>{
          setValues(old=>({...old,cost_method:value}));
          setError("");setSaved(false);
        }}
        options={rosta
          ? [["manual","Mevcut alış fiyatım (TL)"],["coffee_kg","Kahve gramajı × TL/kg"]]
          : [["manual","Mevcut alış fiyatım (TL)"],["weight_usd","Gram × gram başı USD"]]}/>
    </div>

    {method==="manual"?
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Ürünün alış fiyatı (TL)">
          <Input type="number" inputMode="decimal" min={0} step="0.01"
            placeholder="Örn. 850" value={values.purchase??""}
            onChange={e=>{setValues(v=>({...v,purchase:e.target.value}));setSaved(false);}}/>
        </Field>
        {!rosta?<Field label="Ürün gramajı (isteğe bağlı; kayıt için)">
          <Input type="number" inputMode="decimal" min={0} step="0.001"
            placeholder="Örn. 4,25" value={values.grams??""}
            onChange={e=>{setValues(v=>({...v,grams:e.target.value}));setSaved(false);}}/>
        </Field>:null}
      </div>
    : method==="coffee_kg"?
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Kahve gramajı (g)">
          <Input type="number" min={0} step="0.001" value={values.grams??""}
            onChange={e=>setValues(v=>({...v,grams:e.target.value}))}/>
        </Field>
        <Field label="Kahvenin alış fiyatı (TL/kg)">
          <Input type="number" min={0} step="0.01" value={values.coffee_per_kg??""}
            onChange={e=>setValues(v=>({...v,coffee_per_kg:e.target.value}))}/>
        </Field>
      </div>
    : <div className="mt-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Ürünün gramajı (g)">
            <Input type="number" inputMode="decimal" min={0} step="0.001"
              placeholder="Örn. 4,25" value={values.grams??""}
              onChange={e=>{setValues(v=>({...v,grams:e.target.value}));setSaved(false);}}/>
          </Field>
          <Field label="Gram başına alış fiyatı (USD)">
            <Input type="number" inputMode="decimal" min={0} step="0.000001"
              placeholder="Örn. 12,50" value={usdPerGram}
              onChange={e=>{setUsdPerGram(e.target.value);setSaved(false);}}/>
          </Field>
        </div>
        <Notice>
          Gram başı USD fiyatı Ruth ürünleri için ortaktır. Değiştirip kaydettiğinde
          bu yöntemi kullanan ürünlerin yeni alış maliyetleri otomatik hesaplanır.
          Daha önce kaydedilmiş sipariş maliyetleri değişmez.
        </Notice>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <strong>1 USD = {fx.data?.usdTry?money(fx.data.usdTry,"TRY"):"Kur alınamadı"}</strong>
          <Button variant="secondary" onClick={()=>void fx.load()}>Kuru yenile</Button>
          <span className="text-muted">TCMB döviz satış · {formattedDate(fx.data?.publishedOn??null)}</span>
        </div>
        {fx.data?.fallback?<Notice tone="warning">
          TCMB'ye erişilemedi; son kaydedilen kur kullanılıyor.
          {fx.data.message?" "+fx.data.message:""}
        </Notice>:null}
        <p className="text-xs text-muted">
          TCMB kuru iş günlerinde yayımlanır; saniyelik canlı piyasa kuru değildir.
          Finans / Ödemeler'e USD yazılmaz, yalnız TL alış maliyeti aktarılır.
        </p>
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-border-subtle p-3">
          <div className="text-sm">Ürün alış fiyatı (USD)
            <strong className="mt-1 block text-lg">{usdTotal==null?"—":money(usdTotal,"USD")}</strong>
          </div>
          <div className="text-sm">Güncel alış fiyatı (TL)
            <strong className="mt-1 block text-lg">{preview==null?"Kur / fiyat eksik":money(preview,"TRY")}</strong>
          </div>
        </div>
      </div>}
    {method!=="weight_usd"?<p className="mt-3 text-sm">
      Hesaplanan ürün alış fiyatı: <strong>{preview==null?"Eksik":money(preview,"TRY")}</strong>
    </p>:null}
    <p className="mt-2 text-xs text-muted">
      Finans kayıtlarında bütün maliyetler TL olarak tutulur. Kargo, paketleme ve
      benzeri ödemeleri Finans bölümüne ayrı gider olarak girebilirsin.
    </p>
    {error||costs.error||setup.error?
      <Notice tone="danger">{error||costs.error||setup.error}</Notice>:null}
    {saved?<Notice>Alış fiyatı kaydedildi.</Notice>:null}
    <div className="mt-4 flex flex-wrap gap-2">
      <Button disabled={busy||!setup.data} onClick={()=>void save()}>
        {busy?"Kaydediliyor…":"Alış fiyatını kaydet"}
      </Button>
      {dirty?<Button variant="secondary" onClick={()=>setDiscard(true)}>
        Değişiklikleri iptal et
      </Button>:null}
    </div>
    <ConfirmDialog open={discard} title="Alış fiyatı değişikliklerinden vazgeçilsin mi?"
      onClose={()=>setDiscard(false)}
      onConfirm={()=>{
        setValues(original);setUsdPerGram(originalUsdPerGram);
        setDiscard(false);setError("");
      }}/>
  </PageSection>;
}
