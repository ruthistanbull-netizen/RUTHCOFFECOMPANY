import { LegalDocument, LegalList } from "@/components/legal/LegalDocument";

export const metadata = {
  title: "Ürün Saklama ve Kullanım",
  description: "ROSTA Coffee Co. ürün saklama ve kullanım bilgileri.",
};

export default function WarrantyCarePage() {
  return <LegalDocument title="Ürün Saklama ve Kullanım" description="Kahve ve diğer ürünler için genel saklama, kullanım ve destek bilgileri." sections={[
    {title:"Kahvenin Saklanması",content:<LegalList><li>Kahveyi serin, kuru ve doğrudan güneş almayan bir yerde saklayın.</li><li>Paketi açtıktan sonra hava ile teması azaltacak şekilde ağzını sıkıca kapatın.</li><li>Ürün etiketindeki son tüketim/tavsiye edilen tüketim ve saklama bilgilerini esas alın.</li></LegalList>},
    {title:"Ürün Bilgileri",content:<p>Ürüne özgü içerik, gramaj, varyant, hazırlama veya kullanım bilgileri ilgili ürün sayfasında ve ürün ambalajında yer alır.</p>},
    {title:"Hasarlı veya Hatalı Ürün",content:<p>Eksik, yanlış veya taşıma sırasında hasar görmüş bir ürün teslim alırsanız sipariş numaranızla iletişim formu üzerinden destek talebi oluşturabilirsiniz.</p>},
    {title:"Kanuni Haklar",content:<p>Bu bilgilendirme tüketicinin ayıplı mala ve mesafeli satışlara ilişkin yürürlükteki kanuni haklarını ortadan kaldırmaz veya sınırlandırmaz.</p>},
  ]} />;
}
