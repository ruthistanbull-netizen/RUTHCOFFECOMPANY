"use client";

import { motion } from "framer-motion";
import { Gem, Package, RefreshCw, Shield, Truck } from "lucide-react";

function trustItems(freeShippingThreshold: number) {
  return [
    { icon: Shield, title: "Güvenli Ödeme", lines: ["PAYTR ile Güvenli Ödeme"] },
    { icon: Package, title: "Özenli Paketleme", lines: ["Hediye hissiyle hazırlanır"] },
    { icon: RefreshCw, title: "Kolay İade ve Değişim", lines: ["14 gün içinde iade", "30 gün içinde değişim"] },
    { icon: Truck, title: "Ücretsiz Kargo", lines: [`${freeShippingThreshold.toLocaleString("tr-TR")}₺ Üzeri Ücretsiz Kargo`] },
    { icon: Gem, title: "Kaliteli Materyal", lines: ["925 Ayar Gümüş ve Brass ile Atelier Parçalar"] },
  ];
}

export default function TrustSection({ freeShippingThreshold = 2000 }: { freeShippingThreshold?: number }) {
  const TRUST = trustItems(freeShippingThreshold);
  return (
    <section className="bg-cream px-4 py-16 md:px-8 md:py-20" style={{ borderTop: "1px solid rgba(184,151,106,0.12)", borderBottom: "1px solid rgba(184,151,106,0.12)" }}>
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
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-gold/20">
                <item.icon size={20} className="text-gold-dark" />
              </div>
              <h3 className="font-heading text-sm" style={{ color: "var(--ink)" }}>{item.title}</h3>
              <div className="mt-2 space-y-1">
                {item.lines.map((line) => (
                  <p key={line} className="mx-auto max-w-[13rem] text-xs leading-5 text-muted-ruth">{line}</p>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
