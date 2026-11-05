-- Голосование «По балансу TON» не сохранялось: правило требовало адрес токена
-- длиной от 48 символов, а для TON в поле пишется слово 'TON'.
-- Разрешаем 'TON' (символ TON, точность 9), адреса токенов проверяются как раньше.
alter table public.dao_settings drop constraint dao_settings_vote_jetton_chk;
alter table public.dao_settings add constraint dao_settings_vote_jetton_chk check (
  vote_jetton is null
  or (vote_jetton = 'TON' and vote_symbol = 'TON' and vote_decimals = 9)
  or (length(vote_jetton) >= 48 and vote_symbol is not null and length(btrim(vote_symbol)) > 0
      and vote_decimals is not null and vote_decimals >= 0 and vote_decimals <= 30)
);
