-- =====================================================================
-- TONIX — укрепление №3 (27.10.2026). Запускать после hardening-2.
-- Найдено при сверке правил базы с кодом серверных функций.
--
-- 1. Делегирование. Правило «tonix delegations write own» разрешало
--    вставить делегирование прямо из браузера, мимо set-delegation.
--    Так человек, НЕ состоящий в DAO (не прошёл порог и не платил взнос),
--    мог отдать свой вес участнику — и его токены голосовали.
--    Сайт сам эту таблицу только читает, делегирование ставит сервер.
--    Правило удаляем, неправильные записи чистим.
-- 2. Предложения мог создать любой вошедший, даже не участник DAO.
--    Теперь — только участник (или владелец).
-- 3. Владелец DAO мог переставить chat_id своего DAO на чат ЧУЖОГО DAO.
--    Тогда кнопка «вступить» в своём DAO пускала его в чужой чат,
--    а значит в чужие голосования. Теперь chat_id ставится один раз,
--    только на свободный чат и только на свой.
-- 4. Один перевод из казны мог «подтвердить» две разные выплаты с тем же
--    адресом и суммой. Теперь одна транзакция — одно подтверждение.
-- =====================================================================
begin;

-- 1 ---------------------------------------------------------------------
drop policy if exists "tonix delegations write own" on public.dao_delegations;

delete from public.dao_delegations g
 where g.delegator_uid = g.delegate_uid
    or not exists (select 1 from daos d join user_chats uc on uc.chat_id = d.chat_id
                    where d.slug = g.dao_key and uc.user_id = g.delegator_uid)
    or not exists (select 1 from daos d join user_chats uc on uc.chat_id = d.chat_id
                    where d.slug = g.dao_key and uc.user_id = g.delegate_uid);

-- 2 ---------------------------------------------------------------------
create or replace function public.tonix_proposal_member_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
    if v_uid is null then return new; end if;     -- сервер
    if not exists (
        select 1 from daos d
         where d.slug = new.dao_key
           and (d.owner_uid = v_uid
                or exists (select 1 from user_chats uc where uc.chat_id = d.chat_id and uc.user_id = v_uid))
    ) then
        raise exception 'not-member' using errcode = '42501';
    end if;
    return new;
end;
$$;

drop trigger if exists tonix_proposal_member_guard on public.dao_proposals;
create trigger tonix_proposal_member_guard
    before insert on public.dao_proposals
    for each row execute function public.tonix_proposal_member_guard();

-- 3 ---------------------------------------------------------------------
create or replace function public.tonix_dao_chat_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
    if v_uid is null then return new; end if;     -- сервер
    if new.chat_id is null or new.chat_id is not distinct from old.chat_id then
        return new;
    end if;
    if old.chat_id is not null then
        raise exception 'chat-id-locked' using errcode = '42501';
    end if;
    if exists (select 1 from daos d where d.chat_id = new.chat_id and d.slug <> new.slug) then
        raise exception 'chat-id-taken' using errcode = '42501';
    end if;
    if exists (select 1 from chats c where c.id = new.chat_id and c.created_by is distinct from v_uid) then
        raise exception 'chat-id-foreign' using errcode = '42501';
    end if;
    return new;
end;
$$;

drop trigger if exists tonix_dao_chat_guard on public.daos;
create trigger tonix_dao_chat_guard
    before update of chat_id on public.daos
    for each row execute function public.tonix_dao_chat_guard();

-- 4 ---------------------------------------------------------------------
do $$
begin
    create unique index if not exists dao_proposals_payout_tx_once
        on public.dao_proposals (payout_note)
        where payout_verified is true and payout_note is not null;
exception when unique_violation then
    raise notice 'ВНИМАНИЕ: уже есть две выплаты с одной транзакцией — проверь dao_proposals.payout_note';
end $$;

commit;

-- ОТКАТ:
-- begin;
-- create policy "tonix delegations write own" on public.dao_delegations for insert to authenticated with check (delegator_uid = auth.uid());
-- drop trigger if exists tonix_proposal_member_guard on public.dao_proposals;
-- drop trigger if exists tonix_dao_chat_guard on public.daos;
-- drop index if exists public.dao_proposals_payout_tx_once;
-- commit;
