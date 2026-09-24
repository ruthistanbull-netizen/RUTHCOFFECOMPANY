"use client";

import { motion, type Transition } from "framer-motion";

type MenuToggleIconProps = {
  open: boolean;
  className?: string;
  duration?: number;
};

/**
 * API and 500ms morph timing mirror Efferd's 21st.dev Menu Toggle Icon usage:
 * <MenuToggleIcon open={open} className="size-20" duration={500} />
 */
export function MenuToggleIcon({ open, className, duration = 500 }: MenuToggleIconProps) {
  const seconds = duration / 1000;
  const transition: Transition = { duration: seconds, ease: [0.4, 0, 0.2, 1] };

  return (
    <motion.svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      initial={false}
      animate={open ? "open" : "closed"}
    >
      <motion.path
        d="M11.5 6.5H20"
        stroke="currentColor"
        strokeWidth="2.15"
        strokeLinecap="round"
        variants={{
          closed: { d: "M11.5 6.5H20", opacity: 1 },
          open: { d: "M6.7 6.7L17.3 17.3", opacity: 1 },
        }}
        transition={transition}
      />
      <motion.path
        d="M4 12H20"
        stroke="currentColor"
        strokeWidth="2.15"
        strokeLinecap="round"
        variants={{
          closed: { d: "M4 12H20", opacity: 1, pathLength: 1 },
          open: { d: "M12 12H12", opacity: 0, pathLength: 0 },
        }}
        transition={transition}
      />
      <motion.path
        d="M4 17.5H12.5"
        stroke="currentColor"
        strokeWidth="2.15"
        strokeLinecap="round"
        variants={{
          closed: { d: "M4 17.5H12.5", opacity: 1 },
          open: { d: "M17.3 6.7L6.7 17.3", opacity: 1 },
        }}
        transition={transition}
      />
    </motion.svg>
  );
}
