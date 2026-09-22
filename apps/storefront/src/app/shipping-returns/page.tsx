import { LegalDocument, LegalList } from "@/components/legal/LegalDocument";

export const metadata = {
  title: "Kargo, İade ve Değişim",
  description: "ROSTA Coffee Co. kargo, cayma, iade ve değişim koşulları.",
};

export default function ShippingReturnsPage() {
  return <LegalDocument
    title="Kargo, İade ve Değişim"
    description="Teslimat, cayma hakkı, iade ve değişim süreçlerine ilişkin bilgilendirme."
    sections={[
      {
        title: "Kargo ve Teslimat",
        content: <>
          <LegalList>
            <li>Siparişler ürün ve hazırlık durumuna göre kargoya teslim edilir.</li>
            <li>2.000 TL ve üzeri siparişlerde kargo ücretsizdir.</li>
            <li>Kargo firması ve takip numarası oluşturulduğunda sipariş takip ekranında gösterilir.</li>
          </LegalList>
          <p>Mücbir sebep, yoğun kampanya dönemi, resmi tatil veya taşıyıcı kaynaklı gecikmelerde süreç güncel sipariş bilgileri üzerinden takip edilir.</p>
        </>,
      },
      {
        title: "Cayma ve İade",
        content: <>
          <p>İade veya cayma talebinizi teslimat sonrasında yürürlükteki tüketici mevzuatının izin verdiği süre ve koşullar içinde iletişim formu üzerinden sipariş numaranızla iletebilirsiniz.</p>
          <p>Gıda niteliğindeki, ambalajı açılmış veya mevzuatta cayma hakkı istisnası kapsamında değerlendirilen ürünlerde farklı koşullar uygulanabilir. Talep ürünün niteliğine göre değerlendirilir.</p>
        </>,
      },
      {
        title: "İade Bedeli",
        content: <>
          <p>Onaylanan iadelerde ödeme, satın alırken kullanılan ödeme aracına uygun şekilde ve yürürlükteki mevzuata göre gerçekleştirilir.</p>
          <p>Ayıplı, yanlış veya eksik gönderilen ürünlerde tüketicinin kanuni hakları saklıdır.</p>
        </>,
      },
      {
        title: "Değişim",
        content: <p>Değişim uygunluğu; ürünün niteliği, ambalaj durumu, stok ve yeniden satışa uygunluk koşullarına göre değerlendirilir. Talep oluşturmadan önce iletişim formu üzerinden destek alınmalıdır.</p>,
      },
      {
        title: "İade ve Değişim Gönderimi",
        content: <p>Ürünleri herhangi bir adrese doğrudan göndermeden önce iletişim formu üzerinden sipariş numaranızla talep oluşturun. Güncel gönderim yönlendirmesi destek ekibi tarafından paylaşılır.</p>,
      },
    ]}
  />;
}
