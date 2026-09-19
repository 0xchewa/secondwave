import assert from 'node:assert/strict';
import { setTimeout as pause } from 'node:timers/promises';
import { hex, num, RpcError, type RpcReader } from './rpc.js';

const fields = {
  block: ['number', 'hash', 'parent_hash', 'timestamp'],
  transaction: ['hash', 'block_number', 'block_hash', 'transaction_index', 'from', 'to', 'input', 'value', 'status', 'chain_id'],
  log: ['address', 'data', 'topic0', 'topic1', 'topic2', 'topic3', 'transaction_hash', 'block_hash', 'block_number', 'transaction_index', 'log_index'],
};
const flat = (body: any, key: string): any[] => body.data.flatMap((b: any) => b[key] ?? []);
const hashPattern = /^0x[0-9a-f]{64}$/i;
/** Transport adapter only. Model inference and persisted state remain local. */
export class HyperSyncReader implements RpcReader {
  readonly kind = 'hypersync'; indexedLogs = true; suggestedBlocks = 6000;
  private queries = 0;
  get requests() { return this.queries + (this.rpc.requests ?? 0); }
  private cachedBlocks = new Map<number, any>(); private transactions = new Map<string, any>(); private receipts = new Map<string, any>();
  constructor(private rpc: RpcReader, private token: string, private endpoint = 'https://robinhood.hypersync.xyz', private signal?: AbortSignal) {
    const u = new URL(endpoint);
    if (u.origin !== 'https://robinhood.hypersync.xyz' || u.pathname !== '/' || u.search || u.username || u.password) throw new RpcError('HYPERSYNC_ENDPOINT_MUST_BE_ROBINHOOD_MAINNET');
    this.endpoint = u.origin;
    if (!token) throw new RpcError('HYPERSYNC_TOKEN_REQUIRED');
  }
  reset() { this.cachedBlocks.clear(); this.transactions.clear(); this.receipts.clear(); }
  async query(q: any) {
    for (let attempt = 0; attempt < 4; attempt++) {
      this.signal?.throwIfAborted();
      let response: Response;
      try {
        this.queries++;
        response = await fetch(this.endpoint + '/query', { method: 'POST', redirect: 'error', headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' }, body: JSON.stringify(q), signal: this.signal ? AbortSignal.any([this.signal, AbortSignal.timeout(45000)]) : AbortSignal.timeout(45000) });
      } catch {
        if (this.signal?.aborted) throw new RpcError('SYNC_CANCELLED');
        if (attempt === 3) throw new RpcError('HYPERSYNC_TIMEOUT_OR_NETWORK');
        await pause(1000 * 2 ** attempt, undefined, { signal: this.signal }); continue;
      }
      if ([401, 403].includes(response.status)) throw new RpcError(`HYPERSYNC_ACCESS_DENIED_${response.status}`);
      if (response.status === 429 || response.status >= 500) {
        await response.body?.cancel();
        if (attempt === 3) throw new RpcError(`HYPERSYNC_HTTP_${response.status}`);
        const retry = Number(response.headers.get('retry-after'));
        await pause(Math.min(30000, Math.max(1000 * 2 ** attempt, Number.isFinite(retry) ? retry * 1000 : 0)), undefined, { signal: this.signal }); continue;
      }
      if (!response.ok) throw new RpcError(`HYPERSYNC_HTTP_${response.status}`);
      const chunks: Uint8Array[] = []; let total = 0;
      for await (const chunk of response.body!) { total += chunk.byteLength; if (total > 64 * 1024 ** 2) throw new RpcError('HYPERSYNC_RESPONSE_TOO_LARGE'); chunks.push(chunk); }
      let body: any; try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { throw new RpcError('HYPERSYNC_INVALID_JSON'); }
      if (!Array.isArray(body.data) || !Number.isSafeInteger(body.next_block) || body.next_block <= q.from_block || body.next_block > q.to_block) throw new RpcError('HYPERSYNC_CURSOR_INVALID_OR_ARCHIVE_BEHIND');
      return body;
    }
    throw new RpcError('HYPERSYNC_RETRY_EXHAUSTED');
  }
  private remember(body: any, from: number) {
    const blocks = flat(body, 'blocks'), txs = flat(body, 'transactions'), logs = flat(body, 'logs');
    const bm = new Map<number, any>(), tm = new Map<string, any>();
    for (const b of blocks) {
      assert.ok(Number.isSafeInteger(b.number) && b.number >= from && b.number < body.next_block && hashPattern.test(b.hash) && hashPattern.test(b.parent_hash) && b.timestamp != null && !bm.has(b.number), 'HYPERSYNC_BLOCK_INVALID');
      const previous = this.cachedBlocks.get(b.number); assert.ok(!previous || previous.hash === b.hash, 'HYPERSYNC_REORG_DURING_READ');
      bm.set(b.number, b);
      this.cachedBlocks.set(b.number, { number: hex(b.number), hash: b.hash, parentHash: b.parent_hash, timestamp: hex(BigInt(b.timestamp)) });
    }
    for (const b of blocks) if (bm.has(b.number - 1)) assert.equal(bm.get(b.number - 1).hash, b.parent_hash, 'HYPERSYNC_PARENT_MISMATCH');
    for (const t of txs) {
      assert.ok(bm.get(t.block_number)?.hash === t.block_hash && t.input != null && t.from && t.status != null && !tm.has(t.hash), 'HYPERSYNC_TRANSACTION_INVALID');
      if (t.chain_id != null) assert.equal(num(String(t.chain_id)), 4663, 'WRONG_CHAIN');
      tm.set(t.hash, t); this.transactions.set(t.hash, { ...t, blockHash: t.block_hash, blockNumber: hex(t.block_number), transactionIndex: hex(t.transaction_index) });
    }
    const seen = new Set<string>(), converted: any[] = [];
    for (const l of logs) {
      const id = `${l.block_number}:${l.log_index}`, t = tm.get(l.transaction_hash);
      assert.ok(t && t.block_hash === l.block_hash && bm.get(l.block_number)?.hash === l.block_hash, 'HYPERSYNC_LOG_TRANSACTION_JOIN_INVALID');
      assert.equal(t.transaction_index, l.transaction_index, 'HYPERSYNC_LOG_TRANSACTION_INDEX_INVALID');
      // JoinAll also includes anonymous sibling logs, which legitimately have no topic0.
      assert.ok(Number.isSafeInteger(l.log_index) && l.log_index >= 0 && typeof l.data === 'string', 'HYPERSYNC_LOG_FIELDS_INVALID');
      assert.ok(!seen.has(id), 'HYPERSYNC_DUPLICATE_LOG');
      seen.add(id);
      converted.push({ address: l.address.toLowerCase(), data: l.data, topics: [l.topic0, l.topic1, l.topic2, l.topic3].filter(v => v != null), transactionHash: l.transaction_hash, transactionIndex: hex(l.transaction_index), blockHash: l.block_hash, blockNumber: hex(l.block_number), logIndex: hex(l.log_index), removed: false });
    }
    // JoinAll returns every log of the selected transaction, including migration Initialize.
    for (const t of txs) this.receipts.set(t.hash, { status: hex(t.status), blockHash: t.block_hash, logs: converted.filter(l => l.transactionHash === t.hash) });
    return converted;
  }
  async readLogs(filter: any, from: number, to: number) {
    const address = filter.address == null ? [] : Array.isArray(filter.address) ? filter.address : [filter.address];
    const topics: string[][] = (filter.topics ?? []).map((v: any) => v == null ? [] : Array.isArray(v) ? v : [v]);
    const matches = (l: any) => (!address.length || address.some((a: string) => a.toLowerCase() === l.address)) && topics.every((t, i) => !t.length || t.includes(l.topics[i]));
    const out: any[] = []; let cursor = from;
    while (cursor <= to) {
      const body = await this.query({ from_block: cursor, to_block: to + 1, logs: [{ address, topics }], join_mode: 'JoinAll', field_selection: fields, max_num_logs: 10000, max_num_transactions: 10000 });
      out.push(...this.remember(body, cursor).filter(matches)); cursor = body.next_block;
    }
    return out;
  }
  async call<T = any>(method: string, params: any[] = []): Promise<T> {
    if (method === 'eth_getTransactionByHash' && this.transactions.has(params[0])) return this.transactions.get(params[0]);
    if (method === 'eth_getTransactionReceipt' && this.receipts.has(params[0])) return this.receipts.get(params[0]);
    // Boundary checks deliberately reach independent RPC, never a cached header.
    return this.rpc.call<T>(method, params);
  }
  async batch(requests: { method: string; params: unknown[] }[]) {
    const out: any[] = [];
    for (const r of requests) {
      const cached = r.method === 'eth_getBlockByNumber' ? this.cachedBlocks.get(num(String(r.params[0]))) : null;
      out.push(cached ?? await this.rpc.call(r.method, r.params));
    }
    return out;
  }
}
