# Tonix — DAO-платформа на TON

[English below](#english)

Tonix — это инструмент для токен-сообществ на TON: голосования холдеров с весом по токенам, закрытый чат только для холдеров и открытая история казны. Платформа работает в Telegram и в браузере, кошелёк подключается через TON Connect.

## Доступа к средствам у платформы нет

Это главное, и это можно проверить по коду в этом репозитории:

- **Своего смарт-контракта для казны у Tonix нет.** Казна сообщества — это официальный мультисиг TON ([multisig-contract-v2](https://github.com/ton-blockchain/multisig-contract-v2)) от команды TON Core, прошедший аудит Zellic и Trail of Bits. Такой же контракт создаёт Tonkeeper Pro и multisig.ton.org.
- **Казна только читается.** Модули [`js/treasury.js`](js/treasury.js) и [`js/treasury-tx.js`](js/treasury-tx.js) получают баланс и историю транзакций мультисига из публичного API блокчейна. В них нет ключей, подписей и отправки средств.
- **Платформа никогда не подписывает транзакции сама.** В коде всего три места, где создаётся транзакция, и все три отправляют её в кошелёк пользователя через TON Connect, где человек сам нажимает «Подтвердить»:
  - [`js/multisig-deploy.js`](js/multisig-deploy.js), строка 124 — создание мультисига кошельком самого основателя;
  - [`js/entry-fee.js`](js/entry-fee.js), строки 261 и 281 — оплата входа в DAO, деньги уходят напрямую в казну этого DAO, а не платформе.
- **В коде нет приватных ключей и сид-фраз.** Выводом средств из казны управляют только подписанты мультисига в своих кошельках (Tonkeeper, multisig.ton.org).

Подключить казну к Tonix — значит просто указать её публичный адрес. По адресу видно баланс и историю, как в Tonviewer, но вывести по нему ничего нельзя.

## Что в репозитории

| Файл | Что делает |
|---|---|
| `index.html` | Интерфейс платформы |
| `js/auth.js`, `js/supabase-init.js` | Вход и подключение кошелька через TON Connect |
| `js/governance.js` | Голосования с весом по токенам |
| `js/chat.js` | Чат для холдеров |
| `js/treasury.js`, `js/treasury-tx.js`, `js/treasury-guide.js` | Казна: баланс, история, инструкция (только чтение) |
| `js/multisig-deploy.js` | Создание официального мультисига кошельком пользователя |
| `js/entry-fee.js`, `js/verify-entry-fee.ts` | Платный вход в DAO (оплата в казну DAO) и его проверка на сервере |
| `js/config.js` | Публичные настройки (адрес базы, публичный ключ, адреса казны) |

## Как устроен чат холдеров

Чат работает как обычные группы в Telegram: **без сквозного (E2E) шифрования**, и вся история видна каждому участнику, включая новых. Это осознанный выбор. При сквозном шифровании в группах (Signal, WhatsApp, протокол MLS) новый участник не может прочитать сообщения, отправленные до его входа, а холдерам, которые присоединяются позже, нужна вся история решений. Доступ к чату ограничивают права в базе данных. Чат не связан с казной: средства от него никак не зависят.

В `js/config.js` лежит **публичный** ключ Supabase (роль `anon`). Он и так виден любому на работающем сайте; доступ к данным ограничивают правила базы. Сервисный ключ хранится только в секретах сервера и в код не попадает.

## Контакты

Telegram-бот: [@TonixDAO_bot](https://t.me/TonixDAO_bot) · Каталог: [TON Apps](https://ton.app/social/tonix?id=5842)

---

<a name="english"></a>
# Tonix — DAO platform on TON

Tonix is a tool for token communities on TON: token-weighted holder voting, a holders-only chat, and an open treasury history. It runs in Telegram and in the browser; wallets connect through TON Connect.

## The platform has no access to funds

You can verify this in the code:

- **Tonix has no treasury contract of its own.** A community treasury is the official TON multisig ([multisig-contract-v2](https://github.com/ton-blockchain/multisig-contract-v2)) by TON Core, audited by Zellic and Trail of Bits — the same contract Tonkeeper Pro and multisig.ton.org deploy.
- **The treasury is read-only.** [`js/treasury.js`](js/treasury.js) and [`js/treasury-tx.js`](js/treasury-tx.js) only fetch the multisig balance and transaction history from a public blockchain API. No keys, no signing, no transfers.
- **The platform never signs transactions.** There are exactly three places that build a transaction, and all of them hand it to the user's own wallet via TON Connect for manual approval:
  - [`js/multisig-deploy.js`](js/multisig-deploy.js) line 124 — the founder deploys the multisig from their own wallet;
  - [`js/entry-fee.js`](js/entry-fee.js) lines 261 and 281 — DAO entry fee, paid straight into that DAO's treasury, not to the platform.
- **No private keys or seed phrases in the code.** Only the multisig signers can withdraw, from their own wallets.

Connecting a treasury to Tonix just means entering its public address — like viewing it on Tonviewer.

## Holder chat

The chat works like regular Telegram groups: **no end-to-end encryption**, and the full history is visible to every member, including new ones. This is deliberate: with group E2E (Signal, WhatsApp, MLS) a new member cannot read messages sent before they joined, while holders who join later need the full decision history. Access is restricted by database rules. The chat is not connected to the treasury in any way.

Bot: [@TonixDAO_bot](https://t.me/TonixDAO_bot) · Listed in [TON Apps](https://ton.app/social/tonix?id=5842)
