import assert from 'node:assert/strict';
import { decodeEventLog, toEventSelector } from 'viem';
import { curveAbi, poolAbi } from './abi.js';
import { logs, POOL_MANAGER } from './collect.js';
import { hex, num, type RpcReader } from './rpc.js';
import type { LocalState, HistoryJob } from './state.js';
import type { Market } from '../domain.js';
import { ZERO } from '../domain.js';
import { tradePrice, poolPrice, poolSide } from './math.js';
import { replay } from '../engines/wave24/engine.js';
import { mergeCoverage } from '../engines/coverage.js';
import { appendTrade, extendBarCoverage } from '../market.js';

const curveTopics = ['CurveBuy(address,address,uint256,uint256,uint256,uint256)', 'CurveSell(address,address,uint256,uint256,uint256,uint256)', 'BuybackLocked(uint256,uint256)'].map(toEventSelector);
const swapTopic = toEventSelector('Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)');
export function newHistoryJob(market: Market, state: LocalState): HistoryJob {
  assert.equal(market.quoteAddress, ZERO, 'HISTORY_REQUIRES_SUPPORTED_QUOTE');
  assert.ok(market.decimals != null && market.quoteDecimals != null, 'HISTORY_REQUIRES_VERIFIED_DECIMALS');
  assert.ok(market.phase === 'curve' || market.pool && market.history, 'HISTORY_REQUIRES_VERIFIED_MIGRATION_POOL');
  const m = structuredClone(market);
  Object.assign(m, { bars: [], barCoverage: [], tape: [], coverage: [], checkpoint: undefined, terminalGate: null, reserveRaw: '0', priceQuote: null, priceAt: null, pressureHistoryFrom: undefined });
  if (m.history) m.history.ticks = [];
  return { next: m.launchBlock, to: state.session.block, at: state.session.asOf, hash: state.session.hash, market: m };
}
/** One resumable, atomic history page. Live input is never mutated on failure. */
export async function hydratePage(input: LocalState, rpc: RpcReader, address: string, onProgress: (text: string) => void = () => {}, blocks = rpc.suggestedBlocks ?? 1000) {
  rpc.reset?.();
  assert.equal(num(await rpc.call('eth_chainId')), 4663, 'WRONG_CHAIN');
  const selected = input.session.markets.find(m => m.address === address);
  assert.ok(selected, 'TOKEN_NOT_IN_LOCAL_SESSION');
  const state = structuredClone(input), jobs = state.historyJobs ??= {};
  let job = jobs[address];
  if (!job || job.market.pool?.id !== selected.pool?.id) job = jobs[address] = newHistoryJob(selected, state);
  const anchor = await rpc.call('eth_getBlockByNumber', [hex(job.to), false]);
  assert.equal(anchor?.hash, job.hash, 'HISTORY_REORG: checkpoint retained');
  if (job.next > job.to && state.session.block > job.to) {
    job.to = state.session.block; job.hash = state.session.hash; job.at = state.session.asOf;
  }
  if (job.next <= job.to) {
    const from = job.next, to = Math.min(job.to, from + blocks - 1), m = job.market;
    const boundary = await rpc.call('eth_getBlockByNumber', [hex(to), false]);
    assert.ok(boundary?.hash, 'HISTORY_BOUNDARY_MISSING');
    const at = num(boundary.timestamp), headers = new Map<number, any>([[to, boundary]]);
    onProgress(`HISTORY ${m.symbol ?? address.slice(0, 10)} / ${from}-${to} / ${job.to - to} blocks left`);
    const migration = m.history?.migrationBlock ?? Infinity;
    const curveEnd = Math.min(to, migration);
    const curve = from <= curveEnd ? await logs(rpc, { address: m.curve, topics: [curveTopics] }, from, curveEnd) : [];
    const pool = m.pool && migration <= to ? await logs(rpc, { address: POOL_MANAGER, topics: [swapTopic, m.pool.id] }, Math.max(from, migration), to) : [];
    const events = [...curve.map(l => ({ l, venue: 'curve' })), ...pool.map(l => ({ l, venue: 'pool' }))].sort((a, b) => num(a.l.blockNumber) - num(b.l.blockNumber) || num(a.l.logIndex) - num(b.l.logIndex));
    const ns = [...new Set(events.map(e => num(e.l.blockNumber)))].filter(n => !headers.has(n));
    for (let i = 0; i < ns.length; i += 10) {
      const chunk = ns.slice(i, i + 10), queries = chunk.map(n => ({ method: 'eth_getBlockByNumber', params: [hex(n), false] }));
      const values = rpc.batch ? await rpc.batch(queries) : await Promise.all(queries.map(q => rpc.call(q.method, q.params)));
      values.forEach((b, j) => { assert.ok(b?.hash, 'HISTORY_HEADER_MISSING'); headers.set(chunk[j], b); });
    }
    for (const { l, venue } of events) {
      const header = headers.get(num(l.blockNumber)); assert.equal(header?.hash, l.blockHash, 'HISTORY_REORG_DURING_READ');
      const ts = num(header.timestamp), e: any = decodeEventLog({ abi: venue === 'curve' ? curveAbi : poolAbi, topics: l.topics, data: l.data, strict: true }), a = e.args;
      if (e.eventName === 'BuybackLocked') { m.reserveRaw = String(BigInt(m.reserveRaw!) + a.quoteSpent); continue; }
      let price: string | null, quote: bigint, side: 'buy' | 'sell';
      if (venue === 'curve') {
        side = e.eventName === 'CurveBuy' ? 'buy' : 'sell'; const buy = side === 'buy'; quote = buy ? a.quoteIn : a.quoteOut;
        price = tradePrice(quote, buy ? a.tokensOut : a.tokensIn, m.quoteDecimals!, m.decimals!);
        m.reserveRaw = String(BigInt(m.reserveRaw!) + (buy ? quote - BigInt(a.fee) - BigInt(a.tax) : -(quote + BigInt(a.fee) + BigInt(a.tax))));
      } else {
        const is0 = m.pool!.currency0 === m.address, amount = is0 ? a.amount0 : a.amount1; quote = is0 ? a.amount1 : a.amount0;
        if (!amount || !quote) continue;
        assert.ok((amount > 0n) !== (quote > 0n), 'INVALID_POOL_DELTAS');
        side = poolSide(amount); quote = quote < 0n ? -quote : quote; price = poolPrice(a.sqrtPriceX96, is0, m.decimals, m.quoteDecimals);
      }
      const tick = { ts, block: num(l.blockNumber), log: num(l.logIndex), hash: l.blockHash, tx: l.transactionHash, price: price === null ? null : Number(price), quoteRaw: String(quote), side, actor: null };
      appendTrade(m, { ...tick, price });
      if (venue === 'pool') m.history!.ticks.push(tick); else (m.tape ??= []).push(tick);
      m.priceQuote = price; m.priceAt = ts;
    }
    const startHeader = await rpc.call('eth_getBlockByNumber', [hex(Math.max(m.launchBlock, from - 1)), false]);
    extendBarCoverage(m, from, to, Math.max(m.launchedAt, num(startHeader.timestamp)), at);
    if (m.history && to >= migration) {
      m.coverage = mergeCoverage([...m.coverage, { fromBlock: BigInt(Math.max(from, migration)), toBlock: BigInt(to), fromTime: Math.max(m.history.migratedAt, num(startHeader.timestamp)), toTime: at }]);
      if (m.history.ticks.length > 12000 && !m.checkpoint) m.terminalGate = { state: 'insufficient_history', reason: 'Detector prefix exceeds the 12000-event budget' };
      if (!m.terminalGate) m.checkpoint = replay(m.history, m.coverage, at, m.checkpoint).checkpoint;
      if (m.checkpoint || m.terminalGate) {
        const tail = m.history.ticks.filter(t => t.ts > at - 600);
        if (tail.length > 12000) m.pressureHistoryFrom = Math.max(m.pressureHistoryFrom ?? 0, tail[tail.length - 12000].ts);
        m.history.ticks = tail.slice(-12000);
      }
    }
    m.tape = (m.tape ?? []).filter(t => t.ts > at - 600).slice(-12000);
    if (m.phase === 'curve') m.curveProgress = BigInt(m.thresholdRaw) > 0n && BigInt(m.reserveRaw!) >= 0n ? Math.min(100, Number(BigInt(m.reserveRaw!) * 10n ** 12n / BigInt(m.thresholdRaw)) / 1e10) : null;
    m.reserveAt = at;
    const verify = await rpc.call('eth_getBlockByNumber', [hex(to), false]); assert.equal(verify?.hash, boundary.hash, 'HISTORY_REORG_BEFORE_COMMIT');
    const verifyEnd = await rpc.call('eth_getBlockByNumber', [hex(job.to), false]); assert.equal(verifyEnd?.hash, job.hash, 'HISTORY_REORG_BEFORE_COMMIT');
    job.next = to + 1;
  }
  const done = job.next > job.to && job.to === state.session.block;
  if (done) {
    job.market.pinned = true;
    state.session.markets = state.session.markets.map(m => m.address === address ? job.market : m); delete jobs[address];
  }
  return { state, done, next: job.next, to: job.to };
}
