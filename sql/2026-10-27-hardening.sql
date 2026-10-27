-- =====================================================================
-- TONIX — укрепление предложений и голосований (27.10.2026)
-- Запускать ПОСЛЕ 2026-10-27-proposal-moderation.sql и
-- 2026-10-27-moderation-panel.sql.
--
-- Что закрывает (атаки напрямую через API базы, в обход сайта):
--  1. Подмена автора: при создании предложения автором всегда
--     становится тот, кто вошёл. Нельзя выдать себя за владельца
--     и так обойти модерацию.
--  2. Правка после одобрения: заголовок, описание, сумма и адрес
--     выплаты, действие и автор после создания НЕ меняются никем.
--     Иначе можно было бы пройти модерацию с безобидным текстом
--     и потом подменить его.
--  3. Поддельные поля при создании: «выплата подтверждена»,
--     «исполнено» и т.п. сбрасываются — их ставит только сервер.
--  4. Срок голосования: не меньше 1 минуты и не больше 30 дней.
--  5. Мусор и вредные строки: ограничение длины текста и формат
--     адреса выплаты/токена (только настоящий TON-адрес).
-- Проверки 5 добавлены как NOT VALID: старые записи не трогаются,
-- проверяются только новые и изменённые.
-- =====================================================================
begin;

-- 1, 3, 4: при создании -------------------------------------------------
create or replace function public.tonix_proposal_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_on boolean;
    v_uid uuid := auth.uid();
begin
    -- автор = тот, кто вошёл (служебный ключ сервера оставляет как есть)
    if v_uid is not null then
        new.author_uid := v_uid;
    end if;

    -- срок: от 1 минуты до 30 дней
    if new.ends_at is null or new.ends_at < now() + interval '1 minute' then
        new.ends_at := now() + interval '1 minute';
    end if;
    if new.ends_at > now() + interval '30 days' then
        new.ends_at := now() + interval '30 days';
    end if;
    new.vote_minutes := greatest(1, least(30 * 24 * 60, coalesce(new.vote_minutes,
                            round(extract(epoch from (new.ends_at - now())) / 60)::int)));
    new.created_at := now();

    -- служебные поля ставит только сервер
    new.executed_at := null;
    new.moderated_by := null;
    new.moderated_at := null;
    new.moderation_note := null;
    new.payout_status := 'none';
    new.payout_verified := false;
    new.payout_note := null;
    new.payout_at := null;
    new.payout_by := null;

    select s.proposal_moderation into v_on
      from dao_settings s where s.dao_key = new.dao_key limit 1;

    if coalesce(v_on, true) and not tonix_is_dao_staff(new.dao_key, new.author_uid) then
        new.status := 'pending';
    else
        new.status := 'active';
    end if;
    return new;
end;
$$;

-- 2: что нельзя менять после создания ---------------------------------
create or replace function public.tonix_proposal_pending_guard()
returns trigger
language plpgsql
as $$
declare
    v_mod boolean := coalesce(current_setting('tonix.moderating', true), '') = 'on';
begin
    if new.title is distinct from old.title
       or new.description is distinct from old.description
       or new.dao_key is distinct from old.dao_key
       or new.author_uid is distinct from old.author_uid
       or new.action_type is distinct from old.action_type
       or new.action_value is distinct from old.action_value
       or new.action_target is distinct from old.action_target
       or new.payout_address is distinct from old.payout_address
       or new.payout_amount is distinct from old.payout_amount
       or new.payout_jetton is distinct from old.payout_jetton
       or new.payout_symbol is distinct from old.payout_symbol
       or new.payout_decimals is distinct from old.payout_decimals
       or new.vote_minutes is distinct from old.vote_minutes then
        raise exception 'proposal-immutable' using errcode = '42501';
    end if;

    -- срок и дату публикации меняет только модерация (при одобрении)
    if (new.ends_at is distinct from old.ends_at or new.created_at is distinct from old.created_at)
       and not v_mod then
        raise exception 'proposal-immutable' using errcode = '42501';
    end if;

    -- статусы модерации — только через функцию модерации
    if new.status is distinct from old.status
       and not v_mod
       and (old.status in ('pending', 'moderation_rejected', 'removed')
            or new.status in ('pending', 'moderation_rejected', 'removed')) then
        raise exception 'moderation-required' using errcode = '42501';
    end if;
    return new;
end;
$$;

-- 5: длина текста и формат адресов (только новые/изменённые строки) ------
alter table public.dao_proposals drop constraint if exists dao_proposals_text_len;
alter table public.dao_proposals add constraint dao_proposals_text_len
    check (char_length(coalesce(title, '')) between 1 and 200
           and char_length(coalesce(description, '')) <= 4000) not valid;

alter table public.dao_proposals drop constraint if exists dao_proposals_payout_addr_fmt;
alter table public.dao_proposals add constraint dao_proposals_payout_addr_fmt
    check (payout_address is null
           or payout_address ~ '^[A-Za-z0-9_-]{48}$'
           or payout_address ~ '^-?[0-9]{1,3}:[0-9a-fA-F]{64}$') not valid;

alter table public.dao_proposals drop constraint if exists dao_proposals_payout_jetton_fmt;
alter table public.dao_proposals add constraint dao_proposals_payout_jetton_fmt
    check (payout_jetton is null
           or payout_jetton ~ '^[A-Za-z0-9_-]{48}$'
           or payout_jetton ~ '^-?[0-9]{1,3}:[0-9a-fA-F]{64}$') not valid;

alter table public.dao_proposals drop constraint if exists dao_proposals_payout_amount_pos;
alter table public.dao_proposals add constraint dao_proposals_payout_amount_pos
    check (payout_amount is null or payout_amount > 0) not valid;

commit;

-- ОТКАТ: запустить заново 2026-10-27-moderation-panel.sql (вернёт прежний
-- охранный триггер) и
-- alter table public.dao_proposals drop constraint if exists dao_proposals_text_len,
--   drop constraint if exists dao_proposals_payout_addr_fmt,
--   drop constraint if exists dao_proposals_payout_jetton_fmt,
--   drop constraint if exists dao_proposals_payout_amount_pos;
