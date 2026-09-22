"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Save, X } from "lucide-react";
import { adminRequest } from "@/lib/adminApi";

type Product = {
  id?: string; name:string; slug:string; status:string; price:number|string; compare_at_price?:number|string|null;
  currency?:string; stock_status:string; main_image_url?:string|null; is_featured?:boolean; is_new?:boolean; sort_order?:number;
};

type Detail = {
  images:any[];
  categoryIds:string[];
  collectionIds:string[];
  categories:any[];
  collections:any[];
};

const emptyProduct: Product = { name:"", slug:"", status:"draft", price:"", compare_at_price:null, currency:"TRY", stock_status:"in_stock", main_image_url:"", is_featured:false, is_new:false, sort_order:0 };

export function ProductManager(){
  const [rows,setRows]=useState<Product[]|null>(null);
  const [draft,setDraft]=useState<Product|null>(null);
  const [detail,setDetail]=useState<Detail|null>(null);
  const [imageLines,setImageLines]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");

  const load=useCallback(()=>adminRequest<any>("/api/products").then(v=>setRows(v.products||[])).catch(e=>setMessage(e.message||"Ürünler alınamadı.")),[]);
  useEffect(()=>{load();},[load]);

  async function openEdit(row:Product){
    setDraft({...row});
    setDetail(null);
    setImageLines("");
    if(!row.id)return;
    try{
      const value=await adminRequest<Detail & {ok:boolean}>(`/api/products/detail?id=${encodeURIComponent(row.id)}`);
      setDetail(value);
      const urls=(value.images||[]).map((x:any)=>String(x.image_url||"").trim()).filter(Boolean);
      if(!urls.length && row.main_image_url) urls.push(row.main_image_url);
      setImageLines(urls.join("\n"));
    }catch(error){
      setMessage(error instanceof Error?error.message:"Ürün detayları alınamadı.");
    }
  }

  async function save(){
    if(!draft) return;
    setBusy(true);setMessage("");
    try{
      const result=await adminRequest<any>("/api/products",{method:draft.id?"PATCH":"POST",body:JSON.stringify(draft)});
      if(draft.id && detail){
        const image_urls=imageLines.split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
        await adminRequest("/api/products/detail",{method:"PUT",body:JSON.stringify({
          product_id:draft.id,
          image_urls,
          category_ids:detail.categoryIds,
          collection_ids:detail.collectionIds,
        })});
      }
      setDraft(null);setDetail(null);setMessage("Ürün kaydedildi, storefront yenilemesi tetiklendi.");await load();
      if(!draft.id && result?.product?.id)setMessage("Ürün oluşturuldu. Görselleri, kategorileri ve varyantları düzenlemek için ürünü tekrar açabilirsin.");
    }catch(e){setMessage(e instanceof Error?e.message:"Ürün kaydedilemedi.");}finally{setBusy(false);}
  }

  async function archive(id:string){
    if(!confirm("Ürünü arşivlemek istiyor musun?")) return;
    await adminRequest("/api/products",{method:"DELETE",body:JSON.stringify({id})}); await load();
  }

  function toggleId(key:"categoryIds"|"collectionIds",id:string){
    if(!detail)return;
    const current=detail[key];
    setDetail({...detail,[key]:current.includes(id)?current.filter(x=>x!==id):[...current,id]});
  }

  if(!rows) return <div className="admin-loading">Ürünler yükleniyor…</div>;

  return <>
    <div className="admin-toolbar"><div><strong>{rows.length} ürün</strong><span>Canlı Supabase kataloğu</span></div><button className="admin-primary-button" onClick={()=>{setDraft({...emptyProduct});setDetail(null);setImageLines("");}}><Plus size={15}/>Yeni Ürün</button></div>
    {message?<div className="admin-inline-message">{message}</div>:null}
    <div className="admin-card admin-table-wrap">
      <table className="admin-table">
        <thead><tr><th>Ürün</th><th>Durum</th><th>Fiyat</th><th>Stok</th><th>Sıra</th><th></th></tr></thead>
        <tbody>{rows.map(row=><tr key={row.id}>
          <td><div className="admin-resource-name">{row.main_image_url?<img src={row.main_image_url} alt=""/>:<span/>}<div><strong>{row.name}</strong><small>/{row.slug}</small></div></div></td>
          <td><span className="admin-pill">{row.status}</span></td>
          <td>{new Intl.NumberFormat("tr-TR",{style:"currency",currency:row.currency||"TRY"}).format(Number(row.price||0))}</td>
          <td>{row.stock_status}</td><td>{row.sort_order??0}</td>
          <td><div className="admin-row-actions"><button onClick={()=>openEdit(row)}>Düzenle</button><button onClick={()=>archive(String(row.id))}>Arşivle</button></div></td>
        </tr>)}</tbody>
      </table>
    </div>

    {draft?<div className="admin-editor-backdrop" onMouseDown={()=>setDraft(null)}><section className="admin-editor-panel" onMouseDown={e=>e.stopPropagation()}>
      <header><div><p className="admin-kicker">{draft.id?"ÜRÜN DÜZENLE":"YENİ ÜRÜN"}</p><h2>{draft.id?draft.name:"Yeni ürün"}</h2></div><button className="admin-icon-button" onClick={()=>setDraft(null)}><X size={18}/></button></header>
      <div className="admin-form-grid">
        <label className="admin-field admin-field-wide"><span>Ürün adı</span><input value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
        <label className="admin-field admin-field-wide"><span>Slug</span><input value={draft.slug||""} onChange={e=>setDraft({...draft,slug:e.target.value})} placeholder="otomatik oluşturulabilir"/></label>
        <label className="admin-field"><span>Fiyat</span><input type="number" step="0.01" value={draft.price} onChange={e=>setDraft({...draft,price:e.target.value})}/></label>
        <label className="admin-field"><span>Karşılaştırma fiyatı</span><input type="number" step="0.01" value={draft.compare_at_price??""} onChange={e=>setDraft({...draft,compare_at_price:e.target.value})}/></label>
        <label className="admin-field"><span>Durum</span><select value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value})}><option value="draft">Taslak</option><option value="active">Aktif</option><option value="archived">Arşiv</option></select></label>
        <label className="admin-field"><span>Stok durumu</span><select value={draft.stock_status} onChange={e=>setDraft({...draft,stock_status:e.target.value})}><option value="in_stock">Stokta</option><option value="out_of_stock">Tükendi</option><option value="preorder">Ön sipariş</option></select></label>
        <label className="admin-field"><span>Sıralama</span><input type="number" value={draft.sort_order??0} onChange={e=>setDraft({...draft,sort_order:Number(e.target.value)})}/></label>
        <label className="admin-check"><input type="checkbox" checked={Boolean(draft.is_featured)} onChange={e=>setDraft({...draft,is_featured:e.target.checked})}/><span>Öne çıkan ürün</span></label>
        <label className="admin-check"><input type="checkbox" checked={Boolean(draft.is_new)} onChange={e=>setDraft({...draft,is_new:e.target.checked})}/><span>Yeni ürün</span></label>

        {draft.id?<label className="admin-field admin-field-wide"><span>Ürün görselleri · her satıra bir URL</span><textarea rows={7} value={imageLines} onChange={e=>setImageLines(e.target.value)} placeholder="https://.../image-1.webp\nhttps://.../image-2.webp"/></label>:null}

        {draft.id && !detail?<div className="admin-detail-loading">Katalog ilişkileri yükleniyor…</div>:null}
        {draft.id && detail?<div className="admin-field admin-field-wide"><span>Kategoriler</span><div className="admin-chip-grid">{detail.categories.map(item=><button type="button" key={item.id} className={detail.categoryIds.includes(String(item.id))?"admin-chip is-active":"admin-chip"} onClick={()=>toggleId("categoryIds",String(item.id))}>{item.name}</button>)}</div></div>:null}
        {draft.id && detail?<div className="admin-field admin-field-wide"><span>Koleksiyonlar</span><div className="admin-chip-grid">{detail.collections.map(item=><button type="button" key={item.id} className={detail.collectionIds.includes(String(item.id))?"admin-chip is-active":"admin-chip"} onClick={()=>toggleId("collectionIds",String(item.id))}>{item.name}</button>)}</div></div>:null}
      </div>
      <footer><button className="admin-secondary-button" onClick={()=>setDraft(null)}>Vazgeç</button><button className="admin-primary-button" disabled={busy||!draft.name.trim()} onClick={save}><Save size={15}/>{busy?"Kaydediliyor…":"Kaydet"}</button></footer>
    </section></div>:null}
  </>;
}
