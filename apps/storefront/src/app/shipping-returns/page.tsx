import { LegalDocument, LegalList } from "@/components/legal/LegalDocument";

export const metadata = { title: "Kargo, İade ve Değişim", description: "Ruth Istanbul kargo, cayma, iade ve değişim koşulları." };

export default function ShippingReturnsPage() {
  return <LegalDocument title="Kargo, İade ve Değişim" description="Teslimat, cayma hakkı, iade ve değişim süreçlerine ilişkin bilgilendirme." sections={[
    { title: "Kargo ve Teslimat", content: <>
      <LegalList>
        <li>Siparişler üretim ve hazırlık sürecine bağlı olarak 3–5 iş günü içinde kargoya teslim edilir.</li>
        <li>2.000 TL ve üzeri siparişlerde kargo ücretsizdir.</li>
        <li>Gönderimler siparişin niteliğine ve teslimat bölgesine göre Sürat Kargo veya HepsiJet ile yapılabilir.</li>
        <li>Kargo firması ve takip numarası oluşturulduğunda sipariş takip sayfası ve müşteri hesabında gösterilir.</li>
      </LegalList>
      <p>Mücbir sebep, yoğun kampanya dönemi, resmi tatil veya taşıyıcı kaynaklı gecikmelerde müşteri bilgilendirilir.</p>
    </>},
    { title: "14 Günlük Cayma Hakkı", content: <>
      <p>Tüketici, ürünü teslim aldığı tarihten itibaren 14 gün içinde herhangi bir gerekçe göstermeksizin cayma hakkını kullanabilir. Talep; ruthistanbull@gmail.com, iletişim formu veya WhatsApp destek hattı üzerinden sipariş numarası belirtilerek iletilebilir.</p>
      <p>Cayma bildiriminin süresinde yapılması yeterlidir. Ürün, bildirimin ardından yönlendirilen gönderim yöntemiyle iade adresine gönderilmelidir. Ruth Istanbul’un bildirdiği yöntem kullanıldığında iade kargo ücreti Ruth Istanbul tarafından karşılanır.</p>
      <p>Ürün yalnızca niteliğini, özelliklerini ve işleyişini anlamak için gerekli ölçüde incelenmelidir. Bu sınırı aşan kullanımdan doğan değer azalmasından tüketici sorumlu olabilir.</p>
    </>},
    { title: "İade Bedelinin Ödenmesi", content: <>
      <p>Cayma bildirimi ulaştıktan sonra bedel iadesi yürürlükteki mevzuatta öngörülen süre içinde, satın alırken kullanılan ödeme aracına uygun şekilde yapılır. Ürün teslim alınana veya gönderildiğine ilişkin belge sunulana kadar iade işlemi bekletilebilir.</p>
      <p>Ürünün ayıplı, yanlış veya eksik gönderilmesi halinde tüketicinin kanuni seçimlik hakları saklıdır.</p>
    </>},
    { title: "30 Günlük Değişim Hakkı", content: <>
      <p>Ruth Istanbul, kanuni cayma hakkına ek olarak kullanılmamış ve yeniden satışa uygun ürünlerde teslimden itibaren 30 gün içinde değişim imkânı sunar. Değişim stok durumuna bağlıdır.</p>
      <p>Fiyat farkı bulunan değişimlerde fark tahsil edilir veya iade edilir. Kampanyalı/set ürünlerinde değişim, kampanya bütünlüğü dikkate alınarak değerlendirilir.</p>
    </>},
    { title: "45 Günlük Garanti", content: <>
      <p>Ruth Istanbul ürünleri teslim tarihinden itibaren 45 gün süreyle ticari garanti kapsamında değerlendirilir. Altın kaplama ürünlerde olağan kullanımda solma benzeri bir durum oluşması halinde ürün incelemeye alınır; inceleme sonucuna göre ücretsiz değişim veya uygun çözüm sunulur.</p>
      <p>Kimyasal temas, darbe, kopma, ezilme, yanlış kullanım ve kullanım talimatlarına aykırı işlemler garanti değerlendirmesinde dikkate alınır. Bu ticari garanti, tüketicinin ayıplı mala ilişkin kanuni haklarını ortadan kaldırmaz.</p>
    </>},
    { title: "İade ve Değişim Adresi", content: <>
      <p><strong>Ruth Istanbul</strong><br/>Vatan Mahallesi, Küçük Sokak No: 2 Daire: 1, Bayrampaşa / İstanbul</p>
      <p>Gönderimden önce destek ekibinden güncel kargo kodu ve yönlendirme alınmalıdır.</p>
    </>},
  ]} />;
}
