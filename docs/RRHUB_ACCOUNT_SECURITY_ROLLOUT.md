# RR HUB personel hesabı silme ve yetki geçişi

Durum: kod ve izole testler hazır; production'a uygulanmadı. Web Watch'a dokunulmaz. `/api/account` web ve iOS için mevcut ortak işlem sahibidir. Yeni silme servisi yalnız bu route'un DELETE metodundan çağrılır.

## Davranış ve kapsam

- Her markada yalnız o marka oturumuyla doğrulanan kendi hesap silinir. Gövdedeki user/profile/email hedefleri kullanılmaz. Worker hesabı bu işlemden men edilir.
- Mevcut şifre doğrulanır. Geçici doğrulama istemcisi, ortak service-role istemcisinin oturumunu değiştiremez. Canonical `claim_public_action_rate` ile 15 dakikada beş deneme sınırı uygulanır; servis hatasında erişim açılmaz.
- Tek PostgreSQL transaction'ı profil, Auth kimliği, kişisel sohbet/hafıza, ses profili, bildirim aboneliği ve adresleri temizler. Auth oturumları ve eski session_id'siz refresh token'lar da kaldırılır. Sipariş/ürün/mali işletme kayıtları silinmez; aktör bağları SET NULL ile ayrılır.
- Son yönetici de kendi hesabını silebilir. iOS, bu durumda işletme yönetim erişimi kalmayacağını silmeden önce açıklar. Başka hesap veya diğer marka otomatik silinmez.
- Bilinmeyen CASCADE/RESTRICT ilişki ya da kullanıcıya ait Storage nesnesi bulunursa transaction hiçbir silme yapmadan reddedilir. Bu bir tamamlandı yanıtı değildir; staging'de gerçek şema/Storage envanteri çözülmeden yayın yapılmamalı. Bu sunucuların gerçek ilişkileri ve saklama politikaları henüz doğrulanmadı.
- Her yetkili panel okuma/yazması güncel Auth `app_metadata`, ban durumu ve profil rolünü tekrar kontrol eder. Kullanıcı tarafından değiştirilebilir `user_metadata`, eski JWT, continuity veya profil cache'i güncel yetki kaynağı olamaz. Auth/profil servisi kesintisinde erişim kapalı kalır. In-flight aynı REST okuması mevcut transport tarafından paylaşılabilir; kalıcı yetki cache'i eklenmedi.
- Owner/admin panel işlemlerine erişir; diğer roller belirlenen alanlarla sınırlıdır. Viewer ürün/kategori/koleksiyon/stok/dashboard okur; yazamaz. Finance, otomasyon, anahtar/entegrasyon ve AI gibi ayrı izin gerektiren alanlar owner/admin dışında varsayılan kapalıdır. Daha önce örtük açık olan bir yetkiyi sürdürmek için kullanıcı metadata'sına güvenilmez.
- Kendi profilini düzenlemek rol değiştirmez; başkasının hesabını yalnız owner yönetir. Başka owner değiştirilemez, yeni owner bu API ile atanamaz. Personel dizini owner dışına açılmaz. Ruth yeni kullanıcı oluştururken e-posta eşleşmesiyle mevcut profili devralmaz.

## Production öncesi sıralama

1. Ayrı self-host Ruth ve ROSTA DB/Storage yedekleri ve staging kopyaları alınır. Eski hosted projeye uygulanmaz. Önce mevcut linked admin kimlikleri, ilişkiler, kişisel veri tabloları ve Storage sahipliği incelenir:

```sql
select p.id as profile_id, p.auth_user_id, p.email, u.raw_app_meta_data
from public.profiles p join auth.users u on u.id=p.auth_user_id
where p.role='admin' order by p.created_at;

select n.nspname, c.relname, a.attname, fk.confdeltype
from pg_constraint fk join pg_class c on c.oid=fk.conrelid
join pg_namespace n on n.oid=c.relnamespace
join pg_attribute a on a.attrelid=c.oid and a.attnum=fk.conkey[1]
where fk.contype='f' and fk.confrelid in ('public.profiles'::regclass,'auth.users'::regclass);
```

2. Her markanın mevcut personeli için onaylı `[{"auth_user_id":"<gerçek UUID>","panel_role":"owner|admin|operations|support|marketing|viewer","panel_status":"active|disabled"}]` haritası hazırlanır. Sahip kaydı e-posta, kayıt sırası veya `user_metadata`'dan otomatik çıkarılmaz. **En az bir doğrulanmış aktif owner dahil edilir; mevcut bütün personelin yetkisi açıkça incelenir.** Gerçek UUID/secret değerleri repoya konmaz.
3. `apps/admin` içinde `PANEL_SUPABASE_URL` ve `SUPABASE_SERVICE_ROLE_KEY` yalnız sunucu ortamında verilerek `node scripts/set-panel-roles.mjs /güvenli/yol/roles.json` kuru çalıştırılır. Açık production onayı sonrası `--apply` ile yazılır ve geri okuma doğrulanır. İşlem kısmi başarısız olursa deploy yapılmaz; raporlanan kimlik uzlaştırılır. `user_metadata` değerleri taşınmaz.
4. `supabase/migrations/*_panel_self_account_deletion.sql` staging'de gerçek Auth sürümü ve bütün migration'larla test edilir. RPC'nin yalnız service_role tarafından çağrılabildiği, anahtar/şifrenin istemciye çıkmadığı, ilgili kişisel tablo envanterinin tam olduğu doğrulanır. Supabase advisors staging'de çalıştırılır; bu ortamdan gerçek DB advisors çalıştırılmadı.
5. Yeni API önce staging'de gerçek disposable personelle sınanır: create/login/read, owner/self kontrolleri, rol düşürme, disable, JWT tekrar kullanımı, silme, tekrar giriş başarısızlığı, kişisel verinin kalkması, diğer kullanıcı/marka ve sipariş/finans verilerinin korunması. Çalışan mevcut kullanıcıların taşınması doğrulanmadan auth değişikliği production'a çıkarılmaz.
6. Root AGENTS.md §11 gereği açık onaydan sonra reviewed role mapping + migration uygulanır; aynı değişiklik setinin backend deploy'u yapılır, ardından native build yayın adayı oluşturulur. iOS'un DELETE butonu eski API'de başarılı sayılmaz; backend ve migration bağımlılığı release engelidir. Reviewer hesabını kullanıcı panelden oluşturacak.

## Test kanıtı ve sınırı

`apps/admin/tests/panel-security.test.cjs`: gerçek TypeScript modülleri transpile edilerek denetimli Auth/DB istemci yanıtlarıyla rol, stale JWT, profil revocation, outage ve self-delete yetkileri test edilir.

`apps/admin/tests/panel-account-deletion.test.cjs`: gerçek migration SQL'i PGlite PostgreSQL motorunda çalıştırılır; gerçek servis bağlantısı değildir. İzole fixture Auth FK'ları, transaction rollback, Storage guard, kişisel temizleme ve işletme korunması içerir. Bu testler production Supabase/Storage smoke'unun yerine geçmez.

Bağımlılıkları uygulamanın üretim paketini değiştirmeden izole kurmak için:

```sh
npm install --prefix /tmp/rrhub-security-tests --no-save @electric-sql/pglite@0.3.14 typescript@5.9.3
NODE_PATH=/tmp/rrhub-security-tests/node_modules node --test apps/admin/tests/panel-security.test.cjs apps/admin/tests/panel-account-deletion.test.cjs
```

Native tarafta parola/token kalıcı kaydedilmez. Başarılı silmeden sonra yerel yüz kaydı, paylaşım izni, ekran/HTTP cache'i ve kayıtlı oturumlar kaldırılır. Gerçek iPhone testi hâlâ gereklidir.

## Geri dönüş

Backend deploy sorununda uygulama güncellemesi dağıtılmaz. Önceki backend commit'ine dönüş ve önceden güvenli olarak kaydedilmiş server-owned metadata'nın geri yüklenmesi planlanır. RPC kullanımı durdurulabilir; fonksiyonları geri almak silinen hesapları geri getirmez. Silme işlemleri kullanıcı tarafından istenen kalıcı işlemdir; rutin rollback gerekçesiyle silinen kişisel veriler yeniden canlandırılmaz. Yedeklerin erişimi/saklama süresi işletme politikasıyla yönetilir.
