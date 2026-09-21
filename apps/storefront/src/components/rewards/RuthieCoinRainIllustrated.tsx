"use client";

import { motion } from "framer-motion";

const coins = [
  { left: "5%", size: 28, delay: 1.12, duration: 2.42, drift: 1.5, rotate: -9 },
  { left: "11%", size: 24, delay: 0.18, duration: 2.26, drift: -1.2, rotate: 10 },
  { left: "17%", size: 32, delay: 1.84, duration: 2.48, drift: 1.6, rotate: -12 },
  { left: "23%", size: 26, delay: 0.73, duration: 2.31, drift: -1.1, rotate: 8 },
  { left: "29%", size: 33, delay: 2.21, duration: 2.52, drift: 1.4, rotate: -14 },
  { left: "35%", size: 25, delay: 0.42, duration: 2.22, drift: -1.0, rotate: 9 },
  { left: "41%", size: 31, delay: 1.51, duration: 2.46, drift: 1.3, rotate: -10 },
  { left: "47%", size: 26, delay: 2.58, duration: 2.28, drift: -1.2, rotate: 8 },
  { left: "53%", size: 35, delay: 0.09, duration: 2.54, drift: 1.4, rotate: -8 },
  { left: "59%", size: 27, delay: 1.96, duration: 2.34, drift: -1.1, rotate: 10 },
  { left: "65%", size: 32, delay: 0.88, duration: 2.47, drift: 1.2, rotate: -9 },
  { left: "71%", size: 24, delay: 2.34, duration: 2.25, drift: -1.2, rotate: 8 },
  { left: "77%", size: 33, delay: 0.29, duration: 2.5, drift: 1.3, rotate: -12 },
  { left: "83%", size: 26, delay: 1.37, duration: 2.3, drift: -1.0, rotate: 10 },
  { left: "89%", size: 30, delay: 2.03, duration: 2.4, drift: 1.1, rotate: -8 },
  { left: "94%", size: 28, delay: 0.61, duration: 2.32, drift: -1.0, rotate: 8 },
  { left: "38%", size: 29, delay: 1.67, duration: 2.38, drift: 1.2, rotate: -11 },
  { left: "68%", size: 30, delay: 1.03, duration: 2.44, drift: -1.1, rotate: 9 },
  { left: "14%", size: 23, delay: 2.67, duration: 2.2, drift: 0.9, rotate: -7 },
  { left: "57%", size: 27, delay: 1.27, duration: 2.29, drift: 1.0, rotate: 11 },
  { left: "86%", size: 25, delay: 2.47, duration: 2.24, drift: -0.9, rotate: -10 },
];

export function RuthieCoinRainIllustrated() {
  return (
    <motion.div
      className="ruthie-success-coins"
      aria-hidden="true"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
    >
      {coins.map((coin, index) => (
        <motion.div
          key={index}
          className="ruthie-illustrated-coin"
          style={{ left: coin.left, width: coin.size, height: coin.size }}
          initial={{ y: -84, x: 0, rotate: coin.rotate, opacity: 0, scale: 0.96 }}
          animate={{
            y: [-100, 120, 360, 680, 1040, 1480],
            x: [0, coin.drift, coin.drift * 0.45, coin.drift * -0.2, coin.drift * 0.1, 0],
            rotate: [coin.rotate, coin.rotate + 20, coin.rotate + 42, coin.rotate + 60, coin.rotate + 78, coin.rotate + 98],
            opacity: [0, 1, 1, 0.96, 0.55, 0],
            scale: [0.96, 1, 1.02, 1, 0.97, 0.94],
          }}
          transition={{
            duration: coin.duration,
            delay: coin.delay,
            repeat: Infinity,
            repeatDelay: 0,
            ease: "linear",
            times: [0, 0.18, 0.36, 0.58, 0.8, 1],
          }}
        >
          <span>R</span>
        </motion.div>
      ))}
    </motion.div>
  );
}
