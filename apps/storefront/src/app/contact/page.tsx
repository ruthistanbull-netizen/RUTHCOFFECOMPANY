import Link from "next/link";
import { Instagram, Mail, MessageCircle } from "lucide-react";
import { AnimatedBlock, PageIntro } from "@/components/PageIntro";
import { ContactForm } from "@/components/contact/ContactForm";

export const metadata = {
  title: "İletişim",
  description: "ROSTA Coffee Co. iletişim ve destek.",
};

export default function ContactPage() {
  const whatsappUrl = String(process.env.NEXT_PUBLIC_ROSTA_WHATSAPP_URL || "").trim();
  const instagramUrl = String(process.env.NEXT_PUBLIC_ROSTA_INSTAGRAM_URL || "").trim();
  const supportEmail = String(process.env.NEXT_PUBLIC_ROSTA_SUPPORT_EMAIL || "").trim();

  const cards = [
    {
      icon: MessageCircle,
      title: "Canlı Destek",
      desc: "Canlı destek kapalıysa WhatsApp üzerinden ROSTA ekibine ulaşabilirsiniz.",
      href: null,
      actionLabel: whatsappUrl ? "WhatsApp'tan Yaz" : null,
      actionHref: whatsappUrl || null,
    },
    {
      icon: Mail,
      title: "Mesaj Gönder",
      desc: "Aşağıdaki formdan bize mesaj bırakabilirsiniz.",
      href: "#contact-form",
      actionLabel: null,
      actionHref: null,
    },
    {
      icon: Instagram,
      title: "Instagram",
      desc: "ROSTA Coffee Co. sosyal medya hesabını ziyaret edin.",
      href: instagramUrl || null,
      actionLabel: null,
      actionHref: null,
    },
  ];

  return (
    <div className="min-h-screen bg-ivory px-4 pb-24 pt-32 md:px-8">
      <div className="mx-auto max-w-5xl">
        <PageIntro
          eyebrow="İletişim"
          title="Kahve için buradayız."
          description="Sipariş, ürün, toptan satış veya profesyonel kahve ihtiyaçlarınız için ROSTA Coffee Co. ekibine ulaşabilirsiniz."
          align="left"
        />

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {cards.map((item, index) => {
            const CardIcon = item.icon;
            const content = (
              <div className="h-full rounded-lg border border-gold/15 bg-cream p-7 transition hover:-translate-y-1 hover:border-gold/30 hover:shadow-xl hover:shadow-ink/5">
                <CardIcon className="mb-5 text-gold-dark" size={22} />
                <h2 className="font-heading text-2xl">{item.title}</h2>
                <p className="mt-4 leading-7 text-muted-ruth">{item.desc}</p>
                {item.actionHref && item.actionLabel ? (
                  <a
                    href={item.actionHref}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-ink px-5 py-3 text-[10px] uppercase tracking-wide-luxe text-cream transition hover:bg-gold-dark"
                  >
                    {item.actionLabel}
                  </a>
                ) : null}
              </div>
            );

            return (
              <AnimatedBlock key={item.title} delay={0.12 + index * 0.08}>
                {item.href ? (
                  item.href.startsWith("http") ? (
                    <a href={item.href} target="_blank" rel="noreferrer" className="block h-full">
                      {content}
                    </a>
                  ) : (
                    <Link href={`/contact${item.href}`} className="block h-full">
                      {content}
                    </Link>
                  )
                ) : (
                  content
                )}
              </AnimatedBlock>
            );
          })}
        </div>

        <AnimatedBlock delay={0.26}>
          <section className="mt-12 rounded-[2rem] border border-gold/15 bg-cream p-6 md:p-10">
            <p className="mb-3 text-xs uppercase tracking-wide-luxe text-gold-dark">İletişim ve işletme bilgileri</p>
            <div className="grid gap-5 text-sm leading-7 text-muted-ruth md:grid-cols-2">
              <div className="space-y-2">
                <p><strong className="text-ink">Resmî satıcı:</strong> Görkem Çirik</p>
                <p><strong className="text-ink">İşletme türü:</strong> Şahıs işletmesi</p>
                <p><strong className="text-ink">Vergi dairesi / no:</strong> Bayrampaşa / 2571309841</p>
              </div>
              <div className="space-y-2">
                {supportEmail ? <p><strong className="text-ink">E-posta:</strong> <a className="hover:text-ink" href={`mailto:${supportEmail}`}>{supportEmail}</a></p> : null}
                <p><strong className="text-ink">Adres:</strong> Vatan Mahallesi, Küçük Sokak No: 2 Daire: 1, Bayrampaşa / İstanbul</p>
              </div>
            </div>
          </section>
        </AnimatedBlock>

        <AnimatedBlock delay={0.3}>
          <section id="contact-form" className="mt-16 scroll-mt-32 rounded-[2rem] border border-gold/15 bg-cream p-6 md:p-10">
            <div className="mb-9 max-w-2xl">
              <p className="mb-3 text-xs uppercase tracking-wide-luxe text-gold-dark">Bizimle iletişime geç</p>
              <h2 className="font-heading text-4xl uppercase tracking-[0.08em] md:text-5xl">Mesajınızı bırakın.</h2>
              <p className="mt-5 leading-7 text-muted-ruth">
                Ad soyad, e-posta, telefon numarası ve mesajınızı bırakarak bizimle iletişime geçebilirsiniz.
              </p>
            </div>

            <ContactForm />
          </section>
        </AnimatedBlock>

        <AnimatedBlock delay={0.34}>
          <Link href="/products" className="mt-10 inline-flex rounded-full bg-ink px-8 py-4 text-xs uppercase tracking-wide-luxe text-cream transition hover:bg-gold-dark">
            Alışverişe Devam Et
          </Link>
        </AnimatedBlock>
      </div>
    </div>
  );
}
