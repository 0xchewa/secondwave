import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Rpc, RpcError, hex, type RpcReader } from '../src/chain/rpc.js';
import { collectPage, logs } from '../src/chain/collect.js';
import { commitState, readState, stateLock, type LocalState } from '../src/chain/state.js';
import { safeError } from '../src/tui/app.js';
import { encodeEventTopics, encodeAbiParameters, encodeFunctionData } from 'viem';
import { FACTORY } from '../src/chain/collect.js';
import { factoryAbi } from '../src/chain/abi.js';
import { routerAbi, PONS_ROUTER } from '../src/chain/launch.js';
import { ZERO } from '../src/domain.js';
import { FEATURES } from '../src/engines/early/vendor/features.js';
const hash = '0x' + 'a'.repeat(64), changed = '0x' + 'b'.repeat(64);
function state(): LocalState { return {
  format: 'secondwave-state-v1', seed: { format: 'secondwave-seed-v1', chainId: 4663, next: 11, hash, asOf: 1010, missing: 0, recent: [], launches: [], graduations: [], exemptions: [] },
  session: { format: 'secondwave-session-v1', chainId: 4663, source: 'recorded', capturedAt: '2026-09-19T00:00:00Z', block: 10, hash, asOf: 1010, markets: [] },
}; }
class FakeRpc implements RpcReader {
  seen: string[] = []; anchors = 0; chain = 4663; reorg = false; fail = false;
  async call<T = any>(method: string, params: any[] = []): Promise<T> {
    this.seen.push(method); let value: any;
    if (method === 'eth_chainId') value = hex(this.chain);
    else if (method === 'eth_blockNumber') value = hex(50);
    else if (method === 'eth_getBlockByNumber') {
      const n = Number(BigInt(params[0])); if (n === 10) this.anchors++;
      value = { hash: this.reorg && this.anchors > 1 ? changed : hash, timestamp: hex(1000 + n) };
    } else if (method === 'eth_getLogs') { if (this.fail) throw new RpcError('RPC_HTTP_429'); value = []; }
    else throw Error('Unexpected method'); return value as T;
  }
}
test('RPC reader refuses transaction and wallet methods before network access', async () => {
  const rpc = new Rpc('https://example.invalid/private-key');
  await assert.rejects(rpc.call('eth_sendRawTransaction'), /READ_ONLY_RPC/);
});
test('wrong chain stops before any market read', async () => {
  const rpc = new FakeRpc(); rpc.chain = 1; await assert.rejects(collectPage(state(), rpc), /WRONG_CHAIN/);
  assert.deepEqual(rpc.seen, ['eth_chainId']);
});
test('reorg before commit preserves the previous cursor and events', async () => {
  const original = state(), before = structuredClone(original), rpc = new FakeRpc(); rpc.reorg = true;
  await assert.rejects(collectPage(original, rpc), /REORG_BEFORE_COMMIT/); assert.deepEqual(original, before);
});
test('RPC failure leaves the previous state untouched', async () => {
  const original = state(), rpc = new FakeRpc(); rpc.fail = true;
  await assert.rejects(collectPage(original, rpc), /RPC_HTTP_429/); assert.equal(original.seed.next, 11);
});
test('empty canonical page commits and resumes without skipping a block', async () => {
  const first = await collectPage(state(), new FakeRpc(), undefined, { blocks: 5 });
  assert.equal(first.state.seed.next, 16); assert.equal(first.state.session.block, 15);
  const second = await collectPage(first.state, new FakeRpc(), undefined, { blocks: 5 });
  assert.equal(second.state.seed.next, 21); assert.equal(second.state.session.source, 'rpc');
});

test('a canonical launch computes features before advancing caller history (synthetic)', async () => {
  const token = '0x' + '1'.repeat(40), curve = '0x' + '2'.repeat(40), caller = '0x' + '3'.repeat(40), txHash = '0x' + '4'.repeat(64);
  const initial = state(); initial.seed.launches = [[caller, 2]]; initial.seed.graduations = [[caller, 1]]; initial.seed.exemptions = [caller]; initial.seed.recent = [1009];
  const log = { address: FACTORY, blockNumber: '0xb', blockHash: hash, transactionHash: txHash, logIndex: '0x0',
    topics: encodeEventTopics({ abi: factoryAbi, eventName: 'TokenLaunched', args: { token: token as `0x${string}`, curve: curve as `0x${string}`, deployer: caller as `0x${string}` } }),
    data: encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }, { type: 'uint256' }], [ZERO as `0x${string}`, 1n, 10n ** 18n]) };
  const calldata = encodeFunctionData({ abi: routerAbi, functionName: 'launchAndBuy', args: [{ name: 'Synthetic case', symbol: 'TEST', logo: '', description: 'Explicit test fixture', socials: { twitter: '', telegram: '', discord: '', website: '', farcaster: '' }, creatorFeeRecipient: caller as `0x${string}`, creatorTaxBps: 100, buybackEnabled: false, expectedEconomics: hash as `0x${string}`, salt: hash as `0x${string}` }, 1n, ZERO as `0x${string}`, 10n ** 16n, 0n, caller as `0x${string}`, [caller as `0x${string}`]] });
  const base = new FakeRpc();
  const rpc: RpcReader = { async call<T>(method: string, params: any[] = []): Promise<T> {
    if (method === 'eth_getLogs') return (params[0].address === FACTORY ? [log] : []) as T;
    if (method === 'eth_getTransactionReceipt') return { status: '0x1', blockHash: hash, logs: [log] } as T;
    if (method === 'eth_getTransactionByHash') return { from: caller, to: PONS_ROUTER, input: calldata, blockHash: hash } as T;
    if (method === 'eth_call') return encodeAbiParameters([{ type: 'uint256' }], [5n * 10n ** 17n]) as T;
    return base.call<T>(method, params);
  } };
  const result = await collectPage(initial, rpc, undefined, { blocks: 1 });
  const m = result.state.session.markets[0], x = m.featureSnapshot!;
  assert.equal(m.symbol, 'TEST'); assert.equal(m.curveProgress, 0); // No CurveBuy event in this explicit fixture.
  assert.equal(x[FEATURES.indexOf('dev_prior_launches')], 2); assert.equal(x[FEATURES.indexOf('dev_prior_graduations')], 1);
  assert.equal(x[FEATURES.indexOf('exempt_seen_before')], 1); assert.equal(x[FEATURES.indexOf('launches_prior_hour')], 1);
  assert.equal(new Map(result.state.seed.launches).get(caller), 3); assert.equal(new Map(initial.seed.launches).get(caller), 2);
});
test('atomic persisted checkpoint survives a fresh process-style reload', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'secondwave-test-'));
  try {
    const path = join(dir, 'state.json.gz'), unlock = await stateLock(path);
    await assert.rejects(stateLock(path), /LOCAL_STATE_LOCKED/);
    const next = (await collectPage(state(), new FakeRpc(), undefined, { blocks: 5 })).state;
    await commitState(path, next); assert.deepEqual(await readState(path), next); await unlock();
    const second = await stateLock(path); await second();
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('resume rejects incomplete causal counters even when the block hash matches', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'secondwave-seed-test-'));
  try {
    const path = join(dir, 'state.json.gz'), broken = state(); broken.seed.missing = 1;
    await commitState(path, broken); await assert.rejects(readState(path), /Causal seed is not complete/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('dense log pages split rather than silently truncate', async () => {
  const ranges: string[] = [];
  const rpc: RpcReader = { async call<T>(method: string, params: any[] = []): Promise<T> {
    const p = params[0]; ranges.push(`${p.fromBlock}:${p.toBlock}`);
    return (p.fromBlock !== p.toBlock ? Array(1000).fill({}) : []) as T;
  } };
  assert.deepEqual(await logs(rpc, {}, 1, 2), []); assert.equal(ranges.length, 3);
});
test('duplicate or removed logs cannot advance a page', async () => {
  const log = { blockNumber: '0x1', logIndex: '0x0' };
  await assert.rejects(logs({ call: async <T>() => [log, log] as T }, {}, 1, 2), /DUPLICATE/);
  await assert.rejects(logs({ call: async <T>() => [{ ...log, removed: true }] as T }, {}, 1, 2), /NONCANONICAL/);
});
test('untrusted provider errors never echo credentials', () => {
  assert.ok(!safeError(Error('Failed https://secret.example/token')).includes('secret'));
});
test('batched RPC matches results by ID, not response order', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    const request = JSON.parse(String(init?.body));
    return new Response(JSON.stringify(request.map((r: any) => ({ jsonrpc: '2.0', id: r.id, result: r.method })).reverse()), { headers: { 'content-type': 'application/json' } });
  };
  try { assert.deepEqual(await new Rpc('https://example.invalid', undefined, 0).batch([{ method: 'eth_chainId', params: [] }, { method: 'eth_blockNumber', params: [] }]), ['eth_chainId', 'eth_blockNumber']); }
  finally { globalThis.fetch = original; }
});
test('one bad item rejects the complete RPC batch', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    const request = JSON.parse(String(init?.body));
    return new Response(JSON.stringify(request.map((r: any) => ({ jsonrpc: '2.0', id: r.id, error: { code: -32000, message: 'sensitive provider detail' } }))));
  };
  try { await assert.rejects(new Rpc('https://example.invalid', undefined, 0).batch([{ method: 'eth_chainId', params: [] }]), /RPC_RESPONSE_-32000/); }
  finally { globalThis.fetch = original; }
});
