"use client";

import { motion } from "framer-motion";
import { Coffee, Package, RefreshCw, Shield, Truck } from "lucide-react";

function trustItems(freeShippingThreshold: number) {
  return [
    { icon: Shield, title: "Güvenli Ödeme", lines: ["PAYTR ile Güvenli Ödeme"] },
    { icon: Package, title: "Özenli Paketleme", lines: ["Hediye hissiyle hazırlanır"] },
    { icon: RefreshCw, title: "Kolay Destek", lines: ["Sipariş ve ürün desteği"] },
    { icon: Truck, title: "Ücretsiz Kargo", lines: [`${freeShippingThreshold.toLocaleString("tr-TR")}₺ Üzeri Ücretsiz Kargo`] },
    { icon: Coffee, title: "Kahve Odaklı Seçki", lines: ["Ürün bilgisi ve kullanım detaylarıyla"] },
  ];
}

export default function TrustSection({ freeShippingThreshold = 2000 }: { freeShippingThreshold?: number }) {
  const TRUST = trustItems(freeShippingThreshold);
  return (
    <section className="bg-carbon-soft px-4 py-16 text-cream md:px-8 md:py-20" style={{ borderTop: "1px solid color-mix(in srgb, var(--rosta-kraft) 38%, transparent)", borderBottom: "1px solid color-mix(in srgb, var(--rosta-kraft) 38%, transparent)" }}>
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-5 md:gap-4">
          {TRUST.map((item, index) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.06, duration: 0.55 }}
              className={`text-center ${index === TRUST.length - 1 ? "col-span-2 md:col-span-1" : ""}`}
            >
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-kraft/40 bg-carbon">
                <item.icon size={20} className="text-brick" />
              </div>
              <h3 className="font-heading text-sm" style={{ color: "var(--rosta-cream)" }}>{item.title}</h3>
              <div className="mt-2 space-y-1">
                {item.lines.map((line) => (
                  <p key={line} className="mx-auto max-w-[13rem] text-xs leading-5 text-cream/70">{line}</p>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
