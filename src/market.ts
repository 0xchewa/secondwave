import { formatUnits } from 'viem';
import type { Bar, Market, DeskRow, Session } from './domain.js';
import { ZERO } from './domain.js';
import { mergeCoverage, type CoverageRange } from './engines/coverage.js';

export type Activity = { from: number; to: number; complete: boolean; buys: number | null; sells: number | null; volume: string | null; reason: string | null };
export function mergeBar(a: Bar, b: Bar): Bar {
  const first = a[8] < b[8] || a[8] === b[8] && a[9] <= b[9];
  const last = a[10] > b[10] || a[10] === b[10] && a[11] >= b[11];
  const high = [a[2], b[2]].filter(v => v !== null).sort((x, y) => Number(y) - Number(x))[0] ?? null;
  const low = [a[3], b[3]].filter(v => v !== null).sort((x, y) => Number(x) - Number(y))[0] ?? null;
  return [a[0], (first ? a[1] : b[1]) ?? a[1] ?? b[1], high, low, (last ? a[4] : b[4]) ?? a[4] ?? b[4], String(BigInt(a[5]) + BigInt(b[5])), a[6] + b[6], a[7] + b[7], ...(first ? a.slice(8, 10) : b.slice(8, 10)), ...(last ? a.slice(10, 12) : b.slice(10, 12))] as Bar;
}
export function appendTrade(m: Market, t: { ts: number; block: number; log: number; price: string | null; quoteRaw: string; side: 'buy' | 'sell' }) {
  const minute = Math.floor(t.ts / 60) * 60;
  const b: Bar = [minute, t.price, t.price, t.price, t.price, t.quoteRaw, t.side === 'buy' ? 1 : 0, t.side === 'sell' ? 1 : 0, t.block, t.log, t.block, t.log];
  const bars = m.bars ??= []; const last = bars.at(-1);
  if (last?.[0] === minute) bars[bars.length - 1] = mergeBar(last, b);
  else bars.push(b);
}
export function covers(ranges: CoverageRange[], from: number, to: number) {
  if (to < from) return false;
  let cursor = from;
  for (const r of [...ranges].sort((a, b) => a.fromTime - b.fromTime)) {
    if (r.toTime < cursor) continue;
    if (r.fromTime > cursor) return false;
    cursor = Math.max(cursor, r.toTime);
    if (cursor >= to) return true;
  }
  return false;
}
export function activity(m: Market, from: number, to: number): Activity {
  const complete = covers(m.barCoverage ?? [], from, to);
  const rows = (m.bars ?? []).filter(b => b[0] >= Math.floor(from / 60) * 60 && b[0] <= Math.floor(to / 60) * 60);
  return { from, to, complete, buys: complete ? rows.reduce((n, b) => n + b[6], 0) : null,
    sells: complete ? rows.reduce((n, b) => n + b[7], 0) : null,
    volume: complete && m.quoteDecimals != null ? formatUnits(rows.reduce((n, b) => n + BigInt(b[5]), 0n), m.quoteDecimals) : null,
    reason: complete ? m.quoteDecimals == null ? 'Quote decimals unavailable' : null : 'Trading history is incomplete; press [h] to prepare it' };
}
export function extendBarCoverage(m: Market, from: number, to: number, fromTime: number, toTime: number) {
  m.barCoverage = mergeCoverage([...(m.barCoverage ?? []), { fromBlock: BigInt(from), toBlock: BigInt(to), fromTime, toTime }]);
}
export function viewTime(session: Session, now = Date.now() / 1000) { return session.source === 'recorded' ? session.asOf : Math.floor(now); }
export function projectRow(row: DeskRow, session: Session, now = Date.now() / 1000): DeskRow {
  const m = row.market, at = viewTime(session, now), stale = session.reorg || at - session.asOf > 90;
  const current = m.phase === 'curve' && at >= m.launchedAt && at - m.launchedAt < 14400 && !stale;
  const estimate = current && m.quoteAddress === ZERO ? row.early.historicalEstimate : null;
  const early = { ...row.early, estimate, displayState: m.phase === 'migrated' ? 'migrated' : at - m.launchedAt >= 14400 ? 'expired' : stale ? 'stale' : estimate != null ? 'experimental' : 'unsupported' };
  const from = m.phase === 'curve' ? m.launchedAt : Math.max(m.launchedAt, Math.floor((session.asOf - 86400) / 60) * 60);
  const a = row.activity?.from === from && row.activity.to === session.asOf ? row.activity : activity(m, from, session.asOf), reasons: string[] = [];
  if (session.reorg) reasons.push('Canonical history changed; live inference paused');
  if (!m.symbol) reasons.push('No declared ticker');
  if (m.decimals == null || m.quoteDecimals == null) reasons.push('Quote asset units are not verified');
  if (!a.complete) reasons.push(a.reason!);
  if (!m.priceQuote || Number(m.priceQuote) <= 0) reasons.push('No priced trades in saved history');
  const core = !reasons.length, earlyReasons: string[] = [];
  if (m.quoteAddress !== ZERO) earlyReasons.push('Early supports ETH-quoted launches only');
  if (m.phase === 'migrated') earlyReasons.push('Migrated; follow Second Wave');
  if (at - m.launchedAt >= 14400) earlyReasons.push('The four-hour Early window has ended');
  if (m.phase === 'curve' && m.curveProgress == null) earlyReasons.push('Curve reserve is not verified');
  if (estimate == null && !earlyReasons.length) earlyReasons.push(stale ? 'Collection is delayed; current estimate paused' : 'Launch-time model vector unavailable');
  const waveReady = !['INSUFFICIENT DATA', 'INSUFFICIENT HISTORY', 'HISTORY NEEDED', 'INELIGIBLE', 'ON CURVE'].includes(row.wave.stage);
  if (m.phase === 'migrated' && !waveReady) reasons.push('The exact migration history is needed for a Wave scenario');
  return { ...row, early, activity: a,
    windows: row.windows?.['5m']?.to === session.asOf ? row.windows : Object.fromEntries([['5m', 300], ['1h', 3600], ['24h', 86400]].map(([k, seconds]) => [k, activity(m, Math.max(m.launchedAt, Math.floor((session.asOf - Number(seconds)) / 60) * 60), session.asOf)])),
    admission: { early: core && !earlyReasons.length && current && estimate != null,
      wave: core && m.phase === 'migrated' && waveReady && !!m.history && at - m.history.migratedAt < 259200, reasons: [...reasons, ...earlyReasons] } };
}
