# Public Console Status

Verification date: **September 19, 2026**.

- Isolated Git history and a standalone npm project. The website, bots, server infrastructure, and private training archive are not included.
- Three SHA-256 model artifacts were verified against the current active files.
- The bootstrap at block 67,054,871, 11:42:08 UTC contains 39,605 real tokens and 212,707 one-minute OHLCV records. A normal start is live; `--recorded` is an explicit offline replay.
- MODEL ESTIMATE matches Terminal; TOP is secondary. Early admission requires the 4h window, supported quote, price, complete activity interval, and known reserve. The current estimate is hidden when lag exceeds 90 seconds.
- Seven sort modes, minimum estimate, ready/catalogue toggle, contract-address search, launch facts, model explanations, one-minute chart, 5m/1h/24h flow, and JSON export.
- Independent RPC and HyperSync collection, factory lookup for old contract addresses, and resumable history from launch. The model runs locally; the console does not call the production API.
- `npm run check`, `npm run build`, `npm test`, `npm run bench`: 52 tests, 882 previous numerical assertions, and exact estimate/TOP parity for 40 real vectors.
- Live HyperSync + RPC caught up to block 67,061,586 with 13 seconds of lag: 39,625 tokens, 932 Early ready, and 228 Wave ready. The final 715-block pass took 6.8 seconds and 9 read requests. This is a measurement from one run, not a performance guarantee.
- Live API verification for VERTEX: estimate `0.01220523763724389` and TOP `70.0170623724504` matched exactly. The 228 Wave-ready count matched the available server response; the snapshots were taken at different times.
- Reconstruction of VERTEX and the migrated `0x8c5579a814af1d3a734b293c3042a240d2539c7a` matched stored bars/activity/price; the latter had 2,387 buys, 2,425 sells, 30 one-minute bars, and OBSERVING status. Factory lookup from genesis restored the same launch block and pool key.
- Windows Terminal controls and exit behavior were verified. Renderer sizes: 140×42, 120×36, 80×30, 64×24, and 40×16. Narrow or short terminals display guidance.
- Probability release gates are preserved. Full replay/training against the private archive is not published.

The actual limitations are documented in [DATA_SOURCES.md](DATA_SOURCES.md). The README uses original research diagrams and renders of real console cells; it does not include website UI animations.
