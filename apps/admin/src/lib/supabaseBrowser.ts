"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  assertRostaSupabaseUrl,
  ROSTA_SUPABASE_PUBLISHABLE_KEY,
  ROSTA_SUPABASE_URL,
} from "@/lib/platform";

let client: SupabaseClient | null = null;
const AUTH_STORAGE_KEY="rosta_admin_auth_session_v1";
const REMEMBER_KEY="rosta_admin_remember_session_v1";

function storage(kind:"local"|"session"){
  if(typeof window==="undefined")return null;
  try{return kind==="local"?window.localStorage:window.sessionStorage;}catch{return null;}
}

export function adminRememberSessionEnabled(){
  try{return storage("local")?.getItem(REMEMBER_KEY)==="1";}catch{return false;}
}

export function setAdminRememberSession(remember:boolean){
  if(typeof window==="undefined")return false;
  const local=storage("local"),session=storage("session");
  try{
    if(remember)local?.setItem(REMEMBER_KEY,"1");
    else local?.removeItem(REMEMBER_KEY);
    // Move the currently stored session between buckets when the preference changes.
    const from=remember?session:local;
    const to=remember?local:session;
    const value=from?.getItem(AUTH_STORAGE_KEY);
    if(value&&to){to.setItem(AUTH_STORAGE_KEY,value);from?.removeItem(AUTH_STORAGE_KEY);}
    if(remember){try{void navigator.storage?.persist?.();}catch{}}
    return true;
  }catch{return false;}
}

function adaptiveStorage(){
  if(typeof window==="undefined")return undefined;
  return{
    getItem(key:string){
      try{
        const preferred=adminRememberSessionEnabled()?storage("local"):storage("session");
        const fallback=adminRememberSessionEnabled()?storage("session"):storage("local");
        return preferred?.getItem(key)||fallback?.getItem(key)||null;
      }catch{return null;}
    },
    setItem(key:string,value:string){
      const target=adminRememberSessionEnabled()?storage("local"):storage("session");
      const other=adminRememberSessionEnabled()?storage("session"):storage("local");
      try{target?.setItem(key,value);other?.removeItem(key);}catch{}
    },
    removeItem(key:string){
      try{storage("local")?.removeItem(key);}catch{}
      try{storage("session")?.removeItem(key);}catch{}
    },
  };
}

export function getSupabaseBrowser(){
  if(client)return client;
  const url=assertRostaSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL||ROSTA_SUPABASE_URL);
  const key=String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||ROSTA_SUPABASE_PUBLISHABLE_KEY).trim();
  if(!key)throw new Error("Supabase publishable key eksik.");
  client=createClient(url,key,{
    auth:{
      storage:adaptiveStorage(),
      storageKey:AUTH_STORAGE_KEY,
      persistSession:true,
      autoRefreshToken:true,
      detectSessionInUrl:true,
    },
  });
  return client;
}
