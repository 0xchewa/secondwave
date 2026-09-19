import { scenarioFeatures } from './scenario-features.js';
import { coversTime, type CoverageRange } from '../coverage.js';
import {
  detect,
  sellPressure,
  type PoolHistory,
  type Tick,
  type SellPressure,
} from '../wave/detector.js';

export const TASK = 'wave24-impulse-before-breakdown-v1';
export const FEATURE_VERSION = 'wave24-causal-base-v1';
export const HORIZON = 86400;
export const FEATURES = [
  'rise',
  'drawdown',
  'age',
  'baseWidth',
  'baseVolatility',
  'upperDistance',
  'lowerDistance',
  'baseTrades',
  'buys1m',
  'sells1m',
  'sellShare',
  'sellActivityChange',
  'largestSellShare',
  'return1m',
] as const;
export const order = (a: Tick, b: Tick) => a.block - b.block || a.log - b.log;
const valid = (t: Tick): t is Tick & { price: number } =>
  t.price !== null && Number.isFinite(t.price) && t.price > 0;
const quantile = (ns: number[], q: number) => {
  const a = [...ns].sort((x, y) => x - y),
    x = (a.length - 1) * q,
    i = Math.floor(x);
  return a[i] + (a[Math.ceil(x)] - a[i]) * (x - i);
};
export type Assessment = {
  key: string;
  scenarioId: string;
  token: string;
  asOf: number;
  deadline: number;
  block: number;
  log: number;
  hash: string;
  price: number;
  upper: number;
  lower: number;
  previousPeak: number;
  baseFrom: number;
  x: number[];
  pressure: SellPressure;
  scenarioX?: number[] | null;
  base?: { low: number; high: number; from: number; to: number };
};
export type Outcome = {
  label: 'impulse' | 'breakdown' | 'unresolved' | 'unknown';
  at: number | null;
  reason: string;
  evidence?: { block: number; log: number; hash: string; tx: string };
};
export function baseLevels(ticks: Tick[], at: Tick, after = -Infinity) {
  const w = ticks.filter((t) => t.ts > at.ts - 600 && t.ts > after && order(t, at) <= 0);
  if (
    w.some((t) => !valid(t)) ||
    w.length < 12 ||
    at.ts - w[0].ts < 480 ||
    new Set(w.map((t) => t.tx)).size < 12
  )
    return null;
  const bins = new Map<number, number[]>();
  for (const t of w) {
    const key = Math.floor(t.ts / 30),
      b = bins.get(key) ?? [];
    b.push(t.price!);
    bins.set(key, b);
  }
  if (bins.size < 8) return null;
  const prices = [...bins.entries()].sort((a, b) => a[0] - b[0]).map(([, ps]) => quantile(ps, 0.5));
  const lo = quantile(prices, 0.2),
    hi = quantile(prices, 0.8),
    logs = prices.map(Math.log),
    med = quantile(logs, 0.5);
  const sigma =
      1.4826 *
      quantile(
        logs.map((p) => Math.abs(p - med)),
        0.5,
      ),
    middle = Math.floor(prices.length / 2);
  if (
    hi / lo - 1 > 0.2 ||
    Math.abs(quantile(prices.slice(middle), 0.5) / quantile(prices.slice(0, middle), 0.5) - 1) >
      0.1 ||
    !valid(at) ||
    Math.abs(at.price / prices.at(-1)! - 1) > 0.1
  )
    return null;
  const upper = Math.max(hi * Math.exp(2 * sigma), at.price * 1.2),
    lower = Math.min(lo * Math.exp(-2 * sigma), at.price * 0.9);
  if (
    !(upper > at.price && at.price > lower) ||
    upper / at.price - 1 > 1 ||
    1 - lower / at.price > 0.35
  )
    return null;
  return {
    upper,
    lower,
    low: lo,
    high: hi,
    width: hi / lo - 1,
    sigma,
    trades: w.length,
    from: w[0].ts,
  };
}

/** Same upper-confirmation state machine for observed stages and historical labels. */
export function resolve(
  p: Assessment,
  ticks: Tick[],
  ranges: CoverageRange[],
  now: number,
  requireMature = true,
): Outcome {
  if (requireMature && now < p.deadline)
    return { label: 'unknown', at: null, reason: '24-hour horizon is still open' };
  const end = Math.min(now, p.deadline);
  if (!coversTime(ranges, p.asOf, end + 1, BigInt(p.block)))
    return { label: 'unknown', at: null, reason: 'Full outcome interval lacks confirmed coverage' };
  const confirmations: Tick[] = [];
  for (const t of [...ticks].sort(order)) {
    if (t.block < p.block || (t.block === p.block && t.log <= p.log) || t.ts > end) continue;
    if (!valid(t))
      return { label: 'unknown', at: null, reason: 'Unpriced trade prevents first-touch ordering' };
    const evidence = { block: t.block, log: t.log, hash: t.hash, tx: t.tx };
    if (t.price <= p.lower)
      return {
        label: 'breakdown',
        at: t.ts,
        reason: 'First valid lower touch before confirmed impulse',
        evidence,
      };
    while (confirmations.length && confirmations[0].ts < t.ts - 120) confirmations.shift();
    if (
      t.price >= p.upper &&
      !confirmations.some((c) => c.tx === t.tx) &&
      (!confirmations.length || t.ts - confirmations.at(-1)!.ts >= 5)
    )
      confirmations.push(t);
    if (confirmations.length >= 3 && t.ts - confirmations[0].ts >= 10)
      return {
        label: 'impulse',
        at: t.ts,
        reason: 'Three distinct upper transactions confirmed over at least ten seconds',
        evidence,
      };
  }
  return now >= p.deadline
    ? {
        label: 'unresolved',
        at: p.deadline,
        reason: 'Complete 24 hours without either resolved boundary, including no further trades',
      }
    : { label: 'unknown', at: null, reason: 'Scenario remains open' };
}

/** Causal replay is also the live feature implementation. No future-derived levels. */
export function replay(h: PoolHistory, ranges: CoverageRange[], now: number, checkpoint?: any) {
  const gate = checkpoint?.gate ?? detect(h, ranges, now),
    first = checkpoint?.first ?? gate.points[0];
  const result = {
    state: checkpoint?.state ?? (first ? 'forming_base' : gate.state),
    reason: checkpoint?.reason ?? (first ? 'Waiting for a supported ten-minute base' : gate.reason),
    assessments: [] as Assessment[],
    scenarios: (checkpoint?.scenarios ?? []) as Assessment[],
    checkpoint: null as any,
    lastAssessment: (checkpoint?.lastAssessment ?? null) as Assessment | null,
    asOf: gate.asOf,
  };
  if (!first) return result;
  const r = ranges.find(
    (r) =>
      r.fromBlock <= BigInt(h.migrationBlock) &&
      r.toBlock >= BigInt(h.migrationBlock) &&
      r.fromTime <= h.migratedAt,
  );
  if (!r || h.decimals === null) return result;
  const ticks = h.ticks
    .filter(
      (t) =>
        (!checkpoint ||
          t.block > checkpoint.consumed[0] ||
          (t.block === checkpoint.consumed[0] && t.log > checkpoint.consumed[1])) &&
        t.ts <= Math.min(now, r.toTime) &&
        BigInt(t.block) <= r.toBlock &&
        (t.block > h.migrationBlock || (t.block === h.migrationBlock && t.log > h.migrationLog)),
    )
    .sort(order);
  const seen: Tick[] = checkpoint?.seen ?? [];
  let active: Assessment | null = checkpoint?.active ?? null,
    after = checkpoint?.after ?? -Infinity,
    nextAllowed = checkpoint?.nextAllowed ?? first.asOf,
    last = checkpoint?.last ?? -Infinity,
    attempted = checkpoint?.attempted ?? -Infinity;
  let upper: Tick[] = checkpoint?.upper ?? [],
    consumed = checkpoint?.consumed ?? [h.migrationBlock, h.migrationLog];
  for (const t of ticks) {
    if (['impulse', 'unresolved'].includes(result.state)) break;
    consumed = [t.block, t.log];
    seen.push(t);
    while (seen.length && seen[0].ts < t.ts - 600) seen.shift();
    if (!valid(t)) {
      result.state = 'insufficient_history';
      result.reason = 'Unpriced trade in causal history';
      break;
    }
    if (active) {
      if (t.ts > result.lastAssessment!.deadline) {
        result.state = 'unresolved';
        result.reason = 'Episode horizon completed';
        break;
      }
      if (t.price <= active.lower) {
        result.state = 'breakdown';
        result.reason = 'Frozen lower boundary touched';
        active = null;
        after = t.ts;
        nextAllowed = t.ts + 1800;
        upper = [];
        last = -Infinity;
        attempted = -Infinity;
        continue;
      }
      while (upper.length && upper[0].ts < t.ts - 120) upper.shift();
      if (
        t.price >= active.upper &&
        !upper.some((x) => x.tx === t.tx) &&
        (!upper.length || t.ts - upper.at(-1)!.ts >= 5)
      )
        upper.push(t);
      if (upper.length >= 3 && t.ts - upper[0].ts >= 10) {
        result.state = 'impulse';
        result.reason = 'Upper impulse confirmed';
        break;
      }
    }
    if (
      t.ts < nextAllowed ||
      t.ts - h.migratedAt > 172800 ||
      (result.scenarios.length >= 3 && !active) ||
      t.ts - last < 30 ||
      t.ts - attempted < 30
    )
      continue;
    attempted = t.ts;
    const levels = baseLevels(seen, t, after);
    if (!levels && !active) continue;
    const lower = active?.lower ?? levels!.lower,
      high = active?.upper ?? levels!.upper;
    if (!(high > t.price && t.price > lower)) continue;
    const pressure = sellPressure(seen, t.ts, h.decimals, ranges, t.block);
    const old = [...seen].reverse().find((s) => s.ts <= t.ts - 60);
    if (!pressure.complete || !old || !valid(old)) continue;
    const b = levels ?? baseLevels(seen, t);
    if (!b) continue;
    const x = [
      first.vector[0],
      1 - t.price / first.peak,
      t.ts - h.migratedAt,
      b.width,
      b.sigma,
      high / t.price - 1,
      1 - lower / t.price,
      b.trades,
      pressure.buys,
      pressure.sells,
      pressure.sellShare ?? 0,
      pressure.sellActivityChange,
      pressure.largestSellTradeShare ?? 0,
      t.price / old.price - 1,
    ];
    if (!x.every(Number.isFinite)) continue;
    const scenarioId = active?.scenarioId ?? `${TASK}:${h.token}:${t.hash}:${t.log}`;
    const p: Assessment = {
      key: `${scenarioId}:${t.block}:${t.log}`,
      scenarioId,
      token: h.token,
      asOf: t.ts,
      deadline: t.ts + HORIZON,
      block: t.block,
      log: t.log,
      hash: t.hash,
      price: t.price,
      upper: high,
      lower,
      previousPeak: first.peak,
      baseFrom: b.from,
      x,
      pressure,
      scenarioX: scenarioFeatures(first, t, seen, b, high, lower, h.migratedAt),
      base: active?.base ?? { low: b.low, high: b.high, from: b.from, to: t.ts },
    };
    if (!active) {
      active = p;
      result.scenarios.push(p);
    }
    result.assessments.push(p);
    result.lastAssessment = p;
    last = t.ts;
    result.state = pressure.sellActivityChange > 0.5 ? 'weakening' : 'base';
    result.reason = 'Adaptive levels frozen; observed stage is not a probability';
  }
  if (active && ['base', 'weakening'].includes(result.state)) {
    const lastPoint = result.lastAssessment!;
    const outcome = resolve(lastPoint, ticks, ranges, now, false);
    if (outcome.label !== 'unknown') {
      result.state = outcome.label;
      result.reason = outcome.reason;
    }
  }
  result.checkpoint = {
    gate: { ...gate, points: [] },
    first,
    state: result.state,
    reason: result.reason,
    scenarios: result.scenarios,
    lastAssessment: result.lastAssessment,
    seen,
    active,
    after: Number.isFinite(after) ? after : null,
    nextAllowed,
    last: Number.isFinite(last) ? last : null,
    attempted: Number.isFinite(attempted) ? attempted : null,
    upper,
    consumed,
  };
  return result;
}

export function eligibleLabel(
  p: Assessment,
  h: PoolHistory,
  ranges: CoverageRange[],
  boundary: number,
) {
  if (boundary < p.deadline)
    return { label: 'unknown', at: null, reason: '24-hour horizon is still open' } as Outcome;
  // Context and ALL 24h labels require coverage, including early positive touches.
  if (!coversTime(ranges, h.migratedAt, p.deadline + 1, BigInt(h.migrationBlock)))
    return {
      label: 'unknown',
      at: null,
      reason: 'Full context and 24-hour coverage required',
    } as Outcome;
  return resolve(p, h.ticks, ranges, boundary, true);
}
