import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scoreEarly, scoreMarket } from '../src/models.js';
import { activity, appendTrade, projectRow } from '../src/market.js';
import { initialDesk, visibleRows } from '../src/tui/state.js';
import { estimate } from '../src/tui/text.js';
import { ZERO, type Market, type Session } from '../src/domain.js';
import { collectPage } from '../src/chain/collect.js';
import { hydratePage } from '../src/chain/history.js';
import { hex, type RpcReader } from '../src/chain/rpc.js';
import type { LocalState } from '../src/chain/state.js';
import { encodeEventTopics, encodeAbiParameters } from 'viem';
import { curveAbi } from '../src/chain/abi.js';

const cases = JSON.parse(readFileSync(new URL('../data/terminal-parity.json', import.meta.url), 'utf8')).cases;
const hash = '0x' + 'a'.repeat(64), token = '0x' + '1'.repeat(40), curve = '0x' + '2'.repeat(40);
function market(): Market { return { address: token, symbol: 'TEST', name: 'Synthetic test', launchedAt: 1000, launchBlock: 10, phase: 'curve', curve, thresholdRaw: '100', quoteAddress: ZERO, quoteSymbol: 'ETH', quoteDecimals: 18, decimals: 18, featureSnapshot: cases[0].x, priceQuote: '0.01', priceAt: 1000, curveProgress: 0, reserveRaw: '0', bars: [], barCoverage: [{ fromBlock: 10n, toBlock: 13n, fromTime: 1000, toTime: 1030 }], coverage: [] }; }
function session(): Session { return { format: 'secondwave-session-v1', chainId: 4663, source: 'recorded', capturedAt: new Date(1030000).toISOString(), block: 13, hash, asOf: 1030, markets: [market()] }; }
function state(): LocalState { return { format: 'secondwave-state-v1', session: session(), seed: { format: 'secondwave-seed-v1', chainId: 4663, next: 14, hash, asOf: 1030, missing: 0, launches: [], graduations: [], exemptions: [], recent: [] } }; }

test('40 real launch vectors reproduce saved Terminal estimates and ranks exactly', () => {
  assert.equal(cases.length, 40);
  for (const sample of cases) {
    const m = { ...market(), address: sample.address, featureSnapshot: sample.x };
    const result = scoreEarly(m, 1030);
    assert.equal(result.estimate, sample.estimate, sample.address);
    assert.equal(result.topPercent, sample.topPercent, sample.address);
    assert.equal(result.probability, null);
  }
});
test('Terminal estimate format is separate from relative TOP percent', () => {
  assert.equal(estimate(.01281570310911654), '1.28%'); assert.equal(estimate(.0000001), '<0.01%');
  assert.equal(estimate(null), '--'); assert.equal(estimate(0), '0.00%');
});
test('Early admission expires at four hours and pauses after 90 seconds of lag', () => {
  const s = session(); s.source = 'rpc'; const base = scoreMarket(s.markets[0], s.asOf);
  assert.equal(projectRow(base, s, 1120).admission?.early, true);
  assert.equal(projectRow(base, s, 1121).early.estimate, null);
  assert.equal(projectRow(base, s, 1121).early.displayState, 'stale');
  assert.equal(projectRow(base, { ...s, asOf: 15400 }, 15400).early.displayState, 'expired');
  assert.equal(projectRow(base, { ...s, reorg: true }, 1030).early.estimate, null);
});
test('recorded mode uses its disclosed reference clock, independent of wall time', () => {
  const s = session(), row = projectRow(scoreMarket(s.markets[0], s.asOf), s, 9999999);
  assert.equal(row.admission?.early, true); assert.notEqual(row.early.estimate, null);
});
test('unknown interval is not zero; completely scanned empty interval is zero', () => {
  const m = market(); m.barCoverage = [];
  assert.equal(activity(m, 1000, 1030).buys, null); assert.equal(activity(m, 1000, 1030).volume, null);
  m.barCoverage = market().barCoverage;
  assert.equal(activity(m, 1000, 1030).buys, 0); assert.equal(activity(m, 1000, 1030).volume, '0');
  m.barCoverage = [{ fromBlock: 10n, toBlock: 11n, fromTime: 1000, toTime: 1010 }, { fromBlock: 12n, toBlock: 13n, fromTime: 1020, toTime: 1030 }];
  assert.equal(activity(m, 1000, 1030).complete, false);
  m.phase = 'migrated'; m.coverage = [{ fromBlock: 10n, toBlock: 500n, fromTime: 1000, toTime: 2000 }];
  m.history = { token, quote: 'ETH', decimals: 18, migratedAt: 1000, migrationBlock: 10, migrationLog: 0, migrationHash: hash, verifiedPool: true, ticks: [] };
  assert.equal(scoreMarket(m, 1500).wave.pressureComplete, true);
  m.pressureHistoryFrom = 1450; assert.equal(scoreMarket(m, 1500).wave.pressureComplete, false);
  assert.equal(scoreMarket(m, 1800).wave.pressureComplete, true);
});
test('candle merge preserves exact quote volume and canonical OHLC despite venue read order', () => {
  const m = market();
  appendTrade(m, { ts: 1030, block: 13, log: 2, price: '0.03', quoteRaw: '900719925474099300', side: 'sell' });
  appendTrade(m, { ts: 1020, block: 12, log: 1, price: '0.01', quoteRaw: '7', side: 'buy' });
  assert.deepEqual(m.bars![0].slice(1, 8), ['0.01', '0.03', '0.01', '0.03', '900719925474099307', 1, 1]);
});
test('unsupported quote and missing coverage cannot enter the ready feed', () => {
  const s = session(), m = s.markets[0]; m.quoteAddress = '0x' + '3'.repeat(40);
  const row = projectRow(scoreMarket(m, s.asOf), s); assert.equal(row.admission?.early, false); assert.equal(row.early.estimate, null);
  m.quoteAddress = ZERO; m.barCoverage = [];
  assert.equal(projectRow(scoreMarket(m, s.asOf), s).admission?.early, false);
});
test('CA search bypasses phase, eligibility, minimum and stage filters', () => {
  const s = session(), r = projectRow(scoreMarket(s.markets[0], s.asOf), s), desk = initialDesk();
  desk.filter = 3; desk.minimum = 99; desk.query = token;
  assert.equal(visibleRows([r], desk).length, 1);
  desk.query = ''; desk.tab = 'early'; const stale = projectRow(r, { ...s, source: 'rpc' }, 9999);
  desk.filter = desk.minimum = 0; assert.equal(visibleRows([stale], desk).length, 0);
  desk.catalogue = true; assert.equal(visibleRows([stale], desk).length, 1);
});
test('latest-scenario sort places markets without a scenario after dated scenarios', () => {
  const s = session(), r = scoreMarket(s.markets[0], 1030), desk = initialDesk(); desk.catalogue = true; desk.sort = 5;
  const rows = [null, 100, 200].map((time, i) => ({ ...r, market: { ...r.market, address: '0x' + String(i + 1).repeat(40), phase: 'migrated' as const }, wave: { ...r.wave, scenarioCreatedAt: time } }));
  assert.deepEqual(visibleRows(rows, desk).map(r => r.wave.scenarioCreatedAt), [200, 100, null]);
});

const events = [
  { name: 'CurveBuy', block: 11, args: { buyer: token, recipient: token }, amounts: [100n, 10000n, 5n, 1n] },
  { name: 'CurveSell', block: 12, args: { seller: token, recipient: token }, amounts: [2000n, 20n, 2n, 1n] },
  { name: 'BuybackLocked', block: 13, args: {}, amounts: [5n, 500n] },
].map(e => ({ address: curve, blockNumber: hex(e.block), logIndex: '0x0', blockHash: hash, transactionHash: '0x' + String(e.block - 10).repeat(64), topics: encodeEventTopics({ abi: curveAbi, eventName: e.name as any, args: e.args as any }), data: encodeAbiParameters(e.amounts.map(() => ({ type: 'uint256' })), e.amounts) }));
function rpc(changed = false): RpcReader {
  let read = false;
  return { async call<T>(method: string, args: any[] = []): Promise<T> {
    if (method === 'eth_chainId') return hex(4663) as T;
    if (method === 'eth_blockNumber') return hex(33) as T;
    if (method === 'eth_getBlockByNumber') return { hash: changed && read ? '0x' + 'b'.repeat(64) : hash, timestamp: hex(1000 + (Number(BigInt(args[0])) - 10) * 10) } as T;
    if (method === 'eth_getLogs') { read = true; return events.filter(l => Number(BigInt(l.blockNumber)) >= Number(BigInt(args[0].fromBlock)) && Number(BigInt(l.blockNumber)) <= Number(BigInt(args[0].toBlock)) && (!args[0].address || args[0].address === curve)) as T; }
    throw Error('Unexpected test RPC method');
  } };
}
test('history resumes across pages and matches one-pass OHLCV and net curve reserve', async () => {
  const first = await hydratePage(state(), rpc(), token, undefined, 2); assert.equal(first.done, false); assert.equal(first.next, 12);
  const resumed = await hydratePage(first.state, rpc(), token, undefined, 2);
  const whole = await hydratePage(state(), rpc(), token, undefined, 10);
  assert.equal(resumed.done, true); assert.deepEqual(resumed.state, whole.state);
  const m = whole.state.session.markets[0]; assert.equal(m.reserveRaw, '76'); assert.equal(m.curveProgress, 76);
  const a = activity(m, 1000, 1030); assert.equal(a.complete, true); assert.equal(a.buys, 1); assert.equal(a.sells, 1);
  assert.equal(m.bars!.reduce((n,b) => n + BigInt(b[5]), 0n), 120n);
});
test('history reorg preserves the previous job and market, without partial candles', async () => {
  const input = state(), before = structuredClone(input);
  await assert.rejects(hydratePage(input, rpc(true), token), /HISTORY_REORG/);
  assert.deepEqual(input, before);
});
test('live collection keeps more than 1000 markets and observes curves beyond the old 64 cap', async () => {
  const input = state(); input.seed.next = 11; input.seed.asOf = input.session.asOf = 1000; input.session.block = 10;
  input.session.markets = Array.from({ length: 1005 }, (_, i) => ({ ...market(), address: '0x' + (i + 1).toString(16).padStart(40,'0'), curve: i === 1004 ? curve : '0x' + (i + 10000).toString(16).padStart(40,'0') }));
  const result = await collectPage(input, rpc());
  assert.equal(result.state.session.markets.length, 1005);
  const m = result.state.session.markets.find(m => m.curve === curve)!; assert.equal(m.reserveRaw, '76'); assert.equal(m.bars!.reduce((n,b) => n + b[6] + b[7],0),2);
});
