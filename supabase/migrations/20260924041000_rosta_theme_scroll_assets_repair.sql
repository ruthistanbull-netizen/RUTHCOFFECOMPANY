-- Repair only the legacy bootstrap ScrollStory asset list.
-- Custom merchant-configured scroll images are intentionally left untouched.

update public.site_settings
set setting_value = jsonb_set(
      setting_value,
      '{homepageImages,scrollImages}',
      '["/home/rosta-hero-current.webp","/home/rosta-espresso.webp","/home/rosta-hero-v4.webp","/home/rosta-under-hero-photo.jpg","/home/rosta-under-hero-v4.jpg","/home/rosta-hero.webp"]'::jsonb,
      true
    ),
    updated_at = now()
where setting_key = 'theme_customizer'
  and setting_value #> '{homepageImages,scrollImages}'
      = '["/scroll-product-1.png","/scroll-product-2.png","/scroll-product-3.png","/scroll-product-4.png","/scroll-product-5.png","/scroll-product-6.png"]'::jsonb;
