"use client";

import { useCallback, useEffect, useState } from "react";
import { adminRequest } from "@/lib/adminApi";

export function OrderManager(){
  const [rows,setRows]=useState<any[]|null>(null); const [saving,setSaving]=useState("");
  const load=useCallback(()=>adminRequest<any>("/api/orders").then(v=>setRows(v.orders||[])),[]);
  useEffect(()=>{load();},[load]);
  async function save(row:any){setSaving(row.id);await adminRequest("/api/orders",{method:"PATCH",body:JSON.stringify({id:row.id,status:row.status,payment_status:row.payment_status,shipping_status:row.shipping_status,cargo_tracking_no:row.cargo_tracking_no})});setSaving("");await load();}
  if(!rows)return <div className="admin-loading">Siparişler yükleniyor…</div>;
  if(!rows.length)return <div className="admin-empty">Henüz sipariş bulunamadı.</div>;
  return <div className="admin-card admin-table-wrap"><table className="admin-table"><thead><tr><th>Sipariş</th><th>Müşteri</th><th>Durum</th><th>Ödeme</th><th>Kargo</th><th>Takip</th><th>Tutar</th><th></th></tr></thead><tbody>{rows.map((row,index)=><tr key={row.id}><td><strong>{row.order_no}</strong><small className="admin-cell-sub">{new Date(row.created_at).toLocaleString("tr-TR")}</small></td><td>{row.customer_name}<small className="admin-cell-sub">{row.customer_email}</small></td><td><select className="admin-table-select" value={row.status||"pending"} onChange={e=>setRows(c=>c!.map((v,i)=>i===index?{...v,status:e.target.value}:v))}><option value="pending">Bekliyor</option><option value="paid">Ödendi</option><option value="preparing">Hazırlanıyor</option><option value="shipped">Kargoda</option><option value="completed">Tamamlandı</option><option value="cancelled">İptal</option></select></td><td><select className="admin-table-select" value={row.payment_status||"waiting"} onChange={e=>setRows(c=>c!.map((v,i)=>i===index?{...v,payment_status:e.target.value}:v))}><option value="waiting">Bekliyor</option><option value="paid">Ödendi</option><option value="failed">Başarısız</option><option value="refunded">İade</option></select></td><td><input className="admin-table-input" value={row.shipping_status||""} onChange={e=>setRows(c=>c!.map((v,i)=>i===index?{...v,shipping_status:e.target.value}:v))} placeholder="hazırlanıyor"/></td><td><input className="admin-table-input" value={row.cargo_tracking_no||""} onChange={e=>setRows(c=>c!.map((v,i)=>i===index?{...v,cargo_tracking_no:e.target.value}:v))}/></td><td>{new Intl.NumberFormat("tr-TR",{style:"currency",currency:row.currency||"TRY"}).format(Number(row.total_amount||0))}</td><td><button className="admin-secondary-button" disabled={saving===row.id} onClick={()=>save(row)}>Kaydet</button></td></tr>)}</tbody></table></div>;
}
