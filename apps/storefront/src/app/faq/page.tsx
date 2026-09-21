import { PageIntro } from "@/components/PageIntro";
import { FaqAccordion, type FaqItem } from "@/components/faq/FaqAccordion";

export const metadata = {
  title: "S.S.S.",
  description: "Ruth Istanbul sıkça sorulan sorular ve yanıtları.",
};

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Hangi ödeme yöntemlerini kullanabilirim?",
    answer: "Kredi kartı veya banka kartı ile ödemenizi PayTR güvenli ödeme altyapısı üzerinden yapabilirsiniz.",
  },
  {
    question: "Siparişim ne zaman elime ulaşır?",
    answer: "Ürünlerimiz sipariş üzerine hazırlandığı için siparişler 3–5 iş günü içinde kargoya teslim edilir. Kargoya verildikten sonra takip bilgileriniz sizinle paylaşılır.",
  },
  {
    question: "Mücevherlerimi nasıl saklayabilirim?",
    answer: "Takılarınızı kullanmadığınız zamanlarda kutusunda veya pamuklu bir kesede, kuru ve güneş görmeyen bir yerde saklamanızı öneririz. Spor, duş ve uyku öncesinde çıkarmak ürünün ömrünü uzatır.",
  },
  {
    question: "Kargo ücretsiz mi?",
    answer: "2.000 TL ve üzerindeki siparişlerde kargo ücretsizdir. Daha düşük tutarlı siparişlerde güncel kargo bedeli ödeme adımında gösterilir.",
  },
  {
    question: "Hangi kargo firmalarıyla gönderim yapıyorsunuz?",
    answer: "Siparişler Sürat Kargo veya HepsiJet ile gönderilir. Siparişinize atanan firma ve takip numarası hesabınızda ve sipariş takip alanında görüntülenir.",
  },
  {
    question: "İade ve değişim süresi nedir?",
    answer: "Teslimden itibaren 14 gün içinde cayma ve iade, 30 gün içinde değişim talebinde bulunabilirsiniz. Ürünün kullanılmamış, zarar görmemiş ve yeniden satışa uygun olması gerekir.",
  },
  {
    question: "Ürünlerin garanti süresi var mı?",
    answer: "Ruth Istanbul ürünleri teslim tarihinden itibaren 45 gün garanti kapsamındadır. Ürün incelemesinden sonra üretim veya kaplama kaynaklı uygun talepler ücretsiz şekilde sonuçlandırılır.",
  },
  {
    question: "İade kargo ücretini kim karşılar?",
    answer: "Usulüne uygun iade ve değişim gönderilerinde kargo ücreti Ruth Istanbul tarafından karşılanır. Gönderim öncesinde destek ekibimizden yönlendirme alınmalıdır.",
  },
  {
    question: "Siparişimi nasıl takip edebilirim?",
    answer: "Sipariş Takip sayfasında sipariş numaranız ile siparişte kullandığınız e-posta adresi veya telefon numarasını girerek güncel durumu görebilirsiniz.",
  },
  {
    question: "Takılar su, parfüm veya kimyasallarla temas edebilir mi?",
    answer: "Kaplamanın ve yüzeyin daha uzun süre korunması için takılarınızı su, parfüm, krem, temizlik malzemeleri ve yoğun terlemeden uzak tutmanızı öneririz.",
  },
];

export default function FaqPage() {
  return (
    <main className="min-h-screen bg-ivory px-4 pb-24 pt-32 md:px-8">
      <div className="mx-auto max-w-5xl">
        <PageIntro
          eyebrow="Ruth Istanbul"
          title="S.S.S."
          description="Sipariş, ödeme, kargo, iade, garanti ve ürün kullanımıyla ilgili en çok sorulan sorular."
          align="left"
          className="mb-12"
        />
        <FaqAccordion items={FAQ_ITEMS} />
      </div>
    </main>
  );
}
