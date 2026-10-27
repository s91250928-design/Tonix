-- =====================================================================
-- TONIX — укрепление по результатам проверки правил базы (27.10.2026)
-- Найдено в diagnostics-security.sql. Запускать после 2026-10-27-hardening.sql.
--
-- 1. КРИТИЧНО. user_chats: правило «user_chats_update» разрешало человеку
--    менять СВОЮ строку членства без проверки — в том числе chat_id.
--    Любой вошедший мог «переписать» своё членство на закрытый чат DAO
--    и стать участником в обход порога входа и взноса: читать чат,
--    голосовать. Сайт эту таблицу не обновляет — правило удаляем.
-- 2. dao_settings: правило «tonix settings write owner-admin» давало
--    АДМИНАМ менять любые настройки, включая токен голосования, порог
--    входа и взнос. Сменив токен голосования на свой, можно было решить
--    любое голосование. Теперь админы меняют только оформление, правила и длительность,
--    остальное — только владелец. Токен голосования не меняется, пока
--    идёт хоть одно голосование (даже владельцем).
-- 3. messages: автор мог «перенести» своё сообщение в чужой чат правкой
--    chat_id (проверка членства есть только при отправке). Теперь
--    chat_id и автора сообщения поменять нельзя.
-- 4. chats: участник чата мог переименовать чат DAO, сменить создателя
--    и вписать в participants кого угодно. Теперь можно только добавить
--    себя и обновить «последнее сообщение».
-- 5. Функции с правами владельца без search_path — задаём search_path.
-- =====================================================================
begin;

-- 1 ---------------------------------------------------------------------
drop policy if exists "user_chats_update" on public.user_chats;

-- 2 ---------------------------------------------------------------------
create or replace function public.tonix_settings_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
    v_owner boolean;
    v_free text[] := array['bg_url','bg_mobile_url','bg_dim','accent','layout','avatar_url',
                           'rules','treasury_coin_url','treasury_main_jetton','vote_hours','updated_at'];
    v_old jsonb;
    v_new jsonb;
    k text;
begin
    if v_uid is null then           -- сервер (служебный ключ) — без ограничений
        return coalesce(new, old);
    end if;
    select exists (select 1 from daos d where d.slug = coalesce(new.dao_key, old.dao_key)
                                         and d.owner_uid = v_uid) into v_owner;

    if tg_op = 'DELETE' then
        if not v_owner then raise exception 'owner-only' using errcode = '42501'; end if;
        return old;
    end if;

    if tg_op = 'INSERT' then
        -- сайт сохраняет настройки через upsert: если строка уже есть, это
        -- на деле правка — её проверит ветка UPDATE ниже
        if not v_owner and not exists (select 1 from dao_settings s where s.dao_key = new.dao_key) then
            raise exception 'owner-only' using errcode = '42501';
        end if;
        return new;
    end if;

    -- UPDATE
    if new.dao_key is distinct from old.dao_key then
        raise exception 'owner-only' using errcode = '42501';
    end if;
    if not v_owner then
        v_old := to_jsonb(old); v_new := to_jsonb(new);
        foreach k in array v_free loop
            v_old := v_old - k; v_new := v_new - k;
        end loop;
        if v_old is distinct from v_new then
            raise exception 'owner-only' using errcode = '42501';
        end if;
    end if;

    -- токен голосования нельзя менять посреди голосований
    if (to_jsonb(new) -> 'vote_jetton') is distinct from (to_jsonb(old) -> 'vote_jetton')
       or (to_jsonb(new) -> 'vote_decimals') is distinct from (to_jsonb(old) -> 'vote_decimals') then
        if exists (select 1 from dao_proposals p
                    where p.dao_key = new.dao_key and p.status in ('active', 'pending')) then
            raise exception 'vote-token-locked' using errcode = '42501';
        end if;
    end if;
    return new;
end;
$$;

drop trigger if exists tonix_settings_guard on public.dao_settings;
create trigger tonix_settings_guard
    before insert or update or delete on public.dao_settings
    for each row execute function public.tonix_settings_guard();

-- 3 ---------------------------------------------------------------------
create or replace function public.tonix_message_move_guard()
returns trigger
language plpgsql
as $$
begin
    if auth.uid() is not null
       and (new.chat_id is distinct from old.chat_id or new.sender_uid is distinct from old.sender_uid) then
        raise exception 'message-immutable' using errcode = '42501';
    end if;
    return new;
end;
$$;

drop trigger if exists tonix_message_move_guard on public.messages;
create trigger tonix_message_move_guard
    before update on public.messages
    for each row execute function public.tonix_message_move_guard();

-- 4 ---------------------------------------------------------------------
create or replace function public.tonix_chat_update_guard()
returns trigger
language plpgsql
as $$
declare
    v_uid uuid := auth.uid();
    v_old jsonb;
    v_new jsonb;
begin
    if v_uid is null then return new; end if;
    -- participants: можно только добавить себя, остальные остаются
    if new.participants is distinct from old.participants then
        if not (old.participants <@ new.participants
                and new.participants <@ (old.participants || v_uid)) then
            raise exception 'chat-participants-locked' using errcode = '42501';
        end if;
    end if;
    -- остальное, кроме «последнего сообщения», не меняется
    v_old := to_jsonb(old) - array['participants','last_message','last_time','last_sender_uid'];
    v_new := to_jsonb(new) - array['participants','last_message','last_time','last_sender_uid'];
    if v_old is distinct from v_new then
        raise exception 'chat-immutable' using errcode = '42501';
    end if;
    return new;
end;
$$;

drop trigger if exists tonix_chat_update_guard on public.chats;
create trigger tonix_chat_update_guard
    before update on public.chats
    for each row execute function public.tonix_chat_update_guard();

-- 5 ---------------------------------------------------------------------
do $$
declare f record;
begin
    for f in
        select p.oid::regprocedure as sig
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.prosecdef and p.proconfig is null
    loop
        execute format('alter function %s set search_path = public', f.sig);
    end loop;
end $$;

commit;

-- ОТКАТ (если что-то перестанет работать):
-- begin;
-- drop trigger if exists tonix_settings_guard on public.dao_settings;
-- drop trigger if exists tonix_message_move_guard on public.messages;
-- drop trigger if exists tonix_chat_update_guard on public.chats;
-- create policy "user_chats_update" on public.user_chats for update using (auth.uid() = user_id);
-- commit;
