-- =====================================================================
-- TONIX — панель модерации: снять опубликованное голосование (27.10.2026)
-- Запускать ПОСЛЕ 2026-10-27-proposal-moderation.sql.
--
-- Владелец и админы теперь могут не только одобрять/отклонять новые
-- предложения, но и СНЯТЬ уже идущее голосование (например, если в нём
-- некультурный текст). Снятое голосование:
--   • получает статус 'removed' и пропадает у всех, кроме автора и модераторов;
--   • больше не принимает голоса (триггер на dao_votes пускает только 'active');
--   • не подводится и не исполняется (finish-proposal берёт только 'active').
-- Вернуть снятое в голосование нельзя — это сделано намеренно.
-- =====================================================================
begin;

-- 1. Новый статус 'removed' в проверке значений
do $$
declare
    c record;
    v_list text;
begin
    for c in
        select con.conname from pg_constraint con
         where con.conrelid = 'public.dao_proposals'::regclass and con.contype = 'c'
           and pg_get_constraintdef(con.oid) ilike '%status%'
           and pg_get_constraintdef(con.oid) not ilike '%payout_status%'
    loop
        execute format('alter table public.dao_proposals drop constraint %I', c.conname);
    end loop;
    select string_agg(quote_literal(s), ',') into v_list from (
        select distinct status as s from public.dao_proposals where status is not null
        union select unnest(array['active','passed','rejected','executed','pending','moderation_rejected','removed'])
    ) x;
    execute 'alter table public.dao_proposals add constraint dao_proposals_status_check check (status in (' || v_list || '))';
end $$;

-- 2. Снятые скрыты так же, как непроверенные
drop policy if exists "proposals_hide_unmoderated" on public.dao_proposals;
create policy "proposals_hide_unmoderated" on public.dao_proposals
    as restrictive
    for select
    using (
        status not in ('pending', 'moderation_rejected', 'removed')
        or author_uid = auth.uid()
        or tonix_is_dao_staff(dao_key, auth.uid())
    );

-- 3. Менять эти статусы можно только через функцию модерации.
--    И снять активное голосование тоже — только через неё.
create or replace function public.tonix_proposal_pending_guard()
returns trigger
language plpgsql
as $$
begin
    if new.status is distinct from old.status
       and coalesce(current_setting('tonix.moderating', true), '') <> 'on'
       and (old.status in ('pending', 'moderation_rejected', 'removed')
            or new.status in ('pending', 'moderation_rejected', 'removed')) then
        raise exception 'moderation-required' using errcode = '42501';
    end if;
    return new;
end;
$$;

-- 4. Модерация: approve / reject (для 'pending') и remove (для 'active')
create or replace function public.tonix_moderate(p_id uuid, p_action text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_dao text;
    v_status text;
    v_minutes integer;
    v_ends timestamptz;
    v_new text;
begin
    if auth.uid() is null then
        return jsonb_build_object('ok', false, 'error', 'no-session');
    end if;
    if p_action not in ('approve', 'reject', 'remove') then
        return jsonb_build_object('ok', false, 'error', 'bad-action');
    end if;

    select p.dao_key, p.status, coalesce(p.vote_minutes, 1440)
      into v_dao, v_status, v_minutes
      from dao_proposals p where p.id = p_id
       for update;

    if v_dao is null then
        return jsonb_build_object('ok', false, 'error', 'no-proposal');
    end if;
    if not tonix_is_dao_staff(v_dao, auth.uid()) then
        return jsonb_build_object('ok', false, 'error', 'not-staff');
    end if;
    if p_action in ('approve', 'reject') and v_status <> 'pending' then
        return jsonb_build_object('ok', false, 'error', 'not-pending');
    end if;
    if p_action = 'remove' and v_status <> 'active' then
        return jsonb_build_object('ok', false, 'error', 'not-active');
    end if;

    perform set_config('tonix.moderating', 'on', true);

    if p_action = 'approve' then
        v_new := 'active';
        v_ends := now() + make_interval(mins => least(greatest(v_minutes, 1), 30 * 24 * 60));
        update dao_proposals
           set status = v_new, ends_at = v_ends, created_at = now(),
               moderated_by = auth.uid(), moderated_at = now(),
               moderation_note = nullif(btrim(coalesce(p_note, '')), '')
         where id = p_id;
    else
        v_new := case when p_action = 'reject' then 'moderation_rejected' else 'removed' end;
        update dao_proposals
           set status = v_new,
               moderated_by = auth.uid(), moderated_at = now(),
               moderation_note = nullif(btrim(coalesce(p_note, '')), '')
         where id = p_id;
    end if;

    perform set_config('tonix.moderating', '', true);
    return jsonb_build_object('ok', true, 'status', v_new, 'ends_at', v_ends);
end;
$$;

revoke all on function public.tonix_moderate(uuid, text, text) from public;
grant execute on function public.tonix_moderate(uuid, text, text) to authenticated;

commit;

-- ОТКАТ:
-- begin;
-- drop function if exists public.tonix_moderate(uuid, text, text);
-- update public.dao_proposals set status = 'rejected' where status = 'removed';
-- commit;
