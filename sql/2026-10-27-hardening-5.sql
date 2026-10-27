-- =====================================================================
-- TONIX — укрепление №5 (27.10.2026). Запускать после hardening-4.
--
-- 1. Старый Quantum Messenger закрыт. Его таблицы сайт Tonix не трогает
--    (проверено по всему коду сайта), а правила к ним остались — например,
--    любой вошедший мог удалять сигналы звонков, слать заявки без
--    ограничений, менять уровни в гильдиях. Убираем ВСЕ браузерные
--    правила этих таблиц: из браузера к ним теперь доступа нет вовсе.
--    Сервер (служебный ключ) работает с ними как раньше. Данные НЕ удаляются.
--    Старым функциям мессенджера запрещаем вызов из браузера.
-- 2. Заявка на взнос. Время заявки — это отсечка: платежи раньше неё не
--    засчитываются. Но время мог прислать сам браузер — поставить, скажем,
--    год назад, и тогда старый перевод в казну (например, пожертвование)
--    открыл бы вход в платное DAO. Теперь время ставит база.
-- 3. user_telegram: браузер мог переписать свой Telegram-ID на чужой —
--    и бот слал бы уведомления постороннему человеку. Сайт эту таблицу
--    только читает, связку делает сервер (link-telegram). Правку убираем.
-- 4. users: из браузера можно менять только статус «в сети/не в сети»
--    (сайт больше ничего там не меняет). Остальные поля — только сервер.
-- 5. chats: создать чат можно только от своего имени и только с собой
--    в участниках (раньше можно было создать чат «от имени» другого
--    и вписать туда кого угодно).
-- =====================================================================
begin;

-- 1 ---------------------------------------------------------------------
do $$
declare
    t text;
    p record;
    legacy text[] := array['call_signals','dao_applications','group_sender_keys','guild_channels',
        'guild_join_requests','guild_members','guild_posts','guilds','honeypot_log',
        'message_reactions','push_subscriptions','tier_rooms','ton_proof_challenges',
        'tonix_login_challenges','trust_ratings','user_public_keys','user_tiers'];
begin
    foreach t in array legacy loop
        if to_regclass('public.' || t) is null then continue; end if;
        execute format('alter table public.%I enable row level security', t);
        for p in select policyname, roles from pg_policies where schemaname = 'public' and tablename = t loop
            if not (p.roles = array['service_role']::name[]) then
                execute format('drop policy %I on public.%I', p.policyname, t);
            end if;
        end loop;
    end loop;
end $$;

do $$
declare f record;
begin
    for f in
        select p.oid::regprocedure as sig
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname in ('my_guild_level', 'guild_role_level', 'disconnect_wallet', 'cleanup_expired_ton_challenges')
    loop
        execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    end loop;
end $$;

-- 2 ---------------------------------------------------------------------
create or replace function public.tonix_entry_ticket_guard()
returns trigger
language plpgsql
as $$
begin
    if auth.uid() is not null then
        new.requested_at := now();
        new.status := 'pending';
        new.tx_hash := null;
        new.paid_ton := null;
        new.confirmed_at := null;
    end if;
    return new;
end;
$$;

drop trigger if exists tonix_entry_ticket_guard on public.dao_entry_payments;
create trigger tonix_entry_ticket_guard
    before insert on public.dao_entry_payments
    for each row execute function public.tonix_entry_ticket_guard();

-- 3 ---------------------------------------------------------------------
drop policy if exists "user_tg_update_own" on public.user_telegram;

-- 4 ---------------------------------------------------------------------
create or replace function public.tonix_users_guard()
returns trigger
language plpgsql
as $$
begin
    if auth.uid() is not null
       and (to_jsonb(new) - array['status','last_seen','updated_at'])
           is distinct from (to_jsonb(old) - array['status','last_seen','updated_at']) then
        raise exception 'users-readonly' using errcode = '42501';
    end if;
    return new;
end;
$$;

drop trigger if exists tonix_users_guard on public.users;
create trigger tonix_users_guard
    before update on public.users
    for each row execute function public.tonix_users_guard();

-- 5 ---------------------------------------------------------------------
drop policy if exists "chats_insert_self_only" on public.chats;
create policy "chats_insert_self_only" on public.chats
    as restrictive for insert to authenticated
    with check (created_by = auth.uid() and participants = array[auth.uid()]);

commit;

-- ОТКАТ пунктов 2–5 (пункт 1 откатывается только из резервной копии правил):
-- begin;
-- drop trigger if exists tonix_entry_ticket_guard on public.dao_entry_payments;
-- create policy "user_tg_update_own" on public.user_telegram for update to authenticated using (user_uid = auth.uid()) with check (user_uid = auth.uid());
-- drop trigger if exists tonix_users_guard on public.users;
-- drop policy if exists "chats_insert_self_only" on public.chats;
-- commit;
