"use client";

import { motion, useReducedMotion } from "framer-motion";

const beans = [
  { left: "4%",  width: 20, height: 29, delay: 0.10, duration: 2.55, drift: 34, rotate: -18 },
  { left: "9%",  width: 16, height: 24, delay: 1.15, duration: 2.34, drift: -24, rotate: 22 },
  { left: "15%", width: 23, height: 32, delay: 0.52, duration: 2.72, drift: 28, rotate: -36 },
  { left: "21%", width: 18, height: 27, delay: 1.86, duration: 2.48, drift: -31, rotate: 14 },
  { left: "27%", width: 24, height: 34, delay: 0.28, duration: 2.64, drift: 25, rotate: 42 },
  { left: "33%", width: 17, height: 25, delay: 1.38, duration: 2.42, drift: -28, rotate: -12 },
  { left: "39%", width: 22, height: 31, delay: 0.76, duration: 2.69, drift: 36, rotate: 28 },
  { left: "45%", width: 15, height: 23, delay: 2.02, duration: 2.36, drift: -22, rotate: -31 },
  { left: "51%", width: 25, height: 35, delay: 0.04, duration: 2.78, drift: 31, rotate: 16 },
  { left: "57%", width: 19, height: 28, delay: 1.60, duration: 2.51, drift: -35, rotate: 37 },
  { left: "63%", width: 21, height: 30, delay: 0.91, duration: 2.58, drift: 23, rotate: -24 },
  { left: "69%", width: 16, height: 24, delay: 2.18, duration: 2.39, drift: -29, rotate: 11 },
  { left: "75%", width: 24, height: 33, delay: 0.39, duration: 2.73, drift: 33, rotate: -40 },
  { left: "81%", width: 18, height: 27, delay: 1.27, duration: 2.46, drift: -26, rotate: 25 },
  { left: "87%", width: 22, height: 31, delay: 0.66, duration: 2.61, drift: 29, rotate: -15 },
  { left: "93%", width: 17, height: 25, delay: 1.94, duration: 2.44, drift: -32, rotate: 33 },
  { left: "12%", width: 14, height: 22, delay: 2.42, duration: 2.31, drift: 20, rotate: 9 },
  { left: "36%", width: 20, height: 29, delay: 2.30, duration: 2.57, drift: -34, rotate: -29 },
  { left: "60%", width: 15, height: 23, delay: 2.55, duration: 2.35, drift: 27, rotate: 39 },
  { left: "84%", width: 19, height: 28, delay: 2.68, duration: 2.49, drift: -23, rotate: -7 },
];

export function CoffeeBeanRain() {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      {beans.map((bean, index) => (
        <motion.div
          key={index}
          style={{
            position: "absolute",
            left: bean.left,
            top: -70,
            width: bean.width,
            height: bean.height,
            borderRadius: "58% 42% 56% 44% / 52% 48% 52% 48%",
            background: "linear-gradient(145deg,#7b4b31 0%,#4a2b1d 58%,#2b1811 100%)",
            boxShadow: "0 5px 10px rgba(24,12,7,.18), inset 2px 2px 3px rgba(255,255,255,.12)",
          }}
          initial={{ y: -90, x: 0, rotate: bean.rotate, opacity: 0 }}
          animate={{
            y: [-90, 180, 510, 900, 1320],
            x: [0, bean.drift, bean.drift * -0.35, bean.drift * 0.5, 0],
            rotate: [bean.rotate, bean.rotate + 70, bean.rotate + 150, bean.rotate + 235, bean.rotate + 320],
            opacity: [0, 1, 1, 0.82, 0],
          }}
          transition={{
            duration: bean.duration,
            delay: bean.delay,
            repeat: 1,
            ease: "linear",
            times: [0, 0.2, 0.48, 0.75, 1],
          }}
        >
          <span
            style={{
              position: "absolute",
              left: "49%",
              top: "13%",
              width: 2,
              height: "74%",
              borderRadius: 999,
              background: "rgba(232,194,155,.54)",
              transform: "rotate(8deg)",
              boxShadow: "1px 0 0 rgba(30,13,7,.38)",
            }}
          />
        </motion.div>
      ))}
    </div>
  );
}
