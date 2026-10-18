-- Tonix · 2026-10-18
-- Монета в панели казны: своя картинка монеты DAO (PNG/WebP с прозрачным фоном).
-- Выполнить один раз в Supabase → SQL Editor. Повторный запуск безопасен.
-- Права не меняются: менять настройки DAO может тот же, кто и раньше.

alter table public.dao_settings
  add column if not exists treasury_coin_url text;

-- Откат (если понадобится):
-- alter table public.dao_settings drop column if exists treasury_coin_url;
