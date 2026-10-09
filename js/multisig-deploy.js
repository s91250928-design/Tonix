/* =====================================================
   TONIX — multisig-deploy.js
   Разворачивает ОФИЦИАЛЬНЫЙ контракт TON Multisig v2
   (ton-blockchain/multisig-contract-v2, тот же, что на
   multisig.ton.org) прямо из браузера через TON Connect.
   Транзакцию деплоя подписывает кошелёк пользователя —
   у платформы нет ключей и она не может стать подписантом.

   Требует: ton-core.bundle.js (window.TonCore), auth.js
   (window.tonConnectUI). По умолчанию — TESTNET.

   Проверено: адрес, который считает этот модуль, совпадает
   с адресом от официальной обёртки контракта (5/5 конфигов).
   Финальная сверка — с multisig.ton.org на testnet.
   ===================================================== */

(function () {

    // Точный скомпилированный код официального контракта Multisig v2
    var MULTISIG_CODE_HEX = "b5ee9c7241021201000495000114ff00f4a413f4bcf2c80b010201620802020120060302016605040159b0c9fe0a00405c00b21633c5804072fff26208b232c07d003d0032c0325c007e401d3232c084b281f2fff274201100f1b0cafb513434ffc04074c1c0407534c1c0407d01348000407448dfdc2385d4449e3d1f1be94c886654c0aebcb819c0a900b7806cc4b99b08548c2ebcb81b085fdc2385d4449e3d1f1be94c886654c0aebcb819c0a900b7806cc4b99b084c08b0803cb81b8930803cb81b5490eefcb81b40648cdfe440f880e00143bf74ff6a26869ff8080e9838080ea69838080fa0269000080e8881aaf8280fc11d0c0700c2f80703830cf94130038308f94130f8075006a18127f801a070f83681120670f836a0812bec70f836a0811d9870f836a022a60622a081053926a027a070f83823a481029827a070f838a003a60658a08106e05005a05005a0430370f83759a001a002cad033d0d3030171b0925f03e0fa403022d749c000925f03e002d31f0120c000925f04e001d33f01ed44d0d3ff0101d3070101d4d3070101f404d2000101d1288210f718510fbae30f054443c8500601cbff500401cb0712cc0101cb07f4000101ca00c9ed540d09029a363826821075097f5dba8eba068210a32c59bfba8ea9f82818c705f2e06503d4d1103410364650f8007f8e8d2178f47c6fa5209132e30d01b3e65b10355034923436e2505413e30d40155033040b0a02e23604d3ff0101d32f0101d3070101d3ff0101d4d1f8285005017002c858cf160101cbffc98822c8cb01f400f400cb00c97001f90074c8cb0212ca07cbffc9d01bc705f2e06526f9001aba5193be19b0f2e06607f823bef2e06f44145056f8007f8e8d2178f47c6fa5209132e30d01b3e65b110b01fa02d74cd0d31f01208210f1381e5bba8e6a82101d0cfbd3ba8e5e6c44d3070101d4217f708e17511278f47c6fa53221995302baf2e06702a402de01b312e66c2120c200f2e06e23c200f2e06d5330bbf2e06d01f404217f708e17511278f47c6fa53221995302baf2e06702a402de01b312e66c2130d155239130e2e30d0c001030d307d402fb00d1019e3806d3ff0128b38e122084ffba923024965305baf2e3f0e205a405de01d2000101d3070101d32f0101d4d1239126912ae2523078f40e6fa1f2e3ef1ec705f2e3ef20f823bef2e06f20f823a1546d700e01d4f80703830cf94130038308f94130f8075006a18127f801a070f83681120670f836a0812bec70f836a0811d9870f836a022a60622a081053926a027a070f83823a481029827a070f838a003a60658a08106e05005a05005a0430370f83759a001a01cbef2e064f82850030f02b8017002c858cf160101cbffc98822c8cb01f400f400cb00c97021f90074c8cb0212ca07cbffc9d0c882109c73fba2580a02cb1fcb3f2601cb075250cc500b01cb2f1bcc2a01ca000a951901cb07089130e2102470408980188050db3c111000928e45c85801cb055005cf165003fa0254712323ed44ed45ed479f5bc85003cf17c913775003cb6bcccced67ed65ed64747fed11987601cb6bcc01cf17ed41edf101f2ffc901fb00db060842026305a8061c856c2ccf05dcb0df5815c71475870567cab5f049e340bcf59251f3ada4ac42";

    function TC() {
        if (typeof window === "undefined" || !window.TonCore)
            throw new Error("ton-core.bundle.js не загружен");
        return window.TonCore;
    }

    function codeCell() {
        var t = TC();
        return t.Cell.fromBoc(t.Buffer.from(MULTISIG_CODE_HEX, "hex"))[0];
    }

    // Сериализация конфига — 1:1 с официальной wrappers/Multisig.ts
    function signersDict(addrs) {
        var t = TC();
        var d = t.Dictionary.empty(t.Dictionary.Keys.Uint(8), t.Dictionary.Values.Address());
        for (var i = 0; i < addrs.length; i++) d.set(i, addrs[i]);
        return d;
    }
    function configToData(cfg) {
        var t = TC();
        return t.beginCell()
            .storeUint(cfg.orderSeqno || 0, 256)     // стартовый orderSeqno (соль, см. randomSalt)
            .storeUint(cfg.threshold, 8)             // порог
            .storeRef(t.beginCell().storeDictDirect(signersDict(cfg.signers)))
            .storeUint(cfg.signers.length, 8)
            .storeDict(signersDict(cfg.proposers || []))
            .storeBit(!!cfg.allowArbitrarySeqno)
            .endCell();
    }

    /* Соль для уникального адреса казны.
       Адрес контракта в TON = хэш(код + стартовые данные). Если стартовый
       orderSeqno всегда 0, то одинаковые подписанты и порог дают ОДИН И ТОТ ЖЕ
       адрес, и «новая» казна совпадает с уже существующей.
       В режиме allowArbitrarySeqno=true официальный контракт стартовый
       next_order_seqno не читает (multisig.func, op::new_order: проверка
       только при ~allow_arbitrary_order_seqno; get_multisig_data отдаёт -1),
       поэтому случайное число там ни на что не влияет, кроме адреса. */
    function randomSalt() {
        var b = new Uint8Array(8);
        crypto.getRandomValues(b);
        var hex = "";
        for (var i = 0; i < b.length; i++) hex += ("0" + b[i].toString(16)).slice(-2);
        var v = BigInt("0x" + hex);
        return v === 0n ? 1n : v;
    }

    var TONCENTER_KEY = "4dd7f5b05be6418cb3e4920b690cbe41eb7c349732123846d0d15773fd3bd600";

    /* Состояние адреса в сети: "uninitialized" | "active" | "frozen".
       null — если проверить не удалось (сеть/лимиты). */
    async function addressState(addrStr, testnet) {
        try {
            var api = (testnet ? "https://testnet.toncenter.com" : "https://toncenter.com") +
                "/api/v2/getAddressState?address=" + encodeURIComponent(addrStr);
            var r = await fetch(api, { headers: { "X-API-Key": TONCENTER_KEY } });
            var j = await r.json();
            return (j && j.ok === true) ? String(j.result) : null;
        } catch (e) { return null; }
    }

    function parseSigners(list) {
        var t = TC();
        return list.map(function (s) { return t.Address.parse(String(s).trim()); });
    }

    function validate(signers, threshold) {
        if (!signers || !signers.length) throw new Error("Нет адресов подписантов");
        if (!(threshold >= 1 && threshold <= signers.length))
            throw new Error("Порог должен быть от 1 до числа подписантов (" + signers.length + ")");
    }

    /* Только вычисление адреса — без деплоя. Для сверки с multisig.ton.org. */
    window.tonixMultisigAddress = function (opts) {
        var t = TC();
        var signers = parseSigners(opts.signers);
        var threshold = parseInt(opts.threshold, 10);
        validate(signers, threshold);
        var data = configToData({
            threshold: threshold,
            signers: signers,
            proposers: [],
            allowArbitrarySeqno: opts.allowArbitrarySeqno !== false, // по умолчанию true (как «Arbitrary»)
            orderSeqno: opts.orderSeqno || 0  // 0 — как у официальной обёртки (для сверки)
        });
        var addr = t.contractAddress(0, { code: codeCell(), data: data });
        var testOnly = opts.testnet !== false;
        return addr.toString({ bounceable: true, testOnly: testOnly });
    };

    /* Показать адрес в ОБОИХ режимах seqno — чтобы найти совпадение с официальным */
    window.tonixMultisigAddressBoth = function (opts) {
        return {
            arbitrary_true: window.tonixMultisigAddress(Object.assign({}, opts, { allowArbitrarySeqno: true })),
            arbitrary_false: window.tonixMultisigAddress(Object.assign({}, opts, { allowArbitrarySeqno: false }))
        };
    };

    /* Деплой контракта через TON Connect (кошелёк пользователя подписывает) */
    window.tonixDeployMultisig = async function (opts) {
        var t = TC();
        if (typeof tonConnectUI === "undefined" || !tonConnectUI)
            throw new Error("TON Connect не готов — подключи кошелёк");
        if (!tonConnectUI.connected)
            throw new Error("Кошелёк не подключён");

        var signers = parseSigners(opts.signers);
        var threshold = parseInt(opts.threshold, 10);
        validate(signers, threshold);
        var testnet = opts.testnet !== false;

        var arbitrary = opts.allowArbitrarySeqno !== false;
        var code = codeCell();
        var data, address, addrStr, state;

        /* Каждая новая казна получает свой адрес, даже с теми же подписантами
           и порогом. Перед подписью проверяем, что адрес в сети ещё пуст:
           иначе деньги ушли бы в уже существующий контракт. */
        for (var attempt = 0; attempt < 3; attempt++) {
            data = configToData({
                threshold: threshold, signers: signers, proposers: [],
                allowArbitrarySeqno: arbitrary,
                orderSeqno: arbitrary ? randomSalt() : 0
            });
            address = t.contractAddress(0, { code: code, data: data });
            addrStr = address.toString({ bounceable: true, testOnly: testnet });
            state = await addressState(addrStr, testnet);
            if (state !== "active" && state !== "frozen") break;
            if (!arbitrary) break; /* без соли адрес не сменить */
        }
        if (state === "active" || state === "frozen")
            throw new Error("Казна с такими настройками уже существует: " + addrStr +
                ". Новый контракт не создан, деньги не отправлены.");

        var stateInit = t.beginCell().store(t.storeStateInit({ code: code, data: data })).endCell();
        var body = t.beginCell().storeUint(0, 32).storeUint(0, 64).endCell(); // op=0, queryId=0

        var value = t.toNano(String(opts.deployValue || "0.1"));

        var tx = {
            validUntil: Math.floor(Date.now() / 1000) + 300,
            network: testnet ? "-3" : "-239", // CHAIN: TESTNET / MAINNET
            messages: [{
                address: address.toString({ bounceable: true, testOnly: testnet }),
                amount: value.toString(),
                stateInit: stateInit.toBoc().toString("base64"),
                payload: body.toBoc().toString("base64")
            }]
        };

        console.log("[multisig-deploy] деплой контракта", address.toString({ bounceable: true, testOnly: testnet }), "сеть:", testnet ? "testnet" : "MAINNET");
        await tonConnectUI.sendTransaction(tx);
        return { address: address.toString({ bounceable: true, testOnly: testnet }) };
    };

})();
