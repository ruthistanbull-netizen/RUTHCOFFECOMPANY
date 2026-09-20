"use client";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import type { CoffeeProduct } from "@/data/coffee";
import { formatPrice } from "@/lib/format";
import { useCart } from "./CartProvider";
export function ProductCard({product,index=0}:{product:CoffeeProduct;index?:number}){const {add}=useCart(); return <motion.article className="product-card" initial={{opacity:0,y:22}} whileInView={{opacity:1,y:0}} viewport={{once:true,amount:.15}} transition={{duration:.65,delay:Math.min(index*.06,.24),ease:[.22,1,.36,1]}}><Link href={`/product/${product.slug}`} className="product-image-wrap"><Image src={product.image} alt={product.name} width={800} height={1000}/><span>{product.category.replace("-"," ")}</span></Link><div className="product-card-copy"><Link href={`/product/${product.slug}`}><h3>{product.name}</h3><p>{product.subtitle}</p></Link><div><strong>{formatPrice(product.price)}</strong><button onClick={()=>add(product)}>+ QUICK ADD</button></div></div></motion.article>}
