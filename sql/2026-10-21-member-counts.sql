-- Tonix · 2026-10-21
-- Число участников DAO для всех посетителей, включая тех, кто ещё не вступил.
--
-- Почему: число считалось запросом к user_chats из браузера. Правила доступа
-- к user_chats показывают строки только участникам чата, поэтому новичок
-- (или гость без входа) видел «0 участников».
--
-- Функция отдаёт ТОЛЬКО числа (slug → количество), без списка людей и id.
-- security definer — считает в обход правил доступа, но наружу выходит лишь число.
-- Выполнить один раз в Supabase → SQL Editor. Повторный запуск безопасен.

create or replace function public.tonix_member_counts(p_slug text default null)
returns table (slug text, members bigint)
language sql
stable
security definer
set search_path = public
as $$
    select d.slug::text, count(uc.user_id)::bigint
    from public.daos d
    left join public.user_chats uc on uc.chat_id = d.chat_id
    where d.status = 'approved'
      and (p_slug is null or d.slug = p_slug)
    group by d.slug;
$$;

revoke all on function public.tonix_member_counts(text) from public;
grant execute on function public.tonix_member_counts(text) to anon, authenticated;

-- Проверка: должны появиться все DAO с реальным числом участников
select * from public.tonix_member_counts();

-- Откат (если понадобится):
-- drop function if exists public.tonix_member_counts(text);
