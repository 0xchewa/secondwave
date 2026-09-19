#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { loadSession, stringify, atomicSave } from './session.js';
import { manifest, scoreMarket } from './models.js';
import { createReader, readerOptions } from './chain/reader.js';
import { readState, stateLock, commitState } from './chain/state.js';
import { collectPage } from './chain/collect.js';
import { hydratePage } from './chain/history.js';
import { lookupToken } from './chain/lookup.js';
import { projectRow } from './market.js';
import { runDesk, safeError } from './tui/app.js';
import { initialDesk, visibleRows } from './tui/state.js';
import { render } from './tui/render.js';

try { loadEnvFile('.env'); } catch (e: any) { if (e.code !== 'ENOENT') throw e; }
const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  help: { type: 'boolean', short: 'h' }, live: { type: 'boolean' }, recorded: { type: 'boolean' }, json: { type: 'boolean' }, all: { type: 'boolean' },
  input: { type: 'string' }, state: { type: 'string' }, mode: { type: 'string' }, search: { type: 'string' }, transport: { type: 'string' },
  pages: { type: 'string' }, blocks: { type: 'string' }, output: { type: 'string' }, width: { type: 'string' }, height: { type: 'string' }, minimum: { type: 'string' }, 'from-block': { type: 'string' },
} });
const command = positionals[0] ?? 'desk', statePath = resolve(values.state ?? '.local/checkpoint.json.gz');
const integer = (value: string | undefined, fallback: number, min: number, max: number) => {
  const n = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw Error('INVALID_NUMERIC_OPTION'); return n;
};
async function main() {
  if (values.help || command === 'help') {
    console.log(`SECOND / WAVE_   Local research terminal

  npm start                          Live desk; resumes local collection
  npm start -- --recorded             Offline, dated real-data session
  npm start -- snapshot               Print your local saved state once
  npm start -- snapshot --recorded    Print the bundled offline session
  npm start -- inspect 0x...          Full local calculation as JSON
  npm start -- sync --pages 10        Catch up, atomically saving every page
  npm start -- hydrate 0x...          Prepare selected history; resumable
  npm start -- lookup 0x...           Find a contract outside your catalogue
  npm start -- models                Verify and list frozen artifacts
  npm run bench                      Numerical reference cases

  --transport rpc|hypersync           RPC alone, or accelerated history
  --input file.json[.gz]              Open a portable session, offline
  --mode early|wave|models            Initial tab
  --search SYMBOL_OR_CA --all         Search the complete local catalogue
  --minimum 2.5                      Minimum Early model estimate, percent
  --json                             Machine-readable snapshot output
  --state .local/checkpoint.json.gz   Isolated state; never concurrent writers
  --pages 1..1000 --blocks 1..10000    Bound sync or history work
  --from-block N                     RPC lookup start (max 200,000 blocks)
  --output file.json                 Destination for the export command

  .env: SWAVE_RPC_URL; optional ENVIO_API_TOKEN + ENVIO_HYPERSYNC_URL.
  With an Envio token, HyperSync is selected automatically. Inference stays local.
  Without one, ordinary read-only RPC works; initial catch-up can take longer.
  Snapshot/inspect never silently fetch the network. Only desk/sync/hydrate/lookup do.
  Keys: 1/2/3 tabs, / search, a catalogue, h history, w flow, c chart, ? help, q quit.`); return;
  }
  if (command === 'models') { console.log(JSON.stringify(manifest, null, 2)); return; }
  if (command === 'bench') { const { bench } = await import('./verify.js'); console.log(JSON.stringify(await bench(), null, 2)); return; }
  if (values.live && (values.recorded || values.input) || values.recorded && values.input) throw Error('CHOOSE_LIVE_RECORDED_OR_INPUT');
  const reader = readerOptions(values.transport);
  if (['sync', 'hydrate', 'lookup'].includes(command)) {
    if (values.recorded || values.input) throw Error('NETWORK_COMMAND_REQUIRES_LOCAL_STATE');
    const pages = integer(values.pages, command === 'sync' ? 1 : 100, 1, 1000);
    const unlock = await stateLock(statePath), controller = new AbortController();
    const stop = () => controller.abort(); process.once('SIGINT', stop); process.once('SIGTERM', stop);
    try {
      let state = await readState(statePath); const rpc = createReader(reader, controller.signal);
      const blocks = integer(values.blocks, rpc.suggestedBlocks ?? 1000, 1, 10000);
      const address = positionals[1]?.toLowerCase() ?? '';
      const progress = (s: string) => process.stderr.write(s + '\n');
      if (command === 'lookup') {
        state = await lookupToken(state, rpc, address, values['from-block'] == null ? undefined : integer(values['from-block'], 0, 0, state.session.block), progress);
        await commitState(statePath, state); console.log('Contract saved. Run hydrate CONTRACT to prepare its price and Wave history.'); return;
      }
      for (let i = 0; i < pages; i++) {
        if (command === 'hydrate') {
          const r = await hydratePage(state, rpc, address, progress, blocks); await commitState(statePath, r.state); state = r.state;
          console.log(JSON.stringify({ historyComplete: r.done, next: r.next, to: r.to })); if (r.done) break;
        } else {
          const r = await collectPage(state, rpc, p => progress(`${p.phase} / blocks ${p.from}-${p.to} / ${p.head - p.to} behind`), { blocks });
          if (r.advanced) { await commitState(statePath, r.state); state = r.state; }
          console.log(JSON.stringify({ committed: r.advanced, caughtUp: r.caughtUp, block: state.session.block, asOf: state.session.asOf, requests: rpc.requests }));
          if (r.caughtUp) break;
        }
      }
    } finally { await unlock(); process.off('SIGINT', stop); process.off('SIGTERM', stop); } return;
  }
  const recorded = !!values.recorded || !!values.input;
  const session = values.input ? await loadSession(values.input) : recorded ? await loadSession() : (await readState(statePath)).session;
  session.source = recorded ? 'recorded' : 'rpc';
  const rows = session.markets.map(m => projectRow(scoreMarket(m, session.asOf), session)), state = initialDesk();
  if (values.mode && !['early', 'wave', 'models'].includes(values.mode)) throw Error('INVALID_MODE');
  state.tab = values.mode as typeof state.tab ?? 'wave'; state.query = values.search ?? ''; state.catalogue = !!values.all;
  state.minimum = values.minimum == null ? 0 : Number(values.minimum);
  if (!Number.isFinite(state.minimum) || state.minimum < 0 || state.minimum > 100) throw Error('MINIMUM_MUST_BE_0_TO_100');
  if (command === 'inspect') {
    const address = positionals[1]?.toLowerCase(), row = rows.find(r => r.market.address === address);
    if (!row) throw Error('TOKEN_NOT_IN_LOCAL_SESSION: run lookup CONTRACT first');
    console.log(stringify({ source: session.source, asOf: session.asOf, ...row })); return;
  }
  if (command === 'export') {
    if (!values.output) throw Error('EXPORT_REQUIRES_OUTPUT_PATH');
    await atomicSave(values.output, session); console.log('Session exported'); return;
  }
  if (!['snapshot', 'desk'].includes(command)) throw Error('UNKNOWN_COMMAND: run npm start -- --help');
  if (values.json) { console.log(stringify({ source: session.source, asOf: session.asOf, rows: visibleRows(rows, state) })); return; }
  if (command === 'snapshot' || !process.stdout.isTTY || !process.stdin.isTTY) {
    console.log(render(session, rows, state, integer(values.width, 132, 30, 240), integer(values.height, 38, 12, 80)).plain());
    if (command === 'desk' && !recorded) process.stderr.write('Non-interactive snapshot. Use sync --pages 10 to fetch data, or run npm start in an interactive terminal.\n'); return;
  }
  await runDesk(session, { reader, statePath, live: !recorded, desk: state });
}
main().catch(e => { console.error(`SECOND / WAVE_  ${safeError(e)}`); process.exitCode = 1; });
