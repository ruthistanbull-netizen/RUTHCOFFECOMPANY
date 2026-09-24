-- ROSTA bootstrap data and media storage.
-- storefront_product_read_models RLS is intentionally NOT changed here.
-- It needs an explicit read/write policy decision before enabling RLS.

insert into storage.buckets (id,name,public,allowed_mime_types)
values (
  'rosta-media',
  'rosta-media',
  true,
  array['image/jpeg','image/png','image/webp','image/avif','video/mp4','video/webm','video/quicktime']
)
on conflict (id) do update
set public=excluded.public,
    allowed_mime_types=excluded.allowed_mime_types;

insert into public.site_settings (setting_key, setting_value, is_public, updated_at)
values
(
  'theme_customizer',
  '{
    "announcement":{"enabled":false,"text":"","text2":"","href":"/products","intervalSeconds":5},
    "logo":{"src":"/rosta-coffee-co.svg","desktopWidth":180,"mobileWidth":120},
    "colors":{"ivory":"#F4F0E8","cream":"#F4F0E8","ink":"#111111","gold":"#B9563D","goldDark":"#2B1B16","muted":"#6F725B"},
    "header":{"links":[
      {"id":"home","label":"Anasayfa","path":"/","side":"left","children":[]},
      {"id":"products","label":"Tüm Ürünler","path":"/products","side":"left","children":[]},
      {"id":"categories","label":"Kategoriler","path":"/categories","side":"left","children":[]},
      {"id":"collections","label":"Koleksiyonlar","path":"/collections","side":"right","children":[]},
      {"id":"tracking","label":"Sipariş Takip","path":"/siparis-takip","side":"right","children":[]},
      {"id":"contact","label":"İletişim","path":"/contact","side":"right","children":[]}
    ]},
    "whatsapp":{"enabled":false,"phone":"","label":"WhatsApp"},
    "homepageImages":{
      "heroImage":"",
      "heroDesktopImage":"",
      "heroMobileImage":"",
      "editorialVideo":"/home/rosta-under-hero-video.mp4",
      "editorialImage":"/home/rosta-under-hero-photo.jpg",
      "scrollImages":["/home/rosta-hero-current.webp","/home/rosta-espresso.webp","/home/rosta-hero-v4.webp","/home/rosta-under-hero-photo.jpg","/home/rosta-under-hero-v4.jpg","/home/rosta-hero.webp"]
    },
    "editor":{"pages":{}}
  }'::jsonb,
  true,
  now()
),
(
  'theme_sections',
  '{"pages":{"/":{"path":"/","label":"Ana Sayfa","sections":[
    {"id":"home-hero","type":"hero","enabled":true},
    {"id":"home-scroll-story","type":"scroll-story","enabled":true},
    {"id":"home-collections","type":"collections","enabled":true},
    {"id":"home-featured-products","type":"featured-products","enabled":true},
    {"id":"home-brand-story","type":"brand-story","enabled":true},
    {"id":"home-trust","type":"trust","enabled":true}
  ]}}}'::jsonb,
  true,
  now()
),
(
  'discount_campaigns',
  '{"discounts":[],"coupons":[],"campaigns":[]}'::jsonb,
  true,
  now()
)
on conflict (setting_key) do nothing;
