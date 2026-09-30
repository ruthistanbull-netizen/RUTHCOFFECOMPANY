"use client";

import Link from "next/link";
import { usePrefersReducedMotion } from "@ruth-commerce/ui";
import {
  Brick,
  C,
  FinalCTA,
  Hero,
  MarqueeRow,
  Nav,
  Process,
  ServiceBlock,
  StudioArrow,
  WhoWeAre,
  type EditorialStage,
} from "@/components/business/BusinessEditorialPrimitives";

const navLinks = [
  { label: "KAHVE", href: "#coffee" },
  { label: "SÜREÇ", href: "#process" },
  { label: "SORULAR", href: "#questions" },
  { label: "İLETİŞİM", href: "#contact" },
];

const menuLinks = [
  { label: "ANASAYFA", href: "/" },
  ...navLinks,
  { label: "ROSTA.STUDIO", href: "/studio" },
];

const stages: readonly EditorialStage[] = [
  {
    n: "01",
    t: "PAYLAŞ",
    d: "İşletme adınızı, bulunduğunuz şehri, kahveyi nasıl hazırladığınızı ve tahmini tüketiminizi iletişim formundaki mesajınıza ekleyin.",
    side: "left",
  },
  {
    n: "02",
    t: "SEÇİM",
    d: "Servis şeklinizi, ekipmanınızı ve hedeflediğiniz kahve deneyimini konuşarak güncel ürün seçeneklerini değerlendirelim.",
    side: "right",
  },
  {
    n: "03",
    t: "TEKLİF",
    d: "Ürün, miktar ve teslimat adresi üzerinden teklif koşullarını netleştirelim. Fiyat ve sipariş detayları talebinize göre belirlenir.",
    side: "left",
  },
];

const questions = [
  {
    question: "Toptan kahve talebimi nasıl iletebilirim?",
    answer: "İletişim sayfasındaki formdan işletme bilgilerinizi ve kahve ihtiyacınızı paylaşabilirsiniz.",
  },
  {
    question: "Talebimde hangi bilgileri paylaşmalıyım?",
    answer: "İşletme adınızı, bulunduğunuz şehri, espresso veya filtre kullanımınızı ve tahmini tüketiminizi mesajınıza ekleyebilirsiniz.",
  },
  {
    question: "Güncel kahve bilgilerine nereden ulaşabilirim?",
    answer: "Ürünlerin güncel içerik, varyant ve kullanım bilgilerini ürün detay sayfalarında inceleyebilirsiniz.",
    link: { label: "KAHVELERİ KEŞFET", href: "/products" },
  },
  {
    question: "Miktar, fiyat ve teslimat koşulları nasıl netleşir?",
    answer: "Çalışma koşulları ürün, miktar ve teslimat adresi üzerinden teklifte netleştirilir. Güncel miktar ve fiyat bilgisi için ihtiyacınızı iletişim formundan paylaşabilirsiniz.",
    link: { label: "TALEBİNİ PAYLAŞ", href: "/contact#contact-form" },
  },
  {
    question: "Kahve dışında profesyonel destek alabilir miyim?",
    answer: "ROSTA.Studio; kahve programı, bar kurulumu, ekipman danışmanlığı ve ekip eğitimi alanlarında hizmet sunar. Destek kapsamı ve koşulları ayrıca değerlendirilir.",
    link: { label: "ROSTA.STUDIO", href: "/studio" },
  },
];

function CoffeeSections({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <section id="coffee" className="relative grain" style={{ background: C.carbon }}>
      <div className="wholesale-meta px-5 sm:px-8 py-10 flex items-center justify-between font-mono-tech text-[10px] uppercase tracking-[0.2em]" style={{ color: C.kraft }}>
        <span>BÖLÜM / 04</span>
        <span>İŞLETMENİN İHTİYACI</span>
      </div>
      <ServiceBlock
        index={1}
        label="TOPTAN"
        title={<>KAHVE<br />SEÇİMİ</>}
        subline="ESPRESSO / FİLTRE / DENEYİM"
        description={<>Espresso ya da filtre hazırlığı için kullanım şeklinizi, ekipmanınızı ve aradığınız kahve deneyimini paylaşın. Güncel ürün seçeneklerini birlikte değerlendirelim.<Link className="business-inline-link wholesale-section-link" href="/products">KAHVELERİ KEŞFET <StudioArrow /></Link></>}
        image="/home/rosta-espresso.webp"
        imageAlt="ROSTA espresso hazırlığı"
        reduceMotion={reduceMotion}
      />
      <ServiceBlock
        index={2}
        label="TOPTAN"
        side="right"
        title={<>MİKTAR &<br />PLANLAMA</>}
        subline="TÜKETİM / MİKTAR / PLAN"
        description="Tahmini tüketiminizi ve sipariş ihtiyacınızı belirtin. Miktar ve çalışma koşullarını işletmenizin ihtiyacı üzerinden konuşalım."
        image="/home/rosta-under-hero-photo.jpg"
        imageAlt="ROSTA kahve deneyimi"
        reduceMotion={reduceMotion}
      />
      <ServiceBlock
        index={3}
        label="TOPTAN"
        title={<>TALEP &<br />TEKLİF</>}
        subline="ÜRÜN / KOŞULLAR / SİPARİŞ"
        description="İşletme bilgilerinizi ve talebinizi iletişim formundan gönderin. Ürün, miktar ve teslimat adresi üzerinden güncel fiyat ve sipariş koşullarını netleştirelim."
        image="https://media.base44.com/images/public/6abc5148a8d8f7bdd9a2ee6f/70c0e45c9_generated_e8a15d6f.jpg"
        imageAlt="Kahve barı çalışma alanı"
        reduceMotion={reduceMotion}
      />
      <ServiceBlock
        index={4}
        label="TOPTAN"
        side="right"
        title={<>ROSTA.<br />STUDIO</>}
        subline="KAHVE PROGRAMI / BAR / EKİP"
        description={<>Kahve programı, bar kurulumu, ekipman seçimi ve ekip eğitimi için ROSTA.Studio hizmetlerini keşfedin. Destek kapsamını ve koşullarını ayrıca değerlendirelim.<Link className="business-inline-link wholesale-section-link" href="/studio">STÜDYOYU KEŞFET <StudioArrow /></Link></>}
        image="https://media.base44.com/images/public/6abc5148a8d8f7bdd9a2ee6f/e11718cca_generated_42ef871f.jpg"
        imageAlt="Kahve işletmesi konsepti"
        reduceMotion={reduceMotion}
      />
    </section>
  );
}

function WholesaleQuestions() {
  return (
    <section id="questions" className="wholesale-questions relative px-5 sm:px-8 py-20 sm:py-28" style={{ background: C.cream, color: C.carbon }}>
      <div className="wholesale-meta mb-14 flex items-center justify-between font-mono-tech text-[10px] uppercase tracking-[0.2em]" style={{ color: C.brick }}>
        <span>BÖLÜM / 06</span>
        <span>SIK SORULAN SORULAR</span>
      </div>
      <h2 className="font-display uppercase font-bold leading-[0.9] tracking-tight mb-12" style={{ fontSize: "clamp(3rem, 9vw, 9rem)" }}>AKLINDA<br />KALMASIN.</h2>
      <div className="max-w-5xl">
        {questions.map(({ question, answer, link }, i) => (
          <details key={question} className="wholesale-faq">
            <summary>
              <span aria-hidden="true" className="font-mono-tech wholesale-faq-number">{String(i + 1).padStart(2, "0")}</span>
              <span className="font-display font-bold">{question}</span>
            </summary>
            <div className="wholesale-faq-answer font-body">
              <p>{answer}</p>
              {link ? <Link className="business-inline-link" href={link.href}>{link.label} <StudioArrow /></Link> : null}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

export function ToptanKahveClient() {
  const reduceMotion = usePrefersReducedMotion();

  return (
    <div className="rosta-studio-exact wholesale-page bg-[#111111]">
      <Nav
        reduceMotion={reduceMotion}
        navLinks={navLinks}
        menuLinks={menuLinks}
        wordmark={<>ROSTA / TOPTAN</>}
        drawerTitle="ROSTA / TOPTAN"
        menuLabel="Toptan kahve menüsü"
        footerText="ROSTA · İŞLETMELER İÇİN KAHVE"
      />
      <Hero
        reduceMotion={reduceMotion}
        title="ROSTA Toptan Kahve"
        words={["TOPTAN", "KAHVE"]}
        eyebrow="ROSTA / TOPTAN"
        yearLabel="İŞLETMELER İÇİN"
        subline={<>KAHVE <Brick>/</Brick> İŞLETMEN <Brick>/</Brick> DENEYİM</>}
        description="Kahve seçimini işletmenin ihtiyacıyla buluşturalım. Toptan kahve ve profesyonel destek için ROSTA ekibiyle tanış."
        actionLabel="İHTİYACINI PAYLAŞ"
        actionHref="#contact"
      />
      <section className="wholesale-marquees relative py-14 sm:py-20 grain" aria-label="İşletmeler için kahve">
        <div className="font-display font-bold uppercase leading-[0.9] tracking-tight" style={{ color: C.cream }}>
          <MarqueeRow reduceMotion={reduceMotion} className="text-[12vw] sm:text-[10vw]" items={["İŞLETMEN İÇİN", <Brick key="one">—</Brick>, "DOĞRU KAHVE", <Brick key="two">—</Brick>, "ROSTA", <Brick key="three">—</Brick>]} />
          <MarqueeRow reduceMotion={reduceMotion} direction={1} className="text-[12vw] sm:text-[10vw] mt-4" items={["SEÇİM", <Brick key="four">PLAN</Brick>, "KAHVE", <Brick key="five">DENEYİM</Brick>, "SEÇİM", <Brick key="six">PLAN</Brick>]} />
        </div>
      </section>
      <WhoWeAre
        reduceMotion={reduceMotion}
        firstLine="HER İŞLETMENİN"
        secondLine={<>KAHVE İHTİYACI <Brick>FARKLI.</Brick></>}
        words={["KAHVE.", "PLAN.", "TEKLİF.", "DESTEK."]}
        description="Servis şeklinizi, kullandığınız ekipmanı ve hedeflediğiniz kahve deneyimini paylaşın. Ürün seçimini ve toptan çalışma koşullarını birlikte değerlendirelim."
        label="İŞLETMELER İÇİN"
      />
      <CoffeeSections reduceMotion={reduceMotion} />
      <Process reduceMotion={reduceMotion} stages={stages} sectionNumber="05" heading={<>BİRLİKTE<br />NETLEŞTİRELİM.</>} />
      <WholesaleQuestions />
      <section className="relative py-12 sm:py-16 border-y border-cream/10 grain" aria-label="ROSTA toptan kahve">
        <MarqueeRow reduceMotion={reduceMotion} speed={1.6} className="font-display font-bold uppercase leading-[0.9] text-[7vw] sm:text-[6vw]" items={["ROSTA", <Brick key="seven">/</Brick>, "TOPTAN KAHVE", <Brick key="eight">/</Brick>, "İŞLETMELER İÇİN", <Brick key="nine">/</Brick>]} />
      </section>
      <FinalCTA
        reduceMotion={reduceMotion}
        firstLines={["İŞLETMENİ", "TANIYALIM."]}
        secondLines={["KAHVE", "İHTİYACINI", "KONUŞALIM."]}
        sectionNumber="07"
        brand="ROSTA / TOPTAN KAHVE"
        actionLabel="TEKLİF AL"
        actionHref="/contact#contact-form"
        description="Toptan talebini paylaş. İşletme adını, şehrini, kullanım şeklini ve tahmini ihtiyacını iletişim formundaki mesajına ekleyebilirsin. Ürün, miktar ve teslimat koşullarını teklif üzerinden değerlendirelim."
        secondaryLink={{ label: "ROSTA.STUDIO HİZMETLERİ", href: "/studio" }}
        meta={["ROSTA", "TOPTAN KAHVE", "İŞLETMELER İÇİN"]}
      />
    </div>
  );
}
