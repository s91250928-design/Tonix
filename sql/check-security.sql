-- =====================================================================
-- TONIX — ПРОВЕРКА ЗАЩИТЫ (только чтение, ничего не меняет)
-- Supabase → SQL Editor → Run. Каждая строка: что проверяем и итог.
-- «ОК» — закрыто. «ДЫРА» — открыто, пришли результат.
-- «СМОТРЕТЬ» — нужен человеческий взгляд, пришли результат.
-- =====================================================================
with
pol as (select tablename t, policyname n, cmd, roles, qual, with_check from pg_policies where schemaname = 'public'),
trg as (select tgname from pg_trigger where not tgisinternal),
r as (
  -- 1. RLS включён везде
  select 1 n, 'RLS включён на всех таблицах' chk,
         case when count(*) = 0 then 'ОК' else 'ДЫРА: ' || string_agg(c.relname, ', ') end res
    from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  union all
  -- 2. членство нельзя переписать
  select 2, 'user_chats: членство нельзя «переписать» на чужой чат',
         case when exists (select 1 from pol where t = 'user_chats' and cmd in ('UPDATE','ALL')) then 'ДЫРА' else 'ОК' end
  union all
  -- 3. вступление только через сервер
  select 3, 'user_chats: вступить в DAO можно только через сервер (join-dao)',
         coalesce((select 'СМОТРЕТЬ: ' || string_agg(n || ' CHECK ' || coalesce(with_check, '-'), ' ; ')
                     from pol where t = 'user_chats' and cmd in ('INSERT','ALL')), 'ОК')
  union all
  -- 4. голоса пишет только сервер
  select 4, 'dao_votes: голос нельзя вписать/изменить/удалить из браузера',
         coalesce((select 'ДЫРА: ' || string_agg(n || ' [' || cmd || ']', ', ')
                     from pol where t = 'dao_votes' and cmd <> 'SELECT'), 'ОК')
  union all
  select 5, 'dao_votes: один голос на человека (уникальный индекс)',
         case when exists (select 1 from pg_indexes where tablename = 'dao_votes' and indexdef ilike '%unique%'
                            and indexdef ilike '%proposal_id%' and indexdef ilike '%voter_uid%') then 'ОК' else 'ДЫРА' end
  union all
  -- 6. кошелёк меняет только сервер
  select 6, 'user_wallets: кошелёк нельзя подменить из браузера',
         coalesce((select 'ДЫРА: ' || string_agg(n || ' [' || cmd || ']', ', ')
                     from pol where t = 'user_wallets' and cmd <> 'SELECT' and not ('service_role' = any(roles))), 'ОК')
  union all
  select 7, 'user_wallets: один кошелёк — один аккаунт',
         case when exists (select 1 from user_wallets group by lower(wallet_address) having count(*) > 1)
              then 'ДЫРА: один кошелёк у нескольких аккаунтов' else 'ОК' end
  union all
  -- 8. делегирование
  select 8, 'dao_delegations: делегирование только через сервер',
         coalesce((select 'ДЫРА: ' || string_agg(n || ' [' || cmd || ']', ', ')
                     from pol where t = 'dao_delegations' and cmd in ('INSERT','UPDATE','ALL')), 'ОК')
  union all
  -- 9. оплата входа
  select 9, 'dao_entry_payments: «оплачено» ставит только сервер',
         coalesce((select 'ДЫРА: ' || string_agg(n || ' [' || cmd || ']', ', ')
                     from pol where t = 'dao_entry_payments' and cmd in ('UPDATE','ALL')), 'ОК')
  union all
  select 10, 'dao_entry_payments: из браузера можно создать только «ожидает»',
         case when exists (select 1 from pol where t = 'dao_entry_payments' and cmd = 'INSERT'
                            and with_check not ilike '%pending%') then 'ДЫРА' else 'ОК' end
  union all
  -- 11-17. триггеры защиты
  select 11, 'Предложения: автор, сроки, служебные поля (hardening)',
         case when exists (select 1 from pg_proc where proname = 'tonix_proposal_on_insert' and prosrc ilike '%author_uid := v_uid%')
               and exists (select 1 from trg where tgname = 'tonix_proposal_on_insert')
              then 'ОК' else 'ДЫРА: не запущен hardening.sql' end
  union all
  select 12, 'Предложения создают только участники',
         case when exists (select 1 from trg where tgname = 'tonix_proposal_member_guard') then 'ОК' else 'ДЫРА: не запущен hardening-3.sql' end
  union all
  select 13, 'Голосовать можно только в идущем голосовании',
         case when exists (select 1 from trg where tgname = 'tonix_vote_only_active') then 'ОК' else 'ДЫРА' end
  union all
  select 14, 'Настройки DAO: админ не меняет токен, порог, взнос',
         case when exists (select 1 from trg where tgname = 'tonix_settings_guard') then 'ОК' else 'ДЫРА: не запущен hardening-2.sql' end
  union all
  select 15, 'Сообщение не перенести в чужой чат',
         case when exists (select 1 from trg where tgname = 'tonix_message_move_guard') then 'ОК' else 'ДЫРА: не запущен hardening-2.sql' end
  union all
  select 16, 'Чат DAO не переименовать, участников не вписать',
         case when exists (select 1 from trg where tgname = 'tonix_chat_update_guard') then 'ОК' else 'ДЫРА: не запущен hardening-2.sql' end
  union all
  select 17, 'DAO нельзя «привязать» к чужому чату',
         case when exists (select 1 from trg where tgname = 'tonix_dao_chat_guard') then 'ОК' else 'ДЫРА: не запущен hardening-3.sql' end
  union all
  select 18, 'Один перевод — одна подтверждённая выплата',
         case when exists (select 1 from pg_indexes where indexname = 'dao_proposals_payout_tx_once') then 'ОК' else 'ДЫРА: не запущен hardening-3.sql' end
  union all
  -- 19. функции с повышенными правами
  select 19, 'Функции с правами владельца: search_path задан',
         coalesce((select 'ДЫРА: ' || string_agg(p.proname, ', ')
                     from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                    where s.nspname = 'public' and p.prosecdef and p.proconfig is null), 'ОК')
  union all
  -- 20. правила «для всех» на запись
  select 20, 'Правила записи без условий (USING/CHECK = true)',
         coalesce((select 'СМОТРЕТЬ: ' || string_agg(t || '.' || n || ' [' || cmd || ']', ', ')
                     from pol where cmd <> 'SELECT' and not ('service_role' = any(roles))
                      and (coalesce(qual, '') = 'true' or coalesce(with_check, '') = 'true')), 'ОК')
  union all
  -- 21. правка своей строки без CHECK
  select 21, 'UPDATE без CHECK (можно сменить владельца строки)',
         coalesce((select 'СМОТРЕТЬ: ' || string_agg(t || '.' || n, ', ')
                     from pol where cmd in ('UPDATE','ALL') and with_check is null
                      and not ('service_role' = any(roles))), 'ОК')
  union all
  -- 22. DAO: самоодобрение
  select 22, 'DAO можно создать сразу «одобренным» (без проверки админом)',
         case when exists (select 1 from pol where t = 'daos' and cmd = 'INSERT' and with_check ilike '%approved%')
              then 'СМОТРЕТЬ: так задумано?' else 'ОК' end
  union all
  -- 23. что защищает daos_protect_core
  select 23, 'daos_protect_core: какие поля защищены',
         coalesce((select 'СМОТРЕТЬ: ' || left(regexp_replace(prosrc, '\s+', ' ', 'g'), 900)
                     from pg_proc where proname = 'daos_protect_core' limit 1), 'ДЫРА: функции нет')
  union all
  -- 24. хранилище файлов
  select 24, 'Хранилище: правила записи',
         coalesce((select 'СМОТРЕТЬ: ' || string_agg(policyname || ' [' || cmd || '] ' ||
                          coalesce(qual, '-') || ' | ' || coalesce(with_check, '-'), ' ;; ')
                     from pg_policies where schemaname = 'storage' and cmd <> 'SELECT'), 'ОК: записи нет')
)
select n as "№", chk as "проверка", res as "итог" from r order by n;
