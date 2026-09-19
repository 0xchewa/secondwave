import assert from 'node:assert/strict';
import { loadSession, verifyBundledData } from './session.js';
import { scoreMarket } from './models.js';
import { earlyArtifact, peakArtifact } from './models.js';
import { rawScore, predict, contributions } from './engines/early/vendor/gbdt.js';
import { readFile } from 'node:fs/promises';
export async function bench() {
  const record = await verifyBundledData(), session = await loadSession();
  const rows = session.markets.map(m => scoreMarket(m, session.asOf));
  assert.ok(rows.length && rows.some(r => r.early.topPercent !== null));
  const early = JSON.parse(await readFile(new URL('../data/early-parity.json', import.meta.url), 'utf8'));
  const peak = JSON.parse(await readFile(new URL('../data/peak-parity.json', import.meta.url), 'utf8'));
  let checks = 0, maxError = 0;
  const near = (a: number, b: number) => { const error = Math.abs(a - b); maxError = Math.max(maxError, error); assert.ok(error < 1e-10, 'Numerical reference mismatch'); checks++; };
  for (const sample of early.cases) {
    const x = Float64Array.from(sample.x);
    near(rawScore(earlyArtifact.model, x), sample.raw); near(predict(earlyArtifact.model, x), sample.p);
    const c = contributions(earlyArtifact.model, x);
    c.contribs.forEach((v: number, i: number) => near(v, sample.contribs[i]));
  }
  for (const sample of peak.samples) {
    const p = predict(peakArtifact.model, Float64Array.from(sample.x));
    near(Math.exp(p + peakArtifact.lo), sample.low); near(Math.exp(p + peakArtifact.hi), sample.high);
  }
  return { ok: true, records: rows.length, block: record.block, mode: 'recorded', numericAssertions: checks, maximumAbsoluteError: maxError, modelIntegrity: 'verified', probabilityGates: 'preserved' };
}
