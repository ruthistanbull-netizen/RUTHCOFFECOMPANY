import { LegalDocument, LegalList } from "@/components/legal/LegalDocument";

export const metadata = {
  title: "Gizlilik Politikası",
  description: "ROSTA Coffee Co. gizlilik ve veri güvenliği politikası.",
};

export default function PrivacyPage() {
  return <LegalDocument title="Gizlilik Politikası" description="Web sitesi, üyelik, sipariş ve destek süreçlerinde gizliliğin nasıl korunduğunu açıklar." sections={[
    {title:"Toplanan Bilgiler",content:<LegalList><li>Kimlik ve iletişim bilgileri: ad soyad, e-posta, telefon, adres.</li><li>Üyelik ve tercih bilgileri: doğum tarihi, ROSTA Points hareketleri, ticari ileti tercihleri.</li><li>Sipariş ve işlem bilgileri: ürünler, tutarlar, kargo, iade/değişim ve müşteri notları.</li><li>Teknik bilgiler: IP, cihaz, tarayıcı, çerezler, trafik ve güvenlik kayıtları.</li></LegalList>},
    {title:"Kullanım Amaçları",content:<LegalList><li>Üyelik, sipariş, ödeme, teslimat, iade/değişim ve destek süreçlerini yürütmek.</li><li>Dolandırıcılığı önlemek, sistem ve hesap güvenliğini sağlamak.</li><li>Kanuni yükümlülükleri yerine getirmek ve uyuşmazlıkları yönetmek.</li><li>Açık tercih verilmişse kampanya ve indirim iletişimi yapmak.</li><li>Çerez tercihlerine göre performans, ölçüm ve reklam çalışmalarını yürütmek.</li></LegalList>},
    {title:"Hizmet Sağlayıcılar",content:<p>Veriler; ödeme, teslimat, barındırma/veritabanı, e-posta ve izin verilen ölçüm hizmetlerine yalnızca gerekli kapsamda aktarılabilir. Yurt dışı aktarım söz konusu olduğunda yürürlükteki KVKK hükümleri ve uygun güvenceler uygulanır.</p>},
    {title:"Çerezler ve Ölçüm",content:<p>Site; zorunlu oturum ve sepet çerezleri ile kullanıcı tercihine bağlı ölçüm ve reklam araçlarını kullanabilir. Zorunlu olmayan çerezlerde kullanıcı tercihi esas alınır.</p>},
    {title:"Güvenlik ve Saklama",content:<p>Veriler yetkisiz erişime karşı teknik ve idari tedbirlerle korunur; yalnızca işleme amacı ve ilgili mevzuat için gerekli süre boyunca saklanır.</p>},
    {title:"İletişim",content:<p>Gizlilik ve kişisel veri talepleri için güncel iletişim kanallarını <a className="underline" href="/contact">İletişim</a> sayfasından kullanabilirsiniz.</p>},
  ]} />;
}
