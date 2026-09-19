import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { FEATURES } from './engines/early/vendor/features.js';
import { rawScore, predict } from './engines/early/vendor/gbdt.js';
import { explain } from './engines/early/vendor/reasons.js';
import { replay } from './engines/wave24/engine.js';
import { compatible, predict as wavePredict } from './engines/wave24/model.js';
import { sellPressure } from './engines/wave/detector.js';
import { ZERO, type Market, type DeskRow } from './domain.js';
import { modelEstimate } from './engines/early/estimate.js';

export const manifest = JSON.parse(readFileSync(new URL('../models/manifest.json', import.meta.url), 'utf8'));
function artifact(name: string) {
  const bytes = readFileSync(new URL(`../models/${name}.json`, import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.engines[name].sha256, `Model integrity failed: ${name}`);
  return JSON.parse(bytes.toString());
}
export const earlyArtifact = artifact('early'), waveArtifact = artifact('wave'), peakArtifact = artifact('peak');
assert.deepEqual(earlyArtifact.model.featureNames, [...FEATURES]);
assert.ok(compatible(waveArtifact.model));
const references: number[] = earlyArtifact.rankReference;
assert.ok(references.length && references.every((x, i) => Number.isFinite(x) && (!i || x >= references[i - 1])));
type EarlyEvidence = { topPercent: number; score: number; reasons: ReturnType<typeof explain>; peak: { low: number; high: number } | null; historicalEstimate: number };
const evidenceCache = new Map<string, EarlyEvidence>();

export function scoreEarly(m: Market, at: number) {
  const x = m.featureSnapshot;
  const state = m.quoteAddress !== ZERO ? 'unsupported_quote' : !x ? 'missing_history' :
    m.phase === 'migrated' ? 'migrated' : at >= m.launchedAt + 14400 ? 'expired' : 'rank_only';
  if (m.quoteAddress !== ZERO || !x) return { state, topPercent: null, score: null, reasons: [], peak: null, probability: null, estimate: null as number | null, historicalEstimate: null as number | null, displayState: state };
  assert.ok(x.length === FEATURES.length && x.every(Number.isFinite), 'Early feature schema mismatch');
  const key = x.join(','), cached = evidenceCache.get(key);
  if (cached) return { ...cached, state, probability: null, estimate: state === 'rank_only' ? cached.historicalEstimate : null, displayState: state === 'rank_only' ? 'experimental' : state };
  const vector = Float64Array.from(x), z = rawScore(earlyArtifact.model, vector);
  let lo = 0, hi = references.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (references[mid] <= z) lo = mid + 1; else hi = mid; }
  const topPercent = 100 * (1 - lo / references.length);
  const peakScore = x[0] === 1 ? predict(peakArtifact.model, vector) : null;
  const peak = peakScore === null ? null : { low: Math.max(1, Math.exp(peakScore + peakArtifact.lo)), high: Math.max(1, Math.exp(peakScore + peakArtifact.hi)) };
  const reasons = explain(earlyArtifact.model, vector).map(r => ({ ...r, text: ({
    dev_prior_launches: 'Prior launches by this factory caller', dev_prior_graduations: 'Prior migrations by this factory caller',
    dev_prior_grad_rate: 'Historical migration share of this factory caller', dev_is_first_launch: 'First observed launch by this factory caller',
  } as Record<string, string>)[r.feature] ?? r.text }));
  const historicalEstimate = modelEstimate(earlyArtifact.liveCalibration, predict(earlyArtifact.model, vector));
  if (evidenceCache.size >= 100000) evidenceCache.clear();
  evidenceCache.set(key, { topPercent, score: 100 - topPercent, reasons, peak, historicalEstimate });
  return { state, topPercent, score: 100 - topPercent, reasons, peak, probability: null,
    historicalEstimate, estimate: state === 'rank_only' ? historicalEstimate : null, displayState: state === 'rank_only' ? 'experimental' : state };
}
const stages: Record<string, string> = { awaiting_rise: 'OBSERVING', awaiting_pullback: 'PULLBACK', forming_base: 'BASE FORMING', base: 'ACTIVE', weakening: 'ACTIVE', impulse: 'IMPULSE', breakdown: 'INVALIDATED', unresolved: 'UNRESOLVED', observation_expired: 'EXPIRED', insufficient_history: 'INSUFFICIENT HISTORY', insufficient_data: 'INSUFFICIENT DATA', ineligible: 'INELIGIBLE' };
export function scoreMarket(m: Market, at: number): DeskRow {
  const early = scoreEarly(m, at);
  const empty = { target: null, invalidation: null, deadline: null, pressure: null, pressureComplete: false, buys: 0, sells: 0, probability: null, scenarioId: null };
  if (!m.history) return { market: m, early, wave: { ...empty, stage: m.phase === 'curve' ? 'ON CURVE' : 'HISTORY NEEDED', reason: 'A verified migration and market history are required' } };
  const h = structuredClone(m.history), result = m.terminalGate ?? replay(h, m.coverage, at, structuredClone(m.checkpoint));
  const p = 'lastAssessment' in result ? result.lastAssessment : null;
  const pressureTicks = [...new Map([...(m.checkpoint?.seen ?? []), ...h.ticks].map(t => [`${t.block}:${t.log}`, t])).values()];
  const pressure = sellPressure(pressureTicks, at, h.decimals, m.coverage, h.ticks.at(-1)?.block ?? h.migrationBlock);
  if ((m.pressureHistoryFrom ?? -Infinity) > at - 120) pressure.complete = false;
  const active = ['base', 'weakening'].includes(result.state);
  return { market: m, early, wave: {
    stage: stages[result.state] ?? result.state.toUpperCase().replaceAll('_', ' '), reason: result.reason,
    target: p?.upper ?? null, invalidation: p?.lower ?? null, deadline: p?.deadline ?? null,
    pressure: pressure.complete ? pressure.sellShare : null, pressureComplete: pressure.complete,
    buys: pressure.buys, sells: pressure.sells, scenarioId: p?.scenarioId ?? null,
    scenarioCreatedAt: p && 'scenarios' in result ? result.scenarios.find(s => s.scenarioId === p.scenarioId)?.asOf ?? p.asOf : null,
    previousPeak: p?.previousPeak ?? null, base: p?.base ?? null,
    probability: p && active && waveArtifact.probabilityEnabled ? wavePredict(waveArtifact.model, p.x) : null,
  } };
}
