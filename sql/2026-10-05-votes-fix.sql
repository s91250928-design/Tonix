-- =====================================================================
-- TONIX — голоса пишет только сервер (5 октября 2026)
-- Было: правило votes_insert_active позволяло пользователю добавить голос
-- прямо в базу, минуя cast-vote (проверку членства, токенов и веса).
-- Вес такого голоса триггер dao_votes_weight_guard и так сбрасывал до 1,
-- но сам голос засчитывался. Сайт голосует только через cast-vote,
-- а она пишет со служебным ключом — правило ей не нужно.
-- =====================================================================
begin;
drop policy if exists "votes_insert_active" on public.dao_votes;
commit;

-- ОТКАТ (если голосование на сайте перестанет работать):
-- create policy "votes_insert_active" on public.dao_votes
--     for insert
--     with check ((auth.uid() = voter_uid) and (exists ( select 1
--        from dao_proposals p
--       where ((p.id = dao_votes.proposal_id) and (p.status = 'active'::text) and (p.ends_at > now())))));
