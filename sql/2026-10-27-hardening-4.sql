-- =====================================================================
-- TONIX — укрепление №4 (27.10.2026). Запускать после hardening-3.
--
-- 1. Галочка «проверено». Правило «tonix daos update own» разрешало
--    владельцу менять свою строку DAO без проверки поля verified, а
--    правила в Postgres складываются через «ИЛИ» — значит владелец мог
--    сам поставить себе галочку из консоли браузера. Теперь verified
--    меняется ТОЛЬКО SQL-запросом в Supabase (или сервером), из браузера —
--    никем, включая админ-аккаунты.
--    Выдать галочку:  update daos set verified = true where slug = '...';
-- 2. Файлы чатов. Правила «storage_auth_upload» и «storage_auth_update»
--    разрешали ЛЮБОМУ вошедшему загрузить или ПЕРЕЗАПИСАТЬ любой файл
--    в chat-media — то есть подменить картинку или голосовое в чужом
--    закрытом чате. Нужные правила для участников чата уже есть
--    (chatmedia_member_*), лишние удаляем.
-- 3. Перезаписать уже загруженный файл в чате может только тот, кто
--    его загрузил (раньше — любой участник этого чата).
-- =====================================================================
begin;

-- 1 ---------------------------------------------------------------------
create or replace function public.tonix_verified_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if auth.uid() is not null then
        if tg_op = 'INSERT' and new.verified is true then
            raise exception 'verified-sql-only' using errcode = '42501';
        end if;
        if tg_op = 'UPDATE' and new.verified is distinct from old.verified then
            raise exception 'verified-sql-only' using errcode = '42501';
        end if;
    end if;
    return new;
end;
$$;

drop trigger if exists tonix_verified_guard on public.daos;
create trigger tonix_verified_guard
    before insert or update on public.daos
    for each row execute function public.tonix_verified_guard();

-- 2 ---------------------------------------------------------------------
drop policy if exists "storage_auth_upload" on storage.objects;
drop policy if exists "storage_auth_update" on storage.objects;

-- 3 ---------------------------------------------------------------------
drop policy if exists "chatmedia_overwrite_own_only" on storage.objects;
create policy "chatmedia_overwrite_own_only" on storage.objects
    as restrictive for update to authenticated
    using (bucket_id <> 'chat-media' or owner_id = auth.uid()::text);

commit;

-- ОТКАТ:
-- begin;
-- drop trigger if exists tonix_verified_guard on public.daos;
-- drop policy if exists "chatmedia_overwrite_own_only" on storage.objects;
-- create policy "storage_auth_upload" on storage.objects for insert with check (bucket_id = 'chat-media' and auth.role() = 'authenticated');
-- create policy "storage_auth_update" on storage.objects for update using (bucket_id = 'chat-media' and auth.role() = 'authenticated');
-- commit;
