# Data Sources

## Network and contracts

- Robinhood Chain mainnet: chain ID **4663**.
- [Official connection guide](https://docs.robinhood.com/chain/connecting/): `https://rpc.mainnet.chain.robinhood.com`.
- Pons factory: `0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e`.
- Pons router: `0xe33e9e479df8802cb0866d5d05258bec4cf62948`.
- Pool manager: `0x8366a39cc670b4001a1121b8f6a443a643e40951`.
- Migration hook: `0xe5e702641ea86f4ae6cc3cdaed2b886f976be044`.

The ABI is used for reads only. A pool is linked to a migration through the Initialize event in its receipt, token/quote, hook, fee, tick spacing, and computed pool key. Unknown calldata remains unknown.

## Recorded inputs

Checkpoint: **67,054,871**, September 19, 2026, **11:42:08 UTC**. File hashes and SHA-256 values are listed in [data/manifest.json](../data/manifest.json).

- `session.json.gz`: 39,605 tokens from the available 72-hour catalogue, including 295 markets with a verified native pool; 212,707 one-minute OHLCV records. Every part comes from one consistent snapshot. This is bootstrap data, not a current live response or a test set.
- `seed.json.gz`: accumulated public on-chain causal counters. The number of skipped causal events is zero. This is factory-caller and exemption history, not a private user database.
- The Wave session contains the engine checkpoint and event tail. One-minute candles are stored separately; activity completeness is determined by coverage, not tick-tail length. Candles may be absent for runs without a declared ticker, in which case completeness is not claimed.
- `early-parity.json`, `peak-parity.json`: frozen inputs and outputs used to verify the mathematical implementation.
- `terminal-parity.json`: 40 real launch vectors with stored reference estimate/TOP values.
- `evidence.json`: a dated, published research evaluation. RPC sync does not update it.

## Live collection

`eth_chainId`, `eth_blockNumber`, `eth_getBlockByNumber`, `eth_getLogs`, `eth_getTransactionByHash`, `eth_getTransactionReceipt`, and `eth_call`. The transport rejects all other methods. The project does not depend on a hosted project API.

Factory launches and migrations update causal counters across the entire page being read, even when a token is not part of the locally displayed sample. The cursor, hash, and events are written as one checkpoint after the boundaries are reverified. A page is not saved after an RPC error or hash change.

Optional HyperSync: `https://robinhood.hypersync.xyz/query`, using your own `ENVIO_API_TOKEN`. Pages are read through `next_block`, JoinAll preserves related transaction receipts, and pool Initialize events are checked against factory migrations. Boundaries are confirmed through an independent RPC; the model remains local. Provider errors do not expose keys or response bodies.

## Public collector limits

| Area | Limit / value |
| --- | --- |
| Catalogue | Entire available 72h window; safety budget of 100,000 records; manually discovered tokens are preserved |
| Primary view | Early: 4h and Terminal admission; Wave: migrations within 72h and verified state |
| Native-quote pools | Up to the 512 most recently migrated pools, matching the primary collector |
| Native-quote curves | Every known curve in the stored window |
| Curve progress | Exact net reserve from buys/sells/fees/tax/BuybackLocked; archive `eth_call` when the initial amount is unknown |
| Prefix detector without checkpoint | Up to 12,000 trades; exceeding the limit produces an explicit gate |
| Stored tail | Up to ten minutes; pool up to 12,000 events, curve up to 1,000 events |
| Flow | BUY/SELL and volume: 5m/1h/24h; sell pressure: 60s; incomplete values remain null |
| Chart | One-minute OHLCV; 72h bootstrap; resumable hydration from launch for the selected token |
| CA search | Unlimited local pagination; HyperSync lookup from genesis; RPC lookup with a from-block and a 200,000-block limit |
| Old Early vector | Remains unavailable when historical causal features are absent; future data is not substituted |
| USD | No conversion is performed; prices retain their quote unit |
| Reorg | Stop on mismatch, with no automatic mixing or skipping |

Rare quote currencies remain unsupported by the models until the required units and inputs are verified. Uninspected intervals, gaps, and markets removed from observation are not described as complete.

Release weights are frozen: updates to the private platform do not change an already installed console. New artifacts require a new public release. Local response speed and freshness depend on the machine, RPC, and HyperSync; no closed application or server is required.
