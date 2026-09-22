"use client";

import { useCallback, useEffect, useState } from "react";
import { adminRequest } from "@/lib/adminApi";

export function InventoryManager(){
  const [rows,setRows]=useState<any[]|null>(null); const [saving,setSaving]=useState("");
  const load=useCallback(()=>adminRequest<any>("/api/inventory").then(v=>setRows(v.inventory||[])),[]);
  useEffect(()=>{load();},[load]);
  async function save(row:any){setSaving(row.id);await adminRequest("/api/inventory",{method:"PATCH",body:JSON.stringify({id:row.id,stock:row.stock,price:row.price,stock_status:row.stock_status,is_active:row.is_active})});setSaving("");await load();}
  if(!rows)return <div className="admin-loading">Stok yükleniyor…</div>;
  if(!rows.length)return <div className="admin-empty">Varyantlı ürün eklediğinde stok satırları burada görünecek.</div>;
  return <div className="admin-card admin-table-wrap"><table className="admin-table"><thead><tr><th>Ürün</th><th>Varyant</th><th>SKU</th><th>Stok</th><th>Fiyat</th><th>Durum</th><th></th></tr></thead><tbody>{rows.map((row,index)=><tr key={row.id}><td><strong>{row.product?.name||"Ürün"}</strong></td><td>{row.option_summary||row.name||"Standart"}</td><td>{row.sku||"—"}</td><td><input className="admin-table-input" type="number" min="0" value={row.stock??0} onChange={e=>setRows(current=>current!.map((v,i)=>i===index?{...v,stock:e.target.value}:v))}/></td><td><input className="admin-table-input" type="number" step=".01" value={row.price??0} onChange={e=>setRows(current=>current!.map((v,i)=>i===index?{...v,price:e.target.value}:v))}/></td><td><select className="admin-table-select" value={row.stock_status||"in_stock"} onChange={e=>setRows(current=>current!.map((v,i)=>i===index?{...v,stock_status:e.target.value}:v))}><option value="in_stock">Stokta</option><option value="out_of_stock">Tükendi</option><option value="preorder">Ön sipariş</option></select></td><td><button className="admin-secondary-button" disabled={saving===row.id} onClick={()=>save(row)}>{saving===row.id?"Kaydediliyor":"Kaydet"}</button></td></tr>)}</tbody></table></div>;
}
