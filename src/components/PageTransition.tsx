"use client";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
export function PageTransition({children}:{children:ReactNode}){return <motion.div initial={{opacity:0}} animate={{opacity:1}} transition={{duration:.32,ease:[.22,1,.36,1]}}>{children}</motion.div>}
