"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { adminRequest } from "@/lib/adminApi";

export function MediaUploadButton({
  folder="uploads",
  accept="image/*,video/mp4,video/webm",
  onUploaded,
  label="Medya Yükle",
}:{
  folder?:string;
  accept?:string;
  onUploaded:(url:string)=>void;
  label?:string;
}){
  const input=useRef<HTMLInputElement|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  async function change(file?:File){
    if(!file)return;
    setBusy(true);setError("");
    try{
      const form=new FormData();
      form.set("file",file);
      form.set("folder",folder);
      const result=await adminRequest<{url:string}>("/api/media/upload",{method:"POST",body:form});
      onUploaded(result.url);
    }catch(e){setError(e instanceof Error?e.message:"Yükleme başarısız.");}finally{setBusy(false); if(input.current)input.current.value="";}
  }

  return <div className="admin-upload-control">
    <input ref={input} type="file" accept={accept} hidden onChange={e=>change(e.target.files?.[0])}/>
    <button type="button" className="admin-secondary-button" disabled={busy} onClick={()=>input.current?.click()}><Upload size={14}/>{busy?"Yükleniyor…":label}</button>
    {error?<small>{error}</small>:null}
  </div>;
}
