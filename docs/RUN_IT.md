# Running and Operating the Console

## First run

You need Node.js 22.x (22.12 or later), npm, and Git. Windows Terminal is recommended on Windows. The minimum terminal size is 64×24 characters; at 120 columns or more, the list and detail card are visible at the same time.

```sh
git clone https://github.com/davangrind/secondwave.git
cd secondwave
npm ci
npm start
```

Instead of Git, you can select Code → Download ZIP and open a terminal in the extracted directory. `npm ci` installs the dependencies. For subsequent runs, use only `npm start`.

A normal start opens the **live terminal**: it first loads local state, then the collector catches up to the confirmed head and continues updating. The CATCHING UP label is shown until then. If data is more than 90 seconds behind, the current Early estimate is hidden.

For a fully offline view of the bundled recording, run `npm start -- --recorded`. This mode does not use the network; token times and ages refer to the explicitly stated recording date.

## Controls

| Keys | Action |
| --- | --- |
| 1 / 2 / 3 | Early Signal / Second Wave / model information |
| ↑ / ↓, j / k, PgUp / PgDn | Navigate the complete local list |
| / | Search by symbol, name, or contract address |
| s / f | Sort / filter |
| a | Toggle between ready results and the full local catalogue |
| h | Prepare the selected token's history from launch; resume an interrupted download |
| w / c | Flow window 5m / 1h / 24h and chart range ALL / 1H / 4H / 24H |
| v | Launch facts, creator history, and detailed model explanations |
| m | Minimum Early estimate: 0 / 1 / 2.5 / 5 / 10% |
| Enter / Esc | Open card / go back |
| e | Export the selected token and its calculations to `.local` |
| l | Start or repeat independent collection |
| ? | Help |
| q / Ctrl+C | Exit while preserving completed pages |

The price `0.0{7}1234` means seven zeroes after the decimal point before the significant digits. The exact value is available in JSON. ETH is the quote unit, not US dollars. The chart uses one-minute OHLCV on an evenly spaced time axis; empty minutes are not filled with invented trades. `[h]` restores available history from launch. Flow values are displayed only for a confirmed complete interval.

## RPC and HyperSync acceleration

Copy `.env.example` to `.env` and set `SWAVE_RPC_URL`. The official public endpoint is used by default. Do not commit provider URLs containing API keys.

```dotenv
SWAVE_RPC_URL=https://rpc.mainnet.chain.robinhood.com
# Optional: your own Envio key accelerates history reads
ENVIO_API_TOKEN=
ENVIO_HYPERSYNC_URL=https://robinhood.hypersync.xyz
```

```sh
npm start
```

Robinhood Chain **mainnet 4663** is required. The console verifies the chain ID. The provider must support historical logs, transactions, receipts, and block headers; historical `eth_call` is required for migration declarations and reserve progress. HTTP is allowed only for localhost; external addresses must use HTTPS. The application does not sign or submit transactions.

When `ENVIO_API_TOKEN` is set, HyperSync is automatically used for events and related transactions while RPC independently verifies block boundaries and reads contract state. Without a key, standard RPC is used. You can explicitly select `--transport rpc` or `--transport hypersync`. See [HyperSync access and documentation](https://docs.envio.dev/docs/HyperSync/hypersync-quickstart).

Collection continues from the seed and then from its own checkpoint. The older the seed and the lower the provider limits, the longer the first pass takes. Complete history is not promised instantly. The collector leaves 20 confirmation blocks, saves every completed page, and respects provider rate-limit errors.

Run a bounded pass and inspect its result:

```sh
npm start -- sync --pages 2 --blocks 1000
npm start -- snapshot --state .local/checkpoint.json.gz --mode wave
npm start -- inspect 0xYOUR_CONTRACT --state .local/checkpoint.json.gz
```

`--pages`: 1–1000; `--blocks`: 1–10000. The default page is 1,000 blocks for RPC and 6,000 for HyperSync. Snapshot and inspect read saved state without network access.

### Old contracts and complete history

```sh
npm start -- lookup 0xYOUR_CONTRACT --transport hypersync
npm start -- hydrate 0xYOUR_CONTRACT --pages 100
npm start -- inspect 0xYOUR_CONTRACT
```

HyperSync lookup checks factory events from genesis. For RPC, specify a `--from-block` near the launch; the range is limited to 200,000 blocks. In interactive mode, enter the complete contract address with `/`, then press `h`. A prepared contract is saved in the catalogue; another `hydrate` resumes unfinished work. The interactive collector prioritizes the live head and prepares historical pages afterward.

If an old contract has no stored launch-time Early vector, current counters are not substituted. Wave can be restored independently from verified migration history. For tokens without a verified pool, Wave history remains unavailable with a specific reason.

After upgrading from an older release, you can begin with the new seed while retaining the previous state: `npm start -- --state .local/terminal-v2.json.gz`.

## Moving a recording

```sh
npm start -- export --state .local/checkpoint.json.gz --output .local/session.json.gz
npm start -- --input .local/session.json.gz
npm start -- snapshot --mode early --json
```

`--input` opens a dated recording in RECORDED mode. A complete checkpoint that can resume RPC also contains causal counters; moving only a session file does not replace them. Do not combine `--input`, `--recorded`, and `--live`.

## Errors and recovery

- **401/403:** check the RPC key and permissions; the completed checkpoint remains intact.
- **429 / timeout:** the desk retries after a delay while preserving the checkpoint; a bounded CLI command can be run again. The Early estimate is suspended whenever lag exceeds 90 seconds. Your RPC and HyperSync limits affect freshness.
- **REORG / ARCHIVE UNAVAILABLE:** verify historical access and the block hash through a trusted provider. A real reorg requires a checkpoint from before the mismatch or a new verified seed. The collector never automatically skips over a mismatch.
- **LOCAL_STATE_LOCKED:** check the PID in the adjacent `.lock` file. If the process actually crashed, remove only that lock file and start again. Never remove the lock of a running collector.
- **Insufficient history:** this is a coverage state, not a low token estimate. Read the reason on the card and review the [collector limits](DATA_SOURCES.md).

Checks: `npm run check`, `npm run build`, `npm test`, `npm run bench`. To run the compiled version after building: `node dist/cli.js`.
