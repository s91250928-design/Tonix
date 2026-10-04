/* =====================================================
   TONIX — landing-tech.js
   Две секции лендинга: «Путь денег» и «Попробуй сломать».

   Зачем. Все крипто-платформы заявляют безопасность словами:
   audited, non-custodial, secure. Проверить это посетитель не может
   и потому не верит. У Tonix архитектура такая, что заявление можно
   показать: платформа физически не имеет доступа к казне. Поэтому
   первая секция — разрез архитектуры, где стрелки от Tonix к деньгам
   просто нет, а вторая даёт посетителю сыграть за атакующего.

   Каждая атака проваливается своей анимацией и называет настоящий
   механизм защиты — не «мы позаботились», а «триггер в базе»,
   «порог мультисига», «два снимка баланса», «политики RLS».

   Графика рисуется кодом: фаски, затенение в углах, спекуляр,
   контактная тень, рёбра. Скриншоты и эмодзи не используются —
   первые устаревают молча, вторые ломают серьёзный тон.
   ===================================================== */

(function () {
    "use strict";

    var LT = {
        ru: {
            eyebrow: "Архитектура",
            h1: "Деньги не проходят через Tonix",
            lead: "Большинство DAO-платформ держат казну у себя и просят доверия. Мы устроены иначе: казна живёт в мультисиг-контракте TON Foundation, а Tonix её только читает. Даже если бы мы захотели, вывести средства нам нечем — у платформы нет ключа.",
            l1: "Участники",
            l1s: "предлагают и голосуют",
            l2: "Tonix",
            l2s: "считает голоса, показывает баланс, уведомляет подписантов",
            l3: "Мультисиг TON",
            l3s: "деньги · движутся только по подписям",
            bound: "граница доступа — Tonix её не пересекает",
            aVote: "голос",
            aNotify: "уведомление подписантам",
            aSign: "подписи участников",
            ghost: "перевод от платформы — невозможен",
            keys: "2 из 2",
            gtitle: "Что именно вам гарантировано",
            g: [
                ["Казна — не наш код",
                 "Средства лежат в TON Multisig v2 — контракте TON Foundation, а не в нашей разработке. Его код открыт и проверен задолго до нас. Мы не можем изменить его правила."],
                ["Голосование советует, не платит",
                 "Итог голосования не двигает деньги. Он превращается в задачу подписантам, и перевод они создают вручную. Так взлом сайта не превращается в кражу казны."],
                ["Вес голоса считает сервер",
                 "Браузер принадлежит пользователю, поэтому вес голоса в нём не вычисляется. Его ставит сервер по балансу на кошельке, а в базе стоит триггер: любая запись не от сервера получает вес один."],
                ["Исполнение подтверждает блокчейн",
                 "«Выплачено» ставится не по слову владельца, а после того как платформа нашла транзакцию в сети. Отметка вручную остаётся, но помечена как непроверенная — видно всем."]
            ],
            beyebrow: "Проверка",
            btitle: "Попробуйте сломать",
            blead: "Ниже — четыре настоящих способа украсть или подтасовать. Нажмите любой и посмотрите, что именно его останавливает.",
            back: "Другая атака",
            atk: [
                {
                    tab: "Нарисовать себе голоса",
                    h: "Атака: подменить вес голоса в браузере",
                    p: "Открываем инструменты разработчика и отправляем свой голос с весом десять тысяч вместо честного баланса.",
                    fail: "Вес обнулился до единицы",
                    why: "Вес назначает только сервер, по балансу кошелька. В базе стоит триггер: строка, пришедшая не от сервера, принудительно получает вес один. Записать себе влияние из браузера нельзя — правило живёт в базе, а не в коде страницы."
                },
                {
                    tab: "Вывести казну",
                    h: "Атака: увести деньги одной подписью",
                    p: "Создаём в мультисиге ордер на весь баланс и подписываем своим кошельком.",
                    fail: "Одной подписи недостаточно",
                    why: "Порог задаётся при создании контракта. Изменить его можно только ордером, который одобрят сами подписанты по текущему порогу. Пока не набрано нужное число подписей, ордер просто ждёт. Ключа платформы среди подписантов нет вообще — Tonix не может ни создать перевод, ни подтвердить чужой."
                },
                {
                    tab: "Размножить кошельки",
                    h: "Атака: переслать токены и проголосовать дважды",
                    p: "Голосуем, переводим токены на второй кошелёк и голосуем им же — влияние должно удвоиться.",
                    fail: "Суммарный вес не изменился",
                    why: "Вес фиксируется в момент голоса, а при закрытии берётся меньшее из «было тогда» и «есть сейчас». Кто переслал — теряет вес, кто получил — учитывается один раз. Гонять токены по кругу бессмысленно: сумма не превысит реально удерживаемое."
                },
                {
                    tab: "Прочитать чужое",
                    h: "Атака: запросить базу напрямую",
                    p: "Берём публичный ключ из кода страницы и запрашиваем чужие сообщения, заявки и голоса.",
                    fail: "Ноль строк",
                    why: "Публичный ключ открывает дверь, а не доступ. Что видно за дверью, решают политики на уровне строк в самой базе. Запрос выполняется, но возвращает только то, что положено этому участнику. Проверка не в браузере — обойти её нечем."
                }
            ],
            note: "Каждый механизм выше работает в мейннете прямо сейчас, а не в планах.",
            meyebrow: "Механика",
            mh: "Соберите подписи сами",
            mlead: "Ниже — настоящий порог мультисига, только без денег. Поставьте подписи и посмотрите, в какой момент перевод уходит. И попробуйте подписать за платформу.",
            order: "Ордер на перевод",
            oamount: "1 200 DUREV",
            oto: "получатель",
            k1: "Подписать ключом участника",
            k2: "Подписать вторым ключом",
            kx: "Подписать за Tonix",
            reset: "Начать заново",
            of2: "подписей",
            logHead: "Журнал контракта",
            lg: {
                open: "ордер создан · ожидает подписей",
                s1: "подпись принята · порог не достигнут, деньги на месте",
                s2: "подпись принята · порог достигнут",
                exec: "перевод исполнен контрактом",
                deny: "отказано: у платформы нет ключа среди подписантов",
                dup: "этот ключ уже подписал — второй раз голоса не даёт",
                reset: "ордер сброшен"
            },
            netHead: "Сеть TON",
            netBlock: "мастерчейн, блок",
            netLive: "живые данные из блокчейна, обновляются сами",
            deyebrow: "Участие",
            dh: "Голос можно доверить",
            dlead: "Нет времени голосовать в каждом предложении? Отдайте свой вес участнику, которому доверяете. Токены остаются у вас — двигать их не нужно, передаётся только право голоса. Отозвать можно в любой момент.",
            dHolder: "Держатель",
            dDelegate: "Делегат",
            dTokens: "1 000 DUREV",
            dStay: "остаются на кошельке",
            dWeightTo: "вес голоса",
            dBtn: "Делегировать голос",
            dRevoke: "Отозвать",
            dReset: "Сбросить",
            dStateIdle: "вес голоса пока у держателя",
            dStateDone: "делегат голосует весом держателя",
            dNote1: "Токены не переводятся — только право голоса.",
            dNote2: "Двойного счёта нет: при закрытии вес считается по балансу держателя. Переслал токены — вес обнулился.",
            dLogDeleg: "голос делегирован · токены на месте",
            dLogVote: "делегат проголосовал весом 1 000 DUREV",
            dLogRevoke: "делегирование отозвано · голос вернулся"
        },
        en: {
            eyebrow: "Architecture",
            h1: "Money never passes through Tonix",
            lead: "Most DAO platforms hold the treasury themselves and ask for trust. We are built differently: the treasury lives in a TON Foundation multisig contract and Tonix only reads it. Even if we wanted to move funds, we have nothing to move them with — the platform holds no key.",
            l1: "Members",
            l1s: "propose and vote",
            l2: "Tonix",
            l2s: "counts votes, shows the balance, notifies signers",
            l3: "TON Multisig",
            l3s: "the money · moves only by signatures",
            bound: "access boundary — Tonix never crosses it",
            aVote: "vote",
            aNotify: "notice to signers",
            aSign: "member signatures",
            ghost: "transfer by the platform — impossible",
            keys: "2 of 2",
            gtitle: "What you are actually guaranteed",
            g: [
                ["The vault is not our code",
                 "Funds sit in TON Multisig v2 — a TON Foundation contract, not our build. Its code was public and reviewed long before us, and we cannot change its rules."],
                ["Voting advises, it does not pay",
                 "A vote result moves no money. It becomes a task for the signers, who create the transfer by hand. A compromised website does not become a stolen treasury."],
                ["Vote weight is computed server-side",
                 "The browser belongs to the user, so weight is never computed there. The server sets it from the wallet balance, and a database trigger forces weight to one for any row that did not come from the server."],
                ["Execution is confirmed on-chain",
                 "«Paid» is not set on the owner's word — the platform finds the transaction in the network first. Manual marking still exists but is labelled unverified, visibly, to everyone."]
            ],
            beyebrow: "Verification",
            btitle: "Try to break it",
            blead: "Below are four real ways to steal or rig. Pick any one and see exactly what stops it.",
            back: "Another attack",
            atk: [
                {
                    tab: "Forge vote weight",
                    h: "Attack: change vote weight in the browser",
                    p: "Open devtools and submit a vote carrying ten thousand weight instead of the honest balance.",
                    fail: "Weight collapsed to one",
                    why: "Only the server assigns weight, from the wallet balance. A database trigger forces any row that did not come from the server down to weight one. Influence cannot be written from the browser — the rule lives in the database, not in page code."
                },
                {
                    tab: "Drain the treasury",
                    h: "Attack: move funds with one signature",
                    p: "Create an order in the multisig for the whole balance and sign it with your wallet.",
                    fail: "One signature is not enough",
                    why: "The threshold is set when the contract is created. It can only be changed by an order approved by the signers themselves under the current threshold. Until enough signatures are collected the order simply waits. The platform's key is not among the signers at all — Tonix can neither create a transfer nor approve one."
                },
                {
                    tab: "Multiply wallets",
                    h: "Attack: forward tokens and vote twice",
                    p: "Vote, send the tokens to a second wallet and vote again — influence should double.",
                    fail: "Total weight unchanged",
                    why: "Weight is recorded at the moment of the vote, and on close the lesser of «then» and «now» is used. Whoever forwarded loses the weight; whoever received is counted once. Circulating tokens is pointless: the sum never exceeds what is actually held."
                },
                {
                    tab: "Read other people's data",
                    h: "Attack: query the database directly",
                    p: "Take the public key from the page source and request other members' messages, applications and votes.",
                    fail: "Zero rows",
                    why: "A public key opens the door, not the data. What is visible behind that door is decided by row-level policies inside the database. The query runs, but returns only what belongs to this member. The check is not in the browser — there is nothing to bypass."
                }
            ],
            note: "Every mechanism above runs on mainnet right now, not on a roadmap.",
            meyebrow: "Mechanics",
            mh: "Collect the signatures yourself",
            mlead: "Below is a real multisig threshold, just without the money. Add signatures and see the exact moment the transfer leaves. And try signing on the platform's behalf.",
            order: "Transfer order",
            oamount: "1,200 DUREV",
            oto: "recipient",
            k1: "Sign with a member key",
            k2: "Sign with the second key",
            kx: "Sign as Tonix",
            reset: "Start over",
            of2: "signatures",
            logHead: "Contract log",
            lg: {
                open: "order created · awaiting signatures",
                s1: "signature accepted · threshold not met, funds untouched",
                s2: "signature accepted · threshold met",
                exec: "transfer executed by the contract",
                deny: "denied: the platform holds no key among the signers",
                dup: "this key already signed — a second press adds nothing",
                reset: "order reset"
            },
            netHead: "TON network",
            netBlock: "masterchain, block",
            netLive: "live from the blockchain, refreshes on its own",
            deyebrow: "Participation",
            dh: "Your vote can be entrusted",
            dlead: "No time to vote on everything? Hand your weight to a member you trust. Your tokens stay with you — nothing moves, only the right to vote. Revoke anytime.",
            dHolder: "Holder",
            dDelegate: "Delegate",
            dTokens: "1,000 DUREV",
            dStay: "stay in the wallet",
            dWeightTo: "vote weight",
            dBtn: "Delegate the vote",
            dRevoke: "Revoke",
            dReset: "Reset",
            dStateIdle: "weight still with the holder",
            dStateDone: "delegate votes with the holder's weight",
            dNote1: "Tokens are not transferred — only the right to vote.",
            dNote2: "No double counting: on close, weight is measured by the holder's balance. Move the tokens away and the weight drops to zero.",
            dLogDeleg: "vote delegated · tokens untouched",
            dLogVote: "delegate voted with 1,000 DUREV",
            dLogRevoke: "delegation revoked · vote returned"
        }
    };

    function t() {
        var l = (typeof curLang !== "undefined" && LT[curLang]) ? curLang : "en";
        return LT[l];
    }
    function esc(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }
    var reduced = false;
    try {
        reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) { }

    /* ═══════════════ Стили ═══════════════
       Держим их в модуле: секции ставятся и снимаются одним файлом,
       и стили не разъезжаются с разметкой. */
    var CSS = `
    .lt-wrap{position:relative;padding:96px 0 40px}
    .lt-eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:11.5px;letter-spacing:.18em;
        text-transform:uppercase;color:var(--dim2);margin-bottom:18px}
    .lt-eyebrow i{display:block;width:22px;height:1px;background:linear-gradient(90deg,var(--accent),transparent)}
    .lt-h{font-family:var(--serif);font-size:clamp(30px,4.6vw,52px);line-height:1.06;
        letter-spacing:-.02em;margin:0 0 18px;max-width:16em}
    .lt-lead{font-size:16.5px;line-height:1.7;color:var(--dim);max-width:60ch;margin:0}

    /* Разрез архитектуры */
    .lt-stage{position:relative;margin:52px 0 0;padding:26px 22px 22px;border-radius:20px;
        background:linear-gradient(180deg,rgba(255,255,255,.028),transparent 60%);
        border:1px solid var(--border);overflow:hidden}
    .lt-stage::before{content:"";position:absolute;inset:0;pointer-events:none;
        background:radial-gradient(120% 80% at 78% 8%,rgba(45,131,236,.13),transparent 62%)}
    .lt-diagram{position:relative;display:block;width:100%;height:auto}
    .lt-layer{opacity:0;transform:translateY(14px);transition:opacity .6s cubic-bezier(.2,.7,.3,1),transform .6s cubic-bezier(.2,.7,.3,1)}
    .lt-on .lt-layer{opacity:1;transform:none}
    .lt-on .lt-layer.d2{transition-delay:.14s}
    .lt-on .lt-layer.d3{transition-delay:.28s}
    .lt-draw{stroke-dasharray:var(--len,300);stroke-dashoffset:var(--len,300);
        transition:stroke-dashoffset 1.1s cubic-bezier(.3,.8,.2,1)}
    .lt-on .lt-draw{stroke-dashoffset:0}
    .lt-on .lt-draw.d2{transition-delay:.35s}
    .lt-on .lt-draw.d3{transition-delay:.6s}
    .lt-ghost{opacity:0}
    .lt-on .lt-ghost{animation:ltGhost 3.6s ease 1.5s infinite}
    @keyframes ltGhost{0%{opacity:0}18%{opacity:.85}42%{opacity:.85}62%{opacity:0}100%{opacity:0}}

    /* Гарантии */
    .lt-g{display:grid;grid-template-columns:repeat(2,1fr);gap:1px;margin:64px 0 0;
        background:var(--border);border:1px solid var(--border);border-radius:18px;overflow:hidden}
    .lt-gc{background:var(--bg);padding:26px 24px 28px;position:relative;
        opacity:0;transform:translateY(12px);transition:opacity .55s,transform .55s}
    .lt-gon .lt-gc{opacity:1;transform:none}
    .lt-gon .lt-gc:nth-child(2){transition-delay:.08s}
    .lt-gon .lt-gc:nth-child(3){transition-delay:.16s}
    .lt-gon .lt-gc:nth-child(4){transition-delay:.24s}
    .lt-gc h4{font-family:var(--serif);font-size:19px;font-weight:600;margin:0 0 9px;color:var(--text);letter-spacing:-.01em}
    .lt-gc p{font-size:14px;line-height:1.66;color:var(--dim);margin:0}
    .lt-gc::after{content:"";position:absolute;left:24px;right:24px;top:0;height:1px;
        background:linear-gradient(90deg,var(--accent),transparent 70%);opacity:0;transition:opacity .3s}
    .lt-gc:hover::after{opacity:.6}

    /* Симулятор атак */
    .lt-break{margin-top:104px}
    .lt-tabs{display:flex;flex-wrap:wrap;gap:8px;margin:26px 0 0}
    .lt-tab{appearance:none;cursor:pointer;font-family:inherit;font-size:13.5px;
        padding:11px 17px;border-radius:999px;color:var(--dim);
        background:var(--surface2);border:1px solid var(--border);
        transition:color .18s,border-color .18s,background .18s,transform .18s}
    .lt-tab:hover{color:var(--text);border-color:var(--border2);transform:translateY(-1px)}
    .lt-tab[aria-selected="true"]{color:#fff;border-color:transparent;
        background:linear-gradient(120deg,var(--accent),var(--accent2))}
    .lt-tab:focus-visible{outline:2px solid var(--accent2);outline-offset:2px}

    .lt-panel{margin-top:20px;border:1px solid var(--border);border-radius:20px;
        background:var(--surface);overflow:hidden;
        display:grid;grid-template-columns:1.05fr .95fr;min-height:330px}
    .lt-pl{padding:30px 30px 32px;display:flex;flex-direction:column}
    .lt-pl h3{font-family:var(--serif);font-size:22px;margin:0 0 10px;letter-spacing:-.01em}
    .lt-pl>p{font-size:14.5px;line-height:1.68;color:var(--dim);margin:0}
    .lt-run{margin-top:auto;padding-top:24px}
    .lt-verdict{opacity:0;transform:translateY(8px);transition:opacity .4s,transform .4s}
    .lt-verdict.show{opacity:1;transform:none}
    .lt-vhead{display:flex;align-items:center;gap:9px;font-size:14px;font-weight:700;color:var(--ok);margin-bottom:8px}
    .lt-vhead svg{width:17px;height:17px;flex-shrink:0;fill:none;stroke:var(--ok);stroke-width:2.2}
    .lt-why{font-size:14px;line-height:1.68;color:var(--dim);margin:0}
    .lt-pr{position:relative;background:
        radial-gradient(90% 70% at 50% 34%,rgba(45,131,236,.14),transparent 66%),var(--bg);
        border-left:1px solid var(--border);display:grid;place-items:center;padding:22px;min-height:300px}
    .lt-scene{width:100%;max-width:340px;height:auto;display:block}

    /* Механизм подписей */
    .lt-ms{display:grid;grid-template-columns:1fr .82fr;gap:1px;margin-top:30px;
        background:var(--border);border:1px solid var(--border);border-radius:20px;overflow:hidden}
    .lt-msl{background:var(--surface);padding:28px}
    .lt-msr{background:radial-gradient(80% 60% at 50% 30%,rgba(45,131,236,.16),transparent 68%),var(--bg);
        padding:26px 22px 24px;display:flex;flex-direction:column;align-items:center;justify-content:center}
    .lt-ord{border:1px solid var(--border);border-radius:14px;padding:18px 20px;background:var(--bg)}
    .lt-ordh{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim2)}
    .lt-orda{font-family:var(--serif);font-size:32px;font-weight:600;letter-spacing:-.02em;margin:6px 0 10px}
    .lt-ordto{display:flex;align-items:baseline;gap:9px;font-size:12.5px;color:var(--dim2)}
    .lt-ordto code{font-family:ui-monospace,monospace;font-size:12.5px;color:var(--dim)}
    .lt-keys{display:grid;gap:9px;margin-top:20px}
    .lt-key{appearance:none;cursor:pointer;font-family:inherit;font-size:14px;text-align:left;
        padding:14px 17px;border-radius:12px;color:var(--text);background:var(--surface2);
        border:1px solid var(--border2);transition:transform .16s,border-color .16s,background .16s}
    .lt-key:hover{transform:translateX(3px);border-color:var(--accent);background:rgba(45,131,236,.09)}
    .lt-key:active{transform:translateX(1px) scale(.995)}
    .lt-key:focus-visible{outline:2px solid var(--accent2);outline-offset:2px}
    .lt-key.deny{border-style:dashed;color:var(--dim)}
    .lt-key.deny:hover{border-color:#e0a64b;background:rgba(224,166,75,.08);color:#e0a64b}
    .lt-key.ghostbtn{background:transparent;border-color:var(--border);color:var(--dim2);font-size:13px;padding:11px 17px}
    .lt-cnt{font-family:ui-monospace,monospace;font-size:26px;font-weight:700;
        color:var(--text);margin-top:14px;letter-spacing:.02em}
    .lt-cntl{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim2);margin-top:2px}
    .lt-state{font-size:13px;color:var(--dim);margin-top:14px;text-align:center;min-height:2.6em;
        max-width:22ch;line-height:1.5;transition:color .3s}
    .lt-tx{font-family:ui-monospace,monospace;font-size:11.5px;color:var(--accent2);
        opacity:0;transition:opacity .4s;margin-top:2px}
    .lt-seg{transition:stroke .35s cubic-bezier(.3,.8,.2,1)}
    #ltMSglow{transition:opacity .5s}

    /* Журнал контракта */
    .lt-logwrap{margin-top:14px;border:1px solid var(--border);border-radius:16px;
        background:var(--bg);overflow:hidden}
    .lt-logh{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim2);
        padding:13px 18px;border-bottom:1px solid var(--border)}
    .lt-log{max-height:150px;overflow-y:auto;padding:10px 18px 14px;
        font-family:ui-monospace,monospace;font-size:12.5px;line-height:1.9}
    .lt-logrow{display:flex;gap:14px;opacity:0;transform:translateX(-6px);
        transition:opacity .28s,transform .28s}
    .lt-logrow.in{opacity:1;transform:none}

    /* Живой блок */
    .lt-net{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:14px;
        padding:12px 18px;border:1px solid var(--border);border-radius:14px;background:var(--bg)}
    .lt-netd{width:7px;height:7px;border-radius:50%;background:var(--ok);flex-shrink:0;
        box-shadow:0 0 0 0 rgba(62,207,142,.5);animation:ltPulse 2.4s ease-out infinite}
    @keyframes ltPulse{0%{box-shadow:0 0 0 0 rgba(62,207,142,.45)}70%{box-shadow:0 0 0 9px rgba(62,207,142,0)}100%{box-shadow:0 0 0 0 rgba(62,207,142,0)}}
    .lt-neth{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim2)}
    .lt-netb{font-size:13.5px;color:var(--dim)}
    .lt-netb b{font-family:ui-monospace,monospace;color:var(--text);font-weight:700}
    .lt-netb b.tick{animation:ltTick .5s ease}
    @keyframes ltTick{0%{color:var(--accent2);transform:translateY(-2px)}100%{color:var(--text);transform:none}}
    .lt-netn{font-size:12px;color:var(--dim2);margin-left:auto}

    @media(max-width:900px){
        .lt-wrap{padding:70px 0 30px}
        .lt-g{grid-template-columns:1fr}
        .lt-panel{grid-template-columns:1fr}
        .lt-pr{border-left:none;border-top:1px solid var(--border);order:-1;min-height:230px}
        .lt-pl{padding:24px 22px 26px}
        .lt-break{margin-top:76px}
        .lt-ms{grid-template-columns:1fr}
        .lt-msl{padding:22px}
        .lt-msr{order:-1;padding:22px 18px}
        .lt-netn{margin-left:0;width:100%}
    }
    @media(prefers-reduced-motion:reduce){
        .lt-layer,.lt-draw,.lt-gc{transition:none!important;opacity:1!important;transform:none!important;stroke-dashoffset:0!important}
        .lt-on .lt-ghost{animation:none;opacity:.7}
    }`;

    /* ═══════════════ Общие определения графики ═══════════════
       Свой набор, а не заимствованный: модуль должен рисоваться
       одинаково, куда бы его ни поставили. Фаска, затенение в углах,
       спекуляр и рёбра — то, что отличает объём от плоской заливки. */
    function defs(id) {
        return `
        <defs>
          <linearGradient id="${id}Body" x1="0" y1="0" x2=".35" y2="1">
            <stop offset="0" stop-color="#25324a"/><stop offset=".45" stop-color="#16203045"/>
            <stop offset=".46" stop-color="#141d2c"/><stop offset="1" stop-color="#0a1120"/>
          </linearGradient>
          <linearGradient id="${id}FaceL" x1="0" y1="0" x2="1" y2=".3">
            <stop offset="0" stop-color="#1b2740"/><stop offset="1" stop-color="#0d1626"/>
          </linearGradient>
          <linearGradient id="${id}FaceR" x1="1" y1="0" x2="0" y2=".4">
            <stop offset="0" stop-color="#2b3d5e"/><stop offset="1" stop-color="#111b2c"/>
          </linearGradient>
          <linearGradient id="${id}Crown" x1=".2" y1="0" x2=".8" y2="1">
            <stop offset="0" stop-color="#6fa8ff"/><stop offset=".5" stop-color="#2d83ec"/>
            <stop offset="1" stop-color="#1a4f96"/>
          </linearGradient>
          <linearGradient id="${id}Bevel" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#cfe4ff" stop-opacity=".85"/>
            <stop offset="1" stop-color="#cfe4ff" stop-opacity="0"/>
          </linearGradient>
          <radialGradient id="${id}AO" cx=".5" cy=".28" r=".78">
            <stop offset=".55" stop-color="#000" stop-opacity="0"/>
            <stop offset="1" stop-color="#000" stop-opacity=".55"/>
          </radialGradient>
          <radialGradient id="${id}Core" cx=".5" cy=".42" r=".6">
            <stop offset="0" stop-color="#bfe6ff"/><stop offset=".55" stop-color="#1ac9ff" stop-opacity=".6"/>
            <stop offset="1" stop-color="#1ac9ff" stop-opacity="0"/>
          </radialGradient>
          <linearGradient id="${id}Edge" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#8fc4ff"/><stop offset=".5" stop-color="#1ac9ff"/>
            <stop offset="1" stop-color="#2d83ec" stop-opacity=".35"/>
          </linearGradient>
          <linearGradient id="${id}Spec" x1="0" y1="0" x2=".6" y2="1">
            <stop offset="0" stop-color="#fff" stop-opacity=".55"/>
            <stop offset="1" stop-color="#fff" stop-opacity="0"/>
          </linearGradient>
          <linearGradient id="${id}Acc" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#2d83ec"/><stop offset="1" stop-color="#1ac9ff"/>
          </linearGradient>
          <filter id="${id}Soft" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="5"/>
          </filter>
          <filter id="${id}Drop" x="-30%" y="-30%" width="170%" height="180%">
            <feDropShadow dx="0" dy="7" stdDeviation="7" flood-color="#02050b" flood-opacity=".72"/>
          </filter>
        </defs>`;
    }

    /* Огранённый камень TON: вертикальная форма с короной, павильоном
       и рундистом. Порядок слоёв как в настоящем рендере — сначала
       контактная тень, потом грани с разным освещением, затем фаска,
       блик и рёбра. Плоская заливка объёма не даёт. */
    function gem(id, x, y, s) {
        return '<g transform="translate(' + x + ',' + y + ') scale(' + s + ')">' +
          '<ellipse cx="0" cy="46" rx="26" ry="5" fill="#02050b" opacity=".8" filter="url(#' + id + 'Soft)"/>' +
          '<g filter="url(#' + id + 'Drop)">' +
            /* павильон: две грани, свет слева */
            '<path d="M-30 -10 L0 44 L0 -10 Z" fill="url(#' + id + 'FaceL)"/>' +
            '<path d="M30 -10 L0 44 L0 -10 Z" fill="url(#' + id + 'FaceR)"/>' +
            /* корона */
            '<path d="M-30 -10 L-18 -34 L18 -34 L30 -10 Z" fill="url(#' + id + 'Crown)"/>' +
            '<path d="M-18 -34 L18 -34 L8 -10 L-8 -10 Z" fill="#9fccff" opacity=".34"/>' +
            '<path d="M-30 -10 L-18 -34 L-8 -10 Z" fill="#0d1b30" opacity=".45"/>' +
            /* рундист — тонкое ребро по обхвату */
            '<path d="M-30 -10 L30 -10" stroke="#cfe4ff" stroke-width="1.6" opacity=".7"/>' +
            '<path d="M-30 -10 L0 44 L30 -10 L18 -34 L-18 -34 Z" fill="url(#' + id + 'AO)"/>' +
            '<path d="M-18 -34 L18 -34 L14 -30 L-14 -30 Z" fill="url(#' + id + 'Bevel)" opacity=".7"/>' +
            '<path d="M-26 -12 L-4 -12 L-2 30 Z" fill="url(#' + id + 'Spec)" opacity=".16"/>' +
          "</g>" +
          '<path d="M-30 -10 L0 44 L30 -10 L18 -34 L-18 -34 Z" fill="none" ' +
            'stroke="url(#' + id + 'Edge)" stroke-width="1.6" stroke-linejoin="round"/>' +
          '<path d="M-8 -10 L0 44 M8 -10 L0 44 M-18 -34 L-8 -10 M18 -34 L8 -10" ' +
            'stroke="#a8c8ff" stroke-width=".6" opacity=".28" fill="none"/>' +
        "</g>";
    }

    /* Механизм подписей: кольцо из секторов, по одному на подписанта.
       Заполненный сектор — поставленная подпись. Читается как замок,
       а не как лицо, и растёт под любой порог: 2 из 3, 3 из 5.
       Он же служит интерактивом — сектора загораются по нажатию. */
    function ringArc(cx, cy, r, a0, a1) {
        var d = Math.PI / 180;
        var x0 = cx + r * Math.cos(a0 * d), y0 = cy + r * Math.sin(a0 * d);
        var x1 = cx + r * Math.cos(a1 * d), y1 = cy + r * Math.sin(a1 * d);
        return "M" + x0.toFixed(2) + " " + y0.toFixed(2) +
               " A" + r + " " + r + " 0 " + ((a1 - a0) > 180 ? 1 : 0) + " 1 " +
               x1.toFixed(2) + " " + y1.toFixed(2);
    }
    function lockRing(id, cx, cy, r, total, filled, interactive) {
        var gap = total > 3 ? 6 : 9;          /* просвет между секторами */
        var step = 360 / total;
        var out = '<g class="lt-ring" data-ring="1">';

        /* колодец под кольцом — даёт кольцу толщину */
        out += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r + 9) + '" fill="#070d18" opacity=".55"/>';
        out += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r + 9) + '" fill="none" ' +
               'stroke="#000" stroke-opacity=".5" stroke-width="1"/>';
        out += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r - 9) + '" fill="none" ' +
               'stroke="rgba(255,255,255,.05)" stroke-width="1"/>';

        for (var i = 0; i < total; i++) {
            var a0 = -90 + i * step + gap / 2, a1 = -90 + (i + 1) * step - gap / 2;
            var on = i < filled;
            out += '<path id="' + id + 'seg' + i + '" d="' + ringArc(cx, cy, r, a0, a1) + '" ' +
                'fill="none" stroke-width="9" stroke-linecap="round" ' +
                'stroke="' + (on ? "url(#" + id + "Acc)" : "#1a2438") + '" ' +
                'opacity="' + (on ? "1" : ".9") + '"' +
                (interactive ? ' class="lt-seg"' : "") + "/>";
            /* насечка-разделитель: без неё сектора сливаются в круг */
            var am = (-90 + (i + 1) * step) * Math.PI / 180;
            out += '<line x1="' + (cx + (r - 7) * Math.cos(am)).toFixed(1) +
                   '" y1="' + (cy + (r - 7) * Math.sin(am)).toFixed(1) +
                   '" x2="' + (cx + (r + 7) * Math.cos(am)).toFixed(1) +
                   '" y2="' + (cy + (r + 7) * Math.sin(am)).toFixed(1) +
                   '" stroke="#070d18" stroke-width="2.4"/>';
        }
        /* внутреннее свечение включается только при полном пороге */
        out += '<circle id="' + id + 'glow" cx="' + cx + '" cy="' + cy + '" r="' + (r - 14) + '" ' +
               'fill="url(#' + id + 'Core)" opacity="' + (filled >= total ? ".55" : "0") + '"/>';
        out += gem(id, cx, cy - 4, r / 58);
        out += "</g>";
        return out;
    }

    /* ═══════════════ Разрез архитектуры ═══════════════
       Смысл картинки в одной детали: ни одна линия от Tonix не доходит
       до денег. Вниз идёт только уведомление, и оно останавливается на
       границе. Подписи начинаются уже внутри денежного слоя — их ставят
       люди своими ключами, и платформы в этой цепочке нет. */
    function diagram() {
        var g = t(), id = "ltA", W = 980, H = 476;

        var band = function (yy, h, label, sub, cls, accent) {
            return '<g class="lt-layer ' + cls + '">' +
              '<rect x="30" y="' + yy + '" width="' + (W - 60) + '" height="' + h + '" rx="14" fill="' +
                (accent ? "rgba(45,131,236,.07)" : "rgba(255,255,255,.024)") + '" stroke="' +
                (accent ? "rgba(45,131,236,.4)" : "rgba(255,255,255,.09)") + '"/>' +
              '<text x="52" y="' + (yy + 28) + '" font-family="var(--serif),Georgia,serif" font-size="19" ' +
                'font-weight="600" fill="#e9ebef">' + esc(label) + "</text>" +
              '<text x="52" y="' + (yy + 48) + '" font-size="12.5" fill="#8b94a2">' + esc(sub) + "</text>" +
            "</g>";
        };

        return '<svg class="lt-diagram" viewBox="0 0 ' + W + " " + H + '" role="img" ' +
            'aria-label="' + esc(g.h1) + '" xmlns="http://www.w3.org/2000/svg">' +
          defs(id) +

          band(24, 78, g.l1, g.l1s, "d1", false) +
          band(150, 86, g.l2, g.l2s, "d2", true) +
          band(318, 128, g.l3, g.l3s, "d3", false) +

          /* голос идёт вверх по цепочке: участники -> платформа */
          '<g class="lt-layer d2">' +
            '<path class="lt-draw d2" style="--len:42" d="M150 102 L150 142" ' +
              'stroke="url(#' + id + 'Acc)" stroke-width="2" fill="none" stroke-linecap="round"/>' +
            '<path d="M150 147 l-5 -9 h10 Z" fill="#1ac9ff"/>' +
            '<text x="164" y="128" font-size="12" fill="#8b94a2">' + esc(g.aVote) + "</text>" +
          "</g>" +

          /* уведомление подписантам — доходит до границы и останавливается */
          '<g class="lt-layer d3">' +
            '<path class="lt-draw d3" style="--len:42" d="M150 240 L150 278" ' +
              'stroke="url(#' + id + 'Acc)" stroke-width="1.8" fill="none" ' +
              'stroke-linecap="round" stroke-dasharray="5 5"/>' +
            '<path d="M150 283 l-5 -9 h10 Z" fill="#1ac9ff" opacity=".85"/>' +
            '<text x="164" y="266" font-size="12" fill="#8b94a2">' + esc(g.aNotify) + "</text>" +
          "</g>" +

          /* граница доступа */
          '<g class="lt-layer d3">' +
            '<path class="lt-draw d3" style="--len:920" d="M30 292 L' + (W - 30) + ' 292" ' +
              'stroke="#e0a64b" stroke-opacity=".5" stroke-width="1.4" ' +
              'stroke-dasharray="2 7" fill="none"/>' +
            '<text x="' + (W - 44) + '" y="284" text-anchor="end" font-size="11" ' +
              'letter-spacing=".06em" fill="#e0a64b" opacity=".8">' + esc(g.bound) + "</text>" +
          "</g>" +

          /* стрелка, которой не существует */
          '<g class="lt-ghost">' +
            '<path d="M646 240 L646 334" stroke="#e06464" stroke-width="2" ' +
              'stroke-dasharray="6 6" fill="none" opacity=".75"/>' +
            '<g stroke="#e06464" stroke-width="2.6" stroke-linecap="round">' +
              '<path d="M636 282 l20 20"/><path d="M656 282 l-20 20"/>' +
            "</g>" +
            '<text x="634" y="262" text-anchor="end" font-size="11.5" fill="#e06464" opacity=".9">' + esc(g.ghost) + "</text>" +
          "</g>" +

          /* ключи подписантов внутри денежного слоя */
          '<g class="lt-layer d3">' +
            '<g stroke="url(#' + id + 'Acc)" stroke-width="1.6" fill="none" opacity=".8">' +
              '<path class="lt-draw d3" style="--len:210" d="M438 366 L520 366 L520 388 L600 388"/>' +
              '<path class="lt-draw d3" style="--len:210" d="M438 412 L520 412 L520 388 L600 388"/>' +
            "</g>" +
            '<g fill="#0d1626" stroke="url(#' + id + 'Edge)" stroke-width="1.4">' +
              '<circle cx="422" cy="366" r="12"/><circle cx="422" cy="412" r="12"/>' +
            "</g>" +
            '<g fill="#cfe4ff" opacity=".8">' +
              '<circle cx="422" cy="362" r="2.8"/><path d="M420.5 364.5 h3 l-.8 8 h-1.4 Z"/>' +
              '<circle cx="422" cy="408" r="2.8"/><path d="M420.5 410.5 h3 l-.8 8 h-1.4 Z"/>' +
            "</g>" +
            '<text x="402" y="342" font-size="12" fill="#8b94a2">' + esc(g.aSign) + "</text>" +
            '<text x="610" y="383" font-size="11.5" letter-spacing=".1em" fill="#9db8ff">' + esc(g.keys) + "</text>" +
            '<path class="lt-draw d3" style="--len:114" d="M612 398 L726 398" ' +
              'stroke="url(#' + id + 'Acc)" stroke-width="1.6" fill="none"/>' +
            '<path d="M731 398 l-9 -5 v10 Z" fill="#1ac9ff"/>' +
          "</g>" +

          /* хранилище: две половины корпуса, фаска, спекуляр, рёбра */
          '<g class="lt-layer d3">' + lockRing(id, 806, 384, 46, 2, 2, false) + "</g>" +
        "</svg>";
    }

    /* ═══════════════ Сцены провала атак ═══════════════
       У каждой атаки своя метафора и своя анимация: обрубленный
       счётчик, отскок от порога, схлопывание веса, отфильтрованные
       строки. Одинаковая тряска на все случаи выглядела бы как
       заглушка и ничему бы не учила. */
    function sceneWeight(id) {
        return `
        <svg class="lt-scene" viewBox="0 0 300 230" xmlns="http://www.w3.org/2000/svg">
          ${defs(id)}
          <rect x="26" y="26" width="248" height="70" rx="12" fill="#0d1626" stroke="rgba(255,255,255,.1)"/>
          <text x="42" y="50" font-size="11" fill="#646c79" font-family="ui-monospace,monospace">weight</text>
          <text id="${id}Num" x="42" y="80" font-size="27" font-weight="700" fill="#e06464"
                font-family="ui-monospace,monospace">10000</text>
          <g id="${id}Clamp" opacity="0">
            <rect x="26" y="118" width="248" height="82" rx="12"
                  fill="rgba(62,207,142,.08)" stroke="rgba(62,207,142,.45)"/>
            <text x="42" y="144" font-size="11" fill="#3ecf8e" font-family="ui-monospace,monospace">database trigger</text>
            <text x="42" y="172" font-size="13" fill="#c9d2de" font-family="ui-monospace,monospace">weight := 1</text>
            <path d="M243 152 l7 7 12 -15" stroke="#3ecf8e" stroke-width="2.6" fill="none"
                  stroke-linecap="round" stroke-linejoin="round"/>
          </g>
          <path id="${id}Arrow" d="M150 100 L150 114" stroke="#646c79" stroke-width="1.6"
                stroke-dasharray="4 4" opacity="0"/>
        </svg>`;
    }
    function sceneDrain(id) {
        return `
        <svg class="lt-scene" viewBox="0 0 300 250" xmlns="http://www.w3.org/2000/svg">
          ${defs(id)}
          ${lockRing(id, 150, 158, 46, 2, 1, false)}
          <g id="${id}Gate">
            <rect x="72" y="22" width="156" height="34" rx="10"
                  fill="rgba(224,166,75,.09)" stroke="rgba(224,166,75,.45)"/>
            <text x="150" y="44" text-anchor="middle" font-size="13" fill="#e0a64b"
                  font-family="ui-monospace,monospace">1 / 2 signatures</text>
          </g>
          <g id="${id}Pack" opacity="0">
            <rect x="130" y="66" width="40" height="24" rx="7" fill="#0d1626"
                  stroke="#e06464" stroke-width="1.4"/>
            <text x="150" y="82" text-anchor="middle" font-size="10" fill="#e06464"
                  font-family="ui-monospace,monospace">ALL</text>
          </g>
        </svg>`;
    }
    function sceneSplit(id) {
        return `
        <svg class="lt-scene" viewBox="0 0 300 240" xmlns="http://www.w3.org/2000/svg">
          ${defs(id)}
          <g font-family="ui-monospace,monospace">
            <g id="${id}W1">
              <rect x="20" y="30" width="112" height="58" rx="11" fill="#0d1626" stroke="rgba(255,255,255,.12)"/>
              <text x="34" y="52" font-size="10" fill="#646c79">wallet A</text>
              <text id="${id}A" x="34" y="76" font-size="18" font-weight="700" fill="#9db8ff">100</text>
            </g>
            <g id="${id}W2" opacity="0">
              <rect x="168" y="30" width="112" height="58" rx="11" fill="#0d1626" stroke="rgba(255,255,255,.12)"/>
              <text x="182" y="52" font-size="10" fill="#646c79">wallet B</text>
              <text id="${id}B" x="182" y="76" font-size="18" font-weight="700" fill="#9db8ff">0</text>
            </g>
            <path id="${id}Flow" d="M132 59 L168 59" stroke="#e06464" stroke-width="1.8"
                  stroke-dasharray="5 4" opacity="0"/>
            <g id="${id}Sum" opacity="0">
              <rect x="20" y="132" width="260" height="76" rx="12"
                    fill="rgba(62,207,142,.08)" stroke="rgba(62,207,142,.45)"/>
              <text x="36" y="156" font-size="10.5" fill="#3ecf8e">min(then, now) per voter</text>
              <text x="36" y="188" font-size="21" font-weight="700" fill="#c9d2de">100</text>
              <text x="96" y="188" font-size="12" fill="#646c79">total weight</text>
            </g>
          </g>
        </svg>`;
    }
    function sceneRows(id) {
        var rows = "";
        for (var i = 0; i < 5; i++) {
            rows += `<g id="${id}R${i}" opacity="0">
              <rect x="24" y="${34 + i * 30}" width="252" height="22" rx="6"
                    fill="#0d1626" stroke="rgba(255,255,255,.1)"/>
              <rect x="34" y="${41 + i * 30}" width="${70 + (i * 37) % 90}" height="8" rx="4"
                    fill="#2b3d5e" opacity=".85"/>
              <rect x="${118 + (i * 37) % 90}" y="${41 + i * 30}" width="42" height="8" rx="4"
                    fill="#1e2a40"/>
            </g>`;
        }
        return `
        <svg class="lt-scene" viewBox="0 0 300 240" xmlns="http://www.w3.org/2000/svg">
          ${defs(id)}
          ${rows}
          <g id="${id}Zero" opacity="0" font-family="ui-monospace,monospace">
            <rect x="24" y="86" width="252" height="66" rx="12"
                  fill="rgba(62,207,142,.08)" stroke="rgba(62,207,142,.45)"/>
            <text x="150" y="112" text-anchor="middle" font-size="11" fill="#3ecf8e">row level security</text>
            <text x="150" y="138" text-anchor="middle" font-size="19" font-weight="700" fill="#c9d2de">0 rows</text>
          </g>
        </svg>`;
    }

    var SCENE = [sceneWeight, sceneDrain, sceneSplit, sceneRows];

    /* Проигрыш сцены. Каждая — свой сценарий во времени. */
    function play(idx, id) {
        var q = function (s) { return document.getElementById(s); };
        var set = function (el, k, v) { if (el) el.setAttribute(k, v); };
        if (reduced) {
            /* Без движения: показываем конечное состояние сразу */
            ["Clamp", "Sum", "Zero"].forEach(function (k) { set(q(id + k), "opacity", "1"); });
            var n0 = q(id + "Num"); if (n0) { n0.textContent = "1"; set(n0, "fill", "#c9d2de"); }
            return;
        }

        if (idx === 0) {
            /* Счётчик разгоняется — и обрубается триггером */
            var num = q(id + "Num"), ar = q(id + "Arrow"), cl = q(id + "Clamp");
            if (!num) return;
            var vals = [10000, 8420, 6100, 3900, 1800, 640, 120, 1];
            var i = 0;
            num.textContent = "10000"; set(num, "fill", "#e06464");
            setTimeout(function () { set(ar, "opacity", ".8"); }, 260);
            setTimeout(function () {
                set(cl, "opacity", "1");
                var tick = setInterval(function () {
                    if (i >= vals.length) {
                        clearInterval(tick);
                        set(num, "fill", "#c9d2de");
                        set(num, "font-size", "27");
                        return;
                    }
                    num.textContent = String(vals[i++]);
                }, 62);
            }, 520);
        } else if (idx === 1) {
            /* Пакет с деньгами бьётся о порог подписей и отлетает */
            var pack = q(id + "Pack"), gate = q(id + "Gate");
            if (!pack) return;
            set(pack, "opacity", "1");
            pack.style.transition = "transform .5s cubic-bezier(.3,.7,.2,1)";
            pack.style.transform = "translateY(0)";
            setTimeout(function () { pack.style.transform = "translateY(26px)"; }, 60);
            setTimeout(function () {
                if (gate) {
                    gate.style.transition = "transform .18s";
                    gate.style.transform = "scale(1.04)";
                    setTimeout(function () { gate.style.transform = "none"; }, 190);
                }
                pack.style.transition = "transform .7s cubic-bezier(.2,.9,.3,1)";
                pack.style.transform = "translateY(-34px)";
            }, 600);
        } else if (idx === 2) {
            /* Токены делятся между кошельками, но сумма веса та же */
            var w2 = q(id + "W2"), fl = q(id + "Flow"),
                A = q(id + "A"), B = q(id + "B"), sum = q(id + "Sum");
            setTimeout(function () { set(fl, "opacity", ".9"); }, 220);
            setTimeout(function () { set(w2, "opacity", "1"); }, 480);
            setTimeout(function () {
                var a = 100, step = setInterval(function () {
                    a -= 10;
                    if (A) A.textContent = String(a);
                    if (B) B.textContent = String(100 - a);
                    if (a <= 50) clearInterval(step);
                }, 70);
            }, 620);
            setTimeout(function () { set(sum, "opacity", "1"); }, 1350);
        } else {
            /* Строки приходят и отфильтровываются политиками до нуля */
            for (var r = 0; r < 5; r++) {
                (function (k) {
                    setTimeout(function () { set(q(id + "R" + k), "opacity", "1"); }, 120 + k * 90);
                })(r);
            }
            for (var r2 = 0; r2 < 5; r2++) {
                (function (k) {
                    setTimeout(function () {
                        var el = q(id + "R" + k);
                        if (el) { el.style.transition = "opacity .3s"; set(el, "opacity", "0"); }
                    }, 760 + k * 70);
                })(r2);
            }
            setTimeout(function () { set(q(id + "Zero"), "opacity", "1"); }, 1380);
        }
    }

    /* ═══════════════ Механизм подписей (интерактив) ═══════════════
       Порог мультисига объясняют словами, и это не запоминается.
       Здесь его можно собрать руками: подписи ставятся по нажатию,
       и до последней деньги не двигаются. Кнопка «подписать за Tonix»
       есть намеренно — она отказывает, и это самая наглядная часть. */
    var ms = { n: 0, total: 2, done: false, log: [], keys: {} };

    function msLog(kind, text) {
        var box = document.getElementById("ltLog");
        if (!box) return;
        var col = kind === "deny" ? "#e0a64b" : kind === "ok" ? "#3ecf8e" : "#8b94a2";
        var row = document.createElement("div");
        row.className = "lt-logrow";
        row.innerHTML = '<span style="color:#4d5663">' + ms.log.length.toString().padStart(2, "0") +
            '</span><span style="color:' + col + '">' + esc(text) + "</span>";
        ms.log.push(text);
        box.appendChild(row);
        box.scrollTop = box.scrollHeight;
        if (typeof requestAnimationFrame === "function") requestAnimationFrame(function () { row.classList.add("in"); });
        else row.classList.add("in");
    }

    function msPaint() {
        var g = t();
        var cnt = document.getElementById("ltMsCnt");
        if (cnt) cnt.textContent = ms.n + " / " + ms.total;
        for (var i = 0; i < ms.total; i++) {
            var seg = document.getElementById("ltMSseg" + i);
            if (!seg) continue;
            seg.setAttribute("stroke", i < ms.n ? "url(#ltMSAcc)" : "#1a2438");
        }
        var glow = document.getElementById("ltMSglow");
        if (glow) glow.setAttribute("opacity", ms.done ? ".55" : "0");
        var st = document.getElementById("ltMsState");
        if (st) {
            st.textContent = ms.done ? g.lg.exec : (ms.n === 0 ? g.lg.open : g.lg.s1);
            st.style.color = ms.done ? "var(--ok)" : "var(--dim)";
        }
        var mv = document.getElementById("ltMsMove");
        if (mv) mv.setAttribute("opacity", ms.done ? "1" : "0");
        var tx = document.getElementById("ltMsTx");
        if (tx) tx.style.opacity = ms.done ? "1" : "0";
    }

    function msSign(which) {
        var g = t();
        /* Платформа среди подписантов не значится — отказ, а не подпись.
           Это самая наглядная часть демонстрации, поэтому она доступна
           всегда, в том числе после набора порога. */
        if (which === "x") { msLog("deny", g.lg.deny); return; }
        if (ms.done) return;
        /* Считаем не количество нажатий, а конкретные ключи: иначе один
           и тот же подписант набирал бы порог в одиночку — ровно та
           дыра, от которой мультисиг и защищает. */
        if (ms.keys[which]) { msLog("", g.lg.dup); return; }
        ms.keys[which] = true;
        ms.n = Math.min(ms.total, ms.n + 1);
        if (ms.n >= ms.total) {
            ms.done = true;
            msLog("ok", g.lg.s2);
            setTimeout(function () { msLog("ok", g.lg.exec); }, reduced ? 0 : 520);
        } else {
            msLog("", g.lg.s1);
        }
        msPaint();
    }

    function msReset() {
        ms.n = 0; ms.done = false; ms.log = []; ms.keys = {};
        var box = document.getElementById("ltLog");
        if (box) box.innerHTML = "";
        msPaint();
        msLog("", t().lg.open);
    }

    function msSection() {
        var g = t(), id = "ltMS";
        return '<section class="lt-wrap lt-break">' +
          '<span class="lt-eyebrow"><i></i>' + esc(g.meyebrow) + "</span>" +
          '<h2 class="lt-h">' + esc(g.mh) + "</h2>" +
          '<p class="lt-lead">' + esc(g.mlead) + "</p>" +
          '<div class="lt-ms">' +
            '<div class="lt-msl">' +
              '<div class="lt-ord">' +
                '<div class="lt-ordh">' + esc(g.order) + "</div>" +
                '<div class="lt-orda">' + esc(g.oamount) + "</div>" +
                '<div class="lt-ordto"><span>' + esc(g.oto) + '</span><code>UQAv…CjCW</code></div>' +
              "</div>" +
              '<div class="lt-keys">' +
                '<button class="lt-key" data-k="1">' + esc(g.k1) + "</button>" +
                '<button class="lt-key" data-k="2">' + esc(g.k2) + "</button>" +
                '<button class="lt-key deny" data-k="x">' + esc(g.kx) + "</button>" +
                '<button class="lt-key ghostbtn" data-k="r">' + esc(g.reset) + "</button>" +
              "</div>" +
            "</div>" +
            '<div class="lt-msr">' +
              '<svg viewBox="0 0 260 250" class="lt-scene" style="max-width:260px">' + defs(id) +
                lockRing(id, 130, 108, 52, 2, 0, true) +
                '<g id="' + id + 'Move" opacity="0">' +
                  '<path d="M130 172 L130 200" stroke="url(#' + id + 'Acc)" stroke-width="2" ' +
                    'fill="none" stroke-linecap="round"/>' +
                  '<path d="M130 205 l-5 -9 h10 Z" fill="#1ac9ff"/>' +
                "</g>" +
              "</svg>" +
              '<div class="lt-cnt" id="ltMsCnt">0 / 2</div>' +
              '<div class="lt-cntl">' + esc(g.of2) + "</div>" +
              '<div class="lt-state" id="ltMsState"></div>' +
              '<code class="lt-tx" id="ltMsTx">tx a3f9c1…7e02</code>' +
            "</div>" +
          "</div>" +
          '<div class="lt-logwrap">' +
            '<div class="lt-logh">' + esc(g.logHead) + "</div>" +
            '<div class="lt-log" id="ltLog"></div>' +
          "</div>" +
        "</section>";
    }

    /* ═══════════════ Делегирование (интерактив) ═══════════════
       Делегирование объясняют словами, и это звучит абстрактно. Здесь
       видно суть: вес перетекает от держателя к делегату по нажатию, а
       токены при этом остаются на кошельке держателя — визуально не
       двигаются. Это снимает главный страх: «я отдам токены и потеряю их».
       Отзыв возвращает вес обратно. */
    var dg = { state: "idle", log: [] };   // idle → delegated → voted

    function dgLog(kind, text) {
        var box = document.getElementById("ltDgLog");
        if (!box) return;
        var col = kind === "ok" ? "#3ecf8e" : kind === "warn" ? "#e0a64b" : "#8b94a2";
        var row = document.createElement("div");
        row.className = "lt-logrow";
        row.innerHTML = '<span style="color:#4d5663">' + dg.log.length.toString().padStart(2, "0") +
            '</span><span style="color:' + col + '">' + esc(text) + "</span>";
        dg.log.push(text);
        box.appendChild(row);
        box.scrollTop = box.scrollHeight;
        if (typeof requestAnimationFrame === "function") requestAnimationFrame(function () { row.classList.add("in"); });
        else row.classList.add("in");
    }

    function dgPaint() {
        var g = t();
        var flow = document.getElementById("ltDgFlow");
        var weight = document.getElementById("ltDgWeight");
        var delegated = (dg.state === "delegated" || dg.state === "voted");
        // вес-«шарик» переезжает к делегату, когда делегировано
        if (weight) {
            weight.style.transition = reduced ? "none" : "transform .6s cubic-bezier(.3,.8,.2,1), opacity .3s";
            weight.style.transform = delegated ? "translateX(150px)" : "translateX(0)";
        }
        if (flow) flow.setAttribute("opacity", delegated ? "1" : "0");

        var st = document.getElementById("ltDgState");
        if (st) {
            st.textContent = (dg.state === "voted") ? g.dStateDone : g.dStateIdle;
            st.style.color = (dg.state === "voted") ? "var(--ok)" : "var(--dim)";
        }
        // кнопки
        var bDeleg = document.getElementById("ltDgBtnDeleg");
        var bRevoke = document.getElementById("ltDgBtnRevoke");
        if (bDeleg) bDeleg.style.display = delegated ? "none" : "";
        if (bRevoke) bRevoke.style.display = delegated ? "" : "none";
        // галочка «токены на месте» всегда горит — это и есть смысл
        var stay = document.getElementById("ltDgStay");
        if (stay) stay.setAttribute("opacity", "1");
    }

    function dgDelegate() {
        if (dg.state !== "idle") return;
        dg.state = "delegated";
        dgLog("ok", t().dLogDeleg);
        dgPaint();
        // через полсекунды делегат «голосует» — показываем, что вес работает
        setTimeout(function () {
            if (dg.state !== "delegated") return;
            dg.state = "voted";
            dgLog("ok", t().dLogVote);
            dgPaint();
        }, reduced ? 0 : 900);
    }

    function dgRevoke() {
        if (dg.state === "idle") return;
        dg.state = "idle";
        dgLog("warn", t().dLogRevoke);
        dgPaint();
    }

    function dgReset() {
        dg.state = "idle"; dg.log = [];
        var box = document.getElementById("ltDgLog");
        if (box) box.innerHTML = "";
        dgPaint();
    }

    /* Узел: аватар-кружок с подписью. Держатель слева, делегат справа. */
    function dgNode(id, cx, cy, label, sub, accent) {
        return '<g>' +
            '<circle cx="' + cx + '" cy="' + cy + '" r="26" fill="#0d1626" ' +
              'stroke="' + (accent ? "url(#" + id + "Acc)" : "rgba(255,255,255,.14)") + '" stroke-width="1.6"/>' +
            '<circle cx="' + cx + '" cy="' + (cy - 5) + '" r="7" fill="' + (accent ? "#1ac9ff" : "#6b7688") + '"/>' +
            '<path d="M' + (cx - 11) + ' ' + (cy + 14) + ' a11 9 0 0 1 22 0" fill="' + (accent ? "#1ac9ff" : "#6b7688") + '"/>' +
            '<text x="' + cx + '" y="' + (cy + 46) + '" text-anchor="middle" font-size="11" ' +
              'font-weight="600" fill="#d4dbe6">' + esc(label) + "</text>" +
            (sub ? '<text x="' + cx + '" y="' + (cy + 62) + '" text-anchor="middle" font-size="10" ' +
              'fill="#8b94a2">' + esc(sub) + "</text>" : "") +
        "</g>";
    }

    function dgSection() {
        var g = t(), id = "ltDg";
        return '<section class="lt-wrap lt-break">' +
          '<span class="lt-eyebrow"><i></i>' + esc(g.deyebrow) + "</span>" +
          '<h2 class="lt-h">' + esc(g.dh) + "</h2>" +
          '<p class="lt-lead">' + esc(g.dlead) + "</p>" +
          '<div class="lt-ms">' +
            '<div class="lt-msl" style="display:flex;flex-direction:column;justify-content:center">' +
              '<div class="lt-keys">' +
                '<button class="lt-key" id="ltDgBtnDeleg" onclick="void 0">' + esc(g.dBtn) + "</button>" +
                '<button class="lt-key ghostbtn" id="ltDgBtnRevoke" style="display:none">' + esc(g.dRevoke) + "</button>" +
                '<button class="lt-key ghostbtn" id="ltDgBtnReset">' + esc(g.dReset) + "</button>" +
              "</div>" +
              '<div class="lt-state" id="ltDgState" style="margin-top:18px;text-align:left;max-width:none">' + esc(g.dStateIdle) + "</div>" +
              '<div style="margin-top:16px;display:flex;flex-direction:column;gap:8px">' +
                '<div style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--dim)">' +
                  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#3ecf8e" stroke-width="2.4" style="flex:none"><path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
                  esc(g.dNote1) + "</div>" +
                '<div style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--dim)">' +
                  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#3ecf8e" stroke-width="2.4" style="flex:none"><path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
                  esc(g.dNote2) + "</div>" +
              "</div>" +
            "</div>" +
            '<div class="lt-msr">' +
              '<svg viewBox="0 0 320 220" class="lt-scene" style="max-width:320px">' + defs(id) +
                // связь между узлами
                '<path id="ltDgFlow" d="M92 74 L228 74" stroke="url(#' + id + 'Acc)" stroke-width="2" ' +
                  'stroke-dasharray="5 4" fill="none" opacity="0"/>' +
                dgNode(id, 62, 74, g.dHolder, g.dTokens, false) +
                dgNode(id, 258, 74, g.dDelegate, "", true) +
                // «вес голоса» — шарик, который переезжает
                '<g id="ltDgWeight">' +
                  '<circle cx="62" cy="40" r="16" fill="#0d1626" stroke="url(#' + id + 'Acc)" stroke-width="1.6"/>' +
                  '<text x="62" y="44" text-anchor="middle" font-size="10" font-weight="700" fill="#1ac9ff" font-family="Arial, Helvetica, sans-serif">1000</text>' +
                "</g>" +
                // токены остаются на месте — отдельная метка под держателем
                '<g id="ltDgStay" opacity="1">' +
                  '<rect x="26" y="156" width="72" height="22" rx="7" fill="rgba(62,207,142,.09)" stroke="rgba(62,207,142,.4)"/>' +
                  '<text x="62" y="171" text-anchor="middle" font-size="9.5" fill="#3ecf8e" font-family="ui-monospace,monospace">DUREV ✓</text>' +
                "</g>" +
              "</svg>" +
              '<div class="lt-cntl" style="margin-top:6px">' + esc(g.dStay) + "</div>" +
            "</div>" +
          "</div>" +
          '<div class="lt-logwrap">' +
            '<div class="lt-logh">' + esc(g.logHead) + "</div>" +
            '<div class="lt-log" id="ltDgLog"></div>' +
          "</div>" +
        "</section>";
    }

    /* ═══════════════ Живой блок сети ═══════════════
       Самое честное доказательство «мы правда на TON» — не значок
       и не обещание, а номер блока, который растёт у человека на глазах.
       Если сеть молчит, полоса просто не показывается: сломанный
       индикатор хуже отсутствующего. */
    function netStrip() {
        var g = t();
        return '<div class="lt-net" id="ltNet" hidden>' +
            '<span class="lt-netd"></span>' +
            '<span class="lt-neth">' + esc(g.netHead) + "</span>" +
            '<span class="lt-netb">' + esc(g.netBlock) + ' <b id="ltSeq">—</b></span>' +
            '<span class="lt-netn">' + esc(g.netLive) + "</span>" +
        "</div>";
    }
    var netTimer = null;
    function netPoll() {
        var seq = document.getElementById("ltSeq"), strip = document.getElementById("ltNet");
        if (!seq || !strip) return;
        fetch("https://toncenter.com/api/v2/getMasterchainInfo", {
            headers: { "X-API-Key": "4dd7f5b05be6418cb3e4920b690cbe41eb7c349732123846d0d15773fd3bd600" }
        })
            .then(function (r) { return r.json(); })
            .then(function (j) {
                var n = j && j.ok && j.result && j.result.last && j.result.last.seqno;
                if (!n) throw new Error("no seqno");
                strip.hidden = false;
                if (seq.textContent !== String(n)) {
                    seq.textContent = Number(n).toLocaleString("en-US");
                    if (!reduced) {
                        seq.classList.remove("tick");
                        void seq.offsetWidth;
                        seq.classList.add("tick");
                    }
                }
            })
            .catch(function () { /* молчим: полоса остаётся скрытой */ });
    }

    /* ═══════════════ Симулятор ═══════════════ */
    var cur = 0;
    function renderPanel() {
        var g = t(), a = g.atk[cur], host = document.getElementById("ltPanel");
        if (!host) return;
        var id = "ltS" + cur + "_" + Date.now().toString(36);
        host.innerHTML =
            '<div class="lt-pl">' +
              "<h3>" + esc(a.h) + "</h3>" +
              "<p>" + esc(a.p) + "</p>" +
              '<div class="lt-run"><div class="lt-verdict" id="ltVerdict">' +
                '<div class="lt-vhead">' +
                  '<svg viewBox="0 0 24 24"><path d="M12 3l7 4v6c0 4-3 7-7 8-4-1-7-4-7-8V7z" stroke-linejoin="round"/><path d="M9 12l2 2 4-5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
                  esc(a.fail) +
                "</div>" +
                '<p class="lt-why">' + esc(a.why) + "</p>" +
              "</div></div>" +
            "</div>" +
            '<div class="lt-pr">' + SCENE[cur](id) + "</div>";

        var v = document.getElementById("ltVerdict");
        setTimeout(function () { if (v) v.classList.add("show"); }, reduced ? 0 : 900);
        play(cur, id);
    }

    function renderTabs() {
        var g = t(), host = document.getElementById("ltTabs");
        if (!host) return;
        host.innerHTML = g.atk.map(function (a, i) {
            return '<button class="lt-tab" role="tab" data-i="' + i + '" ' +
                'aria-selected="' + (i === cur ? "true" : "false") + '">' + esc(a.tab) + "</button>";
        }).join("");
        host.querySelectorAll(".lt-tab").forEach(function (b) {
            b.onclick = function () {
                cur = parseInt(b.getAttribute("data-i"), 10) || 0;
                renderTabs(); renderPanel();
            };
        });
    }

    /* ═══════════════ Монтаж ═══════════════ */
    window.tonixRenderLandingTech = function () {
        var anchor = document.getElementById("whySection");
        if (!anchor) return;
        var g = t();

        if (!document.getElementById("ltStyle")) {
            var st = document.createElement("style");
            st.id = "ltStyle"; st.textContent = CSS;
            document.head.appendChild(st);
        }

        var el = document.getElementById("ltRoot");
        if (!el) {
            el = document.createElement("div");
            el.id = "ltRoot";
            anchor.parentNode.insertBefore(el, anchor.nextSibling);
        }

        el.innerHTML =
            '<section class="lt-wrap" id="ltArch">' +
              '<span class="lt-eyebrow"><i></i>' + esc(g.eyebrow) + "</span>" +
              '<h2 class="lt-h">' + esc(g.h1) + "</h2>" +
              '<p class="lt-lead">' + esc(g.lead) + "</p>" +
              '<div class="lt-stage" id="ltStage">' + diagram() + "</div>" +
              netStrip() +
              '<div class="lt-g" id="ltG">' +
                g.g.map(function (c) {
                    return '<div class="lt-gc"><h4>' + esc(c[0]) + "</h4><p>" + esc(c[1]) + "</p></div>";
                }).join("") +
              "</div>" +
            "</section>" +
            msSection() +
            dgSection() +
            '<section class="lt-wrap lt-break">' +
              '<span class="lt-eyebrow"><i></i>' + esc(g.beyebrow) + "</span>" +
              '<h2 class="lt-h">' + esc(g.btitle) + "</h2>" +
              '<p class="lt-lead">' + esc(g.blead) + "</p>" +
              '<div class="lt-tabs" id="ltTabs" role="tablist"></div>' +
              '<div class="lt-panel" id="ltPanel"></div>' +
              '<p class="lt-lead" style="margin-top:22px;font-size:13.5px;color:var(--dim2)">' + esc(g.note) + "</p>" +
            "</section>";

        renderTabs();
        renderPanel();
        msReset();
        dgReset();

        /* Кнопки механизма подписей: один обработчик на контейнер. */
        var msPanel = document.getElementById("ltMsCnt");
        var keys = msPanel ? msPanel.closest("section").querySelector(".lt-keys") : null;
        if (keys) keys.onclick = function (ev) {
            var b = (ev.target && ev.target.closest) ? ev.target.closest(".lt-key") : null;
            if (!b) return;
            var k = b.getAttribute("data-k");
            if (k === "r") msReset();
            else if (k === "x") msSign("x");
            else msSign(parseInt(k, 10));
        };

        /* Кнопки делегирования */
        var bd = document.getElementById("ltDgBtnDeleg");
        var br = document.getElementById("ltDgBtnRevoke");
        var brs = document.getElementById("ltDgBtnReset");
        if (bd) bd.onclick = dgDelegate;
        if (br) br.onclick = dgRevoke;
        if (brs) brs.onclick = dgReset;

        /* Живой блок сети: первый запрос сразу, дальше раз в семь секунд */
        if (netTimer) { clearInterval(netTimer); netTimer = null; }
        netPoll();
        netTimer = setInterval(netPoll, 7000);

        /* Раскрытие по скроллу: сцена собирается один раз, когда её
           действительно увидели — иначе анимация проходит впустую. */
        var fire = function (node, cls) {
            if (!node) return;
            if (!("IntersectionObserver" in window)) { node.classList.add(cls); return; }
            var io = new IntersectionObserver(function (ents) {
                ents.forEach(function (e) {
                    if (e.isIntersecting) { node.classList.add(cls); io.disconnect(); }
                });
            }, { threshold: .22 });
            io.observe(node);
        };
        fire(document.getElementById("ltStage"), "lt-on");
        fire(document.getElementById("ltG"), "lt-gon");
    };

    /* Перерисовка при смене языка платформы */
    window.tonixLandingTechRelang = function () {
        if (document.getElementById("ltRoot")) window.tonixRenderLandingTech();
    };

})();
