import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HyperSyncReader } from '../src/chain/hypersync.js';
import { createReader } from '../src/chain/reader.js';
import { hex, type RpcReader } from '../src/chain/rpc.js';
const hash = '0x' + 'a'.repeat(64), parent = '0x' + 'b'.repeat(64), tx = '0x' + 'c'.repeat(64), address = '0x' + '1'.repeat(40), topic = '0x' + 'd'.repeat(64);
const fallback: RpcReader = { call: async <T>() => 'INDEPENDENT_RPC' as T };
function page(from: number, next: number) {
  return { next_block: next, data: [{ blocks: [{ number: from, hash, parent_hash: parent, timestamp: 1000 }], transactions: [{ hash: tx, block_number: from, block_hash: hash, transaction_index: 0, from: address, to: address, input: '0x', status: 1, chain_id: 4663 }], logs: [0,1].map(log_index => ({ address, block_number: from, block_hash: hash, transaction_index: 0, transaction_hash: tx, log_index, topic0: log_index ? null : topic, topic1: null, topic2: null, topic3: null, data: '0x' })) }] };
}
test('HyperSync follows next_block, filters anonymous siblings and reconstructs full receipts', async () => {
  const fetch = globalThis.fetch, requests: any[] = [];
  globalThis.fetch = async (_u, init) => { const q = JSON.parse(String(init?.body)); requests.push(q); return new Response(JSON.stringify(page(q.from_block, q.from_block === 10 ? 11 : 13))); };
  try {
    const r = new HyperSyncReader(fallback, 'synthetic-test-token'); const logs = await r.readLogs({address,topics:[topic]},10,12);
    assert.equal(logs.length,2); assert.deepEqual(requests.map(q=>q.from_block),[10,11]); assert.ok(requests.every(q=>q.join_mode==='JoinAll'));
    assert.equal((await r.call('eth_getTransactionReceipt',[tx])).logs.length,2);
    assert.equal(await r.call('eth_getBlockByNumber',[hex(11),false]),'INDEPENDENT_RPC');
    assert.equal((await r.batch([{method:'eth_getBlockByNumber',params:[hex(11),false]}]))[0].hash,hash);
  } finally { globalThis.fetch=fetch; }
});
test('HyperSync rejects mismatched log joins before returning any partial history', async () => {
  const fetch=globalThis.fetch;
  globalThis.fetch=async()=>{const p=page(10,11);p.data[0].logs[0].block_hash=parent;return new Response(JSON.stringify(p));};
  try { await assert.rejects(new HyperSyncReader(fallback,'synthetic-test-token').readLogs({},10,10),/JOIN_INVALID/); }
  finally {globalThis.fetch=fetch;}
});
test('HyperSync access errors cannot leak provider response bodies or bearer keys', async () => {
  const fetch=globalThis.fetch;globalThis.fetch=async()=>new Response('synthetic-secret-key',{status:401});
  try { await assert.rejects(new HyperSyncReader(fallback,'synthetic-secret-key').readLogs({},10,10), e=>e instanceof Error && e.message==='HYPERSYNC_ACCESS_DENIED_401'); }
  finally {globalThis.fetch=fetch;}
});
test('HyperSync cannot send credentials to a redirected or unrelated configured endpoint', () => {
  assert.throws(()=>new HyperSyncReader(fallback,'synthetic-secret-key','https://example.org'),/ENDPOINT/);
  assert.throws(()=>createReader({rpc:'https://example.org',transport:'hypersync'}),/TOKEN_REQUIRED/);
});
test('nonadvancing archive cursor fails explicitly', async () => {
  const fetch=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({data:[],next_block:10}));
  try { await assert.rejects(new HyperSyncReader(fallback,'synthetic-test-token').readLogs({},10,12),/CURSOR_INVALID_OR_ARCHIVE_BEHIND/); }
  finally {globalThis.fetch=fetch;}
});
