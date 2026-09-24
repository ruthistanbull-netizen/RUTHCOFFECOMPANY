import { PageIntro } from "@/components/PageIntro";
import { FaqAccordion, type FaqItem } from "@/components/faq/FaqAccordion";

export const metadata = {
  title: "S.S.S.",
  description: "ROSTA Coffee Co. sıkça sorulan sorular ve yanıtları.",
};

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Hangi ödeme yöntemlerini kullanabilirim?",
    answer: "Kredi kartı veya banka kartı ile ödemenizi PayTR güvenli ödeme altyapısı üzerinden yapabilirsiniz.",
  },
  {
    question: "Siparişim ne zaman kargoya verilir?",
    answer: "Hazırlık süresi ürüne ve sipariş yoğunluğuna göre değişebilir. Kargoya verildiğinde takip bilgileri siparişinizle ilişkilendirilir.",
  },
  {
    question: "Kargo ücretsiz mi?",
    answer: "2.000 TL ve üzerindeki siparişlerde kargo ücretsizdir. Daha düşük tutarlı siparişlerde güncel kargo bedeli ödeme adımında gösterilir.",
  },
  {
    question: "Kahve ürünlerinde kavrum ve ürün bilgilerini nereden görebilirim?",
    answer: "Ürüne ait güncel içerik, varyant ve kullanım bilgileri ürün detay sayfasında gösterilir.",
  },
  {
    question: "ROSTA Points nedir?",
    answer: "Üye hesabınızla alışveriş yaptıkça ROSTA Points kazanabilir ve kullanılabilir bakiyenizi ödeme adımında indirime dönüştürebilirsiniz.",
  },
  {
    question: "Siparişimi nasıl takip edebilirim?",
    answer: "Sipariş Takip sayfasında sipariş numaranız ile siparişte kullandığınız e-posta adresi veya telefon numarasını girerek güncel durumu görebilirsiniz.",
  },
  {
    question: "İade veya değişim talebi nasıl oluşturabilirim?",
    answer: "İletişim formu üzerinden sipariş numaranızı belirterek talep oluşturabilirsiniz. Ürünün niteliğine ve yürürlükteki tüketici mevzuatına göre süreç tarafınıza bildirilir.",
  },
  {
    question: "Toptan satış veya profesyonel kahve desteği için nasıl ulaşabilirim?",
    answer: "İletişim sayfasındaki form üzerinden işletme bilgilerinizi ve ihtiyacınızı paylaşabilirsiniz.",
  },
];

export default function FaqPage() {
  return (
    <main className="min-h-screen bg-carbon px-4 pb-24 pt-32 text-cream md:px-8">
      <div className="mx-auto max-w-5xl">
        <PageIntro
          eyebrow="ROSTA Coffee Co."
          title="S.S.S."
          description="Sipariş, ödeme, kargo, ROSTA Points ve ürünlerle ilgili en çok sorulan sorular."
          align="left"
          className="mb-12"
        />
        <FaqAccordion items={FAQ_ITEMS} />
      </div>
    </main>
  );
}
