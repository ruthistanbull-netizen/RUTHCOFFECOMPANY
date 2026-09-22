import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { normalizeThemeSectionSettings } from "@ruth-commerce/commerce-core/theme-sections";

export const runtime="nodejs";
export const dynamic="force-dynamic";

const STOREFRONT_ORIGIN=(process.env.NEXT_PUBLIC_STOREFRONT_URL||process.env.STOREFRONT_ORIGIN||"https://rostacoffecompany.zeabur.app").replace(/\/$/,"");
const FALLBACK_PAGES=["/","/products","/categories","/collections","/search","/about","/contact","/faq","/order-tracking","/privacy-policy","/kvkk","/account"] as const;
const labels:Record<string,string>={"/":"Ana Sayfa","/products":"Tüm Ürünler","/categories":"Kategoriler","/collections":"Koleksiyonlar","/search":"Arama","/about":"Hakkımızda","/contact":"İletişim","/faq":"S.S.S.","/order-tracking":"Sipariş Takip","/privacy-policy":"Gizlilik Politikası","/kvkk":"KVKK","/account":"Hesabım"};

function cleanPath(value:string){try{const url=new URL(value,STOREFRONT_ORIGIN);if(url.origin!==new URL(STOREFRONT_ORIGIN).origin)return"";const p=url.pathname.replace(/\/{2,}/g,"/");return p.length>1&&p.endsWith("/")?p.slice(0,-1):p;}catch{return"";}}
function words(value:string){try{return decodeURIComponent(value).replace(/[-_]+/g," ").replace(/\b\w/g,(letter)=>letter.toLocaleUpperCase("tr-TR"));}catch{return value.replace(/[-_]+/g," ");}}
function publicPath(path:string){return Boolean(path)&&!path.startsWith("/api/")&&!/^\/(checkout|login|register|reset-password|order-success|order-fail)(\/|$)/.test(path);}
function meta(path:string){if(labels[path])return{label:labels[path],group:"Sayfalar"};const slug=path.split("/").filter(Boolean).at(-1)||path;return{label:words(slug),group:path.startsWith("/pages/")?"Özel Sayfalar":"Diğer"};}
function template(path:string){if(/^\/products\/[^/]+$/.test(path))return{key:"/products/[slug]",label:"Ürün Sayfası"};if(/^\/(category|categories)\/[^/]+$/.test(path))return{key:"/category/[slug]",label:"Kategori Sayfası"};if(/^\/collections\/[^/]+$/.test(path))return{key:"/collections/[slug]",label:"Koleksiyon Sayfası"};return null;}
async function sitemap(){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),3500);try{const r=await fetch(`${STOREFRONT_ORIGIN}/sitemap.xml`,{cache:"no-store",signal:controller.signal});if(!r.ok)return[] as string[];const xml=await r.text();return[...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map(m=>cleanPath(m[1]||"")).filter(Boolean);}catch{return[] as string[];}finally{clearTimeout(timer);}}

export async function GET(request:Request){
 const auth=await requireAdmin(request);if("error" in auth)return auth.error;
 const [setting,siteMap,product,category,collection]=await Promise.all([
   auth.supabase.from("site_settings").select("setting_value").eq("setting_key","theme_sections").maybeSingle(),
   sitemap(),
   auth.supabase.from("products").select("slug").not("slug","is",null).limit(1),
   auth.supabase.from("categories").select("slug").not("slug","is",null).limit(1),
   auth.supabase.from("collections").select("slug").not("slug","is",null).limit(1),
 ]);
 const sections=normalizeThemeSectionSettings(setting.data?.setting_value||undefined);
 const raw=[...new Set<string>([...FALLBACK_PAGES,...siteMap,...Object.keys(sections.pages)])].map(cleanPath).filter(publicPath);
 const pages:any[]=[];const templates=new Map<string,any>();
 for(const path of raw){const t=template(path);if(t){if(!templates.has(t.key))templates.set(t.key,{path:t.key,label:t.label,group:"Şablonlar",previewPath:path,template:true});}else pages.push({path,...meta(path)});}
 const guaranteed:Array<[string,string,string]>= [
  ["/products/[slug]","Ürün Sayfası",product.data?.[0]?.slug?`/products/${product.data[0].slug}`:""],
  ["/category/[slug]","Kategori Sayfası",category.data?.[0]?.slug?`/category/${category.data[0].slug}`:""],
  ["/collections/[slug]","Koleksiyon Sayfası",collection.data?.[0]?.slug?`/collections/${collection.data[0].slug}`:""],
 ];
 for(const [p,label,previewPath] of guaranteed)if(!templates.has(p))templates.set(p,{path:p,label,group:"Şablonlar",previewPath:previewPath||undefined,template:true});
 pages.push(...templates.values());
 pages.sort((a,b)=>a.group.localeCompare(b.group,"tr")||a.label.localeCompare(b.label,"tr"));
 return NextResponse.json({ok:true,pages},{headers:{"Cache-Control":"no-store"}});
}
