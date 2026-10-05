-- =====================================================================
-- ОТКАТ исправлений 2026-10-05-security-fixes.sql
-- Возвращает базу в состояние ДО исправлений (по выгрузке 5 октября 2026).
-- Запускать, только если после исправлений что-то сломалось.
-- ВНИМАНИЕ: откат снова открывает дыры — после него разбираемся и чиним иначе.
-- =====================================================================
begin;

-- 1. Право пользователя писать свою строку кошелька
drop policy if exists "user_wallets_own_rw" on public.user_wallets;
create policy "user_wallets_own_rw" on public.user_wallets
    for all
    using (((user_id)::text = (auth.uid())::text))
    with check (((user_id)::text = (auth.uid())::text));

-- 2. Мягкое правило создания DAO и триггер verified
drop policy if exists "tonix daos insert own" on public.daos;
create policy "tonix daos insert own" on public.daos
    for insert
    with check ((owner_uid = auth.uid()));
drop trigger if exists tonix_guard_dao_verified on public.daos;
drop function if exists public.tonix_guard_dao_verified();

-- 3. Прежняя mark_payout (с ручным 'done')
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
    if p_status not in ('done', 'declined') then
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

-- 4. Прежние правила постов гильдий (с опечаткой gm.guild_id = gm.guild_id)
alter policy "posts_insert_staff" on public.guild_posts
    with check ((((author_uid)::text = (auth.uid())::text) and (exists ( select 1
       from guild_members gm
      where ((gm.guild_id = gm.guild_id) and ((gm.user_uid)::text = (auth.uid())::text) and (gm.role = any (array['emperor'::text, 'magister'::text])))))));
alter policy "posts_update_staff" on public.guild_posts
    using ((exists ( select 1
       from guild_members gm
      where ((gm.guild_id = gm.guild_id) and ((gm.user_uid)::text = (auth.uid())::text) and (gm.role = any (array['emperor'::text, 'magister'::text]))))));
alter policy "posts_delete_staff" on public.guild_posts
    using ((exists ( select 1
       from guild_members gm
      where ((gm.guild_id = gm.guild_id) and ((gm.user_uid)::text = (auth.uid())::text) and (gm.role = any (array['emperor'::text, 'magister'::text]))))));

-- 5. Сигналы звонков снова для роли public
alter policy "Anyone can read call signals"   on public.call_signals to public;
alter policy "Anyone can delete call signals" on public.call_signals to public;

commit;
