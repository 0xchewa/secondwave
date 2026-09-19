import assert from 'node:assert/strict';
import { decodeEventLog, decodeFunctionResult, encodeFunctionData, encodeAbiParameters, keccak256, toEventSelector, type Hex } from 'viem';
import { CHAIN_ID, ZERO, type Market, type Pool, type Session } from '../domain.js';
import { featureRow } from '../engines/early/vendor/features.js';
import { replay } from '../engines/wave24/engine.js';
import { mergeCoverage } from '../engines/coverage.js';
import { factoryAbi, poolAbi, curveAbi } from './abi.js';
import { decodeLaunch } from './launch.js';
import { poolPrice, poolSide, tradePrice } from './math.js';
import { hex, num, RpcError, type RpcReader } from './rpc.js';
import type { LocalState } from './state.js';

export const FACTORY = '0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e';
export const POOL_MANAGER = '0x8366a39cc670b4001a1121b8f6a443a643e40951';
export const HOOK = '0xe5e702641ea86f4ae6cc3cdaed2b886f976be044';
const launchTopic = toEventSelector('TokenLaunched(address,address,address,address,uint256,uint256)');
const migrationTopic = toEventSelector('PoolGraduated(address,uint256,uint256,uint256)');
const swapTopic = toEventSelector('Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)');
const initTopic = toEventSelector('Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)');
const buyTopic = toEventSelector('CurveBuy(address,address,uint256,uint256,uint256,uint256)');
const sellTopic = toEventSelector('CurveSell(address,address,uint256,uint256,uint256,uint256)');
const order = (a: any, b: any) => num(a.blockNumber) - num(b.blockNumber) || num(a.logIndex) - num(b.logIndex);

/** Page bounded logs. A dense response is split; no silent first-page truncation. */
export async function logs(rpc: RpcReader, filter: any, from: number, to: number): Promise<any[]> {
  let result: any[];
  try { result = await rpc.call('eth_getLogs', [{ ...filter, fromBlock: hex(from), toBlock: hex(to) }]); }
  catch (e) {
    if (e instanceof RpcError && ['RPC_RESPONSE_-32005', 'RPC_RESPONSE_-32002'].includes(e.code) && from < to) {
      const mid = Math.floor((from + to) / 2);
      return [...await logs(rpc, filter, from, mid), ...await logs(rpc, filter, mid + 1, to)];
    }
    throw e;
  }
  assert.ok(Array.isArray(result), 'RPC_LOGS_NOT_ARRAY');
  if (result.length >= 1000) {
    if (from === to) throw new RpcError('RPC_DENSE_BLOCK_REQUIRES_UNTRUNCATED_PROVIDER');
    const mid = Math.floor((from + to) / 2);
    return [...await logs(rpc, filter, from, mid), ...await logs(rpc, filter, mid + 1, to)];
  }
  const seen = new Set<string>();
  for (const log of result) {
    const key = `${log.blockNumber}:${log.logIndex}`;
    assert.ok(!log.removed && num(log.blockNumber) >= from && num(log.blockNumber) <= to && !seen.has(key), 'RPC_NONCANONICAL_OR_DUPLICATE_LOG');
    seen.add(key);
  }
  return result.sort(order);
}
export type SyncProgress = { phase: string; from: number; to: number; head: number; detail?: string };
export async function collectPage(input: LocalState, rpc: RpcReader,
  onProgress: (p: SyncProgress) => void = () => {}, options: { blocks?: number; poolLimit?: number } = {}) {
  assert.equal(num(await rpc.call('eth_chainId')), CHAIN_ID, 'WRONG_CHAIN: use Robinhood Chain mainnet 4663');
  const head = num(await rpc.call('eth_blockNumber')) - 20;
  const from = input.seed.next;
  assert.ok(from === input.session.block + 1 && input.seed.hash === input.session.hash, 'LOCAL_CHECKPOINT_MISMATCH');
  const anchor = await rpc.call('eth_getBlockByNumber', [hex(from - 1), false]);
  assert.ok(anchor && anchor.hash === input.seed.hash, 'REORG_OR_ARCHIVE_UNAVAILABLE: checkpoint retained; use a canonical seed');
  if (head < from) return { state: input, caughtUp: true, advanced: false, head };
  const to = Math.min(head, from + (options.blocks ?? 1000) - 1);
  const boundary = await rpc.call('eth_getBlockByNumber', [hex(to), false]);
  assert.ok(boundary?.hash, 'RPC_BOUNDARY_MISSING');
  const at = num(boundary.timestamp);
  onProgress({ phase: 'FACTORY', from, to, head });
  // The input remains immutable until every read, hash check and model step succeeds.
  const state: LocalState = structuredClone(input), session = state.session, seed = state.seed;
  const launches = new Map(seed.launches), grads = new Map(seed.graduations), exemptions = new Set(seed.exemptions);
  const markets = new Map(session.markets.map(m => [m.address, m]));
  const headers = new Map<number, any>([[to, boundary]]), receipts = new Map<string, any>();
  async function preloadHeaders(events: any[]) {
    if (!rpc.batch) return;
    const numbers = [...new Set(events.map(l => num(l.blockNumber)))].filter(n => !headers.has(n));
    for (let i = 0; i < numbers.length; i += 10) {
      const batch = numbers.slice(i, i + 10);
      try {
        const results = await rpc.batch(batch.map(n => ({ method: 'eth_getBlockByNumber', params: [hex(n), false] })));
        results.forEach((b, j) => { assert.ok(b?.hash && num(b.number) === batch[j], 'RPC_HEADER_BATCH_MISMATCH'); headers.set(batch[j], b); });
      } catch (e) {
        if (e instanceof RpcError && e.code === 'RPC_BATCH_UNSUPPORTED') return;
        throw e;
      }
    }
  }
  async function header(n: number) {
    if (!headers.has(n)) headers.set(n, await rpc.call('eth_getBlockByNumber', [hex(n), false]));
    const b = headers.get(n); assert.ok(b?.hash, 'RPC_HEADER_MISSING'); return b;
  }
  async function canonical(log: any) {
    const b = await header(num(log.blockNumber)); assert.equal(b.hash, log.blockHash, 'REORG_DURING_READ'); return num(b.timestamp);
  }
  async function receipt(tx: string, log: any) {
    if (!receipts.has(tx)) receipts.set(tx, await rpc.call('eth_getTransactionReceipt', [tx]));
    const r = receipts.get(tx);
    assert.ok(r && r.status === '0x1' && r.blockHash === log.blockHash && Array.isArray(r.logs), 'TRANSACTION_NOT_CANONICAL');
    assert.ok(r.logs.some((v: any) => v.logIndex === log.logIndex && v.data === log.data && v.address.toLowerCase() === log.address.toLowerCase() && JSON.stringify(v.topics) === JSON.stringify(log.topics)), 'LOG_RECEIPT_MISMATCH');
    return r;
  }
  async function declaration(token: string, block: string): Promise<any> {
    const result = await rpc.call('eth_call', [{ to: FACTORY, data: encodeFunctionData({ abi: factoryAbi, functionName: 'getLaunchedToken', args: [token as Hex] }) }, block]);
    const d = decodeFunctionResult({ abi: factoryAbi, functionName: 'getLaunchedToken', data: result as Hex });
    assert.ok(d.exists && d.token.toLowerCase() === token, 'FACTORY_TOKEN_MISMATCH'); return d;
  }
  const factoryLogs = await logs(rpc, { address: FACTORY, topics: [[launchTopic, migrationTopic]] }, from, to);
  await preloadHeaders(factoryLogs);
  for (const log of factoryLogs) {
    const ts = await canonical(log), r = await receipt(log.transactionHash, log);
    const event = decodeEventLog({ abi: factoryAbi, topics: log.topics, data: log.data, strict: true }) as any;
    const a = event.args, token = a.token.toLowerCase();
    if (event.eventName === 'TokenLaunched') {
      const tx: any = await rpc.call('eth_getTransactionByHash', [log.transactionHash]);
      assert.ok(tx?.blockHash === log.blockHash, 'LAUNCH_TRANSACTION_MISSING');
      const quote = a.pairToken.toLowerCase();
      const detail = decodeLaunch({ decoded: a, block_number: num(log.blockNumber), log_index: num(log.logIndex), timestamp: new Date(ts * 1000).toISOString(), block_hash: log.blockHash, tx_hash: log.transactionHash }, tx, quote === ZERO ? 18 : null);
      const caller = detail.row.deployer;
      seed.recent = seed.recent.filter(t => t >= ts - 3600);
      const x = [...featureRow(detail.row, { priorL: launches.get(caller) ?? 0, priorG: grads.get(caller) ?? 0,
        overlap: detail.exemptions.filter(a => exemptions.has(a)).length, recentCount: seed.recent.length }, 14400).x];
      launches.set(caller, (launches.get(caller) ?? 0) + 1);
      detail.exemptions.forEach(a => exemptions.add(a)); seed.recent.push(ts);
      markets.set(token, { address: token, name: detail.declaration?.name ?? null, symbol: detail.declaration?.symbol ?? null,
        launchedAt: ts, launchBlock: num(log.blockNumber), phase: 'curve', curve: a.curve.toLowerCase(), thresholdRaw: String(a.graduationThreshold),
        quoteAddress: quote, quoteSymbol: quote === ZERO ? 'ETH' : null, quoteDecimals: quote === ZERO ? 18 : null, decimals: 18,
        featureSnapshot: x, priceQuote: null, priceAt: null, curveProgress: null, coverage: [] });
    } else {
      const d = await declaration(token, log.blockNumber), caller = d.deployer.toLowerCase();
      grads.set(caller, (grads.get(caller) ?? 0) + 1);
      const m = markets.get(token);
      if (!m) continue; // Caller history remains complete even outside the bounded display universe.
      m.phase = 'migrated'; m.curveProgress = null;
      if (m.quoteAddress !== ZERO) continue;
      const matching = r.logs.filter((l: any) => l.address.toLowerCase() === POOL_MANAGER && l.topics[0] === initTopic);
      for (const l of matching) {
        const p = (decodeEventLog({ abi: poolAbi, topics: l.topics, data: l.data, strict: true }) as any).args;
        if (p.hooks.toLowerCase() !== HOOK || ![p.currency0.toLowerCase(), p.currency1.toLowerCase()].includes(token)) continue;
        const quote = p.currency0.toLowerCase() === token ? p.currency1.toLowerCase() : p.currency0.toLowerCase();
        const key = keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'address' }, { type: 'uint24' }, { type: 'int24' }, { type: 'address' }], [p.currency0, p.currency1, p.fee, p.tickSpacing, p.hooks]));
        assert.ok(key === p.id && quote === m.quoteAddress && p.fee === d.poolFee && p.tickSpacing === d.tickSpacing, 'POOL_ASSOCIATION_MISMATCH');
        m.pool = { id: p.id, currency0: p.currency0.toLowerCase(), currency1: p.currency1.toLowerCase(), hooks: HOOK, fee: p.fee, tickSpacing: p.tickSpacing };
        m.history = { token, quote: 'ETH', decimals: 18, migratedAt: ts, migrationBlock: num(log.blockNumber), migrationLog: num(log.logIndex), migrationHash: log.blockHash, verifiedPool: true, ticks: [] };
        m.coverage = [{ fromBlock: BigInt(num(log.blockNumber)), toBlock: BigInt(num(log.blockNumber)), fromTime: ts, toTime: ts }];
      }
    }
  }
  // Scope limits are visible in the manual: recent launches + a bounded market watch set.
  session.markets = [...markets.values()].filter(m => at - m.launchedAt < 72 * 3600 || m.history && at - m.history.migratedAt < 72 * 3600)
    .sort((a, b) => b.launchedAt - a.launchedAt).slice(0, 1000);
  const watched = session.markets.filter(m => m.pool && m.history && m.quoteAddress === ZERO)
    .sort((a, b) => b.history!.migratedAt - a.history!.migratedAt).slice(0, options.poolLimit ?? 128);
  const watchedAddresses = new Set(watched.map(m => m.address));
  for (const m of session.markets) if (m.pool && !watchedAddresses.has(m.address)) {
    m.terminalGate = { state: 'insufficient_history', reason: 'Outside the local 128-pool watch budget; coverage is not extended' };
  }
  onProgress({ phase: 'POOL FLOW', from, to, head });
  const byPool = new Map(watched.map(m => [m.pool!.id, m]));
  for (let i = 0; i < watched.length; i += 32) {
    const batch = watched.slice(i, i + 32), ids = batch.map(m => m.pool!.id);
    const poolLogs = await logs(rpc, { address: POOL_MANAGER, topics: [swapTopic, ids] }, from, to);
    await preloadHeaders(poolLogs);
    for (const log of poolLogs) {
      const m = byPool.get(log.topics[1]); assert.ok(m, 'UNREQUESTED_POOL');
      const ts = await canonical(log), a = (decodeEventLog({ abi: poolAbi, topics: log.topics, data: log.data, strict: true }) as any).args;
      const is0 = m.pool!.currency0 === m.address, amount = is0 ? a.amount0 : a.amount1, quote = is0 ? a.amount1 : a.amount0;
      if (!amount || !quote) continue;
      assert.ok((amount > 0n) !== (quote > 0n), 'INVALID_POOL_DELTAS');
      const price = poolPrice(a.sqrtPriceX96, is0, m.decimals, m.quoteDecimals);
      m.history!.ticks.push({ ts, block: num(log.blockNumber), log: num(log.logIndex), hash: log.blockHash, tx: log.transactionHash,
        price: price === null ? null : Number(price), quoteRaw: String(quote < 0n ? -quote : quote), side: poolSide(amount), actor: null });
      m.priceQuote = price; m.priceAt = ts;
    }
  }
  for (const m of watched) {
    const h = m.history!;
    m.coverage = mergeCoverage([...m.coverage, { fromBlock: BigInt(Math.max(from, h.migrationBlock)), toBlock: BigInt(to), fromTime: Math.max(seed.asOf, h.migratedAt), toTime: at }]);
    if (h.ticks.length > 12000 && !m.checkpoint) {
      m.terminalGate = { state: 'insufficient_history', reason: 'Local 12000-event detector prefix budget exceeded' };
    }
    if (!m.terminalGate) {
      const result = replay(h, m.coverage, at, m.checkpoint);
      m.checkpoint = result.checkpoint;
    }
    if (m.checkpoint || m.terminalGate) h.ticks = h.ticks.filter(t => t.ts > at - 600).slice(-12000);
  }
  onProgress({ phase: 'CURVE TAPE', from, to, head });
  const curves = session.markets.filter(m => m.phase === 'curve' && m.quoteAddress === ZERO && /^0x[0-9a-f]{40}$/.test(m.curve)).slice(0, 64);
  const byCurve = new Map(curves.map(m => [m.curve, m]));
  const curveLogs = curves.length ? await logs(rpc, { address: curves.map(m => m.curve), topics: [[buyTopic, sellTopic]] }, from, to) : [];
  await preloadHeaders(curveLogs);
  for (const log of curveLogs) {
    const m = byCurve.get(log.address.toLowerCase()); assert.ok(m, 'UNREQUESTED_CURVE');
    const ts = await canonical(log), event = decodeEventLog({ abi: curveAbi, topics: log.topics, data: log.data, strict: true }) as any;
    const a = event.args, buy = event.eventName === 'CurveBuy';
    m.priceQuote = tradePrice(buy ? a.quoteIn : a.quoteOut, buy ? a.tokensOut : a.tokensIn, 18, 18); m.priceAt = ts;
    (m.tape ??= []).push({ ts, block: num(log.blockNumber), log: num(log.logIndex), hash: log.blockHash, tx: log.transactionHash,
      price: m.priceQuote === null ? null : Number(m.priceQuote), quoteRaw: String(buy ? a.quoteIn : a.quoteOut), side: buy ? 'buy' : 'sell', actor: null });
  }
  for (const m of curves) {
    m.tape = (m.tape ?? []).filter(t => t.ts > at - 600).slice(-1000);
    m.coverage = mergeCoverage([...m.coverage, { fromBlock: BigInt(Math.max(from, m.launchBlock)), toBlock: BigInt(to), fromTime: Math.max(seed.asOf, m.launchedAt), toTime: at }]);
  }
  // Historical reserve reads are explicit. An RPC that lacks this state leaves progress unknown.
  for (const m of curves.slice(0, 8)) {
    try {
      const result = await rpc.call('eth_call', [{ to: m.curve, data: encodeFunctionData({ abi: curveAbi, functionName: 'realQuoteReserve' }) }, hex(to)]);
      const reserve = decodeFunctionResult({ abi: curveAbi, functionName: 'realQuoteReserve', data: result as Hex });
      m.curveProgress = BigInt(m.thresholdRaw) > 0n ? Math.min(100, Number(reserve * 10000n / BigInt(m.thresholdRaw)) / 100) : null;
    } catch (e) {
      if (e instanceof RpcError && (e.code.startsWith('RPC_ACCESS_DENIED') || e.code === 'SYNC_CANCELLED')) throw e;
      m.curveProgress = null;
    }
  }
  const check = await rpc.call('eth_getBlockByNumber', [hex(to), false]);
  const startCheck = await rpc.call('eth_getBlockByNumber', [hex(from - 1), false]);
  assert.ok(check?.hash === boundary.hash && startCheck?.hash === input.seed.hash, 'REORG_BEFORE_COMMIT');
  seed.launches = [...launches]; seed.graduations = [...grads]; seed.exemptions = [...exemptions];
  seed.next = to + 1; seed.hash = boundary.hash; seed.asOf = at; seed.recent = seed.recent.filter(t => t >= at - 3600);
  Object.assign(session, { source: 'rpc', asOf: at, block: to, hash: boundary.hash, capturedAt: new Date().toISOString() });
  onProgress({ phase: 'COMMIT', from, to, head });
  return { state, caughtUp: to === head, advanced: true, head };
}
