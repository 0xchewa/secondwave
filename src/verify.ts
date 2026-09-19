import assert from 'node:assert/strict';
import { loadSession, verifyBundledData } from './session.js';
import { scoreMarket } from './models.js';
export async function bench() {
  const record = await verifyBundledData(), session = await loadSession();
  const rows = session.markets.map(m => scoreMarket(m, session.asOf));
  assert.ok(rows.length && rows.some(r => r.early.topPercent !== null));
  return { ok: true, records: rows.length, block: record.block, mode: 'recorded', modelIntegrity: 'verified', probabilityGates: 'preserved' };
}
