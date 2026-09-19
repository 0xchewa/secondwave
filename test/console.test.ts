import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSession } from '../src/session.js';
import { scoreMarket } from '../src/models.js';
import { initialDesk, visibleRows } from '../src/tui/state.js';
import { render } from '../src/tui/render.js';
import { clean, price } from '../src/tui/text.js';
import { poolSide, poolPrice, tradePrice } from '../src/chain/math.js';
const session = await loadSession(), rows = session.markets.map(m => scoreMarket(m, session.asOf));
for (const [w, h] of [[140, 42], [120, 36], [80, 30], [64, 24], [40, 16]]) test(`console ${w}x${h} respects terminal bounds`, () => {
  const s = initialDesk();
  for (const tab of ['early', 'wave', 'models'] as const) {
    s.tab = tab; const frame = render(session, rows, s, w, h);
    assert.equal(frame.cells.length, h); assert.ok(frame.cells.every(r => r.length === w));
    assert.equal(frame.plain().split('\n').length, h);
  }
});
test('search finds any recorded contract, independent of visible rows', () => {
  const s = initialDesk(); s.tab = 'early'; const last = rows.filter(r => r.market.phase === 'curve').at(-1)!;
  s.query = last.market.address.toUpperCase(); assert.equal(visibleRows(rows, s)[0].market.address, last.market.address);
});
test('sorting and filters are deterministic and preserve missing values', () => {
  const s = initialDesk(); s.filter = 1;
  assert.ok(visibleRows(rows, s).every(r => r.wave.stage === 'ACTIVE'));
  s.filter = 0; s.sort = 3; const list = visibleRows(rows, s);
  assert.ok(list.every((r, i) => !i || (list[i - 1].wave.pressure ?? -1) >= (r.wave.pressure ?? -1)));
});
test('recorded mode is explicit and never claims live data', () => {
  const text = render(session, rows, initialDesk()).plain(); assert.ok(text.includes('RECORDED / LOCAL MODELS')); assert.ok(!text.includes('LIVE RPC'));
});
test('token text cannot execute OSC or ANSI commands', () => {
  assert.equal(clean('A\x1b]52;c;c2VjcmV0\x07B\x1b[2JC\n'), 'ABC');
});
test('tiny prices use readable zero counts and retain full string values', () => {
  const n = '0.0000000123456789'; assert.equal(price(n), '0.0{7}1234'); assert.equal(price(n, true), n);
  assert.equal(price(null), '--'); assert.equal(price(0), '0'); assert.ok(!price(0.000123).includes('e'));
  assert.equal(price(1.234e-40), '0.0{39}1234'); assert.ok(!price(1e-40, true).includes('e'));
});
test('v4 side and decimals use caller deltas and exact integer arithmetic', () => {
  assert.equal(poolSide(1n), 'buy'); assert.equal(poolSide(-1n), 'sell');
  assert.equal(tradePrice(1000000n, 1000000000000000000n, 6, 18), '1');
  assert.equal(poolPrice(2n ** 96n, true, 18, 18), '1');
});
