-- Tonix · 2026-10-21
-- Публичный список участников DAO: кошелёк, ник и аватар — как в Aragon и других DAO.
-- Видят все, включая гостей и ещё не вступивших (сама таблица user_chats
-- для них закрыта правилами доступа).
--
-- Наружу выходят только: id пользователя, адрес кошелька, ник, аватар.
-- Описание профиля (bio) и контакт в Telegram сюда НЕ попадают.
-- Выполнить один раз в Supabase → SQL Editor. Повторный запуск безопасен.

create or replace function public.tonix_dao_members(p_slug text)
returns table (user_id uuid, wallet_address text, nickname text, avatar_url text)
language sql
stable
security definer
set search_path = public
as $$
    select uc.user_id,
           uw.wallet_address::text,
           p.nickname::text,
           p.avatar_url::text
    from public.daos d
    join public.user_chats uc on uc.chat_id = d.chat_id
    left join public.user_wallets uw on uw.user_id = uc.user_id
    left join public.profiles p on p.user_id = uc.user_id
    where d.slug = p_slug
      and d.status = 'approved';
$$;

revoke all on function public.tonix_dao_members(text) from public;
grant execute on function public.tonix_dao_members(text) to anon, authenticated;

-- Проверка (подставь свой адрес DAO): должен вернуться список участников
select * from public.tonix_dao_members('jetton-dao-gelq');

-- Откат (если понадобится):
-- drop function if exists public.tonix_dao_members(text);
