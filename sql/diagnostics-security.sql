-- =====================================================================
-- TONIX — проверка настроек безопасности базы (ТОЛЬКО ЧТЕНИЕ, ничего не меняет)
-- Supabase → SQL Editor → Run → скопировать результат и прислать.
-- =====================================================================
select 'rls' as what, c.relname as tbl,
       case when c.relrowsecurity then 'ON' else 'OFF !!!' end as detail, null as extra
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'
union all
select 'policy', tablename, policyname || ' [' || cmd || ', ' || permissive || ', ' || array_to_string(roles, ',') || ']',
       'USING: ' || coalesce(qual, '-') || ' | CHECK: ' || coalesce(with_check, '-')
  from pg_policies where schemaname = 'public'
union all
select 'definer-func', p.proname,
       case when p.proconfig is null then 'search_path НЕ задан !!!' else array_to_string(p.proconfig, ',') end,
       (select string_agg(r.rolname, ',') from pg_roles r
         where has_function_privilege(r.oid, p.oid, 'execute') and r.rolname in ('anon', 'authenticated'))
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prosecdef
union all
select 'bucket', id, case when public then 'PUBLIC' else 'private' end, null
  from storage.buckets
order by 1, 2, 3;
