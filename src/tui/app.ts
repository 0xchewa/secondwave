import { emitKeypressEvents } from 'node:readline';
import { resolve } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import type { Session } from '../domain.js';
import { scoreMarket } from '../models.js';
import { atomicSave } from '../session.js';
import { Rpc, RpcError } from '../chain/rpc.js';
import { readState, stateLock, commitState } from '../chain/state.js';
import { collectPage } from '../chain/collect.js';
import { initialDesk, visibleRows } from './state.js';
import { render } from './render.js';

export function safeError(e: unknown) {
  if (e instanceof RpcError) return e.code;
  const message = e instanceof Error ? e.message.split('\n')[0] : '';
  return /^[A-Z_]+(?::|$)/.test(message) ? message.slice(0, 160) : 'OPERATION_FAILED / checkpoint preserved; check RPC access and input format';
}
export async function runDesk(initial: Session, options: { live?: boolean; rpc: string; statePath: string }) {
  let session = initial, rows = session.markets.map(m => scoreMarket(m, session.asOf));
  const desk = initialDesk(), controller = new AbortController();
  let closing = false, syncTask: Promise<void> | null = null, last = '';
  const draw = () => {
    if (closing) return;
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
      const rpc = new Rpc(options.rpc, controller.signal);
      while (!controller.signal.aborted) {
        const result = await collectPage(state, rpc, p => {
          desk.sync = `${p.phase}  ${p.from.toLocaleString('en-US')} -> ${p.to.toLocaleString('en-US')} / ${Math.max(0, p.head - p.to).toLocaleString('en-US')} blocks behind`; draw();
        });
        if (result.advanced) { await commitState(options.statePath, result.state); state = result.state; }
        session = state.session; rows = session.markets.map(m => scoreMarket(m, session.asOf));
        desk.sync = `RPC ${result.caughtUp ? 'AT HEAD' : 'CATCHING UP'} / ${rpc.requests} read requests / checkpoint ${session.block}`; draw();
        if (result.caughtUp) await pause(15000, undefined, { signal: controller.signal });
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
      desk.selected = desk.offset = 0; draw(); return;
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
    else if (text === '/') desk.editing = true;
    else if (text === 's') { desk.sort = (desk.sort + 1) % 4; desk.selected = desk.offset = 0; }
    else if (text === 'f') { desk.filter = (desk.filter + 1) % 4; desk.selected = desk.offset = 0; }
    else if (text === 'l') startSync();
    else if (text === 'e') {
      const row = visibleRows(rows, desk)[desk.selected];
      if (row) try {
        await atomicSave(resolve('.local/exports', `${row.market.address}.json`), { asOf: session.asOf, source: session.source, ...row });
        desk.notice = `EXPORTED / .local/exports/${row.market.address}.json`;
      } catch { desk.notice = 'EXPORT_FAILED / check local directory permissions'; }
    }
    draw();
  }
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true); process.stdin.resume();
  process.stdout.write('\x1b[?1049h\x1b[?25l\x1b[2J');
  process.stdin.on('keypress', keypress); process.stdout.on('resize', draw);
  process.once('SIGTERM', close); process.once('SIGINT', close);
  const animation = setInterval(() => { desk.tick++; draw(); }, 500);
  try { draw(); if (options.live) startSync(); await completed; }
  finally {
    clearInterval(animation); controller.abort();
    process.stdin.off('keypress', keypress); process.stdout.off('resize', draw);
    process.off('SIGTERM', close); process.off('SIGINT', close);
    process.stdin.setRawMode(false); process.stdin.pause();
    process.stdout.write('\x1b[0m\x1b[?25h\x1b[?1049l');
    if (syncTask) await syncTask;
  }
}
