import assert from 'node:assert/strict';
import { readFile, writeFile, rename, mkdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzip } from 'node:zlib';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { CHAIN_ID, type Session, type Seed } from './domain.js';

export const bundledSession = fileURLToPath(new URL('../data/session.json.gz', import.meta.url));
export const bundledSeed = fileURLToPath(new URL('../data/seed.json.gz', import.meta.url));
const address = /^0x[a-f0-9]{40}$/i, hash = /^0x[a-f0-9]{64}$/i;
export const stringify = (value: unknown) => JSON.stringify(value, (_, v) => typeof v === 'bigint' ? String(v) : v);
const compress = promisify(gzip);
export async function readJson(path: string, maxBytes = 512 * 1024 ** 2) {
  assert.ok((await stat(path)).size <= maxBytes, 'Input exceeds the local data budget');
  const bytes = await readFile(path);
  return JSON.parse((path.endsWith('.gz') ? gunzipSync(bytes, { maxOutputLength: maxBytes }) : bytes).toString('utf8'));
}
export function validateSession(value: any): Session {
  assert.equal(value.format, 'secondwave-session-v1', 'Unsupported session format');
  assert.equal(value.chainId, CHAIN_ID, 'Only Robinhood Chain mainnet 4663 is supported');
  assert.ok(Number.isSafeInteger(value.block) && Number.isFinite(value.asOf) && hash.test(value.hash));
  assert.ok(['rpc', 'recorded'].includes(value.source) && Array.isArray(value.markets) && value.markets.length <= 100000, 'Invalid session or local market budget exceeded');
  const seen = new Set<string>();
  for (const m of value.markets) {
    assert.ok(address.test(m.address) && address.test(m.quoteAddress) && !seen.has(m.address.toLowerCase()), 'Invalid or duplicated token');
    seen.add(m.address.toLowerCase());
    assert.ok(Number.isFinite(m.launchedAt) && m.launchedAt <= value.asOf && ['curve', 'migrated'].includes(m.phase));
    assert.ok(m.featureSnapshot === null || (Array.isArray(m.featureSnapshot) && m.featureSnapshot.length === 23 && m.featureSnapshot.every(Number.isFinite)), 'Incompatible Early vector');
    assert.ok(m.priceQuote === null || (typeof m.priceQuote === 'string' && /^\d+(\.\d+)?$/.test(m.priceQuote)), 'Prices must be exact decimal strings');
    assert.ok(Array.isArray(m.coverage) && m.coverage.length <= 10000);
    const reviveRange = (r: any) => {
      assert.ok(Number.isFinite(r.fromTime) && Number.isFinite(r.toTime) && r.fromTime <= r.toTime);
      const fromBlock = BigInt(r.fromBlock), toBlock = BigInt(r.toBlock);
      assert.ok(fromBlock <= toBlock && toBlock <= BigInt(value.block), 'Coverage exceeds the recorded block boundary');
      return { ...r, fromBlock, toBlock };
    };
    m.coverage = m.coverage.map(reviveRange);
    if (m.barCoverage) m.barCoverage = m.barCoverage.map(reviveRange);
    if (m.bars) {
      assert.ok(Array.isArray(m.bars) && m.bars.length <= 150000, 'Invalid candle archive');
      let lastMinute = -1;
      for (const b of m.bars) {
        assert.ok(b.length === 12 && Number.isSafeInteger(b[0]) && b[0] % 60 === 0 && b[0] > lastMinute && b[0] <= value.asOf, 'Invalid or duplicated candle minute');
        assert.ok(b.slice(1, 5).every((p: any) => p === null || typeof p === 'string' && /^\d+(\.\d+)?$/.test(p)), 'Invalid candle price');
        assert.ok(typeof b[5] === 'string' && /^\d+$/.test(b[5]) && b.slice(6).every((n: any) => Number.isSafeInteger(n) && n >= 0) && b[10] <= value.block, 'Invalid candle volume or event boundary');
        lastMinute = b[0];
      }
    }
    if (m.history) assert.equal(m.history.token, m.address);
    for (const ticks of [m.history?.ticks, m.tape].filter(v => v !== undefined)) {
      assert.ok(Array.isArray(ticks) && ticks.length <= 12000);
      let last = [-1, -1];
      for (const t of ticks) {
        assert.ok(Number.isSafeInteger(t.block) && t.block <= value.block && Number.isSafeInteger(t.log));
        assert.ok(t.block > last[0] || t.block === last[0] && t.log > last[1], 'Unordered or duplicate market event');
        assert.ok(Number.isFinite(t.ts) && t.ts <= value.asOf && (t.price === null || Number.isFinite(t.price) && t.price > 0));
        assert.ok(hash.test(t.hash) && hash.test(t.tx) && /^\d+$/.test(t.quoteRaw) && ['buy', 'sell'].includes(t.side));
        last = [t.block, t.log];
      }
    }
  }
  return value;
}
export async function loadSession(path = bundledSession) { return validateSession(await readJson(path)); }
export function validateSeed(seed: any): Seed {
  assert.equal(seed.format, 'secondwave-seed-v1'); assert.equal(seed.chainId, CHAIN_ID);
  assert.ok(Number.isSafeInteger(seed.next) && seed.next > 0 && Number.isFinite(seed.asOf) && hash.test(seed.hash) && seed.missing === 0, 'Causal seed is not complete');
  assert.ok(Array.isArray(seed.recent) && seed.recent.every((t: any) => Number.isFinite(t) && t <= seed.asOf), 'Invalid recent launch history');
  for (const field of ['launches', 'graduations']) assert.ok(Array.isArray(seed[field]) && seed[field].every((r: any) => address.test(r[0]) && Number.isSafeInteger(r[1]) && r[1] >= 0));
  assert.ok(Array.isArray(seed.exemptions) && seed.exemptions.every((a: string) => address.test(a)));
  return seed;
}
export async function loadSeed(path = bundledSeed): Promise<Seed> { return validateSeed(await readJson(path)); }
export async function atomicSave(path: string, value: unknown) {
  const target = resolve(path); await mkdir(dirname(target), { recursive: true });
  const bytes = Buffer.from(stringify(value));
  const temp = `${target}.${process.pid}.tmp`;
  await writeFile(temp, path.endsWith('.gz') ? await compress(bytes, { level: 1 }) : bytes, { mode: 0o600 });
  await rename(temp, target);
}
export async function verifyBundledData() {
  const manifest = await readJson(fileURLToPath(new URL('../data/manifest.json', import.meta.url)));
  for (const [name, digest] of Object.entries(manifest.files)) {
    const bytes = await readFile(fileURLToPath(new URL(`../data/${name}`, import.meta.url)));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), digest, `Recorded input checksum: ${name}`);
  }
  return manifest;
}
