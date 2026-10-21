-- Tonix · 2026-10-21
-- Одноразовые запросы на вход (payload для ton_proof).
-- Нужна для новой версии функции ton-wallet-auth (TON Connect 5).
-- Выполнить один раз в Supabase → SQL Editor ДО обновления функции. Повторный запуск безопасен.

create table if not exists public.ton_proof_challenges (
    payload    text primary key,
    expires_at timestamptz not null,
    created_at timestamptz not null default now()
);

create index if not exists ton_proof_challenges_expires_idx
    on public.ton_proof_challenges (expires_at);

-- Доступ только у сервера (service_role обходит RLS).
-- Политик нет намеренно: из браузера таблицу нельзя ни читать, ни писать.
alter table public.ton_proof_challenges enable row level security;
revoke all on public.ton_proof_challenges from anon, authenticated;

-- Откат (если понадобится):
-- drop table if exists public.ton_proof_challenges;
