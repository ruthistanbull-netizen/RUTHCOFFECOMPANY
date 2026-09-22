alter table public.email_integrations
  alter column sender_name set default 'ROSTA Coffee Co.';

update public.site_settings
set setting_value = jsonb_set(
      setting_value,
      '{whatsapp}',
      coalesce(setting_value->'whatsapp','{}'::jsonb)
        || '{"enabled":false,"phone":""}'::jsonb,
      true
    ),
    updated_at = now()
where setting_key = 'theme_customizer'
  and (
    coalesce(setting_value->'whatsapp'->>'phone','') = '908503469789'
    or coalesce(setting_value->'whatsapp'->>'enabled','false') = 'true'
  );
