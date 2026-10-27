-- =====================================================================
-- TONIX — модерация голосований (27 октября 2026)
--
-- Зачем: по просьбе сообществ (JetTon) каждое новое предложение
-- участника сначала проверяет владелец или админ DAO, и только после
-- одобрения оно публикуется и начинается голосование.
--
-- Как устроено (всё на стороне базы — обойти из браузера нельзя):
--   1. dao_settings.proposal_moderation — включатель, по умолчанию ВКЛ.
--   2. Триггер при создании: если модерация включена и автор не владелец
--      и не админ — предложение получает статус 'pending'.
--      Предложения владельца и админов публикуются сразу.
--   3. Пока 'pending', предложение видят только автор, владелец и админы
--      (ограничивающее правило RLS), голосовать по нему нельзя (триггер
--      на dao_votes), и закрыть его по таймеру тоже нельзя
--      (finish-proposal берёт только 'active').
--   4. Одобрить или отклонить можно только функцией tonix_moderate_proposal,
--      и только владельцу/админу этого DAO. При одобрении таймер голосования
--      стартует С МОМЕНТА ОДОБРЕНИЯ на ту длительность, что выбрал автор.
--   5. Сменить статус 'pending' иначе (прямым UPDATE) нельзя — триггер.
--
-- Запуск: Supabase → SQL Editor → вставить файл целиком → Run.
-- Откат — в конце файла.
-- =====================================================================
begin;

-- 1. Настройка DAO и поля предложения ----------------------------------
alter table public.dao_settings
    add column if not exists proposal_moderation boolean not null default true;

alter table public.dao_proposals
    add column if not exists vote_minutes   integer,
    add column if not exists moderated_by   uuid,
    add column if not exists moderated_at   timestamptz,
    add column if not exists moderation_note text;

-- 2. Если на статусе есть CHECK-ограничение — пересобираем его,
--    добавив новые статусы и сохранив все уже встречающиеся в базе.
do $$
declare
    c record;
    v_list text;
begin
    for c in
        select con.conname
          from pg_constraint con
         where con.conrelid = 'public.dao_proposals'::regclass
           and con.contype = 'c'
           and pg_get_constraintdef(con.oid) ilike '%status%'
           and pg_get_constraintdef(con.oid) not ilike '%payout_status%'
    loop
        execute format('alter table public.dao_proposals drop constraint %I', c.conname);
    end loop;

    select string_agg(quote_literal(s), ',') into v_list
      from (
        select distinct status as s from public.dao_proposals where status is not null
        union select unnest(array['active','passed','rejected','executed','pending','moderation_rejected'])
      ) x;

    execute 'alter table public.dao_proposals add constraint dao_proposals_status_check check (status in (' || v_list || '))';
end $$;

-- 3. Кто модерирует: владелец DAO или его админ -------------------------
create or replace function public.tonix_is_dao_staff(p_dao text, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select p_uid is not null and (
           exists (select 1 from daos d where d.slug = p_dao and d.owner_uid = p_uid)
        or exists (select 1 from dao_admins a where a.dao_key = p_dao and a.user_uid = p_uid)
    );
$$;

-- 4. При создании предложения: на модерацию, если нужно -----------------
create or replace function public.tonix_proposal_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_on boolean;
begin
    -- запоминаем выбранную длительность: при одобрении отсчёт начнётся заново
    if new.vote_minutes is null and new.ends_at is not null then
        new.vote_minutes := greatest(1, round(extract(epoch from (new.ends_at - now())) / 60)::int);
    end if;

    -- новое предложение может быть только активным или на модерации
    if new.status is null or new.status not in ('active', 'pending') then
        new.status := 'active';
    end if;

    select s.proposal_moderation into v_on
      from dao_settings s where s.dao_key = new.dao_key limit 1;

    if coalesce(v_on, true) and not tonix_is_dao_staff(new.dao_key, new.author_uid) then
        new.status := 'pending';
    else
        new.status := 'active';
    end if;

    new.moderated_by := null;
    new.moderated_at := null;
    new.moderation_note := null;
    return new;
end;
$$;

drop trigger if exists tonix_proposal_on_insert on public.dao_proposals;
create trigger tonix_proposal_on_insert
    before insert on public.dao_proposals
    for each row execute function public.tonix_proposal_on_insert();

-- 5. Статус 'pending' меняется только через функцию модерации -----------
create or replace function public.tonix_proposal_pending_guard()
returns trigger
language plpgsql
as $$
begin
    if old.status in ('pending', 'moderation_rejected')
       and new.status is distinct from old.status
       and coalesce(current_setting('tonix.moderating', true), '') <> 'on' then
        raise exception 'moderation-required' using errcode = '42501';
    end if;
    return new;
end;
$$;

drop trigger if exists tonix_proposal_pending_guard on public.dao_proposals;
create trigger tonix_proposal_pending_guard
    before update on public.dao_proposals
    for each row execute function public.tonix_proposal_pending_guard();

-- 6. Голосовать можно только по активному предложению -------------------
create or replace function public.tonix_vote_only_active()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_status text;
begin
    select p.status into v_status from dao_proposals p where p.id = new.proposal_id;
    if v_status is distinct from 'active' then
        raise exception 'voting-closed' using errcode = '42501';
    end if;
    return new;
end;
$$;

drop trigger if exists tonix_vote_only_active on public.dao_votes;
create trigger tonix_vote_only_active
    before insert on public.dao_votes
    for each row execute function public.tonix_vote_only_active();

-- 7. Предложения на модерации видят только автор и модераторы ----------
--    Правило ОГРАНИЧИВАЮЩЕЕ: действует поверх существующих правил чтения.
drop policy if exists "proposals_hide_unmoderated" on public.dao_proposals;
create policy "proposals_hide_unmoderated" on public.dao_proposals
    as restrictive
    for select
    using (
        status not in ('pending', 'moderation_rejected')
        or author_uid = auth.uid()
        or tonix_is_dao_staff(dao_key, auth.uid())
    );

-- 8. Одобрить / отклонить ----------------------------------------------
create or replace function public.tonix_moderate_proposal(p_id uuid, p_approve boolean, p_note text default null)
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
begin
    if auth.uid() is null then
        return jsonb_build_object('ok', false, 'error', 'no-session');
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
    if v_status <> 'pending' then
        return jsonb_build_object('ok', false, 'error', 'not-pending');
    end if;

    perform set_config('tonix.moderating', 'on', true);

    if p_approve then
        v_ends := now() + make_interval(mins => least(greatest(v_minutes, 1), 30 * 24 * 60));
        update dao_proposals
           set status = 'active',
               ends_at = v_ends,
               created_at = now(),
               moderated_by = auth.uid(),
               moderated_at = now(),
               moderation_note = nullif(btrim(coalesce(p_note, '')), '')
         where id = p_id;
    else
        update dao_proposals
           set status = 'moderation_rejected',
               moderated_by = auth.uid(),
               moderated_at = now(),
               moderation_note = nullif(btrim(coalesce(p_note, '')), '')
         where id = p_id;
    end if;

    perform set_config('tonix.moderating', '', true);
    return jsonb_build_object('ok', true, 'status', case when p_approve then 'active' else 'moderation_rejected' end, 'ends_at', v_ends);
end;
$$;

revoke all on function public.tonix_moderate_proposal(uuid, boolean, text) from public;
grant execute on function public.tonix_moderate_proposal(uuid, boolean, text) to authenticated;
grant execute on function public.tonix_is_dao_staff(text, uuid) to authenticated, anon;

commit;

-- ---------------------------------------------------------------------
-- ОТКАТ (если что-то пойдёт не так):
-- begin;
-- drop trigger if exists tonix_proposal_on_insert on public.dao_proposals;
-- drop trigger if exists tonix_proposal_pending_guard on public.dao_proposals;
-- drop trigger if exists tonix_vote_only_active on public.dao_votes;
-- drop policy if exists "proposals_hide_unmoderated" on public.dao_proposals;
-- drop function if exists public.tonix_moderate_proposal(uuid, boolean, text);
-- update public.dao_proposals set status = 'active' where status = 'pending';
-- commit;
-- ---------------------------------------------------------------------
