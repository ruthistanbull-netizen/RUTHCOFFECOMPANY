alter table public.products add column if not exists information_sections jsonb not null default '[]'::jsonb;
notify pgrst, 'reload schema';
