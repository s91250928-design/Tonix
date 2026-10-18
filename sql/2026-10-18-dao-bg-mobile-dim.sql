-- Tonix · 2026-10-18
-- Оформление DAO: отдельный фон для телефона и сила затемнения фона.
-- Выполнить один раз в Supabase → SQL Editor. Повторный запуск безопасен.
-- Права (кто может менять настройки DAO) не меняются: действуют прежние правила таблицы.

alter table public.dao_settings
  add column if not exists bg_mobile_url text,
  add column if not exists bg_dim real;

-- Затемнение — число от 0 (фон как есть) до 0.9 (почти не виден).
alter table public.dao_settings drop constraint if exists dao_settings_bg_dim_range;
alter table public.dao_settings
  add constraint dao_settings_bg_dim_range check (bg_dim is null or (bg_dim >= 0 and bg_dim <= 0.9));

-- Откат (если понадобится):
-- alter table public.dao_settings drop constraint if exists dao_settings_bg_dim_range;
-- alter table public.dao_settings drop column if exists bg_mobile_url, drop column if exists bg_dim;
