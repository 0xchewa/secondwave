import { Canvas, type Color } from './canvas.js';
import { age, clean, fit, percent, price, top, wrap } from './text.js';
import { filterNames, sortNames, visibleRows, type DeskState } from './state.js';
import type { DeskRow, Session } from '../domain.js';
import { earlyArtifact, waveArtifact, peakArtifact } from '../models.js';

const tone = (stage: string): Color => ['ACTIVE', 'IMPULSE', 'rank_only'].includes(stage) ? 'green' : ['INVALIDATED', 'INSUFFICIENT HISTORY'].includes(stage) ? 'red' : ['BASE FORMING', 'PULLBACK'].includes(stage) ? 'gold' : 'muted';
function chart(c: Canvas, x: number, y: number, width: number, height: number, row: DeskRow) {
  const ticks = (row.market.history?.ticks ?? row.market.tape ?? []).filter(t => t.price !== null);
  if (ticks.length < 2) { c.text(x, y + 2, 'NO RETAINED PRICE TAPE', 'muted'); c.text(x, y + 3, 'Quotes appear as RPC events arrive', 'muted'); return; }
  const prices = ticks.map(t => t.price!);
  const min = Math.min(...prices), max = Math.max(...prices), span = max - min || max * .01;
  for (let line = 0; line < height; line++) if (!(line % 3)) c.text(x, y + line, '┄'.repeat(width), 'line');
  let last: number | null = null;
  for (let col = 0; col < width; col++) {
    const v = prices[Math.min(prices.length - 1, Math.floor(col / (width - 1) * (prices.length - 1)))];
    const p = Math.max(0, Math.min(height - 1, height - 1 - Math.round((v - min) / span * (height - 1))));
    if (last !== null) for (let line = Math.min(last, p); line <= Math.max(last, p); line++) c.text(x + col, y + line, '│', 'green');
    c.text(x + col, y + p, '•', 'green'); last = p;
  }
  c.text(x, y + height, fit(`${ticks.length} retained events`, Math.floor(width / 2)), 'muted');
  c.text(x + Math.floor(width / 2), y + height, fit(`${age(ticks[0].ts, ticks.at(-1)!.ts)} tape / ${row.market.quoteSymbol ?? '?'}`, Math.ceil(width / 2), true), 'muted');
}
function detail(c: Canvas, row: DeskRow | undefined, x: number, y: number, w: number, h: number, session: Session, tick: number) {
  c.box(x, y, w, h, 'TOKEN / LOCAL INFERENCE');
  if (!row) { c.text(x + 3, y + 3, 'Nothing matches this view', 'muted'); return; }
  const m = row.market, full = w - 6;
  if (h < 25) {
    c.text(x + 3, y + 2, fit(`$${m.symbol || m.address.slice(2, 8)} / ${m.name ?? 'Unnamed launch'}`, full), 'text', 'bg', true);
    c.text(x + 3, y + 3, fit(`${price(m.priceQuote)} ${m.quoteSymbol ?? 'QUOTE UNKNOWN'}`, full), 'green');
    c.text(x + 3, y + 5, fit(m.phase === 'migrated' ? row.wave.stage : `${top(row.early.topPercent)} / ${row.early.state}`, full), 'green');
    c.text(x + 3, y + 6, fit(m.phase === 'migrated' ? `TARGET ${price(row.wave.target)} / INVALID ${price(row.wave.invalidation)}` : row.early.reasons[0]?.text ?? 'Model context unavailable', full), 'muted');
    c.text(x + 3, y + 7, fit(m.phase === 'migrated' ? `SELL / 60s ${percent(row.wave.pressure === null ? null : row.wave.pressure * 100)} / ${row.wave.pressureComplete ? 'complete' : 'partial'}` : row.early.reasons[1]?.text ?? row.early.state, full), 'muted');
    if (h >= 19) chart(c, x + 3, y + 9, full, 3, row);
    c.text(x + 3, y + h - 4, 'CONTRACT / ROBINHOOD CHAIN', 'muted');
    wrap(m.address, full).forEach((line, i) => c.text(x + 3, y + h - 3 + i, line, 'aqua')); return;
  }
  c.text(x + 3, y + 2, fit(`$${m.symbol || m.address.slice(2, 8)}`, full), 'text', 'bg', true);
  c.text(x + 3, y + 3, fit(m.name ?? 'Unnamed launch', full), 'muted');
  c.text(x + 3, y + 5, fit(`${price(m.priceQuote)} ${m.quoteSymbol ?? 'QUOTE UNKNOWN'}`, full), 'green', 'bg', true);
  c.text(x + 3, y + 6, fit(m.priceAt ? `PRICE AGE ${age(m.priceAt, session.asOf)} / LAUNCH ${age(m.launchedAt, session.asOf)}` : 'NO RECORDED PRICE / exact quote units only', full), 'muted');
  const graphHeight = Math.max(3, Math.min(6, h - 24));
  chart(c, x + 3, y + 8, full, graphHeight, row);
  let line = y + 10 + graphHeight;
  const heading = m.phase === 'migrated' ? row.wave.stage : `${top(row.early.topPercent)} / EARLY SIGNAL`;
  c.text(x + 3, line++, fit(heading, full), tone(m.phase === 'migrated' ? row.wave.stage : row.early.state), 'bg', true);
  if (m.phase === 'migrated') {
    c.text(x + 3, line++, fit(`TARGET        ${price(row.wave.target)} ${m.quoteSymbol ?? ''}`, full), 'green');
    c.text(x + 3, line++, fit(`INVALIDATION  ${price(row.wave.invalidation)} ${m.quoteSymbol ?? ''}`, full), 'red');
    c.text(x + 3, line++, fit(`SELL / 60s    ${percent(row.wave.pressure === null ? null : row.wave.pressure * 100)}${row.wave.pressureComplete ? '' : '  INCOMPLETE'}`, full), 'gold');
    c.text(x + 3, line++, fit(`BUY/SELL 60s  ${row.wave.buys} / ${row.wave.sells}${row.wave.pressureComplete ? '' : '  partial'}`, full), 'muted');
    for (const part of wrap(row.wave.reason, full).slice(0, 2)) c.text(x + 3, line++, part, 'muted');
  } else {
    c.text(x + 3, line++, fit(`STATE / ${row.early.state.toUpperCase().replaceAll('_', ' ')}`, full), row.early.state === 'rank_only' ? 'muted' : 'gold');
    for (const reason of row.early.reasons.slice(0, 3)) {
      c.text(x + 3, line++, fit(`${reason.direction === 'up' ? '+' : '-'} ${reason.short}`, full), reason.direction === 'up' ? 'green' : 'gold');
    }
    if (row.early.peak) c.text(x + 3, line++, fit(`PEAK BAND ${row.early.peak.low.toFixed(2)}-${row.early.peak.high.toFixed(2)}x / experimental`, full), 'muted');
  }
  if (line < y + h - 5) c.text(x + 3, line + 1, fit('Relative rank / probability release gates preserved', full), 'muted');
  const bottom = y + h - 4;
  c.text(x + 3, bottom, fit('CONTRACT / ROBINHOOD CHAIN', full), 'muted');
  for (const [i, text] of wrap(m.address, full).entries()) c.text(x + 3, bottom + 1 + i, text, 'aqua');
}
export function render(session: Session, rows: DeskRow[], state: DeskState, columns = 140, height = 42) {
  const w = Math.max(30, Math.min(240, columns)), h = Math.max(12, Math.min(80, height));
  const c = new Canvas(w, h);
  if (w < 64 || h < 24) {
    c.text(2, 2, 'SECOND / WAVE_', 'green', 'bg', true);
    c.text(2, 4, 'Give the signal more room', 'text');
    c.text(2, 6, `Minimum 64 x 24 / now ${w} x ${h}`, 'muted');
    c.text(2, 8, 'Or run: npm start -- snapshot', 'aqua');
    c.text(2, h - 2, '[q] quit  [?] help', 'muted'); return c;
  }
  c.text(2, 1, '◈  SECOND / WAVE_', 'green', 'bg', true);
  c.text(2, 2, 'THE POSITION ENDED. THE STORY KEPT GOING.', 'muted');
  const badge = session.source === 'recorded' ? 'RECORDED / LOCAL MODELS' : Date.now() / 1000 - session.asOf > 180 ? 'CATCHING UP / RPC' : 'LIVE RPC / LOCAL MODELS';
  c.text(w - 29, 1, fit(badge, 27, true), session.source === 'recorded' ? 'gold' : 'aqua');
  c.text(w - 29, 2, fit(`4663 / BLOCK ${session.block}`, 27, true), 'muted');
  c.text(2, 4, '[1] EARLY SIGNAL', state.tab === 'early' ? 'green' : 'muted', state.tab === 'early' ? 'panel' : 'bg', true);
  c.text(23, 4, '[2] SECOND WAVE', state.tab === 'wave' ? 'green' : 'muted', state.tab === 'wave' ? 'panel' : 'bg', true);
  c.text(44, 4, '[3] MODEL DESK', state.tab === 'models' ? 'green' : 'muted', state.tab === 'models' ? 'panel' : 'bg', true);
  if (w >= 110) c.text(w - 35, 4, fit(new Date(session.asOf * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC', 33, true), 'muted');
  const bodyY = 6, bodyH = h - 11;
  if (state.tab === 'models') modelDesk(c, 1, bodyY, w - 2, bodyH);
  else {
    const list = visibleRows(rows, state), wide = w >= 120;
    const leftW = wide ? Math.floor(w * .56) : w - 2;
    const selected = Math.min(state.selected, Math.max(0, list.length - 1));
    const capacity = bodyH - 6, offset = Math.max(0, Math.min(state.offset, Math.max(0, list.length - capacity)));
    if (state.detail && !wide) detail(c, list[selected], 1, bodyY, w - 2, bodyH, session, state.tick);
    else {
      c.box(1, bodyY, leftW, bodyH, `${state.tab === 'early' ? 'EARLY' : 'WAVE'} / ${list.length} RECORDS`);
      c.text(4, bodyY + 2, fit(`SORT ${sortNames[state.sort]}  /  ${filterNames[state.filter]}  /  ${session.source === 'recorded' ? 'RECORDED SAMPLE' : 'LOCAL WATCH SET'}`, leftW - 6), 'muted');
      const nameW = Math.max(12, leftW - 56), signalW = state.tab === 'early' ? 14 : 19;
      c.text(4, bodyY + 4, fit('TOKEN', nameW) + fit('AGE', 7) + fit('PRICE / QUOTE', 18) + fit(state.tab === 'early' ? 'EARLY RANK' : 'STAGE', signalW), 'muted');
      for (let i = 0; i < capacity; i++) {
        const r = list[offset + i]; if (!r) break;
        const isSelected = selected === offset + i, y = bodyY + 5 + i;
        const bg = isSelected ? 'panel' : 'bg';
        if (isSelected) c.fill(2, y, leftW - 2, 1);
        c.text(2, y, isSelected ? '▸' : ' ', 'green', bg);
        c.text(4, y, fit(r.market.symbol ?? r.market.address.slice(0, 8), nameW), isSelected ? 'green' : 'text', bg, isSelected);
        c.text(4 + nameW, y, fit(age(r.market.launchedAt, session.asOf), 7), 'muted', bg);
        c.text(11 + nameW, y, fit(`${price(r.market.priceQuote)} ${r.market.quoteSymbol ?? '?'}`, 18), 'text', bg);
        c.text(29 + nameW, y, fit(state.tab === 'early' ? top(r.early.topPercent) : r.wave.stage, signalW), tone(state.tab === 'early' ? r.early.state : r.wave.stage), bg);
      }
      if (!list.length) { c.text(4, bodyY + 7, 'No matching tokens', 'gold'); c.text(4, bodyY + 9, '[/] edit search   [f] cycle filter', 'muted'); }
      c.text(4, bodyY + bodyH - 1, ` ${list.length ? selected + 1 : 0}/${list.length}  [j/k] navigate  [enter] inspect `, 'muted');
      if (wide) detail(c, list[selected], leftW + 2, bodyY, w - leftW - 3, bodyH, session, state.tick);
    }
  }
  c.text(2, h - 4, fit(state.editing ? `SEARCH / ${state.query}_` : state.syncing ? `${['◐','◓','◑','◒'][state.tick % 4]} ${state.sync || 'CONNECTING RPC'}` : state.notice || (state.query ? `FILTER / ${state.query}` : 'READ THE MOVE / Every model calculation happens on this machine'), w - 4), state.editing ? 'green' : state.syncing ? 'aqua' : 'muted');
  c.text(2, h - 2, fit(w < 100 ? '[/] find  [s] sort  [f] filter  [l] live  [?] help  [q] quit' : '[/] search  [s] sort  [f] filter  [l] live RPC  [e] export  [?] keys  [q] quit', w - 4), 'text', 'panel');
  if (state.help) help(c);
  return c;
}
function modelDesk(c: Canvas, x: number, y: number, w: number, h: number) {
  c.box(x, y, w, h, 'MODEL DESK / FROZEN + VERIFIABLE');
  const narrow = w < 100, gap = narrow ? 0 : Math.floor(w / 2);
  const lines = [
    ['01 / EARLY SIGNAL', 'green'],
    [`${earlyArtifact.features.length} causal features / ${earlyArtifact.model.trees.length} boosted trees`, 'text'],
    ['4-hour migration horizon / frozen training rank', 'muted'],
    ['OUTPUT  relative rank + signed contributions', 'green'],
    ['GATE    rank only / calibrated probability disabled', 'gold'],
    ['', 'muted'],
    ['02 / SECOND WAVE', 'aqua'],
    ['Observed rise -> pullback -> base -> scenario', 'text'],
    [`${waveArtifact.model.features.length} features / 24-hour scenario horizon`, 'muted'],
    ['OUTPUT  target + invalidation + causal state', 'green'],
    ['GATE    probability candidate is not approved', 'gold'],
    ['', 'muted'],
    ['03 / PEAK RANGE', 'gold'],
    [`${peakArtifact.model.trees.length} trees / residual-quartile band`, 'text'],
    ['OUTPUT  experimental range / supported native quote', 'muted'],
    ['', 'muted'],
    ['All weights checked with SHA-256 before inference', 'green'],
    ['npm run bench    numerical checks against frozen cases', 'muted'],
  ] as [string, Color][];
  for (const [i, [text, fg]] of lines.entries()) if (y + i + 2 < y + h - 1) c.text(x + 3, y + i + 2, fit(text, narrow ? w - 6 : gap - 5), fg);
  if (!narrow) {
    const xx = x + gap + 2, ww = w - gap - 6;
    c.text(xx, y + 2, 'THE RESEARCH LOOP', 'green');
    const loop = ['CANONICAL OBSERVATIONS', '           │', '           ▼', 'CAUSAL FEATURES / NO FUTURE INPUT', '           │', '           ▼', 'FROZEN ARTIFACT + LOCAL INFERENCE', '           │', '           ▼', 'RANK / SCENARIO / EXPLANATION'];
    loop.forEach((line, i) => c.text(xx, y + 4 + i, fit(line, ww), i % 3 === 0 ? 'aqua' : 'line'));
    c.text(xx, y + 16, fit('No browser. No server. No wallet.', ww), 'text');
    c.text(xx, y + 18, fit('Same functions. Your own session.', ww), 'green');
  }
}
function help(c: Canvas) {
  const w = Math.min(76, c.width - 6), h = Math.min(27, c.height - 4), x = Math.floor((c.width - w) / 2), y = Math.floor((c.height - h) / 2);
  c.fill(x, y, w, h, 'bg'); c.box(x, y, w, h, 'YOUR KEYBOARD / THE WHOLE DESK');
  const lines = ['1 / 2 / 3       Early / Second Wave / model desk', 'j k / arrows    Move through the entire local list', 'PgUp / PgDn     Move one screen', 'Enter / Esc     Inspect / return', '/               Search ticker, name or contract', 's               Recent / signal / oldest / pressure', 'f               All / active / observing / resolved', 'l               Start independent read-only RPC sync', 'e               Export selected token and calculations', '?               Toggle this panel', 'q / Ctrl-C      Exit; finish no partial checkpoint', '', 'RECORDED is a dated real-data sample, never live.', 'RPC mode resumes verified local history at its block.', '0.0{7}1234 means seven zeros after the decimal point.', 'Open exported JSON for exact decimal strings.', 'Rank is relative. Curve progress is not probability.', 'Quotes retain their original units; USD is not invented.'];
  lines.slice(0, h - 3).forEach((s, i) => c.text(x + 3, y + 2 + i, fit(s, w - 6), i < 11 ? 'text' : 'muted'));
}
