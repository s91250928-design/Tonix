-- Tonix: голосование за исключение участника
-- 1) Колонка «кого исключить» у предложения. Только добавляет поле,
--    существующие данные не трогает.
alter table public.dao_proposals add column if not exists action_target uuid;

-- 2) Показать ограничения таблицы: если среди них есть проверка
--    списка action_type, её нужно будет расширить (пришли результат).
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.dao_proposals'::regclass;
