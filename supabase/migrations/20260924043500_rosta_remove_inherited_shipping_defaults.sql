-- Remove Ruth Istanbul commercial shipping defaults from ROSTA.
-- Only exact inherited bootstrap values are cleared; any merchant-edited ROSTA
-- shipping configuration is preserved.

update public.site_settings
set setting_value = '{}'::jsonb,
    updated_at = now()
where setting_key = 'shipping_settings'
  and setting_value @> '{"freeShippingThreshold":2000,"customerShippingFee":79.9}'::jsonb;

update public.site_settings
set setting_value = jsonb_set(
      jsonb_set(
        jsonb_set(setting_value, '{announcement,text}', '""'::jsonb, true),
        '{announcement,text2}', '""'::jsonb, true
      ),
      '{announcement,enabled}', 'false'::jsonb, true
    ),
    updated_at = now()
where setting_key = 'theme_customizer'
  and setting_value #>> '{announcement,text}' = '2000 TL ve üzeri alışverişlerde ücretsiz kargo ✦';
