-- =====================================================================
-- TONIX — исправления безопасности базы (5 октября 2026)
-- Запускать целиком в Supabase → SQL Editor. Повторный запуск безопасен.
-- Всё в одной транзакции: если хоть одна строка упадёт, не изменится ничего.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1. Кошелёк нельзя подменить.
--    Было: правило user_wallets_own_rw (ALL) позволяло пользователю
--    вписать в свою строку ЛЮБОЙ адрес — например, кита — и голосовать
--    его токенами или пройти проверку баланса за чужой счёт.
--    Адрес кладёт только сервер (ton-wallet-auth, служебный ключ) после
--    проверки tonProof, сайт в эту таблицу не пишет. Чтение своего
--    кошелька остаётся (правила "tonix wallet read own", "Users read own wallet").
-- ---------------------------------------------------------------------
drop policy if exists "user_wallets_own_rw" on public.user_wallets;

-- ---------------------------------------------------------------------
-- 2. Нельзя самому поставить DAO отметку «проверено».
--    Было: мягкое правило "tonix daos insert own" (только «ты владелец»)
--    складывалось через ИЛИ со строгим daos_insert и отменяло его проверки:
--    можно было создать DAO с verified = true, любым названием и без казны.
--    Создание DAO с сайта проходит по строгому daos_insert.
-- ---------------------------------------------------------------------
drop policy if exists "tonix daos insert own" on public.daos;

--    Отметку verified меняют только админы Tonix и сервер. Для всех
--    остальных база сама возвращает прежнее значение, через какое бы
--    правило ни шёл запрос. Редактирование своего DAO не ломается.
create or replace function public.tonix_guard_dao_verified()
returns trigger
language plpgsql
-- без security definer: триггеру нужно видеть настоящую роль того, кто делает запрос
set search_path = public
as $$
begin
    -- сервер (service_role) и SQL Editor (postgres) — без ограничений
    if current_user not in ('anon', 'authenticated') then
        return new;
    end if;
    -- админы Tonix (те же, что в правилах daos_admin_update / daos_admin_delete)
    if auth.uid() = any (array['5517e2d5-c502-4070-b9a1-158f13948a0c'::uuid,
                               '63896ff1-c34b-4f44-bf31-cc3a5fa424a2'::uuid]) then
        return new;
    end if;
    if tg_op = 'INSERT' then
        new.verified := false;
    elsif new.verified is distinct from old.verified then
        new.verified := old.verified;
    end if;
    return new;
end;
$$;

drop trigger if exists tonix_guard_dao_verified on public.daos;
create trigger tonix_guard_dao_verified
    before insert or update on public.daos
    for each row execute function public.tonix_guard_dao_verified();

-- ---------------------------------------------------------------------
-- 3. «Исполнено» — только по транзакции в блокчейне.
--    Было: mark_payout позволял владельцу DAO вручную поставить 'done'.
--    Теперь вручную можно только отклонить ('declined'); 'done' ставит
--    исключительно серверная проверка verify-payout после того, как
--    нашла перевод в сети. Остальная логика функции не изменилась.
-- ---------------------------------------------------------------------
create or replace function public.mark_payout(p_id uuid, p_status text, p_note text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    v_dao text;
    v_owner uuid;
    v_cur text;
begin
    if p_status = 'done' then
        return jsonb_build_object('ok', false, 'error', 'verify-on-chain');
    end if;
    if p_status <> 'declined' then
        return jsonb_build_object('ok', false, 'error', 'bad-status');
    end if;

    select p.dao_key, p.payout_status into v_dao, v_cur
    from dao_proposals p where p.id = p_id;
    if v_dao is null then
        return jsonb_build_object('ok', false, 'error', 'no-proposal');
    end if;

    if v_cur <> 'awaiting_signature' then
        return jsonb_build_object('ok', false, 'error', 'not-awaiting');
    end if;

    select d.owner_uid into v_owner from daos d where d.slug = v_dao;
    if v_owner is null or v_owner <> auth.uid() then
        return jsonb_build_object('ok', false, 'error', 'not-owner');
    end if;

    update dao_proposals
       set payout_status = p_status,
           payout_note = nullif(btrim(coalesce(p_note, '')), ''),
           payout_by = auth.uid(),
           payout_at = now(),
           payout_verified = false
     where id = p_id;

    return jsonb_build_object('ok', true, 'status', p_status, 'verified', false);
end;
$function$;

-- ---------------------------------------------------------------------
-- 4. Посты гильдий (Quantum): опечатка в правилах.
--    Было: gm.guild_id = gm.guild_id — всегда истина, поэтому модератор
--    ЛЮБОЙ гильдии мог писать, править и удалять посты ВО ВСЕХ гильдиях.
--    Теперь — только в своей.
-- ---------------------------------------------------------------------
alter policy "posts_insert_staff" on public.guild_posts
    with check (
        ((author_uid)::text = (auth.uid())::text)
        and exists (
            select 1 from guild_members gm
            where gm.guild_id = guild_posts.guild_id
              and (gm.user_uid)::text = (auth.uid())::text
              and gm.role = any (array['emperor'::text, 'magister'::text])
        )
    );

alter policy "posts_update_staff" on public.guild_posts
    using (
        exists (
            select 1 from guild_members gm
            where gm.guild_id = guild_posts.guild_id
              and (gm.user_uid)::text = (auth.uid())::text
              and gm.role = any (array['emperor'::text, 'magister'::text])
        )
    );

alter policy "posts_delete_staff" on public.guild_posts
    using (
        exists (
            select 1 from guild_members gm
            where gm.guild_id = guild_posts.guild_id
              and (gm.user_uid)::text = (auth.uid())::text
              and gm.role = any (array['emperor'::text, 'magister'::text])
        )
    );

-- ---------------------------------------------------------------------
-- 5. Сигналы звонков (Quantum): были открыты даже без входа (роль public).
--    Любой посторонний мог читать их (там сетевые адреса участников звонка)
--    и удалять, обрывая звонки. Теперь — только вошедшим пользователям.
-- ---------------------------------------------------------------------
alter policy "Anyone can read call signals"   on public.call_signals to authenticated;
alter policy "Anyone can delete call signals" on public.call_signals to authenticated;

commit;
