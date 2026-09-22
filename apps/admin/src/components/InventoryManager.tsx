"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, X } from "lucide-react";
import { adminRequest } from "@/lib/adminApi";

const emptyDraft={product_id:"",name:"Standart",option_summary:"Standart",sku:"",price:"",stock:0,stock_status:"in_stock",is_active:true,image_url:"",sort_order:0};

export function InventoryManager(){
  const [rows,setRows]=useState<any[]|null>(null);
  const [products,setProducts]=useState<any[]>([]);
  const [saving,setSaving]=useState("");
  const [draft,setDraft]=useState<any|null>(null);
  const [busy,setBusy]=useState(false);
  const load=useCallback(()=>adminRequest<any>("/api/inventory").then(v=>{setRows(v.inventory||[]);setProducts(v.products||[]);}),[]);
  useEffect(()=>{load();},[load]);

  async function save(row:any){
    setSaving(row.id);
    try{
      await adminRequest("/api/inventory",{method:"PATCH",body:JSON.stringify({id:row.id,stock:row.stock,price:row.price,stock_status:row.stock_status,is_active:row.is_active,option_summary:row.option_summary,sku:row.sku})});
      await load();
    }finally{setSaving("");}
  }

  async function create(){
    if(!draft?.product_id)return;
    setBusy(true);
    try{
      await adminRequest("/api/inventory",{method:"POST",body:JSON.stringify(draft)});
      setDraft(null); await load();
    }finally{setBusy(false);}
  }

  async function archive(id:string){
    if(!confirm("Varyantı pasifleştirmek istiyor musun?"))return;
    await adminRequest("/api/inventory",{method:"DELETE",body:JSON.stringify({id})}); await load();
  }

  if(!rows)return <div className="admin-loading">Stok yükleniyor…</div>;

  return <>
    <div className="admin-toolbar">
      <div><strong>{rows.length} varyant</strong><span>Storefront varyant / stok kaynağı</span></div>
      <button className="admin-primary-button" disabled={!products.length} onClick={()=>setDraft({...emptyDraft,product_id:products[0]?.id||""})}><Plus size={15}/>Yeni Varyant</button>
    </div>

    {rows.length?<div className="admin-card admin-table-wrap"><table className="admin-table"><thead><tr><th>Ürün</th><th>Varyant</th><th>SKU</th><th>Stok</th><th>Fiyat</th><th>Durum</th><th></th></tr></thead><tbody>{rows.map((row,index)=><tr key={row.id}>
      <td><strong>{row.product?.name||"Ürün"}</strong></td>
      <td><input className="admin-table-input" value={row.option_summary||row.name||"Standart"} onChange={e=>setRows(c=>c!.map((v,i)=>i===index?{...v,option_summary:e.target.value}:v))}/></td>
      <td><input className="admin-table-input" value={row.sku||""} onChange={e=>setRows(c=>c!.map((v,i)=>i===index?{...v,sku:e.target.value}:v))}/></td>
      <td><input className="admin-table-input" type="number" min="0" value={row.stock??0} onChange={e=>setRows(c=>c!.map((v,i)=>i===index?{...v,stock:e.target.value}:v))}/></td>
      <td><input className="admin-table-input" type="number" step=".01" value={row.price??0} onChange={e=>setRows(c=>c!.map((v,i)=>i===index?{...v,price:e.target.value}:v))}/></td>
      <td><select className="admin-table-select" value={row.stock_status||"in_stock"} onChange={e=>setRows(c=>c!.map((v,i)=>i===index?{...v,stock_status:e.target.value}:v))}><option value="in_stock">Stokta</option><option value="out_of_stock">Tükendi</option><option value="preorder">Ön sipariş</option></select></td>
      <td><div className="admin-row-actions"><button disabled={saving===row.id} onClick={()=>save(row)}>{saving===row.id?"Kaydediliyor":"Kaydet"}</button><button onClick={()=>archive(row.id)}>Pasifleştir</button></div></td>
    </tr>)}</tbody></table></div>:<div className="admin-empty">Henüz varyant yok. Ürünlerin gramaj / öğütüm / paket seçeneklerini buradan ekleyebilirsin.</div>}

    <AnimatePresence>{draft?<motion.div className="admin-editor-backdrop" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:.18}} onMouseDown={()=>setDraft(null)}><motion.section className="admin-editor-panel" initial={{x:56,opacity:.98}} animate={{x:0,opacity:1}} exit={{x:72,opacity:0}} transition={{duration:.28,ease:[.32,.72,0,1]}} onMouseDown={e=>e.stopPropagation()}>
      <header><div><p className="admin-kicker">YENİ VARYANT</p><h2>Ürün seçeneği</h2></div><button className="admin-icon-button" onClick={()=>setDraft(null)}><X size={18}/></button></header>
      <div className="admin-form-grid">
        <label className="admin-field admin-field-wide"><span>Ürün</span><select value={draft.product_id} onChange={e=>setDraft({...draft,product_id:e.target.value})}>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className="admin-field admin-field-wide"><span>Varyant adı / özet</span><input value={draft.option_summary} onChange={e=>setDraft({...draft,option_summary:e.target.value,name:e.target.value})} placeholder="500 GR / Çekirdek"/></label>
        <label className="admin-field"><span>SKU</span><input value={draft.sku} onChange={e=>setDraft({...draft,sku:e.target.value})}/></label>
        <label className="admin-field"><span>Fiyat</span><input type="number" step=".01" value={draft.price} onChange={e=>setDraft({...draft,price:e.target.value})}/></label>
        <label className="admin-field"><span>Stok</span><input type="number" min="0" value={draft.stock} onChange={e=>setDraft({...draft,stock:e.target.value})}/></label>
        <label className="admin-field"><span>Stok durumu</span><select value={draft.stock_status} onChange={e=>setDraft({...draft,stock_status:e.target.value})}><option value="in_stock">Stokta</option><option value="out_of_stock">Tükendi</option><option value="preorder">Ön sipariş</option></select></label>
        <label className="admin-field admin-field-wide"><span>Varyant görseli URL</span><input value={draft.image_url} onChange={e=>setDraft({...draft,image_url:e.target.value})}/></label>
      </div>
      <footer><button className="admin-secondary-button" onClick={()=>setDraft(null)}>Vazgeç</button><button className="admin-primary-button" disabled={busy||!draft.product_id||!draft.option_summary.trim()} onClick={create}>{busy?"Ekleniyor…":"Varyantı Ekle"}</button></footer>
    </motion.section></motion.div>:null}</AnimatePresence>
  </>;
}
