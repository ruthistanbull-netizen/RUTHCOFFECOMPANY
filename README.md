# RUTH Commerce V2 Monorepo

Bu repo Ruth Istanbul storefront ve admin panelini tek GitHub reposunda, iki ayri deploy hedefi olarak tutar. Site ve panel ayni sunucuda calisacak sekilde birlestirilmedi; mevcut uygulama kokleri korunarak monorepo altina tasindi.

## Klasor Yapisi

```txt
RUTH-COMMERCE-V2/
  apps/
    storefront/      # Musterinin gordugu Next.js site, Vercel
    admin/           # Yonetim paneli, Render
  packages/
    contracts/       # Ortak DTO, type ve event sozlesmeleri
    commerce-core/   # Ileride odeme, siparis, stok motorlari
    database/        # Supabase migration ve SQL dosyalari
    ui/              # Gelecekte ortak bilesenler
  package.json
  .gitignore
  README.md
  PDF-ILERLEME-DURUMU.md
```

## Kaynak Arsivler

Bu teslimde kullanilan arsivler:

- `RUTH-ISTANBUL-WEBSITE-PAYTR-TOKEN-3D-SECURE-FIX.zip` -> `apps/storefront`
- `RUTH-ISTANBUL-ADMIN-PANEL-POPUP-SCROLL-DASHBOARD-AUTO-FIX.zip` -> `apps/admin`

Kullanici mesajinda adi gecen `RUTH-ISTANBUL-WEBSITE-VERCEL-main.zip` ve `RUTH-ISTANBUL-S-TE-PANEL--main.zip` dosyalari Downloads klasorunde bulunamadigi icin mevcut yuklenmis FIX arsivleri kullanildi.

## Paket Yoneticisi Karari

Iki uygulamanin `package.json` ve lock dosyalari incelendi. Storefront klasorunde `package-lock.json` ve `pnpm-lock.yaml`, admin klasorunde `package-lock.json` bulunuyor. Render'da Corepack/Yarn ile `packageManager` cakismasi yasanmamasi icin deploy komutlari npm'e sabitlendi; uygulamalar kendi root klasorlerinden bagimsiz calismaya devam eder.

Root komutlari:

```bash
npm run dev:storefront
npm run build:storefront
npm run start:storefront
npm run dev:admin
npm run build:admin
npm run start:admin
```

Uygulamalari ayri ayri calistirma:

```bash
cd apps/storefront
npm install
npm run dev
```

```bash
cd apps/admin
npm install
npm run dev
```

## GitHub'a Yukleme

```bash
git init
git add .
git commit -m "Create Ruth Commerce V2 monorepo baseline"
git branch -M main
git remote add origin <YENI_GITHUB_REPO_URL>
git push -u origin main
```

Yuklemeden once `.env*`, `node_modules`, `.next`, `build`, `dist`, `.git` ve cache klasorlerinin commit edilmedigini kontrol edin.

## Vercel Ayarlari

- Project: storefront icin ayri Vercel projesi
- Root Directory: `apps/storefront`
- Framework Preset: Next.js
- Node.js: `22.x`
- Install Command: `npm ci`
- Build Command: `npm run build`
- Output Directory: bos birak / Next.js default. Buraya repo kokune gore `.next` yazma.
- Start Command: Vercel tarafinda gerekli degil

`apps/storefront/vercel.json` dosyasi Vercel'e npm ile kurulum ve `npm run build` komutunu kullanmasini soyler.

Vercel hatasi `The Next.js output directory ".next" was not found at "/vercel/path0/.next"` gorulurse Vercel projesi repo kokunden build almaya calisiyordur. Project Settings > Root Directory mutlaka `apps/storefront` olmali; Output Directory bos/default kalmali.

Storefront environment degiskenleri Vercel Project Settings > Environment Variables alanina girilecek. Degerler GitHub'a veya ZIP'e eklenmeyecek.

Temel degisken gruplari:

- Supabase public URL ve anon key
- PayTR merchant bilgileri
- Site URL
- Revalidate secret
- Pazarlama/analytics anahtarlari

## Render Ayarlari

- Service: admin panel icin ayri Render Web Service
- Root Directory: `apps/admin`
- Runtime: Node
- Node.js: `22.x`
- Build Command:

```bash
npm ci && npm run build
```

- Start Command:

```bash
npm run start
```

Render hatasi `This project is configured to use npm ... has a "packageManager" field` gorulurse servis repo kokunden veya eski yarn komutuyla build aliyordur. Settings > Root Directory `apps/admin`, Build Command `npm ci && npm run build`, Start Command `npm run start` olmali.

Render servis ekraninda GitHub repo olarak eski website reposu gorunuyorsa panel servisini yeni ortak monorepo reposuna baglayin. Eski repo baglantisi kalirsa Render admin kodu yerine repo kokunu build etmeye calisir.

Admin environment degiskenleri Render Service > Environment alanina girilecek. Degerler GitHub'a veya ZIP'e eklenmeyecek.

Temel degisken gruplari:

- Supabase public URL, anon key ve service role key
- Basit Kargo token/webhook secret
- Website revalidate URL ve secret
- Mail/CRM/cron secret bilgileri
- Storefront/site URL

## Eski Panel Reposundan Ortak Repoya Gecis Sirasi

1. Yeni GitHub reposunu bu monorepo ile olustur.
2. Vercel'de storefront projesinin GitHub kaynagini yeni repoya bagla ve Root Directory alanini `apps/storefront` yap.
3. Vercel environment degiskenlerini eski projeden yeni projeye panelden elle tasi.
4. Render'da admin servisinin GitHub kaynagini yeni repoya bagla ve Root Directory alanini `apps/admin` yap.
5. Render environment degiskenlerini eski servisten yeni servise panelden elle tasi.
6. Once staging/preview deploy kontrolu yap.
7. Storefront ve admin kritik akislari kontrol edildikten sonra domain/production traffic yeni deploylara yonlendirilir.
8. Eski repolar hemen silinmez; geri donus penceresi boyunca read-only arsiv olarak tutulur.

## Geri Donus Plani

Bir sorun cikarsa Vercel ve Render servislerinde GitHub kaynagini veya production deployment'i eski repo/onceki deployment'a geri alin. Environment degiskenleri platformlarda tutuldugu icin kod geri alimi yeterli olmali; domain ve webhook URL degisiklikleri yapildiysa eski URL'ler tekrar etkinlestirilir.

## Dogrulama Notlari

Yapilan yapisal kontroller:

- Iki ZIP acildi ve gercek proje koklerinin arsivlerin en ust seviyesi oldugu dogrulandi.
- Storefront `apps/storefront` altina yerlestirildi.
- Admin `apps/admin` altina yerlestirildi.
- `packages/contracts`, `packages/commerce-core`, `packages/database`, `packages/ui` klasorleri olusturuldu.
- Root `.gitignore`, `package.json`, `README.md`, `PDF-ILERLEME-DURUMU.md` olusturuldu.
- Ic ice `.git` klasoru tespit edilmedi.
- App `package-lock.json` dosyalarindaki ic npm proxy tarball adresleri public `registry.npmjs.org` adreslerine cevrildi.
- Render icin yarn/corepack komutlari npm tabanli komutlarla degistirildi ve root `render.yaml` dosyasina `rootDir: apps/admin` eklendi.
- Storefront icin `apps/storefront/vercel.json` eklendi.

Calistirilan build denemeleri:

- Storefront: `npm.cmd run build --workspaces=false`
- Admin: `npm.cmd run build --workspaces=false`

Bu yerel ortamda ag erisimi kisitli oldugu icin bagimlilik indirme tamamlanamadi. Storefront build denemesi prebuild adiminda Ikas CDN gorsellerini indiremedi ve eksik `sharp` bagimliligi nedeniyle durdu. Admin build denemesi `next` binary bulunamadigi icin durdu. Bu hatalar monorepo klasor tasimasindan degil, yerel bagimlilik/ag kurulumu tamamlanamadigindan kaynaklandi.
