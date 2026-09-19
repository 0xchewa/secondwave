import { Canvas, type Color } from './canvas.js';
import { age, clean, fit, percent, price, top, wrap, estimate } from './text.js';
import { filterNames, sortNames, windowNames, visibleRows, type DeskState } from './state.js';
import type { DeskRow, Session } from '../domain.js';
import { chart } from './chart.js';
import { viewTime } from '../market.js';
import { formatUnits } from 'viem';
import { earlyArtifact, waveArtifact, peakArtifact } from '../models.js';

const tone = (stage: string): Color => ['ACTIVE', 'IMPULSE', 'rank_only'].includes(stage) ? 'green' : ['INVALIDATED', 'INSUFFICIENT HISTORY'].includes(stage) ? 'red' : ['BASE FORMING', 'PULLBACK'].includes(stage) ? 'gold' : 'muted';
function detail(c: Canvas, row: DeskRow | undefined, x: number, y: number, w: number, h: number, session: Session, state: DeskState) {
  c.box(x, y, w, h, 'TOKEN / LOCAL INFERENCE');
  if (!row) { c.text(x + 3, y + 3, 'Nothing matches this view', 'muted'); return; }
  const m = row.market, full = w - 6;
  const win = windowNames[state.window], flow = row.windows?.[win];
  const flowLine = `BUY/SELL ${win.toUpperCase()}  ${flow?.complete ? `${flow.buys} / ${flow.sells}` : 'HISTORY INCOMPLETE'}`;
  if (state.facts) {
    const facts = m.launchFacts, bottom = y + h - 4;
    const entries: [string, Color][] = [
      [`$${m.symbol ?? '?'} / LAUNCH FACTS [v]`, 'green'],
      [new Date(m.launchedAt * 1000).toISOString().replace('T',' ').slice(0,19) + ' UTC', 'muted'],
      [`BLOCK ${m.launchBlock} / DATA ${session.block}`, 'muted'],
      ['', 'muted'], ['FACTORY CALLER', 'aqua'], [facts?.creator ?? 'Unknown', 'text'],
      [`PRIOR LAUNCHES ${facts?.priorLaunches ?? '--'} / MIGRATIONS ${facts?.priorMigrations ?? '--'}`, 'muted'],
      [`DECLARED INITIAL BUY ${facts?.initialBuyRaw != null && m.quoteDecimals != null ? price(formatUnits(BigInt(facts.initialBuyRaw), m.quoteDecimals)) : '--'} ${m.quoteSymbol ?? '?'}`, 'text'],
      [`CREATOR TAX ${facts?.creatorTaxBps != null ? (facts.creatorTaxBps / 100).toFixed(2) + '%' : '--'}`, 'text'],
      ['', 'muted'], ['MODEL CONTRIBUTIONS / LAUNCH-TIME', 'aqua'],
    ];
    for (const r of row.early.reasons.slice(0,3)) for (const part of wrap(`${r.direction === 'up' ? '+' : '-'} ${r.text}`,full)) entries.push([part,r.direction === 'up' ? 'green' : 'gold']);
    entries.push(['', 'muted'], ['DATA / ELIGIBILITY', 'aqua']);
    for (const r of row.admission?.reasons ?? []) for (const part of wrap(r,full)) entries.push([part,'muted']);
    let line = y + 2;
    for (const [text, color] of entries) if (line < bottom - 1) c.text(x + 3,line++,fit(text,full),color);
    c.text(x + 3,bottom,'CONTRACT / ROBINHOOD CHAIN','muted');
    wrap(m.address,full).forEach((line,i)=>c.text(x+3,bottom+1+i,line,'aqua')); return;
  }
  if (h < 25) {
    c.text(x + 3, y + 2, fit(`$${m.symbol || m.address.slice(2, 8)} / ${m.name ?? 'Unnamed launch'}`, full), 'text', 'bg', true);
    c.text(x + 3, y + 3, fit(`${price(m.priceQuote)} ${m.quoteSymbol ?? 'QUOTE UNKNOWN'}`, full), 'green');
    c.text(x + 3, y + 5, fit(m.phase === 'migrated' ? row.wave.stage : `${estimate(row.early.estimate)} / MODEL ESTIMATE`, full), 'green');
    c.text(x + 3, y + 6, fit(m.phase === 'migrated' ? `TARGET ${price(row.wave.target)} / INVALID ${price(row.wave.invalidation)}` : row.early.reasons[0]?.text ?? 'Model context unavailable', full), 'muted');
    c.text(x + 3, y + 7, fit(flowLine, full), flow?.complete ? 'aqua' : 'gold');
    if (h >= 19) chart(c, x + 3, y + 9, full, 3, row, session.asOf, state.chart);
    c.text(x + 3, y + h - 4, 'CONTRACT / ROBINHOOD CHAIN', 'muted');
    wrap(m.address, full).forEach((line, i) => c.text(x + 3, y + h - 3 + i, line, 'aqua')); return;
  }
  c.text(x + 3, y + 2, fit(`$${m.symbol || m.address.slice(2, 8)}`, full), 'text', 'bg', true);
  c.text(x + 3, y + 3, fit(m.name ?? 'Unnamed launch', full), 'muted');
  c.text(x + 3, y + 4, fit(m.history ? `MIGRATED ${age(m.history.migratedAt, viewTime(session))} AGO` : m.curveProgress != null ? `ON CURVE / ${m.curveProgress.toFixed(1)}%` : 'CURVE RESERVE UNAVAILABLE', full), 'muted');
  c.text(x + 3, y + 5, fit(`${price(m.priceQuote)} ${m.quoteSymbol ?? 'QUOTE UNKNOWN'}`, full), 'green', 'bg', true);
  c.text(x + 3, y + 6, fit(m.priceAt ? `PRICE AGE ${age(m.priceAt, viewTime(session))} / LAUNCH ${age(m.launchedAt, viewTime(session))}` : 'NO RECORDED PRICE / exact quote units only', full), 'muted');
  const graphHeight = Math.max(3, Math.min(5, h - 26));
  chart(c, x + 3, y + 8, full, graphHeight, row, session.asOf, state.chart);
  let line = y + 10 + graphHeight;
  const heading = m.phase === 'migrated' ? row.wave.stage : `${estimate(row.early.estimate)} / MODEL ESTIMATE`;
  c.text(x + 3, line++, fit(heading, full), tone(m.phase === 'migrated' ? row.wave.stage : row.early.state), 'bg', true);
  if (m.phase === 'migrated') {
    c.text(x + 3, line++, fit(`TARGET        ${price(row.wave.target)} ${m.quoteSymbol ?? ''}`, full), 'green');
    c.text(x + 3, line++, fit(`INVALIDATION  ${price(row.wave.invalidation)} ${m.quoteSymbol ?? ''}`, full), 'red');
    c.text(x + 3, line++, fit(`SELL / 60s    ${percent(row.wave.pressure === null ? null : row.wave.pressure * 100)}${row.wave.pressureComplete ? '' : '  INCOMPLETE'}`, full), 'gold');
    c.text(x + 3, line++, fit(row.wave.deadline ? `SCENARIO ENDS ${new Date(row.wave.deadline * 1000).toISOString().slice(5, 16).replace('T', ' ')} UTC` : 'No active scenario deadline', full), 'muted');
  } else {
    c.text(x + 3, line++, fit(`${top(row.early.topPercent)} / ${row.early.displayState.toUpperCase()}`, full), 'muted');
    for (const reason of row.early.reasons.slice(0, 2)) {
      c.text(x + 3, line++, fit(`${reason.direction === 'up' ? '+' : '-'} ${reason.short}`, full), reason.direction === 'up' ? 'green' : 'gold');
    }
    if (row.early.peak) c.text(x + 3, line++, fit(`PEAK BAND ${row.early.peak.low.toFixed(2)}-${row.early.peak.high.toFixed(2)}x / experimental`, full), 'muted');
  }
  const bottom = y + h - 4;
  const extra: [string, Color][] = [[flowLine, flow?.complete ? 'aqua' : 'gold'], [`VOLUME ${win.toUpperCase()}    ${price(flow?.volume ?? null)} ${m.quoteSymbol ?? '?'}`, 'muted']];
  const ready = m.phase === 'curve' ? row.admission?.early : row.admission?.wave;
  const reason = !ready && row.admission?.reasons.length ? row.admission.reasons[0] : m.phase === 'migrated' ? row.wave.reason : 'Experimental estimate / calibrated probability not approved';
  for (const part of wrap(reason, full).slice(0, 2)) extra.push([part, !ready ? 'gold' : 'muted']);
  for (const [text, color] of extra) if (line < bottom - 1) c.text(x + 3, line++, fit(text, full), color);
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
  const badge = session.source === 'recorded' ? 'RECORDED / LOCAL MODELS' : session.reorg ? 'REORG / PAUSED' : Date.now() / 1000 - session.asOf > 90 ? 'CATCHING UP / STALE' : `LIVE ${session.transport === 'hypersync' ? 'HYPERSYNC' : 'RPC'} / LOCAL`;
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
    if (state.detail && !wide) detail(c, list[selected], 1, bodyY, w - 2, bodyH, session, state);
    else {
      c.box(1, bodyY, leftW, bodyH, `${state.tab === 'early' ? 'EARLY' : 'WAVE'} / ${list.length} RECORDS`);
      c.text(4, bodyY + 2, fit(`SORT ${sortNames[state.sort]}  /  ${filterNames[state.filter]}  /  ${state.catalogue ? 'CATALOGUE' : state.tab === 'early' ? `4H / MIN ${state.minimum}%` : '72H READY'}`, leftW - 6), 'muted');
      const nameW = Math.max(12, leftW - 56), signalW = state.tab === 'early' ? 14 : 19;
      c.text(4, bodyY + 4, fit('TOKEN', nameW) + fit('AGE', 7) + fit('PRICE / QUOTE', 18) + fit(state.tab === 'early' ? 'MODEL ESTIMATE' : 'STAGE', signalW), 'muted');
      for (let i = 0; i < capacity; i++) {
        const r = list[offset + i]; if (!r) break;
        const isSelected = selected === offset + i, y = bodyY + 5 + i;
        const bg = isSelected ? 'panel' : 'bg';
        if (isSelected) c.fill(2, y, leftW - 2, 1);
        c.text(2, y, isSelected ? '▸' : ' ', 'green', bg);
        c.text(4, y, fit(r.market.symbol ?? r.market.address.slice(0, 8), nameW), isSelected ? 'green' : 'text', bg, isSelected);
        c.text(4 + nameW, y, fit(age(r.market.launchedAt, viewTime(session)), 7), 'muted', bg);
        c.text(11 + nameW, y, fit(`${price(r.market.priceQuote)} ${r.market.quoteSymbol ?? '?'}`, 18), 'text', bg);
        c.text(29 + nameW, y, fit(state.tab === 'early' ? r.early.estimate == null ? r.early.displayState.toUpperCase() : estimate(r.early.estimate) : r.wave.stage, signalW), tone(state.tab === 'early' ? r.early.state : r.wave.stage), bg);
      }
      if (!list.length) { c.text(4, bodyY + 7, 'No matching tokens', 'gold'); c.text(4, bodyY + 9, '[a] catalogue / [h] prepare / [l] sync', 'muted'); }
      c.text(4, bodyY + bodyH - 1, ` ${list.length ? selected + 1 : 0}/${list.length}  [j/k] navigate  [enter] inspect `, 'muted');
      if (wide) detail(c, list[selected], leftW + 2, bodyY, w - leftW - 3, bodyH, session, state);
    }
  }
  c.text(2, h - 4, fit(state.editing ? `SEARCH / ${state.query}_` : state.syncing ? `${['◐','◓','◑','◒'][state.tick % 4]} ${state.sync || 'CONNECTING RPC'}` : state.notice || (state.query ? `FILTER / ${state.query}` : 'READ THE MOVE / Every model calculation happens on this machine'), w - 4), state.editing ? 'green' : state.syncing ? 'aqua' : 'muted');
  if (state.notice && state.syncing) c.text(2, h - 3, fit(state.notice,w - 4),'gold');
  c.text(2, h - 2, fit(w < 100 ? '[/] find  [a] all  [h] history  [?] help  [q] quit' : '[/] find  [s] sort  [f] filter  [a] all  [h] history  [w] flow  [c] chart  [v] facts  [?] keys  [q] quit', w - 4), 'text', 'panel');
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
    ['OUTPUT  model estimate + rank + explanations', 'green'],
    ['GATE    experimental estimate / approval pending', 'gold'],
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
    const loop = ['CANONICAL OBSERVATIONS', '           │', '           ▼', 'CAUSAL FEATURES / NO FUTURE INPUT', '           │', '           ▼', 'FROZEN ARTIFACT + LOCAL INFERENCE', '           │', '           ▼', 'ESTIMATE / SCENARIO / EXPLANATION'];
    loop.forEach((line, i) => c.text(xx, y + 4 + i, fit(line, ww), i % 3 === 0 ? 'aqua' : 'line'));
    c.text(xx, y + 16, fit('No browser. No server. No wallet.', ww), 'text');
    c.text(xx, y + 18, fit('Same functions. Your own session.', ww), 'green');
  }
}
function help(c: Canvas) {
  const w = Math.min(76, c.width - 6), h = Math.min(27, c.height - 4), x = Math.floor((c.width - w) / 2), y = Math.floor((c.height - h) / 2);
  c.fill(x, y, w, h, 'bg'); c.box(x, y, w, h, 'YOUR KEYBOARD / THE WHOLE DESK');
  const lines = ['1 / 2 / 3       Early / Second Wave / model desk', 'j k / arrows    Move through the entire local list', 'PgUp / PgDn     Move one screen', 'Enter / Esc     Inspect / return', '/               Search ticker, name or contract', 's               Cycle seven deterministic sort orders', 'f               All / active / observing / resolved', 'a / h           Full catalogue / fetch selected history', 'w / c           Flow window / chart range', 'm               Minimum Early estimate: 0/1/2.5/5/10%', 'l               Start or retry independent live sync', 'e               Export selected token and calculations', '?               Toggle this panel', 'q / Ctrl-C      Exit; finish no partial checkpoint', '', 'RECORDED is a dated real-data sample, never live.', 'RPC mode resumes verified local history at its block.', '0.0{7}1234 means seven zeros after the decimal point.', 'Open exported JSON for exact decimal strings.', 'Model estimate is experimental. TOP is relative rank.', 'Quotes retain their original units; USD is not invented.'];
  lines.slice(0, h - 3).forEach((s, i) => c.text(x + 3, y + 2 + i, fit(s, w - 6), i < 11 ? 'text' : 'muted'));
}
