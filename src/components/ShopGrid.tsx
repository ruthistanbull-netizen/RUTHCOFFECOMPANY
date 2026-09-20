"use client";
import { useMemo, useState } from "react";
import { coffeeProducts } from "@/data/coffee";
import { ProductCard } from "./ProductCard";
const filters=["all","espresso","filter","single-origin","blend"] as const;
export function ShopGrid({initial="all"}:{initial?:string}){const [active,setActive]=useState(initial); const list=useMemo(()=>active==="all"?coffeeProducts:coffeeProducts.filter(p=>p.category===active),[active]); return <><div className="shop-filter">{filters.map(f=><button className={active===f?"active":""} key={f} onClick={()=>setActive(f)}>{f.replace("-"," ")}</button>)}</div><div className="product-grid shop-grid">{list.map((p,i)=><ProductCard key={p.id} product={p} index={i}/>)}</div></>}
