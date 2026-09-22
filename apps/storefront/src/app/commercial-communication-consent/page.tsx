import { LegalDocument, LegalList } from "@/components/legal/LegalDocument";

export const metadata = {
  title: "Elektronik Ticari İleti Onay Metni",
  description: "ROSTA Coffee Co. kampanya ve indirim iletişimi için isteğe bağlı onay metni.",
};

export default function CommercialConsentPage() {
  return <LegalDocument title="Elektronik Ticari İleti Onay Metni" description="ROSTA Coffee Co. kampanya ve indirim iletişimi için isteğe bağlı onay metni." sections={[
    {title:"Onayın Kapsamı",content:<p>Bu seçeneği işaretlemeniz halinde Görkem Çirik – ROSTA Coffee Co. tarafından ürün, kampanya, indirim, avantaj, anket ve benzeri ticari içerikli iletilerin verdiğiniz iletişim kanalına gönderilmesine onay vermiş olursunuz.</p>},
    {title:"İsteğe Bağlılık",content:<p>Ticari ileti onayı hesap oluşturmanın veya alışveriş yapmanın şartı değildir. Onay kutusu önceden işaretli değildir ve yalnızca sizin seçiminizle etkinleşir.</p>},
    {title:"İzin Kaydı",content:<LegalList><li>Onay tarihi, kanal, sürüm ve teknik işlem kaydı saklanabilir.</li><li>İletilerde ROSTA Coffee Co. tanıtıcı bilgileri ve ret imkânı bulunur.</li><li>Hizmetin yürütülmesi için gerekli sipariş, ödeme, kargo ve güvenlik bildirimleri ticari pazarlama iletisi değildir.</li></LegalList>},
    {title:"Onayı Geri Alma",content:<p>Onayınızı e-postalardaki abonelikten çıkma bağlantısı, hesabınızdaki tercih alanı veya <a className="underline" href="/contact">İletişim</a> sayfasındaki güncel kanallar üzerinden geri alabilirsiniz.</p>},
  ]} />;
}
