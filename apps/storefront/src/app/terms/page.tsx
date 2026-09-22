import { LegalDocument, LegalList } from "@/components/legal/LegalDocument";

export const metadata = {
  title: "Kullanım Şartları",
  description: "ROSTA Coffee Co. web sitesi üyelik ve kullanım şartları.",
};

export default function TermsPage() {
  return <LegalDocument title="Kullanım Şartları" description="Web sitesi ve üyelik hizmetlerinin kullanımına ilişkin esaslar." sections={[
    {title:"Taraflar ve Kapsam",content:<p>Bu site Görkem Çirik tarafından ROSTA Coffee Co. markasıyla işletilir. Siteyi kullanan veya hesap oluşturan kişi bu şartları okuduğunu kabul eder. Tüketicinin emredici kanuni hakları saklıdır.</p>},
    {title:"Üyelik",content:<LegalList><li>Kullanıcı doğru, güncel ve kendisine ait bilgi vermelidir.</li><li>Şifre ve hesap güvenliği kullanıcı sorumluluğundadır; yetkisiz kullanım derhal bildirilmelidir.</li><li>Doğum tarihi, ROSTA Points doğum günü ödülü için bir kez kaydedilebilir; değişiklik destek doğrulamasına tabi olabilir.</li><li>Kampanya ileti izni üyelik için zorunlu değildir ve geri alınabilir.</li></LegalList>},
    {title:"Ürün, Fiyat ve Stok",content:<p>Ürün görselleri ekran ve ışık koşullarına göre küçük renk farklılıkları gösterebilir. Açık hata, teknik arıza veya stok uyuşmazlığında müşteri bilgilendirilir; tahsil edilmiş tutar mevzuata uygun şekilde iade edilir. Sipariş, ödeme onayı ve stok doğrulamasıyla kesinleşir.</p>},
    {title:"Fikri Mülkiyet",content:<p>ROSTA Coffee Co. adı, logo, metin, fotoğraf, tasarım ve site içerikleri üzerindeki haklar saklıdır. Yazılı izin olmadan ticari amaçla kopyalanamaz, çoğaltılamaz veya kullanılamaz.</p>},
    {title:"Yasak Kullanımlar",content:<p>Siteye zarar vermek, yetkisiz erişim denemek, sahte hesap oluşturmak, ROSTA Points/indirim sistemini kötüye kullanmak veya üçüncü kişilerin haklarını ihlal etmek yasaktır.</p>},
    {title:"Değişiklikler ve Uyuşmazlık",content:<p>Şartlar mevzuat ve hizmet değişikliklerine göre güncellenebilir. Tüketici uyuşmazlıklarında yürürlükteki mevzuat uyarınca yetkili mercilere başvurulabilir.</p>},
  ]} />;
}
