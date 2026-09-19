import { emitKeypressEvents } from 'node:readline';
import { resolve } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import type { Session } from '../domain.js';
import { scoreMarket } from '../models.js';
import { atomicSave } from '../session.js';
import { RpcError } from '../chain/rpc.js';
import { readState, stateLock, commitState } from '../chain/state.js';
import { collectPage } from '../chain/collect.js';
import { createReader, type ReaderOptions } from '../chain/reader.js';
import { hydratePage } from '../chain/history.js';
import { lookupToken } from '../chain/lookup.js';
import { projectRow } from '../market.js';
import { initialDesk, visibleRows, sortNames, type DeskState } from './state.js';
import { render } from './render.js';

export function safeError(e: unknown) {
  if (e instanceof RpcError) return e.code;
  const message = e instanceof Error ? e.message.split('\n')[0] : '';
  return /^[A-Z_]+(?::|$)/.test(message) ? message.slice(0, 160) : 'OPERATION_FAILED / checkpoint preserved; check RPC access and input format';
}
export async function runDesk(initial: Session, options: { live?: boolean; reader: ReaderOptions; statePath: string; desk?: DeskState }) {
  let session = initial, rows = session.markets.map(m => projectRow(scoreMarket(m, session.asOf), session));
  const desk = options.desk ?? initialDesk(), controller = new AbortController();
  let closing = false, syncTask: Promise<void> | null = null, last = '', historyTarget: string | null = null, lookupTarget: string | null = null;
  let repaint: ReturnType<typeof setTimeout> | undefined;
  const requestDraw = () => { repaint ??= setTimeout(() => { repaint = undefined; draw(); }, 30); };
  let projectionAt = 0;
  const updateRows = () => {
    const selected = visibleRows(rows, desk)[desk.selected]?.market.address;
    rows = session.markets.map(m => projectRow(scoreMarket(m, session.asOf), session));
    const index = selected ? visibleRows(rows, desk).findIndex(r => r.market.address === selected) : -1;
    if (index >= 0) desk.selected = index;
  };
  const draw = () => {
    if (closing) return;
    const now = Math.floor(Date.now() / 1000);
    if (now !== projectionAt) { rows = rows.map(r => projectRow(r, session, now)); projectionAt = now; }
    const list = visibleRows(rows, desk), capacity = Math.max(1, (process.stdout.rows || 42) - 17);
    desk.selected = Math.max(0, Math.min(desk.selected, list.length - 1));
    if (desk.selected < desk.offset) desk.offset = desk.selected;
    if (desk.selected >= desk.offset + capacity) desk.offset = desk.selected - capacity + 1;
    const frame = render(session, rows, desk, process.stdout.columns || 120, process.stdout.rows || 40).ansi(!process.env.NO_COLOR);
    if (frame !== last) { process.stdout.write('\x1b[H' + frame); last = frame; }
  };
  async function sync() {
    if (desk.syncing) return;
    desk.syncing = true; desk.notice = '';
    let unlock: (() => Promise<void>) | undefined;
    try {
      unlock = await stateLock(options.statePath);
      let state = await readState(options.statePath);
      const rpc = createReader(options.reader, controller.signal);
      session = { ...state.session, source: 'rpc' }; updateRows();
      while (!controller.signal.aborted) {
        try {
          const result = await collectPage(state, rpc, p => {
            desk.sync = `${p.phase}  ${p.from.toLocaleString('en-US')} -> ${p.to.toLocaleString('en-US')} / ${Math.max(0, p.head - p.to).toLocaleString('en-US')} blocks behind`; draw();
          });
          if (result.advanced) { await commitState(options.statePath, result.state); state = result.state; }
          session = { ...state.session, source: 'rpc' }; updateRows();
          if (lookupTarget) {
            const target = lookupTarget; lookupTarget = null;
            try {
              state = await lookupToken(state, rpc, target, undefined, text => { desk.sync = text; draw(); });
              await commitState(options.statePath, state); session = state.session; updateRows(); historyTarget = target;
            } catch (e) { desk.notice = safeError(e); }
          }
          if (result.caughtUp) {
            historyTarget ??= Object.keys(state.historyJobs ?? {})[0] ?? null;
            // Prepare one missing current market at a time; live head always takes priority.
            if (!historyTarget) historyTarget = rows.find(r => r.market.quoteAddress === '0x0000000000000000000000000000000000000000' && r.market.symbol && !r.activity?.complete && (r.market.phase === 'curve' && session.asOf - r.market.launchedAt < 14400 || r.market.history && session.asOf - r.market.history.migratedAt < 259200))?.market.address ?? null;
            if (historyTarget) {
              try {
                const h = await hydratePage(state, rpc, historyTarget, text => { desk.sync = text; draw(); });
                await commitState(options.statePath, h.state); state = h.state;
                session = { ...state.session, source: 'rpc' }; updateRows();
                if (h.done) { desk.notice = 'HISTORY READY / complete local candles and flow'; historyTarget = null; }
              } catch (e) { desk.notice = safeError(e); historyTarget = null; }
            }
          }
          desk.sync = `${rpc.kind === 'hypersync' ? 'HYPERSYNC + RPC' : 'RPC'} / ${result.caughtUp ? 'AT HEAD' : 'CATCHING UP'} / checkpoint ${session.block}`; draw();
          if (result.caughtUp) await pause(historyTarget ? 1000 : 10000, undefined, { signal: controller.signal });
        } catch (e) {
          if (controller.signal.aborted) break;
          const code = safeError(e); desk.notice = code;
          if (/REORG|MISMATCH|WRONG_CHAIN|ACCESS_DENIED|TOKEN_REQUIRED|LOCAL_STATE/.test(code)) {
            if (/REORG/.test(code)) { session.reorg = true; updateRows(); }
            throw e;
          }
          desk.sync = `${code} / retry in 10s / saved checkpoint retained`; draw();
          await pause(10000, undefined, { signal: controller.signal });
        }
      }
    } catch (e) { if (!controller.signal.aborted) desk.notice = safeError(e); }
    finally { await unlock?.(); desk.syncing = false; }
  }
  function startSync() { if (!desk.syncing) syncTask = sync(); }
  let done!: () => void;
  const completed = new Promise<void>(resolve => { done = resolve; });
  function close() { if (!closing) { closing = true; controller.abort(); done(); } }
  async function keypress(text: string | undefined, key: any) {
    if (!key || closing) return;
    if (key.ctrl && key.name === 'c') { close(); return; }
    if (desk.editing) {
      if (key.name === 'escape' || key.name === 'return') desk.editing = false;
      else if (key.name === 'backspace') desk.query = desk.query.slice(0, -1);
      else if (text && /^[\x20-\x7e]+$/.test(text)) desk.query = (desk.query + text).slice(0, 100);
      desk.selected = desk.offset = 0; requestDraw(); return;
    }
    const count = Math.max(1, (process.stdout.rows || 42) - 17);
    if (text === 'q') close();
    else if (key.name === 'escape') { desk.help = desk.detail = false; desk.query = ''; }
    else if (text === '?') desk.help = !desk.help;
    else if (['1', '2', '3'].includes(text ?? '')) { desk.tab = text === '1' ? 'early' : text === '2' ? 'wave' : 'models'; desk.selected = desk.offset = desk.filter = 0; }
    else if (key.name === 'down' || text === 'j') desk.selected++;
    else if (key.name === 'up' || text === 'k') desk.selected--;
    else if (key.name === 'pagedown') desk.selected += count;
    else if (key.name === 'pageup') desk.selected -= count;
    else if (key.name === 'home') desk.selected = 0;
    else if (key.name === 'end') desk.selected = 100000;
    else if (key.name === 'return') desk.detail = !desk.detail;
    else if (text === '/') { desk.editing = true; if (desk.tab === 'models') desk.tab = 'early'; }
    else if (text === 's') { desk.sort = (desk.sort + 1) % sortNames.length; desk.selected = desk.offset = 0; }
    else if (text === 'f') { desk.filter = (desk.filter + 1) % 4; desk.selected = desk.offset = 0; }
    else if (text === 'l') startSync();
    else if (text === 'a') { desk.catalogue = !desk.catalogue; desk.selected = desk.offset = 0; }
    else if (text === 'w') desk.window = (desk.window + 1) % 3;
    else if (text === 'c') desk.chart = (desk.chart + 1) % 4;
    else if (text === 'v') desk.facts = !desk.facts;
    else if (text === 'm') { const minima = [0, 1, 2.5, 5, 10]; desk.minimum = minima[(minima.indexOf(desk.minimum) + 1) % minima.length]; }
    else if (text === 'h') {
      if (session.source === 'recorded') desk.notice = 'RECORDED MODE / [l] switch to your local live state before fetching';
      else {
        const row = visibleRows(rows, desk)[desk.selected];
        if (row) { historyTarget = row.market.address; desk.notice = 'HISTORY QUEUED / live catch-up takes priority'; startSync(); }
        else if (/^0x[0-9a-f]{40}$/i.test(desk.query)) { lookupTarget = desk.query.toLowerCase(); desk.notice = 'CONTRACT LOOKUP QUEUED'; startSync(); }
      }
    }
    else if (text === 'e') {
      const row = visibleRows(rows, desk)[desk.selected];
      if (row) try {
        await atomicSave(resolve('.local/exports', `${row.market.address}.json`), { asOf: session.asOf, source: session.source, ...row });
        desk.notice = `EXPORTED / .local/exports/${row.market.address}.json`;
      } catch { desk.notice = 'EXPORT_FAILED / check local directory permissions'; }
    }
    requestDraw();
  }
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true); process.stdin.resume();
  process.stdout.write('\x1b[?1049h\x1b[?25l\x1b[?7l\x1b[2J');
  process.stdin.on('keypress', keypress); process.stdout.on('resize', draw);
  process.once('SIGTERM', close); process.once('SIGINT', close);
  const animation = setInterval(() => { desk.tick++; draw(); }, 500);
  try { draw(); if (options.live) startSync(); await completed; }
  finally {
    clearInterval(animation); controller.abort();
    clearTimeout(repaint);
    process.stdin.off('keypress', keypress); process.stdout.off('resize', draw);
    process.off('SIGTERM', close); process.off('SIGINT', close);
    process.stdin.setRawMode(false); process.stdin.pause();
    process.stdout.write('\x1b[0m\x1b[?7h\x1b[?25h\x1b[?1049l');
    if (syncTask) await syncTask;
  }
}
