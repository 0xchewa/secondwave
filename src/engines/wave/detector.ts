import { formatUnits } from 'viem';
import { coversTime, type CoverageRange } from '../coverage.js';
import { WAVE, type WaveLabel } from './config.js';

export type Tick = {
  ts: number;
  block: number;
  log: number;
  hash: string;
  tx: string;
  price: number | null;
  quoteRaw: string;
  side: 'buy' | 'sell';
  actor: string | null;
};
export type PoolHistory = {
  coverage?: CoverageRange[];
  token: string;
  quote: string;
  decimals: number | null;
  migratedAt: number;
  migrationBlock: number;
  migrationLog: number;
  migrationHash: string;
  verifiedPool: boolean;
  ticks: Tick[];
};
export type SellPressure = {
  from: number;
  to: number;
  complete: boolean;
  buys: number;
  sells: number;
  buyVolume: string | null;
  sellVolume: string | null;
  sellBuyRatio: number | null;
  ratioState: 'available' | 'no_buys' | 'no_trades' | 'unknown_units';
  sellShare: number | null;
  previousSells: number;
  sellActivityChange: number;
  largestSellTradeShare: number | null;
  newBuyers: null;
  sellerConcentration: null;
  earlyParticipantSales: null;
  earlyParticipantBalance: null;
  liquidity: null;
  attribution: string;
};
export type WavePoint = {
  key: string;
  episode: string;
  token: string;
  asOf: number;
  block: number;
  log: number;
  hash: string;
  tx: string;
  peakAt: number;
  peakConfirmedAt: number;
  peak: number;
  price: number;
  lower: number;
  deadline: number;
  vector: number[];
  pressure: SellPressure;
  quote: string;
  contextFrom: number;
  contextBlock: number;
  migrationHash: string;
};
export type WaveOutcome = {
  label: WaveLabel | 'unknown';
  reason: string;
  at: number | null;
  evidence: unknown;
};
export type WaveDetection = {
  state: string;
  reason: string;
  asOf: number | null;
  sourceBlock: number | null;
  points: WavePoint[];
  pressure: SellPressure | null;
  peak: number | null;
  baseline: number | null;
};
const order = (a: Tick, b: Tick) => a.block - b.block || a.log - b.log;
const after = (t: Tick, p: WavePoint) =>
  t.block > p.block || (t.block === p.block && t.log > p.log);
const valid = (t: Tick): t is Tick & { price: number } =>
  t.price !== null && Number.isFinite(t.price) && t.price > 0;

export function sellPressure(
  ticks: Tick[],
  asOf: number,
  decimals: number | null,
  ranges: CoverageRange[],
  block: number,
): SellPressure {
  const current = ticks.filter((t) => t.ts > asOf - 60 && t.ts <= asOf),
    previous = ticks.filter((t) => t.ts > asOf - 120 && t.ts <= asOf - 60);
  const buys = current.filter((t) => t.side === 'buy'),
    sells = current.filter((t) => t.side === 'sell');
  const sum = (rows: Tick[]) => rows.reduce((n, t) => n + BigInt(t.quoteRaw), 0n);
  const b = sum(buys),
    s = sum(sells),
    top = sells.reduce((n, t) => (BigInt(t.quoteRaw) > n ? BigInt(t.quoteRaw) : n), 0n);
  const prev = previous.filter((t) => t.side === 'sell').length;
  return {
    from: asOf - 60,
    to: asOf,
    complete: coversTime(ranges, asOf - 120, asOf, BigInt(block)),
    buys: buys.length,
    sells: sells.length,
    buyVolume: decimals === null ? null : formatUnits(b, decimals),
    sellVolume: decimals === null ? null : formatUnits(s, decimals),
    sellBuyRatio: decimals === null || b === 0n ? null : Number(s) / Number(b),
    ratioState:
      decimals === null
        ? 'unknown_units'
        : b > 0n
          ? 'available'
          : current.length
            ? 'no_buys'
            : 'no_trades',
    sellShare: b + s > 0n ? Number(s) / Number(b + s) : null,
    previousSells: prev,
    sellActivityChange: (sells.length - prev) / Math.max(1, sells.length + prev),
    largestSellTradeShare: s > 0n ? Number(top) / Number(s) : null,
    newBuyers: null,
    sellerConcentration: null,
    earlyParticipantSales: null,
    earlyParticipantBalance: null,
    liquidity: null,
    attribution:
      'Pool events do not establish trader identity. Routers are not counted as traders.',
  };
}

/** First touch uses block/log order, never candle high/low ordering. */
export function labelPoint(
  p: WavePoint,
  ticks: Tick[],
  ranges: CoverageRange[],
  now: number,
  canonical = true,
): WaveOutcome {
  if (!canonical)
    return { label: 'unknown', reason: 'Canonical history invalidated', at: null, evidence: null };
  for (const t of [...ticks]
    .filter((t) => after(t, p) && t.ts <= p.deadline && t.ts <= now)
    .sort(order)) {
    if (
      !coversTime(ranges, p.asOf, t.ts, BigInt(p.block)) ||
      !ranges.some((r) => r.fromBlock <= BigInt(p.block) && r.toBlock >= BigInt(t.block))
    )
      return { label: 'unknown', reason: 'Gap before first touch', at: null, evidence: null };
    if (!valid(t))
      return {
        label: 'unknown',
        reason: 'Unpriced pool trade prevents ordering',
        at: null,
        evidence: null,
      };
    if (t.price >= p.peak || t.price <= p.lower)
      return {
        label: t.price >= p.peak ? 'recovery_first' : 'downside_first',
        reason: 'First recorded pool trade to touch the frozen level',
        at: t.ts,
        evidence: { tx: t.tx, log: t.log, block: t.block, hash: t.hash, price: t.price },
      };
  }
  if (now < p.deadline)
    return {
      label: 'unknown',
      reason: '60-minute horizon is still open',
      at: null,
      evidence: null,
    };
  if (!coversTime(ranges, p.asOf, p.deadline + 1, BigInt(p.block)))
    return {
      label: 'unknown',
      reason: 'Full outcome horizon is not covered',
      at: null,
      evidence: null,
    };
  return {
    label: 'neither',
    reason: 'Complete horizon with neither level touched, including tokens without further trades',
    at: p.deadline,
    evidence: { deadline: p.deadline },
  };
}

/** Pure causal replay; live calls the identical function on the saved prefix. One episode per migration in v1. */
export function detect(
  h: PoolHistory,
  ranges: CoverageRange[],
  now = Date.now() / 1000,
): WaveDetection {
  const result: WaveDetection = {
    state: 'awaiting_rise',
    reason: 'Waiting for a confirmed 50% pool rise',
    asOf: null,
    sourceBlock: null,
    points: [],
    pressure: null,
    peak: null,
    baseline: null,
  };
  if (!h.verifiedPool)
    return {
      ...result,
      state: 'insufficient_data',
      reason: 'Migration has no verified pool association',
    };
  const range = ranges.find(
    (r) =>
      r.fromTime <= h.migratedAt &&
      r.fromBlock <= BigInt(h.migrationBlock) &&
      r.toBlock >= BigInt(h.migrationBlock),
  );
  if (!range)
    return {
      ...result,
      state: 'insufficient_data',
      reason: 'Continuous market coverage from migration is required',
    };
  const end = Math.min(range.toTime, now),
    ticks = h.ticks
      .filter(
        (t) =>
          t.ts <= end &&
          BigInt(t.block) <= range.toBlock &&
          (t.block > h.migrationBlock || (t.block === h.migrationBlock && t.log > h.migrationLog)),
      )
      .sort(order);
  result.asOf = end;
  result.sourceBlock = Number(range.toBlock);
  const recent: Tick[] = [];
  const seen: Tick[] = [];
  let peakTick: Tick | null = null,
    peakConfirmedAt = 0,
    entry: WavePoint | null = null,
    lastPoint = -Infinity,
    broken = false;
  for (const t of ticks) {
    seen.push(t);
    if (entry && t.ts > entry.deadline) {
      result.state = 'neither';
      result.reason = 'The first episode expired';
      break;
    }
    if (!valid(t)) {
      broken = true;
      result.state = 'insufficient_data';
      result.reason = 'Unpriced pool trade in the detector history';
      break;
    }
    if (entry) {
      if (t.price >= entry.peak || t.price <= entry.lower) {
        result.state = t.price >= entry.peak ? 'recovery_first' : 'downside_first';
        result.reason = 'The first episode reached its frozen boundary';
        break;
      }
    } else if (t.ts > h.migratedAt + WAVE.entryWindow) {
      result.state = 'observation_expired';
      result.reason = 'No qualifying first pullback within two hours of migration';
      break;
    }
    // Three distinct transactions over >=10s within 120s; a single print cannot set an anchor.
    if (recent.length && t.ts - recent[recent.length - 1].ts < WAVE.sampleSpacing) continue;
    const prior = recent.findIndex((r) => r.tx === t.tx);
    if (prior >= 0) recent.splice(prior, 1);
    recent.push(t);
    while (recent.length > WAVE.confirmations || recent[0].ts < t.ts - WAVE.confirmationWindow)
      recent.shift();
    if (recent.length < WAVE.confirmations || t.ts - recent[0].ts < WAVE.confirmationSpan) continue;
    const median = [...recent].sort((a, b) => a.price! - b.price!)[1];
    const price = median.price!;
    if (result.baseline === null) {
      result.baseline = price;
      peakTick = median;
      result.peak = price;
      peakConfirmedAt = t.ts;
      continue;
    }
    if (!entry && price > result.peak!) {
      result.peak = price;
      peakTick = median;
      peakConfirmedAt = t.ts;
    }
    if (result.peak! < result.baseline * (1 + WAVE.rise)) continue;
    if (!entry) {
      result.state = 'awaiting_pullback';
      result.reason = 'Rise confirmed; waiting for a 20–50% pullback';
    }
    const drawdown = 1 - price / result.peak!;
    if (
      !entry &&
      (drawdown < WAVE.pullback ||
        drawdown > WAVE.maxPullback ||
        t.ts - peakConfirmedAt < WAVE.minPeakAge)
    )
      continue;
    // Snapshot entry uses the latest executed price; median only confirms the setup.
    if (t.price >= result.peak! || 1 - t.price / result.peak! > WAVE.maxPullback) continue;
    const window = seen.filter((s) => s.ts > t.ts - WAVE.history);
    if (t.ts - h.migratedAt < WAVE.history || window.length < WAVE.minTrades || h.decimals === null)
      continue;
    if (t.ts - lastPoint < WAVE.cadence) continue;
    const pressure = sellPressure(seen, t.ts, h.decimals, ranges, t.block);
    if (!pressure.complete) continue;
    const sum = (rs: Tick[]) => rs.reduce((n, r) => n + Number(r.quoteRaw), 0);
    const volume = sum(window),
      minute = window.filter((s) => s.ts > t.ts - 60),
      old = [...seen].reverse().find((s) => s.ts <= t.ts - 60);
    if (!old || !valid(old) || volume <= 0) continue;
    const point: WavePoint = {
      key: `${h.token}:${t.tx}:${t.log}`,
      episode: `${h.token}:${h.migrationHash}:${WAVE.detectorVersion}`,
      token: h.token,
      asOf: t.ts,
      block: t.block,
      log: t.log,
      hash: t.hash,
      tx: t.tx,
      peakAt: peakTick!.ts,
      peakConfirmedAt,
      peak: result.peak!,
      price: t.price,
      lower: t.price * (1 - WAVE.downside),
      deadline: t.ts + WAVE.horizon,
      vector: [
        result.peak! / result.baseline,
        1 - t.price / result.peak!,
        t.ts - peakConfirmedAt,
        t.ts - h.migratedAt,
        t.price / old.price - 1,
        pressure.buys,
        pressure.sells,
        pressure.sellShare ?? 0,
        sum(minute) / volume,
        pressure.sellActivityChange,
        pressure.largestSellTradeShare ?? 0,
        window.length,
      ],
      pressure,
      quote: h.quote,
      contextFrom: h.migratedAt,
      contextBlock: h.migrationBlock,
      migrationHash: h.migrationHash,
    };
    if (!point.vector.every(Number.isFinite)) continue;
    result.points.push(point);
    entry ??= point;
    lastPoint = t.ts;
    result.state = 'observing';
    result.reason = 'Confirmed pool pullback; model validation is pending';
  }
  result.pressure = sellPressure(ticks, end, h.decimals, ranges, Number(range.toBlock));
  if (entry && result.state === 'observing') {
    const outcome = labelPoint(entry, ticks, ranges, now);
    if (outcome.label !== 'unknown') {
      result.state = outcome.label;
      result.reason = outcome.reason;
    } else if (now >= entry.deadline) {
      result.state = 'window_unverified';
      result.reason = outcome.reason;
    }
  }
  if (!entry && !broken && end >= h.migratedAt + WAVE.entryWindow) {
    result.state = 'observation_expired';
    result.reason = 'No qualifying first pullback within two hours of migration';
  }
  if (h.decimals === null) {
    result.state = 'insufficient_data';
    result.reason = 'Quote decimals are unavailable';
  }
  return result;
}
