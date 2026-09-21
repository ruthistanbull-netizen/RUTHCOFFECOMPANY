import { LegalDocument, LegalList } from "@/components/legal/LegalDocument";
export const metadata={title:"Elektronik Ticari İleti Onay Metni",description:"Kampanya ve indirim e-postaları için ticari ileti onayı."};
export default function CommercialConsentPage(){return <LegalDocument title="Elektronik Ticari İleti Onay Metni" description="Ruth Istanbul kampanya ve indirim iletişimi için isteğe bağlı onay metni." sections={[
 {title:"Onayın Kapsamı",content:<p>Bu seçeneği işaretlemeniz halinde Görkem Çirik – Ruth Istanbul tarafından ürün, kampanya, indirim, avantaj, anket ve benzeri ticari içerikli iletilerin verdiğiniz e-posta adresine gönderilmesine onay vermiş olursunuz.</p>},
 {title:"İsteğe Bağlılık",content:<p>Ticari ileti onayı hesap oluşturmanın veya alışveriş yapmanın şartı değildir. Onay kutusu önceden işaretli değildir ve yalnızca sizin seçiminizle etkinleşir.</p>},
 {title:"İzin Kaydı",content:<LegalList><li>Onay tarihi, kanal, sürüm ve teknik işlem kaydı saklanabilir.</li><li>İletilerde Ruth Istanbul’un tanıtıcı bilgileri ve ret imkânı bulunur.</li><li>Hizmetin yürütülmesi için gerekli sipariş, ödeme, kargo ve güvenlik bildirimleri ticari pazarlama iletisi değildir.</li></LegalList>},
 {title:"Onayı Geri Alma",content:<p>Onayınızı e-postalardaki abonelikten çıkma bağlantısı, hesabınızdaki tercih alanı veya ruthistanbull@gmail.com üzerinden dilediğiniz zaman geri alabilirsiniz. Ret bildiriminiz mevzuatta öngörülen süre içinde uygulanır.</p>}
 ]}/>}
