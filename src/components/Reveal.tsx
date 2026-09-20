"use client";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
export function Reveal({children,className="",delay=0}:{children:ReactNode;className?:string;delay?:number}){return <motion.div className={className} initial={{opacity:0,y:28}} whileInView={{opacity:1,y:0}} viewport={{once:true,amount:.2}} transition={{duration:.8,delay,ease:[.22,1,.36,1]}}>{children}</motion.div>}
