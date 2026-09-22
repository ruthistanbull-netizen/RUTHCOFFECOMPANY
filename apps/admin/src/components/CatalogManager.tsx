"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Save, X } from "lucide-react";
import { adminRequest } from "@/lib/adminApi";

type Kind="category"|"collection";
type Item={id?:string;name:string;slug:string;description?:string|null;cover_image_url?:string|null;sort_order?:number;status?:string};
const empty:Item={name:"",slug:"",description:"",cover_image_url:"",sort_order:0,status:"active"};

export function CatalogManager(){
  const [kind,setKind]=useState<Kind>("category"); const [data,setData]=useState<any>(null); const [draft,setDraft]=useState<Item|null>(null); const [busy,setBusy]=useState(false);
  const load=useCallback(()=>adminRequest<any>("/api/catalog").then(setData),[]);
  useEffect(()=>{load();},[load]);
  const rows:Item[]=data?(kind==="category"?data.categories:data.collections):[];
  async function save(){if(!draft)return;setBusy(true);try{await adminRequest("/api/catalog",{method:draft.id?"PATCH":"POST",body:JSON.stringify({...draft,type:kind})});setDraft(null);await load();}finally{setBusy(false);}}
  async function disable(id:string){await adminRequest("/api/catalog",{method:"DELETE",body:JSON.stringify({id,type:kind})});await load();}
  if(!data)return <div className="admin-loading">Katalog yükleniyor…</div>;
  return <>
    <div className="admin-segmented"><button className={kind==="category"?"is-active":""} onClick={()=>setKind("category")}>Kategoriler</button><button className={kind==="collection"?"is-active":""} onClick={()=>setKind("collection")}>Koleksiyonlar</button></div>
    <div className="admin-toolbar"><div><strong>{rows.length} kayıt</strong><span>Storefront katalog grupları</span></div><button className="admin-primary-button" onClick={()=>setDraft({...empty})}><Plus size={15}/>Yeni {kind==="category"?"Kategori":"Koleksiyon"}</button></div>
    <div className="admin-card admin-table-wrap"><table className="admin-table"><thead><tr><th>Ad</th><th>Slug</th><th>Durum</th><th>Sıra</th><th></th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td><strong>{row.name}</strong></td><td>/{row.slug}</td><td><span className="admin-pill">{row.status}</span></td><td>{row.sort_order??0}</td><td><div className="admin-row-actions"><button onClick={()=>setDraft({...row})}>Düzenle</button><button onClick={()=>disable(String(row.id))}>Pasifleştir</button></div></td></tr>)}</tbody></table></div>
    <AnimatePresence>{draft?<motion.div className="admin-editor-backdrop" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:.18}} onMouseDown={()=>setDraft(null)}><motion.section className="admin-editor-panel" initial={{x:56,opacity:.98}} animate={{x:0,opacity:1}} exit={{x:72,opacity:0}} transition={{duration:.28,ease:[.32,.72,0,1]}} onMouseDown={e=>e.stopPropagation()}><header><div><p className="admin-kicker">KATALOG</p><h2>{draft.id?"Düzenle":"Yeni kayıt"}</h2></div><button className="admin-icon-button" onClick={()=>setDraft(null)}><X size={18}/></button></header><div className="admin-form-grid">
      <label className="admin-field admin-field-wide"><span>Ad</span><input value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
      <label className="admin-field admin-field-wide"><span>Slug</span><input value={draft.slug||""} onChange={e=>setDraft({...draft,slug:e.target.value})}/></label>
      <label className="admin-field admin-field-wide"><span>Açıklama</span><textarea rows={5} value={draft.description||""} onChange={e=>setDraft({...draft,description:e.target.value})}/></label>
      <label className="admin-field admin-field-wide"><span>Kapak görseli URL</span><input value={draft.cover_image_url||""} onChange={e=>setDraft({...draft,cover_image_url:e.target.value})}/></label>
      <label className="admin-field"><span>Sıra</span><input type="number" value={draft.sort_order??0} onChange={e=>setDraft({...draft,sort_order:Number(e.target.value)})}/></label>
      <label className="admin-field"><span>Durum</span><select value={draft.status||"active"} onChange={e=>setDraft({...draft,status:e.target.value})}><option value="active">Aktif</option><option value="inactive">Pasif</option></select></label>
    </div><footer><button className="admin-secondary-button" onClick={()=>setDraft(null)}>Vazgeç</button><button className="admin-primary-button" disabled={busy||!draft.name.trim()} onClick={save}><Save size={15}/>{busy?"Kaydediliyor…":"Kaydet"}</button></footer></motion.section></motion.div>:null}</AnimatePresence>
  </>;
}
