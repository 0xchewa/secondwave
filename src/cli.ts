#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { loadSession, stringify, atomicSave } from './session.js';
import { manifest, scoreMarket } from './models.js';
import { Rpc } from './chain/rpc.js';
import { readState, stateLock, commitState } from './chain/state.js';
import { collectPage } from './chain/collect.js';
import { runDesk, safeError } from './tui/app.js';
import { initialDesk, visibleRows } from './tui/state.js';
import { render } from './tui/render.js';

try { loadEnvFile('.env'); } catch (e: any) { if (e.code !== 'ENOENT') throw e; }
const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  help: { type: 'boolean', short: 'h' }, live: { type: 'boolean' }, json: { type: 'boolean' },
  input: { type: 'string' }, state: { type: 'string' }, mode: { type: 'string' }, search: { type: 'string' },
  pages: { type: 'string' }, blocks: { type: 'string' }, output: { type: 'string' }, width: { type: 'string' }, height: { type: 'string' },
} });
const command = positionals[0] ?? 'desk', statePath = resolve(values.state ?? '.local/checkpoint.json.gz');
const rpcURL = process.env.SWAVE_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com';
const integer = (value: string | undefined, fallback: number, min: number, max: number) => {
  const n = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw Error('INVALID_NUMERIC_OPTION'); return n;
};
async function main() {
  if (values.help || command === 'help') {
    console.log(`SECOND / WAVE_   Local research terminal\n
  npm start                          Interactive replay of real recorded inputs
  npm start -- --live                 Resume local collection through your RPC
  npm start -- snapshot               Print the console once (works in pipes)
  npm start -- inspect 0x...          Full local token calculation as JSON
  npm start -- sync --pages 1         Commit a bounded RPC pass, then exit
  npm start -- models                Verify and list bundled frozen artifacts
  npm run bench                      Verify numerical reference cases

  --input file.json[.gz]              Load a portable session
  --mode early|wave|models            Choose the snapshot tab
  --search SYMBOL_OR_CA               Filter every record in the local session
  --json                             Emit machine-readable snapshot output
  --state .local/checkpoint.json.gz   Choose isolated local state
  --pages 1..100 --blocks 1..2000      Bound an explicit sync command
  --output file.json                 Export the full session (export command)

  RPC: set SWAVE_RPC_URL in a local .env (see .env.example).
  No keys needed for replay. No wallet or database. Robinhood mainnet 4663.
  Controls: 1/2/3 tabs, j/k arrows, / search, Enter inspect, ? help, q quit.`); return;
  }
  if (command === 'models') { console.log(JSON.stringify(manifest, null, 2)); return; }
  if (command === 'bench') { const { bench } = await import('./verify.js'); console.log(JSON.stringify(await bench(), null, 2)); return; }
  if (command === 'sync') {
    const pages = integer(values.pages, 1, 1, 100), blocks = integer(values.blocks, 1000, 1, 2000);
    const unlock = await stateLock(statePath); const controller = new AbortController();
    const stop = () => controller.abort(); process.once('SIGINT', stop); process.once('SIGTERM', stop);
    try {
      let state = await readState(statePath); const rpc = new Rpc(rpcURL, controller.signal);
      for (let i = 0; i < pages; i++) {
        const r = await collectPage(state, rpc, p => process.stderr.write(`${p.phase} / blocks ${p.from}-${p.to} / ${p.head - p.to} behind\n`), { blocks });
        if (r.advanced) { await commitState(statePath, r.state); state = r.state; }
        console.log(JSON.stringify({ committed: r.advanced, caughtUp: r.caughtUp, block: state.session.block, asOf: state.session.asOf, requests: rpc.requests }));
        if (r.caughtUp) break;
      }
    } finally { await unlock(); process.off('SIGINT', stop); process.off('SIGTERM', stop); } return;
  }
  const session = values.input ? await loadSession(values.input) : values.live || values.state ? (await readState(statePath)).session : await loadSession();
  if (values.input && values.live) throw Error('INPUT_AND_LIVE_ARE_SEPARATE_MODES');
  const rows = session.markets.map(m => scoreMarket(m, session.asOf)), state = initialDesk();
  if (values.mode && !['early', 'wave', 'models'].includes(values.mode)) throw Error('INVALID_MODE');
  state.tab = values.mode as typeof state.tab ?? 'wave'; state.query = values.search ?? '';
  if (command === 'inspect') {
    const address = positionals[1]?.toLowerCase(); const row = rows.find(r => r.market.address === address);
    if (!row) throw Error('TOKEN_NOT_IN_LOCAL_SESSION: use / search or import a session containing the contract');
    console.log(stringify({ source: session.source, asOf: session.asOf, ...row })); return;
  }
  if (command === 'export') {
    if (!values.output) throw Error('EXPORT_REQUIRES_OUTPUT_PATH');
    await atomicSave(values.output, session); console.log('Session exported'); return;
  }
  if (!['snapshot', 'desk'].includes(command)) throw Error('UNKNOWN_COMMAND: run npm start -- --help');
  if (values.json) { console.log(stringify({ source: session.source, asOf: session.asOf, rows: visibleRows(rows, state) })); return; }
  if (command === 'snapshot' || !process.stdout.isTTY || !process.stdin.isTTY) {
    console.log(render(session, rows, state, integer(values.width, 132, 30, 240), integer(values.height, 38, 12, 80)).plain()); return;
  }
  await runDesk(session, { rpc: rpcURL, statePath, live: values.live });
}
main().catch(e => { console.error(`SECOND / WAVE_  ${safeError(e)}`); process.exitCode = 1; });
