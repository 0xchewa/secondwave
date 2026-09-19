# Источники данных

## Сеть и контракты

- Robinhood Chain mainnet: chain ID **4663**.
- [Официальное подключение](https://docs.robinhood.com/chain/connecting/): `https://rpc.mainnet.chain.robinhood.com`.
- Pons factory: `0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e`.
- Pons router: `0xe33e9e479df8802cb0866d5d05258bec4cf62948`.
- Pool manager: `0x8366a39cc670b4001a1121b8f6a443a643e40951`.
- Migration hook: `0xe5e702641ea86f4ae6cc3cdaed2b886f976be044`.

ABI используется только для чтения. Pool связывается с миграцией через Initialize в её receipt, token/quote, hook, fee, tick spacing и вычисленный pool key. Неизвестные calldata остаются неизвестными.

## Записанные входы

Checkpoint: **67 054 871**, 19 сентября 2026, **11:42:08 UTC**. Hash и SHA-256 файлов находятся в [data/manifest.json](../data/manifest.json).

- `session.json.gz`: 39 605 токенов доступного каталога за 72 часа, включая 295 рынков с проверенным native pool; 212 707 минутных OHLCV. Все части получены из одного согласованного snapshot. Это bootstrap, а не текущая live-выдача и не test set.
- `seed.json.gz`: накопленные public on-chain causal counters. Число пропущенных causal событий равно нулю. Это история factory caller и exemptions, не приватная база пользователей.
- Wave session содержит checkpoint движка и хвост событий. Минутные свечи хранятся отдельно; полнота activity определяется coverage, а не длиной tick tail. Для запусков без объявленного ticker свечи могут отсутствовать и полнота не заявляется.
- `early-parity.json`, `peak-parity.json`: замороженные входы/выходы для проверки математической реализации.
- `terminal-parity.json`: 40 реальных launch vectors и сохранённые эталонные estimate/TOP.
- `evidence.json`: датированная опубликованная исследовательская оценка. Она не обновляется при RPC sync.

## Живой сбор

`eth_chainId`, `eth_blockNumber`, `eth_getBlockByNumber`, `eth_getLogs`, `eth_getTransactionByHash`, `eth_getTransactionReceipt`, `eth_call`. Другие методы запрещены транспортом. Ни одной зависимости от размещённого API проекта.

Factory launches и migrations обновляют causal counters по всей прочитанной странице, даже если токен не входит в локальную отображаемую выборку. Курсор, hash и события записываются одним checkpoint после повторной проверки границ. При RPC error или изменении hash страница не сохраняется.

Необязательный HyperSync: `https://robinhood.hypersync.xyz/query`, собственный `ENVIO_API_TOKEN`. Страницы дочитываются по `next_block`, JoinAll сохраняет связанные transaction receipts, pool Initialize проверяется по factory migration. Границы подтверждаются через независимый RPC; модель остаётся локальной. Ошибки провайдера не выводят ключи или тело ответа.

## Ограничения публичного сборщика

| Область | Предел / значение |
| --- | --- |
| Каталог | Всё доступное окно 72h; защитный бюджет 100 000 записей; найденные вручную токены сохраняются |
| Основная выдача | Early: 4h и admission Terminal; Wave: migration 72h и проверенное состояние |
| Native-quote pools | До 512 наиболее недавно мигрировавших, как у основного collector |
| Native-quote curves | Все известные кривые в сохранённом окне |
| Curve progress | Точный net reserve из buys/sells/fees/tax/BuybackLocked; archive eth_call при неизвестной исходной сумме |
| Prefix detector без checkpoint | До 12 000 сделок; превышение даёт явный gate |
| Сохранённый хвост | До десяти минут; pool до 12 000, curve до 1 000 событий |
| Flow | BUY/SELL и volume: 5m/1h/24h; sell pressure: 60s; incomplete остаётся null |
| График | Минутные OHLCV; 72h bootstrap; resumable hydrate от launch для выбранного токена |
| CA search | Локально без ограничения страницы; HyperSync lookup от genesis; RPC lookup с from-block и пределом 200 000 блоков |
| Старый Early vector | При отсутствии исторических causal features остаётся unavailable; будущие данные не подставляются |
| USD | Conversion не выполняется, цены сохраняют quote unit |
| Reorg | Остановка на расхождении, без автоматического смешивания/перескока |

Редкие quote currencies остаются unsupported для моделей, пока необходимые единицы и входы не подтверждены. Непросмотренные интервалы, пропуски и снятые с наблюдения рынки не объявляются полными.

Веса в выпуске заморожены: обновление приватной платформы не меняет уже установленную консоль. Для новых артефактов нужен новый публичный выпуск. Скорость и свежесть локальной выдачи зависят от машины, RPC и HyperSync; закрытое приложение и сервер не требуются.
