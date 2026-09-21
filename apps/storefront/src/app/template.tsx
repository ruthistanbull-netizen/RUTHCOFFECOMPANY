"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ruthMotion, ruthPageMotion, ruthTransition } from "@ruth-commerce/ui/motion";
import { ThemeEditorDirectImageBridge } from "@/components/theme/ThemeEditorDirectImageBridge";
import { ThemeEditorLivePreviewRepair } from "@/components/theme/ThemeEditorLivePreviewRepair";

export default function StorefrontTemplate({ children }: { children: React.ReactNode }) {
  const reducedMotion = useReducedMotion();

  return (
    <>
      <ThemeEditorDirectImageBridge />
      <ThemeEditorLivePreviewRepair />
      <motion.div
        className="ruth-route-transition"
        initial={reducedMotion ? false : ruthPageMotion.initial}
        animate={ruthPageMotion.animate}
        exit={reducedMotion ? undefined : ruthPageMotion.exit}
        transition={reducedMotion ? { duration: ruthMotion.duration.none } : ruthTransition("normal")}
      >
        {children}
      </motion.div>
    </>
  );
}
