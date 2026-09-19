import type { Tick, WavePoint } from '../wave/detector.js';
export const SCENARIO_VERSION = 'wave24-scenario-v2';
export const SCENARIO_FEATURES = [
  'logRise',
  'logTimeToPeak',
  'riseSpeed',
  'retracement',
  'logPriceToPeak',
  'logAge',
  'logTimeSincePeak',
  'baseDuration',
  'baseWidth',
  'volatility',
  'compression',
  'rebound',
  'activityAcceleration',
  'flow1m',
  'flow5m',
  'pressureTrend',
  'upperSigma',
  'lowerSigma',
] as const;
/** Prefix only. Shared by saved replay and live; no outcome or later price is accepted. */
export function scenarioFeatures(
  first: WavePoint,
  t: Tick & { price: number },
  seen: Tick[],
  base: { from: number; width: number; sigma: number },
  upper: number,
  lower: number,
  migratedAt: number,
) {
  const ticks = seen.filter(
    (x) => x.ts > t.ts - 600 && (x.block < t.block || (x.block === t.block && x.log <= t.log)),
  );
  const bins = new Map<number, number[]>();
  for (const x of ticks) {
    if (x.price === null || x.price <= 0) return null;
    const k = Math.floor(x.ts / 30),
      v = bins.get(k) ?? [];
    v.push(x.price);
    bins.set(k, v);
  }
  const ps = [...bins]
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => v.sort((a, b) => a - b)[Math.floor(v.length / 2)]);
  if (ps.length < 8) return null;
  const vol = (v: number[]) =>
    Math.sqrt(
      v.slice(1).reduce((s, p, i) => s + Math.log(p / v[i]) ** 2, 0) / Math.max(1, v.length - 1),
    );
  const sigma = vol(ps),
    half = Math.floor(ps.length / 2),
    earlyVol = vol(ps.slice(0, half)),
    lateVol = vol(ps.slice(half));
  const flow = (seconds: number) => {
    const rs = ticks.filter((x) => x.ts > t.ts - seconds);
    const b = rs.filter((x) => x.side === 'buy').reduce((s, x) => s + Number(x.quoteRaw), 0),
      s = rs.filter((x) => x.side === 'sell').reduce((s, x) => s + Number(x.quoteRaw), 0);
    return b + s ? (b - s) / (b + s) : 0;
  };
  const n = ticks.filter((x) => x.ts > t.ts - 60).length,
    old = ticks.filter((x) => x.ts <= t.ts - 60 && x.ts > t.ts - 360).length;
  const rise = first.vector[0],
    duration = Math.max(1, first.peakAt - migratedAt),
    baseline = first.peak / rise;
  const x = [
    Math.log(rise),
    Math.log1p(duration),
    Math.log(rise) / Math.log1p(duration),
    (first.peak - t.price) / (first.peak - baseline),
    Math.log(t.price / first.peak),
    Math.log1p(t.ts - migratedAt),
    Math.log1p(Math.max(0, t.ts - first.peakAt)),
    (t.ts - base.from) / 600,
    base.width,
    sigma,
    Math.log((lateVol + 1e-6) / (earlyVol + 1e-6)),
    Math.log(t.price / Math.min(...ps)),
    Math.log((n + 1) / (old / 5 + 1)),
    flow(60),
    flow(300),
    flow(60) - flow(300),
    Math.log(upper / t.price) / Math.max(sigma, 1e-6),
    Math.log(t.price / lower) / Math.max(sigma, 1e-6),
  ];
  return x.every(Number.isFinite) ? x : null;
}
