import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bench } from '../src/verify.js';
import { loadSession, validateSession, stringify } from '../src/session.js';
import { scoreEarly, scoreMarket } from '../src/models.js';
import { replay, resolve as outcome } from '../src/engines/wave24/engine.js';
import { CausalState } from '../src/engines/early/causal.js';
import type { PoolHistory } from '../src/engines/wave/detector.js';
const session = await loadSession();
test('frozen Early and peak numerical reference cases match exactly', async () => {
  const result = await bench(); assert.equal(result.numericAssertions, 882); assert.equal(result.maximumAbsoluteError, 0);
});
test('recorded scenarios exercise active, impulse and invalidation with gates preserved', () => {
  const rows = session.markets.map(m => scoreMarket(m, session.asOf));
  for (const stage of ['ACTIVE', 'IMPULSE', 'INVALIDATED', 'BASE FORMING', 'OBSERVING']) assert.ok(rows.some(r => r.wave.stage === stage));
  assert.ok(rows.every(r => r.wave.probability === null && r.early.probability === null));
});
test('scoring a saved engine checkpoint never mutates the imported record', () => {
  const m = session.markets.find(m => m.checkpoint)!; const before = stringify(m);
  assert.deepEqual(scoreMarket(m, session.asOf), scoreMarket(m, session.asOf)); assert.equal(stringify(m), before);
});
test('unsupported quote and missing vectors cannot become a numerical Early rank', () => {
  const m = structuredClone(session.markets[0]);
  m.quoteAddress = '0x' + '1'.repeat(40); assert.equal(scoreEarly(m, session.asOf).topPercent, null);
  m.quoteAddress = '0x' + '0'.repeat(40); m.featureSnapshot = null; assert.equal(scoreEarly(m, session.asOf).state, 'missing_history');
});
test('an expired Early observation keeps its historical rank with its lifecycle', () => {
  const m = session.markets.find(m => m.featureSnapshot && m.quoteAddress.endsWith('0000000000'))!;
  const first = scoreEarly(m, m.launchedAt + 1), expired = scoreEarly(m, m.launchedAt + 14401);
  assert.equal(expired.topPercent, first.topPercent); assert.equal(expired.state, m.phase === 'migrated' ? 'migrated' : 'expired');
});
test('import rejects wrong chain, duplicate tokens and incompatible feature vectors', () => {
  const bad = () => JSON.parse(stringify(session));
  const chain = bad(); chain.chainId = 1; assert.throws(() => validateSession(chain));
  const repeated = bad(); repeated.markets.push(repeated.markets[0]); assert.throws(() => validateSession(repeated));
  const vector = bad(); vector.markets[0].featureSnapshot = [1]; assert.throws(() => validateSession(vector));
});
test('coverage beyond the recorded boundary is rejected', () => {
  const s = JSON.parse(stringify(session)), m = s.markets.find((m: any) => m.coverage.length);
  m.coverage[0].toBlock = String(s.block + 1); assert.throws(() => validateSession(s));
});
function history(): PoolHistory {
  return { token: 'synthetic', quote: 'TEST', decimals: 18, migratedAt: 1000, migrationBlock: 1, migrationLog: 0, migrationHash: 'migration', verifiedPool: true,
    ticks: Array.from({ length: 1000 }, (_, i) => ({ ts: 1005 + i * 5, block: i + 2, log: 0, hash: 'h' + i, tx: 'tx' + i,
      price: i < 40 ? 100 : i < 50 ? 100 + (i - 39) * 8 : i < 65 ? 180 : 135, quoteRaw: '1000000000000000000', side: i % 2 ? 'sell' : 'buy', actor: null })) };
}
const ranges = [{ fromBlock: 1n, toBlock: 200000n, fromTime: 0, toTime: 200000 }];
test('Wave replay and resumed checkpoint keep the same causal scenario (synthetic)', () => {
  const h = history(), all = replay(h, ranges, 6000);
  const first = replay({ ...h, ticks: h.ticks.slice(0, 300) }, ranges, h.ticks[299].ts);
  const resumed = replay({ ...h, ticks: h.ticks.slice(300) }, ranges, 6000, JSON.parse(JSON.stringify(first.checkpoint)));
  assert.ok(all.lastAssessment); assert.deepEqual(resumed.lastAssessment, all.lastAssessment);
  assert.equal(resumed.state, all.state);
});
test('Wave fails coverage explicitly and does not invent a scenario (synthetic)', () => {
  const r = replay(history(), [], 6000); assert.equal(r.state, 'insufficient_data'); assert.equal(r.lastAssessment, null);
});
test('lower touch precedes a later upper impulse (synthetic)', () => {
  const h = history(), p = replay(h, ranges, 3000).lastAssessment!;
  const ticks = [{ ...h.ticks[0], block: p.block + 1, ts: p.asOf + 10, price: p.lower * .99 }, { ...h.ticks[1], block: p.block + 2, ts: p.asOf + 20, price: p.upper * 1.1 }];
  assert.equal(outcome(p, ticks, ranges, p.asOf + 30, false).label, 'breakdown');
});
test('causal history refuses duplicate or reversed chain events', () => {
  const state = new CausalState();
  const e = { block_number: 1, log_index: 0, timestamp: '2026-09-19T00:00:00Z', deployer: 'caller', event_name: 'PoolGraduated' };
  state.step(e); assert.throws(() => state.step(e));
  const resumed = CausalState.restore(state.save()); assert.equal(resumed.graduations.get('caller'), 1);
});
