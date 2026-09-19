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

Checkpoint: **67 002 756**, 19 сентября 2026, **10:14:39 UTC**. Hash и SHA-256 файлов находятся в [data/manifest.json](../data/manifest.json).

- `session.json.gz`: 196 реальных рынков — 128 недавних запусков и до 20 сохранённых рынков на состояние detector. Есть пересечения, поэтому итог не является простой суммой всех групп. Это целевая выборка для инспекции, не полный рынок и не test set.
- `seed.json.gz`: накопленные on-chain causal counters для 313 051 launch callers, 44 348 graduation callers и 276 028 exemptions. Число пропущенных causal событий в seed равно нулю. Это счётчики публичных событий, не приватная база пользователей.
- Wave session может содержать checkpoint движка и только хвост событий. Сохранённые наблюдения позволяют продолжить вычисление; хвост отдельно не является lifetime archive.
- `early-parity.json`, `peak-parity.json`: замороженные входы/выходы для проверки математической реализации.
- `evidence.json`: датированная опубликованная исследовательская оценка. Она не обновляется при RPC sync.

## Живой сбор

`eth_chainId`, `eth_blockNumber`, `eth_getBlockByNumber`, `eth_getLogs`, `eth_getTransactionByHash`, `eth_getTransactionReceipt`, `eth_call`. Другие методы запрещены транспортом. Ни одной зависимости от размещённого API проекта.

Factory launches и migrations обновляют causal counters по всей прочитанной странице, даже если токен не входит в локальную отображаемую выборку. Курсор, hash и события записываются одним checkpoint после повторной проверки границ. При RPC error или изменении hash страница не сохраняется.

## Ограничения публичного сборщика

| Область | Предел / значение |
| --- | --- |
| Видимый набор | До 1 000 рынков с launch или migration за 72 часа |
| Native-quote pools | До 128 наиболее недавно мигрировавших |
| Native-quote curves | До 64 наиболее недавних |
| Curve progress | Reserve read для восьми новейших за страницу |
| Prefix detector без checkpoint | До 12 000 сделок; превышение даёт явный gate |
| Сохранённый хвост | До десяти минут; pool до 12 000, curve до 1 000 событий |
| Flow | 60 секунд, completeness отдельно от чисел |
| CA search | Только входы текущей локальной сессии |
| USD | Conversion не выполняется, цены сохраняют quote unit |
| Reorg | Остановка на расхождении, без автоматического смешивания/перескока |

Редкие quote currencies остаются unsupported для моделей, пока необходимые единицы и входы не подтверждены. Непросмотренные интервалы, пропуски и снятые с наблюдения рынки не объявляются полными.
