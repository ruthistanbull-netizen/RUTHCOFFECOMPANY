"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Save, X } from "lucide-react";
import { adminRequest } from "@/lib/adminApi";

type Product = {
  id?: string; name:string; slug:string; status:string; price:number|string; compare_at_price?:number|string|null;
  currency?:string; stock_status:string; main_image_url?:string|null; is_featured?:boolean; is_new?:boolean; sort_order?:number;
};

const emptyProduct: Product = { name:"", slug:"", status:"draft", price:"", compare_at_price:null, currency:"TRY", stock_status:"in_stock", main_image_url:"", is_featured:false, is_new:false, sort_order:0 };

export function ProductManager(){
  const [rows,setRows]=useState<Product[]|null>(null);
  const [draft,setDraft]=useState<Product|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");

  const load=useCallback(()=>adminRequest<any>("/api/products").then(v=>setRows(v.products||[])).catch(e=>setMessage(e.message||"Ürünler alınamadı.")),[]);
  useEffect(()=>{load();},[load]);

  async function save(){
    if(!draft) return;
    setBusy(true);setMessage("");
    try{
      await adminRequest("/api/products",{method:draft.id?"PATCH":"POST",body:JSON.stringify(draft)});
      setDraft(null);setMessage("Ürün kaydedildi, storefront yenilemesi tetiklendi.");await load();
    }catch(e){setMessage(e instanceof Error?e.message:"Ürün kaydedilemedi.");}finally{setBusy(false);}
  }
  async function archive(id:string){
    if(!confirm("Ürünü arşivlemek istiyor musun?")) return;
    await adminRequest("/api/products",{method:"DELETE",body:JSON.stringify({id})}); await load();
  }

  if(!rows) return <div className="admin-loading">Ürünler yükleniyor…</div>;

  return <>
    <div className="admin-toolbar"><div><strong>{rows.length} ürün</strong><span>Canlı Supabase kataloğu</span></div><button className="admin-primary-button" onClick={()=>setDraft({...emptyProduct})}><Plus size={15}/>Yeni Ürün</button></div>
    {message?<div className="admin-inline-message">{message}</div>:null}
    <div className="admin-card admin-table-wrap">
      <table className="admin-table">
        <thead><tr><th>Ürün</th><th>Durum</th><th>Fiyat</th><th>Stok</th><th>Sıra</th><th></th></tr></thead>
        <tbody>{rows.map(row=><tr key={row.id}>
          <td><div className="admin-resource-name">{row.main_image_url?<img src={row.main_image_url} alt=""/>:<span/>}<div><strong>{row.name}</strong><small>/{row.slug}</small></div></div></td>
          <td><span className="admin-pill">{row.status}</span></td>
          <td>{new Intl.NumberFormat("tr-TR",{style:"currency",currency:row.currency||"TRY"}).format(Number(row.price||0))}</td>
          <td>{row.stock_status}</td><td>{row.sort_order??0}</td>
          <td><div className="admin-row-actions"><button onClick={()=>setDraft({...row})}>Düzenle</button><button onClick={()=>archive(String(row.id))}>Arşivle</button></div></td>
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
        <label className="admin-field admin-field-wide"><span>Ana görsel URL</span><input value={draft.main_image_url||""} onChange={e=>setDraft({...draft,main_image_url:e.target.value})}/></label>
        <label className="admin-field"><span>Sıralama</span><input type="number" value={draft.sort_order??0} onChange={e=>setDraft({...draft,sort_order:Number(e.target.value)})}/></label>
        <label className="admin-check"><input type="checkbox" checked={Boolean(draft.is_featured)} onChange={e=>setDraft({...draft,is_featured:e.target.checked})}/><span>Öne çıkan ürün</span></label>
        <label className="admin-check"><input type="checkbox" checked={Boolean(draft.is_new)} onChange={e=>setDraft({...draft,is_new:e.target.checked})}/><span>Yeni ürün</span></label>
      </div>
      <footer><button className="admin-secondary-button" onClick={()=>setDraft(null)}>Vazgeç</button><button className="admin-primary-button" disabled={busy||!draft.name.trim()} onClick={save}><Save size={15}/>{busy?"Kaydediliyor…":"Kaydet"}</button></footer>
    </section></div>:null}
  </>;
}
